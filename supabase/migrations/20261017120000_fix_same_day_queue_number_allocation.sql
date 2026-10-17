-- ============================================================================
-- Migration: fix same-day queue number allocation
-- ============================================================================
--
-- PROBLEM
--   Same-day queue numbers were allocated CLIENT-SIDE, in
--   src/pages/patient/AppointmentBookingFlow.jsx:
--
--       const sameDayRows = appointments.filter(a => ...);
--       const maxQueue = sameDayRows.reduce((m, a) => Math.max(m, a.queue_number || 0), 0);
--       queueNumber = maxQueue + 1;
--
--   `appointments` is populated by loadAppointments() as "the student's own
--   appointments" — a list RLS restricts to the signed-in patient's OWN rows.
--   Migration 20260830200000_create_slot_occupancy_rpc_for_availability_sync.sql
--   had to introduce a SECURITY DEFINER RPC for exactly this reason
--   ("regardless of RLS restrictions on personal records").
--
--   Consequences:
--     * The counter can never see other patients' bookings, so every patient's
--       first same-day booking receives queue_number = 1  ->  collisions.
--     * Staff-created same-day appointments (Dashboard.jsx, Appointments.jsx)
--       never set queue_number at all  ->  NULL.
--     * No constraint prevented either.
--
--   Observed in production before this migration:
--     2026-08-30 / Medical Clinic -> queue numbers [1, 2, 1]  (two patients held #1)
--     2026-10-10 / Medical Clinic -> queue numbers [NULL, 1]
--
-- FIX
--   1. Backfill: renumber the same-day scopes that are currently broken.
--   2. Allocate server-side and atomically in a BEFORE INSERT trigger, guarded
--      by a transaction-scoped advisory lock so concurrent bookings serialise.
--   3. Enforce uniqueness with a partial unique index.
--   4. Require a queue number on every same-day appointment.
--
-- Idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. BACKFILL broken scopes
--
-- `trg_check_appointment_date_mode` fires on UPDATE as well as INSERT and
-- raises whenever a Same-day Appointment's date is not today. The rows we must
-- repair are dated in the past, so it has to be parked for the duration of the
-- backfill. It is re-enabled immediately afterwards.
--
-- The other two appointment triggers were checked against these exact rows and
-- do not fire on them:
--   * trg_check_one_active_appointment -> only for Scheduled/Checked-in rows,
--     and each affected patient has no *other* active row.
--   * trg_check_slot_capacity          -> the 2026-10-10 rows sit in different
--     time slots (10:20 vs 13:00-16:00); the 2026-08-30 rows are Cancelled.
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments DISABLE TRIGGER trg_check_appointment_date_mode;

DO $$
DECLARE
  d        record;
  a        record;
  v_next   integer;
BEGIN
  FOR d IN
    SELECT appointment_date,
           COALESCE(department, 'Medical Clinic') AS dept
      FROM public.appointments
     WHERE appointment_type = 'Same-day Appointment'
     GROUP BY appointment_date, COALESCE(department, 'Medical Clinic')
    HAVING COUNT(*) <> COUNT(DISTINCT queue_number)
        OR COUNT(*) FILTER (WHERE queue_number IS NULL) > 0
  LOOP
    v_next := 1;
    FOR a IN
      SELECT id
        FROM public.appointments
       WHERE appointment_date = d.appointment_date
         AND COALESCE(department, 'Medical Clinic') = d.dept
         AND appointment_type = 'Same-day Appointment'
       ORDER BY created_at NULLS LAST, id
    LOOP
      UPDATE public.appointments SET queue_number = v_next WHERE id = a.id;
      v_next := v_next + 1;
    END LOOP;
    RAISE NOTICE 'Renumbered same-day queue for % / % (% rows)', d.appointment_date, d.dept, v_next - 1;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- Never leave the validation trigger parked, even on an unexpected failure.
  ALTER TABLE public.appointments ENABLE TRIGGER trg_check_appointment_date_mode;
  RAISE;
END $$;

ALTER TABLE public.appointments ENABLE TRIGGER trg_check_appointment_date_mode;

-- ---------------------------------------------------------------------------
-- 2. SERVER-SIDE, ATOMIC ALLOCATION
--
-- Recomputes the queue number for same-day appointments on INSERT (and on
-- UPDATE only when the queue scope itself changes, so status/clinician edits
-- never renumber anyone).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_same_day_queue_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept text;
  v_next integer;
BEGIN
  IF NEW.appointment_type IS DISTINCT FROM 'Same-day Appointment' THEN
    RETURN NEW;
  END IF;

  v_dept := COALESCE(NEW.department, 'Medical Clinic');

  -- On UPDATE, only re-assign when the queue scope actually moved.
  IF TG_OP = 'UPDATE'
     AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
     AND v_dept IS NOT DISTINCT FROM COALESCE(OLD.department, 'Medical Clinic')
  THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent allocations for the same day + department. The lock is
  -- released automatically when the transaction commits or rolls back.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.appointment_date::text || '|' || v_dept));

  SELECT COALESCE(MAX(a.queue_number), 0) + 1
    INTO v_next
    FROM public.appointments a
   WHERE a.appointment_date = NEW.appointment_date
     AND COALESCE(a.department, 'Medical Clinic') = v_dept
     AND a.appointment_type = 'Same-day Appointment'
     AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  NEW.queue_number := v_next;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_same_day_queue_number ON public.appointments;
CREATE TRIGGER trg_assign_same_day_queue_number
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_same_day_queue_number();

-- ---------------------------------------------------------------------------
-- 3. UNIQUENESS — make any future collision fail loudly instead of silently
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_same_day_queue
  ON public.appointments (appointment_date, COALESCE(department, 'Medical Clinic'), queue_number)
  WHERE appointment_type = 'Same-day Appointment'
    AND queue_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Every same-day appointment must carry a queue number
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS check_same_day_queue_number_present;

ALTER TABLE public.appointments
  ADD CONSTRAINT check_same_day_queue_number_present
  CHECK (appointment_type IS DISTINCT FROM 'Same-day Appointment' OR queue_number IS NOT NULL);

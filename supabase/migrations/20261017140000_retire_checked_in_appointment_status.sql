-- ============================================================================
-- Migration: retire the 'Checked-in' appointment status
-- ============================================================================
--
-- 'Checked-in' was a manual "patient has arrived" step. It is redundant: the
-- clinic records attendance by completing the appointment, and the queue number
-- is assigned at booking (see 20261017120000_fix_same_day_queue_number_allocation.sql).
-- It was also never reachable from the UI, so nothing has set it since.
--
-- Appointment vocabulary is now: Scheduled -> Completed | Cancelled
--   Scheduled  = booked, still expected
--   Completed  = the visit happened
--   Cancelled  = the visit will not happen (manual, or auto no-show)
--
-- This migration closes out the last two rows carrying 'Checked-in', then
-- removes it from every DB object that treated it as "active".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Close out the two legacy rows
--
-- Both are Future Appointments dated in the past, so the visit is over.
-- Only `status` changes here, which means the date-mode trigger's TG_OP guard
-- (added in 20261017130000) returns early instead of rejecting the past date.
-- ---------------------------------------------------------------------------
UPDATE public.appointments
   SET status = 'Completed'
 WHERE status = 'Checked-in';

-- ---------------------------------------------------------------------------
-- 2. An "active" appointment is now only 'Scheduled'
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_student;
CREATE UNIQUE INDEX idx_appointments_one_active_per_student
  ON public.appointments (patient_id)
  WHERE status = 'Scheduled';

DROP INDEX IF EXISTS public.idx_appointments_one_active_per_slot;
CREATE UNIQUE INDEX idx_appointments_one_active_per_slot
  ON public.appointments (department, appointment_date, appointment_time)
  WHERE status = 'Scheduled';

-- ---------------------------------------------------------------------------
-- 3. Trigger functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_one_active_appointment_per_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.status = 'Scheduled' THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE patient_id = NEW.patient_id
        AND status = 'Scheduled'
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Active appointment already exists for patient % (Status must be Cancelled before booking a new appointment)', NEW.patient_id
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_slot_capacity_per_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.status = 'Scheduled' THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE department = NEW.department
        AND appointment_date = NEW.appointment_date
        AND appointment_time = NEW.appointment_time
        AND status = 'Scheduled'
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'This time slot is no longer available. Please select another available slot.'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Slot occupancy — only 'Scheduled' occupies a slot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_slot_occupancy(
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT (CURRENT_DATE + 90)
)
RETURNS TABLE (
  department text,
  appointment_date text,
  appointment_time text,
  occupied_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COALESCE(a.department, 'Medical Clinic')::text AS department,
    a.appointment_date::text AS appointment_date,
    a.appointment_time::text AS appointment_time,
    COUNT(*)::bigint AS occupied_count
  FROM public.appointments a
  WHERE a.appointment_date >= p_start_date
    AND a.appointment_date <= p_end_date
    AND a.status = 'Scheduled'
  GROUP BY COALESCE(a.department, 'Medical Clinic'), a.appointment_date, a.appointment_time;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tighten the vocabulary — 'Checked-in' is no longer storable
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('Scheduled', 'Cancelled', 'Completed'));

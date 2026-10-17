-- ============================================================================
-- Migration: release the queue number when an appointment is cancelled
-- ============================================================================
--
-- Queue numbers were assigned at booking and never released, so a cancelled
-- appointment kept its position forever. Because the allocation query had no
-- status filter, the next booking on that day skipped past the dead numbers:
-- on a day where #1 and #2 cancelled, the next same-day booking received #4
-- while only one patient was actually waiting.
--
-- Now: cancelling an appointment releases its queue position, so the next
-- booking reuses it and the queue stays contiguous 1..N.
--
-- Order matters here:
--   1. relax the CHECK first — it currently *requires* a number on same-day
--      rows, so the trigger could not legally clear one;
--   2. replace the trigger;
--   3. backfill the already-cancelled rows.
--
-- The unique index needs no change: it already excludes NULL numbers, so a
-- reissued #1 cannot collide with the cancelled row that used to hold it.
--
-- Completed appointments deliberately KEEP their number — the visit happened,
-- and the position is a historical fact worth showing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Relax the CHECK: a cancelled same-day row may hold no number
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS check_same_day_queue_number_present;

ALTER TABLE public.appointments
  ADD CONSTRAINT check_same_day_queue_number_present
  CHECK (
    appointment_type IS DISTINCT FROM 'Same-day Appointment'
    OR status = 'Cancelled'
    OR queue_number IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 2. Trigger: release on cancel, reassign when a position is missing
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
  -- A cancelled appointment holds no queue position.
  IF NEW.status = 'Cancelled' THEN
    NEW.queue_number := NULL;
    RETURN NEW;
  END IF;

  -- Only same-day appointments hold one.
  IF NEW.appointment_type IS DISTINCT FROM 'Same-day Appointment' THEN
    RETURN NEW;
  END IF;

  v_dept := COALESCE(NEW.department, 'Medical Clinic');

  -- Keep an existing position unless the row lost it, or the queue scope moved.
  -- The `queue_number IS NOT NULL` guard is what makes un-cancelling reassign.
  IF TG_OP = 'UPDATE'
     AND NEW.queue_number IS NOT NULL
     AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
     AND v_dept IS NOT DISTINCT FROM COALESCE(OLD.department, 'Medical Clinic')
  THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent allocations for the same day + department.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.appointment_date::text || '|' || v_dept));

  -- Next free position. Released (NULL) and cancelled positions are skipped.
  SELECT COALESCE(MAX(a.queue_number), 0) + 1
    INTO v_next
    FROM public.appointments a
   WHERE a.appointment_date = NEW.appointment_date
     AND COALESCE(a.department, 'Medical Clinic') = v_dept
     AND a.appointment_type = 'Same-day Appointment'
     AND a.queue_number IS NOT NULL
     AND a.status <> 'Cancelled'
     AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  NEW.queue_number := v_next;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: release positions held by already-cancelled appointments
--    (status-only update, so the date-mode trigger's TG_OP guard returns early)
-- ---------------------------------------------------------------------------
UPDATE public.appointments
   SET queue_number = NULL
 WHERE appointment_type = 'Same-day Appointment'
   AND status = 'Cancelled'
   AND queue_number IS NOT NULL;

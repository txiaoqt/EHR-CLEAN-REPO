-- ============================================================================
-- Migration: 20260830190000_harden_appointment_slot_capacity_and_concurrency.sql
-- Description: Enforce appointment slot capacity = 1 per department, date, and time
--              at the PostgreSQL storage engine level for atomic concurrency.
-- ============================================================================

-- 1. Partial Unique Index: Only ONE active ('Scheduled' or 'Checked-in') appointment
--    may exist for a specific (department, appointment_date, appointment_time).
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_slot;
CREATE UNIQUE INDEX idx_appointments_one_active_per_slot
ON public.appointments (department, appointment_date, appointment_time)
WHERE status IN ('Scheduled', 'Checked-in');

-- 2. Trigger Function: Defense-in-depth trigger for atomic slot concurrency and clear error code
CREATE OR REPLACE FUNCTION public.check_slot_capacity_per_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('Scheduled', 'Checked-in') THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE department = NEW.department
        AND appointment_date = NEW.appointment_date
        AND appointment_time = NEW.appointment_time
        AND status IN ('Scheduled', 'Checked-in')
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'This time slot is no longer available. Please select another available slot.'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_slot_capacity ON public.appointments;
CREATE TRIGGER trg_check_slot_capacity
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.check_slot_capacity_per_appointment();

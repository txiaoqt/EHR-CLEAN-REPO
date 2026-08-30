-- -----------------------------------------------------------------------------
-- Migration: 20260830160000_harden_appointment_lifecycle_and_prevent_duplicates.sql
-- Description:
--   1. Enforces status default 'Scheduled' on public.appointments.
--   2. Cleans up historical duplicate active appointments by keeping newest and cancelling older duplicates.
--   3. Adds partial unique index on patient_id WHERE status IN ('Scheduled', 'Checked-in')
--      to guarantee at most ONE active appointment per student across all viewports and tabs.
--   4. Creates database trigger trg_check_one_active_appointment for atomic race-condition protection.
-- -----------------------------------------------------------------------------

-- 1. Ensure status column defaults to 'Scheduled' and satisfies constraint
ALTER TABLE IF EXISTS public.appointments
  ALTER COLUMN status SET DEFAULT 'Scheduled';

-- 2. Resolve any existing duplicate active appointments by retaining the newest and cancelling older duplicates
WITH ranked_active AS (
  SELECT id,
         patient_id,
         ROW_NUMBER() OVER (
           PARTITION BY patient_id
           ORDER BY created_at DESC, appointment_date DESC
         ) as rn
  FROM public.appointments
  WHERE status IN ('Scheduled', 'Checked-in')
)
UPDATE public.appointments
SET status = 'Cancelled'
WHERE id IN (
  SELECT id FROM ranked_active WHERE rn > 1
);

-- 3. Partial Unique Index: A student may have AT MOST ONE active ('Scheduled' or 'Checked-in') appointment
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_student;
CREATE UNIQUE INDEX idx_appointments_one_active_per_student
ON public.appointments (patient_id)
WHERE status IN ('Scheduled', 'Checked-in');

-- 4. Trigger Function: Defense-in-depth trigger for atomic concurrency and clear error code
CREATE OR REPLACE FUNCTION public.check_one_active_appointment_per_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('Scheduled', 'Checked-in') THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE patient_id = NEW.patient_id
        AND status IN ('Scheduled', 'Checked-in')
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Active appointment already exists for patient % (Status must be Cancelled before booking a new appointment)', NEW.patient_id
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_one_active_appointment ON public.appointments;
CREATE TRIGGER trg_check_one_active_appointment
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.check_one_active_appointment_per_student();

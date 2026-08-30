-- ============================================================================
-- Migration: 20260830210000_enforce_appointment_date_mode_rules.sql
-- Description:
--   1. Enforces business rules for appointment date vs appointment mode:
--      - Same-day Appointment: appointment_date = CURRENT_DATE (Asia/Manila)
--      - Future Appointment:   appointment_date > CURRENT_DATE (Asia/Manila)
--   2. Enforces timezone-aware evaluation based on Asia/Manila calendar date.
--   3. Preserves existing student active uniqueness, slot capacity uniqueness,
--      and lifecycle rules.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_appointment_date_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_manila_today date;
BEGIN
  -- Evaluate current calendar date in Asia/Manila business timezone
  v_manila_today := (now() at time zone 'Asia/Manila')::date;

  IF NEW.appointment_type = 'Same-day Appointment' THEN
    IF NEW.appointment_date <> v_manila_today THEN
      RAISE EXCEPTION 'Same-day appointments are only available for today (%).', v_manila_today
        USING ERRCODE = '22000',
              HINT = 'Select today for same-day appointments or choose Future Appointment mode.';
    END IF;
  ELSIF NEW.appointment_type = 'Future Appointment' THEN
    IF NEW.appointment_date <= v_manila_today THEN
      RAISE EXCEPTION 'Future appointments must be scheduled for tomorrow or a later date (after %).', v_manila_today
        USING ERRCODE = '22000',
              HINT = 'Select tomorrow or a future date for future appointments.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_appointment_date_mode ON public.appointments;
CREATE TRIGGER trg_check_appointment_date_mode
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.check_appointment_date_mode();

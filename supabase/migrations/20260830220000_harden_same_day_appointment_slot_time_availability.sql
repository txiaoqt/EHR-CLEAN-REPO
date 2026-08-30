-- ============================================================================
-- Migration: 20260830220000_harden_same_day_appointment_slot_time_availability.sql
-- Description:
--   1. Enforces same-day appointment slot time validity in Asia/Manila timezone:
--      - For Same-day Appointments on today, current_time < slot_end_time is required.
--      - At or after slot_end_time (current_time >= slot_end_time), the slot is expired
--        and cannot be booked.
--   2. Future Appointments (appointment_date > today) remain unaffected by daily slot expiry.
--   3. Preserves all existing student active uniqueness, slot capacity uniqueness,
--      and lifecycle rules.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_appointment_date_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_manila_today date;
  v_manila_now time;
  v_slot_end_time time;
  v_time_parts text[];
BEGIN
  -- Evaluate current calendar date and time in Asia/Manila business timezone
  v_manila_today := (now() at time zone 'Asia/Manila')::date;
  v_manila_now := (now() at time zone 'Asia/Manila')::time;

  IF NEW.appointment_type = 'Same-day Appointment' THEN
    IF NEW.appointment_date <> v_manila_today THEN
      RAISE EXCEPTION 'Same-day appointments are only available for today (%).', v_manila_today
        USING ERRCODE = '22000',
              HINT = 'Select today for same-day appointments or choose Future Appointment mode.';
    END IF;

    -- Enforce time-of-day expiration for same-day bookings
    IF NEW.appointment_time IS NOT NULL AND NEW.appointment_time <> '' THEN
      IF position('-' in NEW.appointment_time) > 0 THEN
        v_time_parts := string_to_array(NEW.appointment_time, '-');
        BEGIN
          v_slot_end_time := trim(v_time_parts[2])::time;
          IF v_manila_now >= v_slot_end_time THEN
            RAISE EXCEPTION 'This time slot has already ended. Please select another available slot.'
              USING ERRCODE = '22000',
                    HINT = 'Select an upcoming or future time slot.';
          END IF;
        EXCEPTION
          WHEN SQLSTATE '22000' THEN
            RAISE;
          WHEN OTHERS THEN
            NULL;
        END;
      END IF;
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

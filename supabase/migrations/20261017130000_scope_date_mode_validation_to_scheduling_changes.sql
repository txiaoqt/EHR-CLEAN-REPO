-- ============================================================================
-- Migration: scope date-mode validation to scheduling changes
-- ============================================================================
--
-- PROBLEM
--   public.check_appointment_date_mode() is wired to BEFORE INSERT **OR UPDATE**
--   and, for a Same-day Appointment, raises unless
--   appointment_date = today(Asia/Manila):
--
--       IF NEW.appointment_date <> v_manila_today THEN
--         RAISE EXCEPTION 'Same-day appointments are only available for today (%)'
--
--   The rule describes *booking*, but it also fires on every later UPDATE. So
--   once the date has passed, staff can no longer touch the row at all:
--
--       UPDATE public.appointments SET status = 'Completed'
--        WHERE patient_id = 'TUPM-25-0001' AND appointment_date = '2026-10-10';
--       -- ERROR: 22000: Same-day appointments are only available for today (2026-10-17).
--
--   Cancelling, checking in or completing a past same-day visit is therefore
--   impossible. It is also what forced the queue-number backfill in
--   20261017120000_fix_same_day_queue_number_allocation.sql to park this
--   trigger while repairing historical rows.
--
-- FIX
--   Validate only when the booking is created, or when an UPDATE actually moves
--   the appointment's schedule (date, time or mode). Bookkeeping edits —
--   status, clinician, queue_number, notes — are no longer blocked by a date
--   rule that no longer applies to them.
--
--   Reschedules stay fully validated: changing appointment_date,
--   appointment_time or appointment_type re-runs the original checks.
--
-- The trigger itself is unchanged and already points at this function, so
-- CREATE OR REPLACE is sufficient. Idempotent and safe to re-run.
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
  -- Date/mode rules describe *booking*, not bookkeeping. Only validate on
  -- INSERT, or on an UPDATE that actually moves the appointment's schedule.
  -- Without this, a same-day appointment becomes permanently immutable once
  -- its date has passed.
  IF TG_OP = 'UPDATE'
     AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
     AND NEW.appointment_time IS NOT DISTINCT FROM OLD.appointment_time
     AND NEW.appointment_type IS NOT DISTINCT FROM OLD.appointment_type
  THEN
    RETURN NEW;
  END IF;

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

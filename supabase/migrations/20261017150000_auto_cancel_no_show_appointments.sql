-- ============================================================================
-- Migration: auto-cancel no-show appointments (pg_cron)
-- ============================================================================
--
-- A patient who books and never turns up currently leaves the appointment
-- 'Scheduled' forever. That blocks them from booking again
-- (idx_appointments_one_active_per_student) and keeps the time slot occupied
-- (idx_appointments_one_active_per_slot + get_slot_occupancy), even though the
-- visit is over.
--
-- Rule: an appointment whose working day has ended, and which is still
-- 'Scheduled', becomes 'Cancelled'.
--
--   appointment_date <  today (Asia/Manila)                        -> expired
--   appointment_date == today AND now >= 17:00 (Asia/Manila)        -> expired
--
-- The 17:00 no-show cutoff is deliberately SEPARATE from the clinic's closing
-- hour (CLINIC_CLOSE_HOUR = 19 in src/accessControl.js). A patient who has not
-- arrived by 5:00 PM is a no-show even though the clinic stays open until 7:00 PM.
--
-- Cancellations are NOT silent: each one is written to public.audit_logs with
-- performed_by = 'system', because the rule cannot distinguish "never came"
-- from "staff forgot to mark Completed".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Scheduler
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- 2. The sweep
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_no_show_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- No-show cutoff, independent of the clinic's closing hour.
  c_no_show_cutoff constant time := TIME '17:00';

  v_today date    := (now() at time zone 'Asia/Manila')::date;
  v_now   time    := (now() at time zone 'Asia/Manila')::time;
  v_count integer := 0;
  r       record;
BEGIN
  FOR r IN
    SELECT id, patient_id, appointment_date, appointment_time, department
      FROM public.appointments
     WHERE status = 'Scheduled'
       AND (
         appointment_date < v_today
         OR (appointment_date = v_today AND v_now >= c_no_show_cutoff)
       )
     ORDER BY appointment_date, appointment_time
  LOOP
    UPDATE public.appointments SET status = 'Cancelled' WHERE id = r.id;

    INSERT INTO public.audit_logs (action, description, performed_by, appointment_id, meta)
    VALUES (
      'Appointment Auto-Cancelled',
      format(
        'No-show: %s was still Scheduled for %s %s (%s) past the %s cutoff.',
        r.patient_id,
        r.appointment_date,
        COALESCE(r.appointment_time, 'no time'),
        COALESCE(r.department, 'Medical Clinic'),
        to_char(c_no_show_cutoff, 'FMHH12:MI AM')
      ),
      'system',
      r.id::text,
      jsonb_build_object(
        'reason', 'no_show',
        'appointment_date', r.appointment_date,
        'appointment_time', r.appointment_time,
        'cutoff', '17:00 Asia/Manila'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Schedule it every 15 minutes
--
-- The function derives Manila time itself, so the cron schedule's own timezone
-- is irrelevant — no DST or UTC-offset trap.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-no-show-appointments') THEN
    PERFORM cron.unschedule('expire-no-show-appointments');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-no-show-appointments',
  '*/15 * * * *',
  $cron$SELECT public.expire_no_show_appointments();$cron$
);

-- ---------------------------------------------------------------------------
-- 4. Sweep once now so already-lapsed rows are corrected (and audited)
--    immediately rather than waiting for the first scheduled run.
-- ---------------------------------------------------------------------------
SELECT public.expire_no_show_appointments() AS appointments_auto_cancelled;

-- ============================================================================
-- ROLLBACK: RESTORE STRICT PRODUCTION CLINIC HOURS (07:00–19:00 Asia/Manila)
-- ============================================================================

-- 1. Restore strict write operations guard
CREATE OR REPLACE FUNCTION public.enforce_clinic_hours_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_manila_now time;
  v_bypass boolean;
BEGIN
  v_bypass := coalesce(current_setting('app.bypass_clinic_hours', true), 'off') = 'on'
    or current_user in ('postgres', 'supabase_admin', 'service_role');

  IF NOT v_bypass THEN
    v_manila_now := (now() at time zone 'Asia/Manila')::time;

    IF v_manila_now < time '07:00' or v_manila_now >= time '19:00' THEN
      RAISE EXCEPTION 'Write operations are allowed only between 07:00 and 19:00 Asia/Manila.'
        USING ERRCODE = 'P0001',
              HINT = 'Run writes during clinic hours or set app.bypass_clinic_hours=on from a trusted backend channel.';
    END IF;
  END IF;

  IF tg_op = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Restore strict read/select operations guard
CREATE OR REPLACE FUNCTION public.is_within_clinic_hours()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_manila_now time;
BEGIN
  IF current_user in ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN TRUE;
  END IF;
  IF coalesce(current_setting('app.bypass_clinic_hours', true), 'off') = 'on' THEN
    RETURN TRUE;
  END IF;
  v_manila_now := (now() at time zone 'Asia/Manila')::time;
  RETURN v_manila_now >= time '07:00' and v_manila_now < time '19:00';
END;
$$;

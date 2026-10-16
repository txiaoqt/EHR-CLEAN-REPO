-- ============================================================================
-- Migration: 20260830250000_create_patient_settings_table.sql
-- Description:
--   1. Creates public.patient_settings table for profile-isolated patient settings.
--   2. Enforces strict RLS per patient identity (zero cross-user leakage).
--   3. Excludes clinic hours check so user preferences remain readable/writable 24/7.
--   4. Creates touch trigger for updated_at.
--   5. Creates get_or_create_patient_settings RPC for robust initialization.
--   6. Safely seeds settings for existing patients.
-- ============================================================================

-- 1. Create patient_settings table
CREATE TABLE IF NOT EXISTS public.patient_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text UNIQUE NOT NULL REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  font_scale text NOT NULL DEFAULT 'normal' CHECK (font_scale IN ('compact', 'normal', 'comfortable')),
  email_notifications boolean NOT NULL DEFAULT true,
  appointment_reminders boolean NOT NULL DEFAULT true,
  clinic_announcements boolean NOT NULL DEFAULT true,
  message_alerts boolean NOT NULL DEFAULT true,
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY' CHECK (date_format IN ('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
  time_format text NOT NULL DEFAULT '12h' CHECK (time_format IN ('12h', '24h')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'fil')),
  show_id_on_dashboard boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_patient_settings_patient_id ON public.patient_settings (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_settings_user_id ON public.patient_settings (user_id);

-- 3. Row Level Security
ALTER TABLE public.patient_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_settings_select_policy ON public.patient_settings;
CREATE POLICY patient_settings_select_policy ON public.patient_settings
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR patient_id IN (
    SELECT u.patient_id FROM public.users u
    WHERE (u.auth_user_id = auth.uid() OR u.id = auth.uid())
      AND u.patient_id IS NOT NULL
  )
  OR patient_id IN (
    SELECT pp.patient_id FROM public.patient_profiles pp
    WHERE pp.user_id = auth.uid()
  )
  OR public.current_app_role() = 'admin'
);

DROP POLICY IF EXISTS patient_settings_insert_policy ON public.patient_settings;
CREATE POLICY patient_settings_insert_policy ON public.patient_settings
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR patient_id IN (
    SELECT u.patient_id FROM public.users u
    WHERE (u.auth_user_id = auth.uid() OR u.id = auth.uid())
      AND u.patient_id IS NOT NULL
  )
  OR patient_id IN (
    SELECT pp.patient_id FROM public.patient_profiles pp
    WHERE pp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS patient_settings_update_policy ON public.patient_settings;
CREATE POLICY patient_settings_update_policy ON public.patient_settings
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR patient_id IN (
    SELECT u.patient_id FROM public.users u
    WHERE (u.auth_user_id = auth.uid() OR u.id = auth.uid())
      AND u.patient_id IS NOT NULL
  )
  OR patient_id IN (
    SELECT pp.patient_id FROM public.patient_profiles pp
    WHERE pp.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR patient_id IN (
    SELECT u.patient_id FROM public.users u
    WHERE (u.auth_user_id = auth.uid() OR u.id = auth.uid())
      AND u.patient_id IS NOT NULL
  )
  OR patient_id IN (
    SELECT pp.patient_id FROM public.patient_profiles pp
    WHERE pp.user_id = auth.uid()
  )
);

-- 4. Updated_at Trigger
CREATE OR REPLACE FUNCTION public.touch_patient_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_settings_updated_at ON public.patient_settings;
CREATE TRIGGER trg_patient_settings_updated_at
BEFORE UPDATE ON public.patient_settings
FOR EACH ROW
EXECUTE FUNCTION public.touch_patient_settings_updated_at();

-- 5. Helper RPC function for atomic initialization
CREATE OR REPLACE FUNCTION public.get_or_create_patient_settings(p_patient_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth_id uuid;
  v_target_patient_id text;
  v_settings record;
BEGIN
  v_caller_auth_id := auth.uid();
  IF v_caller_auth_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: login required');
  END IF;

  -- Determine patient_id if not explicitly provided
  IF p_patient_id IS NOT NULL AND trim(p_patient_id) <> '' THEN
    v_target_patient_id := trim(p_patient_id);
  ELSE
    SELECT u.patient_id INTO v_target_patient_id
    FROM public.users u
    WHERE (u.auth_user_id = v_caller_auth_id OR u.id = v_caller_auth_id)
      AND u.patient_id IS NOT NULL
    LIMIT 1;

    IF v_target_patient_id IS NULL THEN
      SELECT pp.patient_id INTO v_target_patient_id
      FROM public.patient_profiles pp
      WHERE pp.user_id = v_caller_auth_id
      LIMIT 1;
    END IF;
  END IF;

  IF v_target_patient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked patient profile found');
  END IF;

  -- Verify authorization: must be the owner patient or admin
  IF NOT (
    public.current_app_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE (u.auth_user_id = v_caller_auth_id OR u.id = v_caller_auth_id)
        AND u.patient_id = v_target_patient_id
    )
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles pp
      WHERE pp.user_id = v_caller_auth_id
        AND pp.patient_id = v_target_patient_id
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied to target settings');
  END IF;

  -- Ensure row exists (UPSERT)
  INSERT INTO public.patient_settings (patient_id, user_id)
  VALUES (v_target_patient_id, v_caller_auth_id)
  ON CONFLICT (patient_id) DO UPDATE
  SET user_id = coalesce(public.patient_settings.user_id, excluded.user_id)
  RETURNING * INTO v_settings;

  RETURN jsonb_build_object(
    'success', true,
    'settings', to_jsonb(v_settings)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_patient_settings(text) TO authenticated;

-- 6. Safe seed for existing patients
INSERT INTO public.patient_settings (patient_id, user_id)
SELECT
  p.id,
  (
    SELECT u.auth_user_id
    FROM public.users u
    WHERE u.patient_id = p.id
      AND u.auth_user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.auth_user_id)
    LIMIT 1
  )
FROM public.patients p
ON CONFLICT (patient_id) DO NOTHING;

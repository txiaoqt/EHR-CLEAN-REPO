-- ============================================================================
-- Migration: 20260830180000_harden_student_registration_and_prevent_account_overwrite.sql
-- Description: Harden student registration against duplicate TUP IDs, account overwrite,
--              and user enumeration.
-- ============================================================================

-- 1. Restore canonical state for conflicted test record TUPM-25-3232
--    (Angel Keith Carbon was overwritten during QA testing by a duplicate registration attempt)
UPDATE public.students
SET name = 'Angel Keith Carbon', year = 4, updated_at = now()
WHERE id = 'TUPM-25-3232';

UPDATE public.patients
SET name = 'Angel Keith Carbon', year = 4, updated_at = now()
WHERE id = 'TUPM-25-3232';

UPDATE public.patient_profiles
SET full_name = 'Angel Keith Carbon',
    email = 'angelkeith.carbon@tup.edu.ph',
    user_id = 'dfad4c24-79b6-4aca-b762-f11773a5d852'::uuid,
    student_id = 'TUPM-25-3232',
    updated_at = now()
WHERE patient_id = 'TUPM-25-3232';

-- Clear the conflicting test student_id from jennyrose.molina@tup.edu.ph user row
UPDATE public.users
SET patient_id = NULL,
    student_id = NULL,
    updated_at = now()
WHERE email = 'jennyrose.molina@tup.edu.ph'
  AND patient_id = 'TUPM-25-3232';

-- 2. Database Uniqueness Constraints on public.users
--    Enforces that a patient_id / student_id can belong to AT MOST ONE student account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_patient_id
ON public.users (patient_id)
WHERE role = 'patient' AND patient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_student_id
ON public.users (student_id)
WHERE role = 'patient' AND student_id IS NOT NULL;

-- 3. Trigger Function: Defense-in-Depth check on public.users against student ID reassignment
CREATE OR REPLACE FUNCTION public.check_unique_student_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.role = 'patient' AND NEW.patient_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.users
      WHERE patient_id = NEW.patient_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND auth_user_id <> COALESCE(NEW.auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'These student details are already associated with an account.'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_unique_student_account ON public.users;
CREATE TRIGGER trg_check_unique_student_account
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.check_unique_student_account();

-- 4. Hardened Atomic Patient Registration RPC (CREATE ONLY, NO OVERWRITE)
CREATE OR REPLACE FUNCTION public.complete_patient_registration(
  p_student_id text,
  p_name text,
  p_year integer,
  p_contact_number text default null,
  p_address text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid;
  v_auth_email text;
  v_normalized_student_id text;
  v_clean_name text;
  v_clean_year integer;
  v_user_id uuid;
  v_existing_user_id uuid;
BEGIN
  -- 1. Verify caller authentication
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required. Please log in or verify OTP.'
    );
  END IF;

  -- 2. Retrieve authenticated email
  SELECT lower(email) INTO v_auth_email
  FROM auth.users
  WHERE id = v_auth_uid;

  IF v_auth_email IS NULL OR NOT v_auth_email LIKE '%@tup.edu.ph' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only official @tup.edu.ph email addresses are authorized.'
    );
  END IF;

  -- 3. Validate & normalize Student ID
  v_normalized_student_id := upper(trim(p_student_id));
  IF v_normalized_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid Student ID format. Required format is TUPM-YY-XXXX (e.g. TUPM-23-5030).'
    );
  END IF;

  -- 4. Validate name and year
  v_clean_name := trim(p_name);
  IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Full name is required.'
    );
  END IF;

  v_clean_year := COALESCE(p_year, 1);
  IF v_clean_year < 1 OR v_clean_year > 6 THEN
    v_clean_year := 1;
  END IF;

  -- 5. ANTI-OVERWRITE & DUPLICATE ACCOUNT DEFENSE
  -- Check if student ID is already associated with another user in public.users
  SELECT id INTO v_existing_user_id
  FROM public.users
  WHERE (patient_id = v_normalized_student_id OR student_id = v_normalized_student_id)
    AND auth_user_id IS NOT NULL
    AND auth_user_id <> v_auth_uid
  LIMIT 1;

  IF v_existing_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'These student details are already associated with an account. Please sign in or use Password Recovery.'
    );
  END IF;

  -- Check if student ID is already associated with another profile in public.patient_profiles
  IF EXISTS (
    SELECT 1 FROM public.patient_profiles
    WHERE (patient_id = v_normalized_student_id OR student_id = v_normalized_student_id)
      AND user_id IS NOT NULL
      AND user_id <> v_auth_uid
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'These student details are already associated with an account. Please sign in or use Password Recovery.'
    );
  END IF;

  -- 6. Insert master student record if it does NOT already exist (NEVER OVERWRITE EXISTING)
  INSERT INTO public.students (id, name, year, updated_at)
  VALUES (v_normalized_student_id, v_clean_name, v_clean_year, now())
  ON CONFLICT (id) DO NOTHING;

  -- 7. Insert master patient record if it does NOT already exist (NEVER OVERWRITE EXISTING)
  INSERT INTO public.patients (id, name, year, sensitivity_level, updated_at)
  VALUES (v_normalized_student_id, v_clean_name, v_clean_year, 'normal', now())
  ON CONFLICT (id) DO NOTHING;

  -- 8. Create or bind public.users application account
  INSERT INTO public.users (
    id,
    auth_user_id,
    name,
    email,
    role,
    patient_id,
    student_id,
    active,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_auth_uid,
    v_clean_name,
    v_auth_email,
    'patient',
    v_normalized_student_id,
    v_normalized_student_id,
    true,
    now(),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    role = 'patient',
    patient_id = excluded.patient_id,
    student_id = excluded.student_id,
    active = true,
    updated_at = now()
  WHERE public.users.auth_user_id = v_auth_uid OR public.users.auth_user_id IS NULL
  RETURNING id INTO v_user_id;

  -- 9. Insert or link public.patient_profiles (PRESERVES EXISTING MEDICAL / PROFILE DATA)
  INSERT INTO public.patient_profiles (
    patient_id,
    user_id,
    student_id,
    full_name,
    email,
    year,
    contact_number,
    address,
    updated_at
  )
  VALUES (
    v_normalized_student_id,
    v_auth_uid,
    v_normalized_student_id,
    v_clean_name,
    v_auth_email,
    v_clean_year,
    p_contact_number,
    p_address,
    now()
  )
  ON CONFLICT (patient_id) DO UPDATE SET
    user_id = CASE WHEN public.patient_profiles.user_id IS NULL THEN excluded.user_id ELSE public.patient_profiles.user_id END,
    email = CASE WHEN public.patient_profiles.email IS NULL THEN excluded.email ELSE public.patient_profiles.email END,
    contact_number = COALESCE(public.patient_profiles.contact_number, excluded.contact_number),
    address = COALESCE(public.patient_profiles.address, excluded.address),
    updated_at = now()
  WHERE public.patient_profiles.user_id IS NULL OR public.patient_profiles.user_id = v_auth_uid;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'auth_user_id', v_auth_uid,
    'student_id', v_normalized_student_id,
    'name', v_clean_name,
    'email', v_auth_email,
    'role', 'patient'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_patient_registration(text, text, integer, text, text) TO authenticated, anon;

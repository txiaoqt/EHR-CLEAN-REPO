-- =============================================================================
-- Restore the anti-overwrite rules in complete_patient_registration
-- =============================================================================
--
-- 20261018130000 added p_date_of_birth by rewriting this function from an older
-- copy, which brought back plain upserts and dropped the 20260830180000 checks.
-- A signup could again rename another student's master record and take over
-- their patient profile. This is the 20260830 function with the date of birth.
--
-- The date of birth is filled only when missing: the signup trigger creates the
-- patients row (without one) when the code is sent, so DO NOTHING would lose it.

create or replace function public.complete_patient_registration(
  p_student_id text,
  p_name text,
  p_year integer,
  p_contact_number text default null,
  p_address text default null,
  p_date_of_birth date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid;
  v_auth_email text;
  v_normalized_student_id text;
  v_clean_name text;
  v_clean_year integer;
  v_user_id uuid;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required. Please log in or verify OTP.');
  end if;

  select lower(email) into v_auth_email from auth.users where id = v_auth_uid;
  if v_auth_email is null or not v_auth_email like '%@tup.edu.ph' then
    return jsonb_build_object('success', false, 'error', 'Only official @tup.edu.ph email addresses are authorized.');
  end if;

  v_normalized_student_id := upper(trim(p_student_id));
  if v_normalized_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid Student ID format. Required format is TUPM-YY-XXXX (e.g. TUPM-23-5030).');
  end if;

  v_clean_name := trim(p_name);
  if v_clean_name is null or length(v_clean_name) < 2 then
    return jsonb_build_object('success', false, 'error', 'Full name is required.');
  end if;

  v_clean_year := coalesce(p_year, 1);
  if v_clean_year < 1 or v_clean_year > 6 then
    v_clean_year := 1;
  end if;

  if p_date_of_birth is not null
     and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    return jsonb_build_object('success', false, 'error', 'Please enter a valid date of birth.');
  end if;

  -- A student ID already bound to another sign-in is never reassigned.
  if exists (
    select 1 from public.users
    where (patient_id = v_normalized_student_id or student_id = v_normalized_student_id)
      and auth_user_id is not null and auth_user_id <> v_auth_uid
  ) or exists (
    select 1 from public.patient_profiles
    where (patient_id = v_normalized_student_id or student_id = v_normalized_student_id)
      and user_id is not null and user_id <> v_auth_uid
  ) then
    return jsonb_build_object('success', false,
      'error', 'These student details are already associated with an account. Please sign in or use Password Recovery.');
  end if;

  -- Master records are created, never overwritten.
  insert into public.students (id, name, year, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, now())
  on conflict (id) do nothing;

  insert into public.patients (id, name, year, date_of_birth, sensitivity_level, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, p_date_of_birth, 'normal', now())
  on conflict (id) do update set
    date_of_birth = coalesce(public.patients.date_of_birth, excluded.date_of_birth),
    updated_at = now()
  where public.patients.date_of_birth is null and excluded.date_of_birth is not null;

  insert into public.users (id, auth_user_id, name, email, role, patient_id, student_id, active, created_at, updated_at)
  values (gen_random_uuid(), v_auth_uid, v_clean_name, v_auth_email, 'patient',
          v_normalized_student_id, v_normalized_student_id, true, now(), now())
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    role = 'patient',
    patient_id = excluded.patient_id,
    student_id = excluded.student_id,
    active = true,
    updated_at = now()
  where public.users.auth_user_id = v_auth_uid or public.users.auth_user_id is null
  returning id into v_user_id;

  -- The email row belongs to a different sign-in: reporting success would be false.
  if v_user_id is null then
    return jsonb_build_object('success', false,
      'error', 'These student details are already associated with an account. Please sign in or use Password Recovery.');
  end if;

  insert into public.patient_profiles (patient_id, user_id, student_id, full_name, email, year, contact_number, address, updated_at)
  values (v_normalized_student_id, v_auth_uid, v_normalized_student_id, v_clean_name, v_auth_email,
          v_clean_year, p_contact_number, p_address, now())
  on conflict (patient_id) do update set
    user_id = coalesce(public.patient_profiles.user_id, excluded.user_id),
    email = coalesce(public.patient_profiles.email, excluded.email),
    contact_number = coalesce(public.patient_profiles.contact_number, excluded.contact_number),
    address = coalesce(public.patient_profiles.address, excluded.address),
    updated_at = now()
  where public.patient_profiles.user_id is null or public.patient_profiles.user_id = v_auth_uid;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'auth_user_id', v_auth_uid,
    'student_id', v_normalized_student_id,
    'name', v_clean_name,
    'email', v_auth_email,
    'role', 'patient'
  );
end;
$$;
grant execute on function public.complete_patient_registration(text, text, integer, text, text, date) to authenticated, anon;

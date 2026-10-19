-- =============================================================================
-- Signup: name suffix, date of birth, and a required Applicant ID
-- =============================================================================
--
-- Three gaps this closes:
--
--  1. An enrollee can have a suffix (Jr., III) and the form had nowhere to put
--     it. Name parts are stored separately on `enrollees`, so it needs a column.
--  2. The enrolled-student signup collects no date of birth at all — there was no
--     column for it anywhere on the patient side. `patients` is the clinical
--     record and already holds name and year, so it goes there.
--  3. The Applicant ID was optional. It is the only thing tying an enrollee's
--     account to an admissions record, so it is now required.
--
-- The suffix is composed into the display name on the patient side, where `name`
-- is a single column; splitting that would mean reshaping a table the rest of the
-- app reads by one string.

-- -----------------------------------------------------------------------------
-- 1. New columns
-- -----------------------------------------------------------------------------
alter table if exists public.enrollees
  add column if not exists suffix text;

alter table if exists public.patients
  add column if not exists date_of_birth date;

-- -----------------------------------------------------------------------------
-- 2. The Applicant ID becomes required
-- -----------------------------------------------------------------------------
-- Guarded rather than assumed: `set not null` fails if any row already holds
-- NULL, and a migration that cannot run twice is worse than one that explains
-- itself. Existing rows are only an issue if an enrollee signed up before this,
-- and those should be backfilled by hand rather than silently defaulted.
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing from public.enrollees where applicant_id is null;

  if v_missing > 0 then
    raise notice
      'Applicant ID left nullable: % existing enrollee row(s) have none. Backfill them, then re-run this statement.',
      v_missing;
  else
    alter table public.enrollees alter column applicant_id set not null;
    raise notice 'Applicant ID is now required.';
  end if;
end;
$$;

-- An empty string is not an Applicant ID either.
alter table if exists public.enrollees
  drop constraint if exists enrollees_applicant_id_not_blank;
alter table if exists public.enrollees
  add constraint enrollees_applicant_id_not_blank
  check (applicant_id is null or length(btrim(applicant_id)) > 0);

-- -----------------------------------------------------------------------------
-- 3. complete_enrollee_registration — suffix in, Applicant ID required
-- -----------------------------------------------------------------------------
-- Dropped first: adding a parameter changes the signature, and `create or
-- replace` would otherwise leave the old five-argument version in place as an
-- overload that callers could still reach.
drop function if exists public.complete_enrollee_registration(text, text, text, date, text);

create or replace function public.complete_enrollee_registration(
  p_first_name text,
  p_middle_name text,
  p_surname text,
  p_date_of_birth date,
  p_applicant_id text,
  p_suffix text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_confirmed_at timestamptz;
  v_first text := trim(coalesce(p_first_name, ''));
  v_middle text := nullif(trim(coalesce(p_middle_name, '')), '');
  v_surname text := trim(coalesce(p_surname, ''));
  v_suffix text := nullif(trim(coalesce(p_suffix, '')), '');
  v_applicant text := nullif(upper(trim(coalesce(p_applicant_id, ''))), '');
begin
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required. Please verify your code first.');
  end if;

  select lower(email), email_confirmed_at
    into v_auth_email, v_confirmed_at
  from auth.users
  where id = v_auth_uid;

  if v_auth_email is null then
    return jsonb_build_object('success', false, 'error', 'Account not found.');
  end if;

  -- An enrollee may hold a @tup.edu.ph address only after elevation, so that
  -- address must go through the elevation flow rather than this one.
  if v_auth_email like '%@tup.edu.ph' then
    return jsonb_build_object(
      'success', false,
      'error', 'This address is already a TUP account. Use the enrolled student sign-in instead.'
    );
  end if;

  -- The OTP is only decoration if an unconfirmed address can complete signup.
  if v_confirmed_at is null then
    return jsonb_build_object('success', false, 'error', 'Please verify your email address first.');
  end if;

  if v_first = '' or v_surname = '' then
    return jsonb_build_object('success', false, 'error', 'Please enter your first name and surname.');
  end if;

  -- Required, not collected-and-forgotten: this is how the clinic ties an
  -- account to an admissions record, and without it a submission cannot be
  -- matched to a passer.
  if v_applicant is null then
    return jsonb_build_object('success', false, 'error', 'Please enter your Applicant ID.');
  end if;

  if p_date_of_birth is null then
    return jsonb_build_object('success', false, 'error', 'Please enter your date of birth.');
  end if;

  if p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01' then
    return jsonb_build_object('success', false, 'error', 'Please enter a valid date of birth.');
  end if;

  insert into public.enrollees (
    auth_user_id, personal_email, applicant_id,
    first_name, middle_name, surname, suffix, date_of_birth
  )
  values (
    v_auth_uid, v_auth_email, v_applicant,
    v_first, v_middle, v_surname, v_suffix, p_date_of_birth
  )
  on conflict (auth_user_id) do update set
    personal_email = excluded.personal_email,
    applicant_id = excluded.applicant_id,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    surname = excluded.surname,
    suffix = excluded.suffix,
    date_of_birth = excluded.date_of_birth;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.complete_enrollee_registration(text, text, text, date, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. complete_patient_registration — accept a date of birth
-- -----------------------------------------------------------------------------
-- This reproduces the existing function from
-- 20260829140000_finalize_supabase_account_architecture_and_events.sql in full,
-- changing only two things: the added `p_date_of_birth` parameter, and writing it
-- to public.patients. Everything else — the TUPM-YY-XXXX format check, the
-- students / patients / users / patient_profiles upserts, and the return shape —
-- is carried over verbatim. A function like this is the whole registration path,
-- so rewriting it from memory rather than from the original would silently drop
-- steps.
--
-- The suffix is composed into p_name by the caller, because public.users.name is
-- a single column.
drop function if exists public.complete_patient_registration(text, text, integer, text, text);

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
  -- 1. Verify caller authentication
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required. Please log in or verify OTP.');
  end if;

  -- 2. Retrieve authenticated email
  select lower(email) into v_auth_email
  from auth.users
  where id = v_auth_uid;

  if v_auth_email is null or not v_auth_email like '%@tup.edu.ph' then
    return jsonb_build_object('success', false, 'error', 'Only official @tup.edu.ph email addresses are authorized.');
  end if;

  -- 3. Validate & normalize Student ID
  v_normalized_student_id := upper(trim(p_student_id));
  if v_normalized_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid Student ID format. Required format is TUPM-YY-XXXX (e.g. TUPM-23-5030).');
  end if;

  -- 4. Validate name and year
  v_clean_name := trim(p_name);
  if v_clean_name is null or length(v_clean_name) < 2 then
    return jsonb_build_object('success', false, 'error', 'Full name is required.');
  end if;

  v_clean_year := coalesce(p_year, 1);
  if v_clean_year < 1 or v_clean_year > 6 then
    v_clean_year := 1;
  end if;

  -- 4b. Validate the date of birth, when one is given
  if p_date_of_birth is not null
     and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    return jsonb_build_object('success', false, 'error', 'Please enter a valid date of birth.');
  end if;

  -- 5. Upsert public.students master record
  insert into public.students (id, name, year, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, now())
  on conflict (id) do update set
    name = excluded.name,
    year = excluded.year,
    updated_at = now();

  -- 6. Upsert public.patients master record
  insert into public.patients (id, name, year, date_of_birth, sensitivity_level, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, p_date_of_birth, 'normal', now())
  on conflict (id) do update set
    name = excluded.name,
    year = excluded.year,
    -- A later registration without a date must not erase one already recorded.
    date_of_birth = coalesce(excluded.date_of_birth, public.patients.date_of_birth),
    updated_at = now();

  -- 7. Upsert public.users application account (strictly role = 'patient')
  insert into public.users (
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
  values (
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
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    role = 'patient',
    patient_id = excluded.patient_id,
    student_id = excluded.student_id,
    active = true,
    updated_at = now()
  returning id into v_user_id;

  -- 8. Upsert public.patient_profiles extended record
  insert into public.patient_profiles (
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
  values (
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
  on conflict (patient_id) do update set
    user_id = excluded.user_id,
    student_id = excluded.student_id,
    full_name = excluded.full_name,
    email = excluded.email,
    year = excluded.year,
    contact_number = coalesce(excluded.contact_number, public.patient_profiles.contact_number),
    address = coalesce(excluded.address, public.patient_profiles.address),
    updated_at = now();

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

comment on column public.enrollees.suffix is
  'Name suffix (Jr., III). Optional; composed into the display name on elevation.';
comment on column public.patients.date_of_birth is
  'Collected at signup. The clinic record form also holds one; that remains the clinical source.';

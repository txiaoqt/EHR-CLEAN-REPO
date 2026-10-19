-- =============================================================================
-- Phase 5: Enrollee Elevation, Document Archival, Enrollee Messaging,
-- and submit_record_form array_append fix
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fix submit_record_form array concatenation (22P02 malformed array literal)
-- -----------------------------------------------------------------------------
-- In PostgreSQL, `v_missing || 'literal'` resolves the untyped literal as
-- `text[]` (array concatenation) rather than `text` (element append), which
-- raises 22P02 "malformed array literal" (HTTP 400 in PostgREST). Using
-- `array_append` and returning field keys fixes both the 400 error and the UI
-- field highlighting.
create or replace function public.submit_record_form(
  p_college_course text,
  p_sex text,
  p_date_of_birth date,
  p_cell_phone text,
  p_permanent_address text,
  p_permanent_tel text,
  p_current_address text,
  p_current_tel text,
  p_guardian_name text,
  p_guardian_tel text,
  p_guardian_cp text,
  p_guardian_address text,
  p_past_medical_history text,
  p_vaccinations text,
  p_family_history text,
  p_form_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text;
  v_id text;
  v_missing text[] := array[]::text[];
  v_cell text := regexp_replace(coalesce(p_cell_phone, ''), '\D', '', 'g');
  v_guardian_cp text := regexp_replace(coalesce(p_guardian_cp, ''), '\D', '', 'g');
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  -- An enrollee first; otherwise a patient. Never both.
  select 'enrollee', e.id::text into v_type, v_id
  from public.enrollees e where e.auth_user_id = v_uid limit 1;

  if v_type is null then
    select 'patient', u.patient_id into v_type, v_id
    from public.users u where u.auth_user_id = v_uid and u.patient_id is not null limit 1;
  end if;

  if v_type is null then
    return jsonb_build_object('success', false, 'error', 'No clinic record is linked to this account.');
  end if;

  if nullif(trim(coalesce(p_college_course, '')), '') is null then v_missing := array_append(v_missing, 'college_course'); end if;
  if nullif(trim(coalesce(p_sex, '')), '') is null then v_missing := array_append(v_missing, 'sex'); end if;
  if p_date_of_birth is null then v_missing := array_append(v_missing, 'date_of_birth'); end if;
  if nullif(v_cell, '') is null then v_missing := array_append(v_missing, 'cell_phone'); end if;
  if nullif(trim(coalesce(p_permanent_address, '')), '') is null then v_missing := array_append(v_missing, 'permanent_address'); end if;
  if nullif(trim(coalesce(p_current_address, '')), '') is null then v_missing := array_append(v_missing, 'current_address'); end if;
  if nullif(trim(coalesce(p_guardian_name, '')), '') is null then v_missing := array_append(v_missing, 'guardian_name'); end if;
  if nullif(v_guardian_cp, '') is null then v_missing := array_append(v_missing, 'guardian_cp'); end if;
  if nullif(trim(coalesce(p_guardian_address, '')), '') is null then v_missing := array_append(v_missing, 'guardian_address'); end if;
  if nullif(trim(coalesce(p_past_medical_history, '')), '') is null then v_missing := array_append(v_missing, 'past_medical_history'); end if;
  if nullif(trim(coalesce(p_vaccinations, '')), '') is null then v_missing := array_append(v_missing, 'vaccinations'); end if;
  if nullif(trim(coalesce(p_family_history, '')), '') is null then v_missing := array_append(v_missing, 'family_history'); end if;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'Please complete all required fields.',
      'missing', to_jsonb(v_missing)
    );
  end if;

  if v_cell !~ '^09[0-9]{9}$' or v_guardian_cp !~ '^09[0-9]{9}$' then
    return jsonb_build_object(
      'success', false,
      'error', 'Mobile numbers must be 11 digits starting with 09.'
    );
  end if;

  if p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01' then
    return jsonb_build_object('success', false, 'error', 'Please check the date of birth.');
  end if;

  insert into public.patient_record_forms (
    subject_type, subject_id, form_date, college_course, sex, date_of_birth, cell_phone,
    permanent_address, permanent_tel, current_address, current_tel,
    guardian_name, guardian_tel, guardian_cp, guardian_address,
    past_medical_history, vaccinations, family_history, submitted_at
  )
  values (
    v_type, v_id, coalesce(p_form_date, current_date), trim(p_college_course), trim(p_sex), p_date_of_birth, v_cell,
    trim(p_permanent_address), nullif(trim(coalesce(p_permanent_tel, '')), ''), trim(p_current_address), nullif(trim(coalesce(p_current_tel, '')), ''),
    trim(p_guardian_name), nullif(trim(coalesce(p_guardian_tel, '')), ''), v_guardian_cp, trim(p_guardian_address),
    trim(p_past_medical_history), trim(p_vaccinations), trim(p_family_history), now()
  )
  on conflict (subject_type, subject_id) do update set
    form_date = excluded.form_date,
    college_course = excluded.college_course,
    sex = excluded.sex,
    date_of_birth = excluded.date_of_birth,
    cell_phone = excluded.cell_phone,
    permanent_address = excluded.permanent_address,
    permanent_tel = excluded.permanent_tel,
    current_address = excluded.current_address,
    current_tel = excluded.current_tel,
    guardian_name = excluded.guardian_name,
    guardian_tel = excluded.guardian_tel,
    guardian_cp = excluded.guardian_cp,
    guardian_address = excluded.guardian_address,
    past_medical_history = excluded.past_medical_history,
    vaccinations = excluded.vaccinations,
    family_history = excluded.family_history,
    submitted_at = coalesce(public.patient_record_forms.submitted_at, now()),
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.submit_record_form(
  text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, date
) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Enrollee elevation columns & Archive metadata on enrollee_documents
-- -----------------------------------------------------------------------------
alter table public.enrollees
  add column if not exists pending_tup_email text,
  add column if not exists pending_student_id text,
  add column if not exists pending_year integer,
  add column if not exists elevated_student_id text;

alter table public.enrollee_documents
  add column if not exists archived_at timestamptz,
  add column if not exists archived_student_id text,
  add column if not exists archived_student_name text,
  add column if not exists archived_applicant_id text,
  add column if not exists archived_tup_email text;

create index if not exists enrollee_documents_archived_idx
  on public.enrollee_documents (archived_at desc)
  where archived_at is not null;

-- Update the enrollee guard trigger so pending_tup_email / pending_student_id /
-- pending_year / elevated_student_id are also protected by the transaction flag.
create or replace function public.guard_enrollee_sensitive_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := public.current_app_role();
begin
  if current_setting('app.allow_enrollee_status_change', true) = 'on' then
    return new;
  end if;

  if actor in ('admin', 'physician', 'nurse') then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.tup_email is distinct from old.tup_email
     or new.elevated_at is distinct from old.elevated_at
     or new.elevated_student_id is distinct from old.elevated_student_id
     or new.auth_user_id is distinct from old.auth_user_id
     or new.personal_email is distinct from old.personal_email then
    raise exception 'Only clinic staff or the elevation workflow can change the enrolment status of an account';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Elevation RPCs (two-step: begin while signed in as enrollee, complete after
--    verifying the 6-digit OTP sent to the @tup.edu.ph mailbox)
-- -----------------------------------------------------------------------------
create or replace function public.begin_enrollee_elevation(
  p_tup_email text,
  p_student_id text,
  p_year integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_tup_email, '')));
  v_student_id text := upper(trim(coalesce(p_student_id, '')));
  v_year integer := greatest(1, least(coalesce(p_year, 1), 5));
  v_enrollee_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  select id into v_enrollee_id
  from public.enrollees
  where auth_user_id = v_uid and status = 'enrollee'
  limit 1;

  if v_enrollee_id is null then
    return jsonb_build_object('success', false, 'error', 'No active enrollee account found.');
  end if;

  if v_email !~ '^[^\s@]+@tup\.edu\.ph$' then
    return jsonb_build_object('success', false, 'error', 'Please enter your official @tup.edu.ph email address.');
  end if;

  if v_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'Student ID must follow TUPM-YY-XXXX (e.g. TUPM-26-1234).');
  end if;

  if exists (select 1 from public.users where lower(email) = v_email) then
    return jsonb_build_object('success', false, 'error', 'That TUP email is already registered to a student account.');
  end if;

  if exists (select 1 from public.patients where id = v_student_id) then
    return jsonb_build_object('success', false, 'error', 'That TUPM Student ID is already registered.');
  end if;

  perform set_config('app.allow_enrollee_status_change', 'on', true);

  update public.enrollees
     set pending_tup_email = v_email,
         pending_student_id = v_student_id,
         pending_year = v_year
   where id = v_enrollee_id;

  return jsonb_build_object(
    'success', true,
    'enrollee_id', v_enrollee_id,
    'tup_email', v_email,
    'student_id', v_student_id
  );
end;
$$;

grant execute on function public.begin_enrollee_elevation(text, text, integer) to authenticated;

create or replace function public.complete_enrollee_elevation(
  p_enrollee_id uuid default null
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
  v_enrollee record;
  v_form record;
  v_full_name text;
  v_student_id text;
  v_year integer;
  v_user_id uuid;
begin
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required. Please verify your 6-digit code first.');
  end if;

  select lower(email), email_confirmed_at
    into v_auth_email, v_confirmed_at
  from auth.users
  where id = v_auth_uid;

  if v_auth_email is null or v_auth_email not like '%@tup.edu.ph' then
    return jsonb_build_object('success', false, 'error', 'Only a verified @tup.edu.ph email can complete elevation.');
  end if;

  if v_confirmed_at is null then
    return jsonb_build_object('success', false, 'error', 'Please verify your @tup.edu.ph email with the 6-digit code first.');
  end if;

  -- Locate the enrollee row that initiated elevation for this TUP email.
  select *
    into v_enrollee
  from public.enrollees
  where status = 'enrollee'
    and lower(pending_tup_email) = v_auth_email
    and (p_enrollee_id is null or id = p_enrollee_id)
  order by updated_at desc
  limit 1;

  if v_enrollee.id is null then
    return jsonb_build_object('success', false, 'error', 'No pending elevation found for this TUP email.');
  end if;

  v_student_id := upper(trim(coalesce(v_enrollee.pending_student_id, '')));
  if v_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'A valid TUPM-YY-XXXX Student ID is required.');
  end if;

  v_year := greatest(1, least(coalesce(v_enrollee.pending_year, 1), 5));

  v_full_name := trim(concat_ws(' ',
    nullif(trim(v_enrollee.first_name), ''),
    nullif(trim(v_enrollee.middle_name), ''),
    nullif(trim(v_enrollee.surname), ''),
    nullif(trim(v_enrollee.suffix), '')
  ));

  -- Read the enrollee's clinic record form, if they completed one, so its
  -- demographics carry over to the patient profile.
  select *
    into v_form
  from public.patient_record_forms
  where subject_type = 'enrollee'
    and subject_id = v_enrollee.id::text
  limit 1;

  -- 1. Upsert public.students
  insert into public.students (id, name, year, updated_at)
  values (v_student_id, v_full_name, v_year, now())
  on conflict (id) do update set
    name = excluded.name,
    year = excluded.year,
    updated_at = now();

  -- 2. Upsert public.patients
  insert into public.patients (id, name, year, date_of_birth, sensitivity_level, updated_at)
  values (
    v_student_id,
    v_full_name,
    v_year,
    coalesce(v_form.date_of_birth, v_enrollee.date_of_birth),
    'normal',
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    year = excluded.year,
    date_of_birth = coalesce(excluded.date_of_birth, public.patients.date_of_birth),
    updated_at = now();

  -- 3. Upsert public.users (role = 'patient')
  insert into public.users (
    id, auth_user_id, name, email, role, patient_id, student_id, active, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_auth_uid, v_full_name, v_auth_email, 'patient', v_student_id, v_student_id, true, now(), now()
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

  -- 4. Upsert public.patient_profiles with any form answers already on file
  insert into public.patient_profiles (
    patient_id, user_id, student_id, full_name, email, year,
    sex, course, contact_number, address,
    emergency_contact, emergency_contact_number,
    updated_at
  )
  values (
    v_student_id,
    v_auth_uid,
    v_student_id,
    v_full_name,
    v_auth_email,
    v_year,
    v_form.sex,
    v_form.college_course,
    v_form.cell_phone,
    coalesce(v_form.current_address, v_form.permanent_address),
    v_form.guardian_name,
    coalesce(v_form.guardian_cp, v_form.guardian_tel),
    now()
  )
  on conflict (patient_id) do update set
    user_id = excluded.user_id,
    student_id = excluded.student_id,
    full_name = excluded.full_name,
    email = excluded.email,
    year = excluded.year,
    sex = coalesce(excluded.sex, public.patient_profiles.sex),
    course = coalesce(excluded.course, public.patient_profiles.course),
    contact_number = coalesce(excluded.contact_number, public.patient_profiles.contact_number),
    address = coalesce(excluded.address, public.patient_profiles.address),
    emergency_contact = coalesce(excluded.emergency_contact, public.patient_profiles.emergency_contact),
    emergency_contact_number = coalesce(excluded.emergency_contact_number, public.patient_profiles.emergency_contact_number),
    updated_at = now();

  -- 5. Re-key the clinic record form from ('enrollee', enrollee_id) to ('patient', student_id)
  if v_form.id is not null then
    perform set_config('app.allow_record_form_clinic_write', 'on', true);
    delete from public.patient_record_forms
     where subject_type = 'patient' and subject_id = v_student_id;

    update public.patient_record_forms
       set subject_type = 'patient',
           subject_id = v_student_id,
           updated_at = now()
     where id = v_form.id;
  end if;

  -- 6. Move all submitted medical certificates to Archive Files
  perform set_config('app.allow_enrollee_document_review', 'on', true);
  update public.enrollee_documents
     set archived_at = coalesce(archived_at, now()),
         archived_student_id = v_student_id,
         archived_student_name = v_full_name,
         archived_applicant_id = v_enrollee.applicant_id,
         archived_tup_email = v_auth_email
   where enrollee_id = v_enrollee.id;

  -- 7. Retire the enrollee account and record the elevation
  perform set_config('app.allow_enrollee_status_change', 'on', true);
  update public.enrollees
     set status = 'elevated',
         tup_email = v_auth_email,
         elevated_at = now(),
         elevated_student_id = v_student_id,
         updated_at = now()
   where id = v_enrollee.id;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'student_id', v_student_id,
    'name', v_full_name,
    'email', v_auth_email,
    'role', 'patient'
  );
end;
$$;

grant execute on function public.complete_enrollee_elevation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Enrollee Messaging — separate thread between enrollee and nurse/physician
-- -----------------------------------------------------------------------------
create table if not exists public.enrollee_messages (
  id uuid primary key default gen_random_uuid(),
  enrollee_id uuid not null references public.enrollees(id) on delete cascade,
  sender_role text not null check (sender_role in ('enrollee', 'nurse', 'physician', 'admin')),
  sender_name text not null,
  body text not null check (length(btrim(body)) > 0),
  read_by_staff boolean not null default false,
  read_by_enrollee boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists enrollee_messages_thread_idx
  on public.enrollee_messages (enrollee_id, created_at asc);

alter table public.enrollee_messages enable row level security;

drop policy if exists enrollee_messages_self_select on public.enrollee_messages;
create policy enrollee_messages_self_select on public.enrollee_messages
  for select using (
    enrollee_id in (select e.id from public.enrollees e where e.auth_user_id = auth.uid())
  );

drop policy if exists enrollee_messages_self_insert on public.enrollee_messages;
create policy enrollee_messages_self_insert on public.enrollee_messages
  for insert with check (
    sender_role = 'enrollee'
    and enrollee_id in (select e.id from public.enrollees e where e.auth_user_id = auth.uid())
  );

drop policy if exists enrollee_messages_self_update on public.enrollee_messages;
create policy enrollee_messages_self_update on public.enrollee_messages
  for update using (
    enrollee_id in (select e.id from public.enrollees e where e.auth_user_id = auth.uid())
  )
  with check (
    enrollee_id in (select e.id from public.enrollees e where e.auth_user_id = auth.uid())
  );

drop policy if exists enrollee_messages_staff_all on public.enrollee_messages;
create policy enrollee_messages_staff_all on public.enrollee_messages
  for all using (public.current_app_role() in ('nurse', 'physician', 'admin'))
  with check (public.current_app_role() in ('nurse', 'physician', 'admin'));

comment on table public.enrollee_messages is
  'Separate messaging thread between an enrollee and clinic nurse/physician staff prior to elevation.';

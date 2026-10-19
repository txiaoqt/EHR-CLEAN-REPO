-- =============================================================================
-- The clinic record form — the profile-completeness data
-- =============================================================================
--
-- Transcribed from the clinic's paper form (MEDICAL – DENTAL CLINIC), which has
-- two halves with different authors:
--
--   * The applicant answers everything down to Family History.
--   * The bottom is marked "ANG NASA IBABA AY SUSULATAN LAMANG NG NURSE O DOKTOR
--     NG TUP-CLINIC" — CXR, drug test and dental are filled in by clinic staff.
--
-- One row per person, shared by enrollees and patients. An enrollee's row is
-- re-keyed to their patient id on elevation rather than being copied, so the
-- details the clinic reviewed are the same details it keeps.
--
-- Completeness is about the APPLICANT half only. The clinic half being blank is
-- normal and expected — it is the clinic's work to do, not the applicant's, and
-- treating it as incomplete would lock every student out of the portal.

create table if not exists public.patient_record_forms (
  id uuid primary key default gen_random_uuid(),

  -- 'enrollee' rows key on enrollees.id (a uuid); 'patient' rows key on
  -- patients.id (a TUPM-YY-XXXX string). Stored as text because the two keys
  -- are different shapes, and a single column keeps every query the same shape.
  subject_type text not null check (subject_type in ('enrollee', 'patient')),
  subject_id text not null,

  -- ---- the applicant's half ------------------------------------------------
  form_date date,
  college_course text,
  sex text,
  date_of_birth date,
  cell_phone text,
  permanent_address text,
  permanent_tel text,
  current_address text,
  current_tel text,
  guardian_name text,
  guardian_tel text,
  guardian_cp text,
  guardian_address text,
  past_medical_history text,
  vaccinations text,
  family_history text,

  -- ---- the clinic's half ---------------------------------------------------
  cxr_result text,
  drug_test_result text,
  dental text,
  clinic_completed_by text,
  clinic_completed_at timestamptz,

  -- ---- lifecycle -----------------------------------------------------------
  -- Set when the applicant submits. This is what the gate reads.
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),

  unique (subject_type, subject_id)
);

create index if not exists patient_record_forms_subject_idx
  on public.patient_record_forms (subject_type, subject_id);

-- -----------------------------------------------------------------------------
-- Is the applicant's half complete?
-- -----------------------------------------------------------------------------
--
-- One definition, in the database, so the portal gate and the staff page cannot
-- disagree about who has finished. The fields listed are the ones the form
-- requires of an applicant — the clinic's three are excluded on purpose.
create or replace function public.record_form_complete(
  p_subject_type text,
  p_subject_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      f.submitted_at is not null
      and nullif(trim(coalesce(f.college_course, '')), '') is not null
      and f.sex is not null
      and f.date_of_birth is not null
      and nullif(trim(coalesce(f.cell_phone, '')), '') is not null
      and nullif(trim(coalesce(f.permanent_address, '')), '') is not null
      and nullif(trim(coalesce(f.current_address, '')), '') is not null
      and nullif(trim(coalesce(f.guardian_name, '')), '') is not null
      and nullif(trim(coalesce(f.guardian_cp, '')), '') is not null
      and nullif(trim(coalesce(f.guardian_address, '')), '') is not null
      and nullif(trim(coalesce(f.past_medical_history, '')), '') is not null
      and nullif(trim(coalesce(f.vaccinations, '')), '') is not null
      and nullif(trim(coalesce(f.family_history, '')), '') is not null
    from public.patient_record_forms f
    where f.subject_type = p_subject_type and f.subject_id = p_subject_id
  ), false);
$$;

grant execute on function public.record_form_complete(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Column guards — the clinic's half is not the applicant's to write
-- -----------------------------------------------------------------------------
create or replace function public.guard_record_form_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := public.current_app_role();
begin
  -- A trusted function opts in for its own transaction. The clinic-completion
  -- RPC needs this because it does not run with a staff role in every path.
  if current_setting('app.allow_record_form_clinic_write', true) = 'on' then
    return new;
  end if;

  -- Staff may write anything, including correcting the applicant's answers.
  if actor in ('admin', 'physician', 'nurse') then
    return new;
  end if;

  -- Anyone else: the clinic half and the re-keying fields are off limits.
  if new.clinic_completed_by is distinct from old.clinic_completed_by
     or new.clinic_completed_at is distinct from old.clinic_completed_at
     or new.cxr_result is distinct from old.cxr_result
     or new.drug_test_result is distinct from old.drug_test_result
     or new.dental is distinct from old.dental
     or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id then
    raise exception 'Only clinic staff can complete the clinic section of this form';
  end if;

  return new;
end;
$$;

drop trigger if exists record_forms_guard_columns on public.patient_record_forms;
create trigger record_forms_guard_columns
  before update on public.patient_record_forms
  for each row execute function public.guard_record_form_columns();

create or replace function public.touch_record_form_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists record_forms_touch on public.patient_record_forms;
create trigger record_forms_touch
  before update on public.patient_record_forms
  for each row execute function public.touch_record_form_updated_at();

-- -----------------------------------------------------------------------------
-- Submitting the applicant's half
-- -----------------------------------------------------------------------------
--
-- Upsert rather than insert, so a half-finished form that was saved can be
-- completed in place, and a retry after a dropped connection does not fail.
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
  v_missing text[] := '{}';
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

  -- Reported together rather than one at a time, so a form is not rejected
  -- fifteen times for fifteen fields.
  if nullif(trim(coalesce(p_college_course, '')), '') is null then v_missing := v_missing || 'College/Course'; end if;
  if p_sex is null then v_missing := v_missing || 'Sex'; end if;
  if p_date_of_birth is null then v_missing := v_missing || 'Date of birth'; end if;
  if nullif(trim(coalesce(p_cell_phone, '')), '') is null then v_missing := v_missing || 'Cell phone'; end if;
  if nullif(trim(coalesce(p_permanent_address, '')), '') is null then v_missing := v_missing || 'Permanent address'; end if;
  if nullif(trim(coalesce(p_current_address, '')), '') is null then v_missing := v_missing || 'Current address'; end if;
  if nullif(trim(coalesce(p_guardian_name, '')), '') is null then v_missing := v_missing || 'Guardian'; end if;
  if nullif(trim(coalesce(p_guardian_cp, '')), '') is null then v_missing := v_missing || 'Guardian cell phone'; end if;
  if nullif(trim(coalesce(p_guardian_address, '')), '') is null then v_missing := v_missing || 'Guardian address'; end if;
  if nullif(trim(coalesce(p_past_medical_history, '')), '') is null then v_missing := v_missing || 'Past medical history'; end if;
  if nullif(trim(coalesce(p_vaccinations, '')), '') is null then v_missing := v_missing || 'Vaccinations'; end if;
  if nullif(trim(coalesce(p_family_history, '')), '') is null then v_missing := v_missing || 'Family history'; end if;

  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'Please complete: ' || array_to_string(v_missing, ', ') || '.',
      'missing', to_jsonb(v_missing)
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
    v_type, v_id, coalesce(p_form_date, current_date), trim(p_college_course), p_sex, p_date_of_birth, trim(p_cell_phone),
    trim(p_permanent_address), nullif(trim(coalesce(p_permanent_tel, '')), ''), trim(p_current_address), nullif(trim(coalesce(p_current_tel, '')), ''),
    trim(p_guardian_name), nullif(trim(coalesce(p_guardian_tel, '')), ''), trim(p_guardian_cp), trim(p_guardian_address),
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
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.patient_record_forms enable row level security;

-- An enrollee reads and writes their own row.
drop policy if exists record_forms_enrollee on public.patient_record_forms;
create policy record_forms_enrollee on public.patient_record_forms
  for all
  using (
    subject_type = 'enrollee'
    and subject_id in (select e.id::text from public.enrollees e where e.auth_user_id = auth.uid())
  )
  with check (
    subject_type = 'enrollee'
    and subject_id in (select e.id::text from public.enrollees e where e.auth_user_id = auth.uid())
  );

-- A patient reads and writes their own row.
drop policy if exists record_forms_patient on public.patient_record_forms;
create policy record_forms_patient on public.patient_record_forms
  for all
  using (
    subject_type = 'patient'
    and subject_id in (select u.patient_id from public.users u where u.auth_user_id = auth.uid())
  )
  with check (
    subject_type = 'patient'
    and subject_id in (select u.patient_id from public.users u where u.auth_user_id = auth.uid())
  );

-- Clinic staff read every row; the clinic half is filled in here.
drop policy if exists record_forms_staff on public.patient_record_forms;
create policy record_forms_staff on public.patient_record_forms
  for all
  using (public.current_app_role() in ('admin', 'physician', 'nurse'))
  with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

comment on table public.patient_record_forms is
  'The clinic paper record, as input fields. The applicant half gates portal access; the clinic half (CXR, drug test, dental) is staff-only.';

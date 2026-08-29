-- ============================================================================
-- MIGRATION: 20260829140000_finalize_supabase_account_architecture_and_events.sql
-- Description:
--   1. Finalize public.admins (staff accounts only) and public.users (patients only).
--   2. Enforce canonical Student ID format: TUPM-YY-XXXX (^TUPM-[0-9]{2}-[0-9]{4}$).
--   3. Create public.patient_profiles for extended clinical profile data.
--   4. Create public.events & public.event_email_logs for clinic events & announcement blast.
--   5. Create public.complete_patient_registration RPC for atomic patient registration.
--   6. Enhance public.patient_messages with auth_user_id ownership attribution.
--   7. Update RLS policies and role helper functions (zero nurse default).
-- ============================================================================

-- Bypass clinic hours during migration session if active
select set_config('app.bypass_clinic_hours', 'on', true);

-- ----------------------------------------------------------------------------
-- 1. Ensure public.admins exists (STAFF ONLY)
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'physician', 'nurse')),
  avatar text,
  active boolean not null default true,
  failed_login_attempts integer not null default 0,
  last_failed_login_at timestamptz,
  locked_until timestamptz,
  lockout_reason text,
  last_login_at timestamptz,
  clearance_level text not null default 'standard',
  department text not null default 'Medical Clinic',
  abac_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admins_auth_user_id on public.admins (auth_user_id);
create index if not exists idx_admins_email on public.admins (lower(email));
create index if not exists idx_admins_role on public.admins (role);

-- ----------------------------------------------------------------------------
-- 2. Align public.users (PATIENTS ONLY)
-- ----------------------------------------------------------------------------
alter table if exists public.users
  add column if not exists student_id text,
  add column if not exists patient_id text references public.patients(id) on update cascade on delete set null;

-- Remove plaintext password column from public.users if present
alter table if exists public.users drop column if exists password;

-- Clean up any staff accounts from public.users
delete from public.users where role in ('admin', 'physician', 'nurse');

-- Enforce patient-only constraint on public.users
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role = 'patient');

create index if not exists idx_users_patient_id on public.users (patient_id);
create index if not exists idx_users_student_id on public.users (student_id);

-- ----------------------------------------------------------------------------
-- 3. Create public.patient_profiles (EXTENDED PATIENT PROFILE)
-- ----------------------------------------------------------------------------
create table if not exists public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  patient_id text unique not null references public.patients(id) on update cascade on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  student_id text not null,
  full_name text not null,
  email text,
  year integer check (year between 1 and 6),
  contact_number text,
  address text,
  emergency_contact text,
  emergency_contact_number text,
  blood_type text,
  allergies text,
  medications text,
  medical_history text,
  immunization_history text,
  notes text,
  profile_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure all columns exist if table was already created in prior run
alter table if exists public.patient_profiles
  add column if not exists notes text,
  add column if not exists contact_number text,
  add column if not exists address text,
  add column if not exists emergency_contact text,
  add column if not exists emergency_contact_number text,
  add column if not exists blood_type text,
  add column if not exists allergies text,
  add column if not exists medications text,
  add column if not exists medical_history text,
  add column if not exists immunization_history text;

create index if not exists idx_patient_profiles_patient_id on public.patient_profiles (patient_id);
create index if not exists idx_patient_profiles_user_id on public.patient_profiles (user_id);
create index if not exists idx_patient_profiles_email on public.patient_profiles (lower(email));

-- Seed patient_profiles from existing patients & users
insert into public.patient_profiles (patient_id, user_id, student_id, full_name, email, year, allergies, medications, notes, created_at, updated_at)
select
  p.id as patient_id,
  u.auth_user_id as user_id,
  p.id as student_id,
  p.name as full_name,
  u.email as email,
  p.year as year,
  p.allergies as allergies,
  p.medications as medications,
  p.notes as notes,
  now() as created_at,
  now() as updated_at
from public.patients p
left join public.users u on u.patient_id = p.id
on conflict (patient_id) do update set
  full_name = excluded.full_name,
  year = coalesce(excluded.year, public.patient_profiles.year),
  email = coalesce(excluded.email, public.patient_profiles.email),
  user_id = coalesce(excluded.user_id, public.patient_profiles.user_id),
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 4. Create public.events & public.event_email_logs (EVENTS MODULE)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  category text default 'General',
  status text default 'draft' check (status in ('draft', 'published', 'cancelled', 'archived')),
  is_published boolean default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_events_event_date on public.events (event_date);
create index if not exists idx_events_status on public.events (status);
create index if not exists idx_events_is_published on public.events (is_published);
create index if not exists idx_events_category on public.events (category);

create table if not exists public.event_email_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  sent_by uuid references auth.users(id) on delete set null,
  recipient_count integer default 0,
  success_count integer default 0,
  failed_count integer default 0,
  status text default 'completed',
  error_message text,
  sent_at timestamptz default now()
);

create index if not exists idx_event_email_logs_event_id on public.event_email_logs (event_id);
create index if not exists idx_event_email_logs_sent_at on public.event_email_logs (sent_at desc);

-- Seed initial clinic events if none exist
insert into public.events (id, title, description, event_date, start_time, end_time, location, category, status, is_published, created_at, updated_at)
values
(
  'e1000000-0000-0000-0000-000000000001',
  'TUP Manila Annual Blood Donation Drive',
  'Join the University Clinic and Red Cross for the annual blood donation drive. Free health screening and refreshments provided.',
  current_date + interval '5 days',
  '08:30:00',
  '16:00:00',
  'TUP Main Gymnasium / Clinic Annex',
  'Blood Drive',
  'published',
  true,
  now(),
  now()
),
(
  'e1000000-0000-0000-0000-000000000002',
  'Free Flu & Tetanus Vaccination Drive',
  'Annual seasonal influenza and booster vaccination for all enrolled college students and faculty.',
  current_date + interval '12 days',
  '09:00:00',
  '15:30:00',
  'University Clinic Room 102',
  'Vaccination',
  'published',
  true,
  now(),
  now()
),
(
  'e1000000-0000-0000-0000-000000000003',
  'Mental Health & Stress Management Seminar',
  'Interactive workshop on coping strategies, academic burnout prevention, and campus counseling resources.',
  current_date + interval '18 days',
  '13:30:00',
  '17:00:00',
  'Audio-Visual Theater (AVR 2)',
  'Health Seminar',
  'published',
  true,
  now(),
  now()
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Enhance public.patient_messages with auth_user_id
-- ----------------------------------------------------------------------------
alter table if exists public.patient_messages
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_patient_messages_auth_user_id on public.patient_messages (auth_user_id);

-- Backfill auth_user_id for patient messages where user is known
update public.patient_messages pm
set auth_user_id = u.auth_user_id
from public.users u
where pm.auth_user_id is null
  and pm.patient_id = u.patient_id
  and u.auth_user_id is not null;

-- ----------------------------------------------------------------------------
-- 6. Atomic Patient Registration Function (RPC)
-- ----------------------------------------------------------------------------
create or replace function public.complete_patient_registration(
  p_student_id text,
  p_name text,
  p_year integer,
  p_contact_number text default null,
  p_address text default null
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

  -- 5. Upsert public.students master record
  insert into public.students (id, name, year, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, now())
  on conflict (id) do update set
    name = excluded.name,
    year = excluded.year,
    updated_at = now();

  -- 6. Upsert public.patients master record
  insert into public.patients (id, name, year, sensitivity_level, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, 'normal', now())
  on conflict (id) do update set
    name = excluded.name,
    year = excluded.year,
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

grant execute on function public.complete_patient_registration(text, text, integer, text, text) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 7. Safe Public User Auth Sync Trigger (NEVER default to nurse)
-- ----------------------------------------------------------------------------
create or replace function public.sync_public_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_email text;
  v_patient_id text;
begin
  v_email := lower(coalesce(new.email, ''));
  v_role := lower(coalesce(new.raw_user_meta_data->>'role', ''));
  v_name := coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '');
  v_patient_id := upper(trim(coalesce(new.raw_user_meta_data->>'patient_id', new.raw_user_meta_data->>'student_id', '')));

  -- Route Staff accounts to public.admins
  if v_role in ('admin', 'physician', 'nurse') then
    if v_name = '' then
      v_name := case v_role
        when 'physician' then 'Dr. Rivera'
        when 'nurse' then 'Nurse Santos'
        when 'admin' then 'Clinic Administrator'
        else initcap(v_role)
      end;
    end if;

    insert into public.admins (id, auth_user_id, name, email, role, active, created_at, updated_at)
    values (gen_random_uuid(), new.id, v_name, v_email, v_role, true, now(), now())
    on conflict (email) do update set
      auth_user_id = excluded.auth_user_id,
      name = case when public.admins.name in ('Dr. Rivera', 'Nurse Santos', 'Staff User', 'Administrator') and excluded.name <> '' then excluded.name else public.admins.name end,
      role = excluded.role,
      active = excluded.active,
      updated_at = now();

    return new;
  end if;

  -- Route Patient accounts to public.users
  if v_role = 'patient' or v_email like '%@tup.edu.ph' then
    if v_name = '' then
      v_name := split_part(v_email, '@', 1);
    end if;

    if v_patient_id ~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
      insert into public.students (id, name, year, updated_at)
      values (v_patient_id, v_name, 1, now())
      on conflict (id) do update set
        name = case when excluded.name <> '' and excluded.name not in ('Patient', 'Clinic User') then excluded.name else public.students.name end,
        updated_at = now();

      insert into public.patients (id, name, year, sensitivity_level, updated_at)
      values (v_patient_id, v_name, 1, 'normal', now())
      on conflict (id) do update set
        name = case when excluded.name <> '' and excluded.name not in ('Patient', 'Clinic User') then excluded.name else public.patients.name end,
        updated_at = now();
    else
      v_patient_id := null;
    end if;

    insert into public.users (id, auth_user_id, name, email, role, patient_id, student_id, active, created_at, updated_at)
    values (gen_random_uuid(), new.id, v_name, v_email, 'patient', v_patient_id, v_patient_id, true, now(), now())
    on conflict (email) do update set
      auth_user_id = excluded.auth_user_id,
      name = case when public.users.name in ('Patient', 'Clinic User') and excluded.name not in ('', 'Patient', 'Clinic User') then excluded.name else public.users.name end,
      role = 'patient',
      patient_id = coalesce(excluded.patient_id, public.users.patient_id),
      student_id = coalesce(excluded.student_id, public.users.student_id),
      active = excluded.active,
      updated_at = now();

    return new;
  end if;

  -- If role is unassigned or invalid, safely skip without creating a broken profile or defaulting to nurse
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Safe Staff Directory Projection View
-- ----------------------------------------------------------------------------
create or replace view public.staff_directory as
select
  id,
  name,
  role,
  avatar,
  department,
  active
from public.admins
where active = true;

grant select on public.staff_directory to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Row Level Security Policies
-- ----------------------------------------------------------------------------
alter table public.patient_profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_email_logs enable row level security;

-- patient_profiles RLS
drop policy if exists patient_profiles_patient_select on public.patient_profiles;
create policy patient_profiles_patient_select on public.patient_profiles
for select to authenticated
using (
  user_id = auth.uid()
  or patient_id in (select u.patient_id from public.users u where u.auth_user_id = auth.uid())
  or public.current_app_role() in ('admin', 'physician', 'nurse')
);

drop policy if exists patient_profiles_patient_update on public.patient_profiles;
create policy patient_profiles_patient_update on public.patient_profiles
for update to authenticated
using (
  user_id = auth.uid()
  or patient_id in (select u.patient_id from public.users u where u.auth_user_id = auth.uid())
  or public.current_app_role() in ('admin', 'physician', 'nurse')
)
with check (
  user_id = auth.uid()
  or patient_id in (select u.patient_id from public.users u where u.auth_user_id = auth.uid())
  or public.current_app_role() in ('admin', 'physician', 'nurse')
);

drop policy if exists patient_profiles_insert on public.patient_profiles;
create policy patient_profiles_insert on public.patient_profiles
for insert to authenticated
with check (
  user_id = auth.uid()
  or public.current_app_role() in ('admin', 'physician', 'nurse')
);

-- events RLS
drop policy if exists events_public_select on public.events;
create policy events_public_select on public.events
for select to anon, authenticated
using (
  (is_published = true and status = 'published')
  or public.current_app_role() in ('admin', 'physician', 'nurse')
);

drop policy if exists events_staff_insert on public.events;
create policy events_staff_insert on public.events
for insert to authenticated
with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

drop policy if exists events_staff_update on public.events;
create policy events_staff_update on public.events
for update to authenticated
using (public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

drop policy if exists events_staff_delete on public.events;
create policy events_staff_delete on public.events
for delete to authenticated
using (public.current_app_role() in ('admin', 'physician', 'nurse'));

-- event_email_logs RLS
drop policy if exists event_email_logs_staff on public.event_email_logs;
create policy event_email_logs_staff on public.event_email_logs
for all to authenticated
using (public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

-- Grants
grant select on public.events to anon, authenticated;
grant select, insert, update on public.patient_profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert on public.event_email_logs to authenticated;


-- ============================================================================
-- Migration: Split Staff & Patient Accounts, Standardize Student IDs to TUPM-YY-XXXX
-- Filename: supabase/migrations/20260829130000_split_staff_admins_and_standardize_student_ids.sql
-- ============================================================================

-- 1. Ensure required extensions
do $$
begin
  begin
    execute 'create extension if not exists pgcrypto';
  exception when insufficient_privilege or read_only_sql_transaction then
    raise notice 'Skipping CREATE EXTENSION pgcrypto due to environment permissions.';
  end;
end $$;

-- 2. Create public.admins table for Staff Portal accounts (admin, physician, nurse)
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text unique not null,
  role text not null check (role in ('admin', 'physician', 'nurse')),
  avatar text,
  active boolean not null default true,
  failed_login_attempts integer not null default 0,
  last_failed_login_at timestamptz,
  locked_until timestamptz,
  lockout_reason text,
  last_login_at timestamptz,
  clearance_level smallint,
  department text,
  abac_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admins_auth_user_id on public.admins (auth_user_id);
create index if not exists idx_admins_email on public.admins (email);
create index if not exists idx_admins_role on public.admins (role);

-- 3. Migrate existing staff rows from public.users to public.admins preserving original UUIDs
insert into public.admins (
  id,
  auth_user_id,
  name,
  email,
  role,
  avatar,
  active,
  failed_login_attempts,
  last_failed_login_at,
  locked_until,
  lockout_reason,
  last_login_at,
  created_at,
  updated_at
)
select
  u.id,
  u.auth_user_id,
  u.name,
  u.email,
  u.role,
  u.avatar,
  coalesce(u.active, true),
  coalesce(u.failed_login_attempts, 0),
  u.last_failed_login_at,
  u.locked_until,
  u.lockout_reason,
  u.last_login_at,
  coalesce(u.created_at, now()),
  coalesce(u.updated_at, now())
from public.users u
where u.role in ('admin', 'physician', 'nurse')
on conflict (email) do update set
  auth_user_id = coalesce(excluded.auth_user_id, public.admins.auth_user_id),
  name = excluded.name,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();

-- Ensure standard staff accounts in public.admins
do $$
declare
  v_phys_auth_id uuid;
  v_nurse_auth_id uuid;
begin
  select id into v_phys_auth_id from auth.users where lower(email) = 'physician@tupclinic.local';
  select id into v_nurse_auth_id from auth.users where lower(email) = 'nurse@tupclinic.local';

  insert into public.admins (id, auth_user_id, name, email, role, active, created_at, updated_at)
  values
    (gen_random_uuid(), v_phys_auth_id, 'Dr. Rivera', 'physician@tupclinic.local', 'physician', true, now(), now()),
    (gen_random_uuid(), v_nurse_auth_id, 'Nurse Santos', 'nurse@tupclinic.local', 'nurse', true, now(), now())
  on conflict (email) do update set
    auth_user_id = coalesce(excluded.auth_user_id, public.admins.auth_user_id),
    name = excluded.name,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();
end $$;

-- 4. Migrate Foreign Keys in break_glass_audit_logs to reference public.admins(id)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'break_glass_audit_logs') then
    -- Drop old foreign keys referencing users
    alter table public.break_glass_audit_logs
      drop constraint if exists break_glass_audit_logs_user_id_fkey,
      drop constraint if exists break_glass_audit_logs_approved_by_fkey;

    -- Add new foreign keys referencing admins
    alter table public.break_glass_audit_logs
      add constraint break_glass_audit_logs_user_id_fkey foreign key (user_id) references public.admins(id) on update cascade on delete set null,
      add constraint break_glass_audit_logs_approved_by_fkey foreign key (approved_by) references public.admins(id) on update cascade on delete set null;
  end if;
end $$;

-- 5. Standardize Student IDs to TUPM-YY-XXXX format
create temp table if not exists _student_id_migration_map (
  old_id text primary key,
  new_id text not null unique
);
truncate table _student_id_migration_map;

insert into _student_id_migration_map (old_id, new_id)
select
  id as old_id,
  case
    when id ~ '^TUPM-[0-9]{2}-[0-9]{4}$' then id
    when id ~ '^[0-9]{4}-[0-9]{5}$' then 'TUPM-' || substr(id, 3, 2) || '-' || substr(id, 7, 4)
    when id ~ '^[0-9]{2}-[0-9]{4}$' then 'TUPM-' || id
    else 'TUPM-23-' || right('0000' || replace(replace(id, 'TEST-USER-', ''), 'student-', ''), 4)
  end as new_id
from public.students;

-- Apply updates to students table (cascades to patients, appointments, encounters, patient_messages, users)
update public.students s
set id = m.new_id
from _student_id_migration_map m
where s.id = m.old_id and s.id <> m.new_id;

-- Add or update format check constraint on public.students
alter table public.students drop constraint if exists chk_students_id_format;
alter table public.students add constraint chk_students_id_format check (id ~ '^TUPM-[0-9]{2}-[0-9]{4}$');

-- 6. Clean up migrated staff rows from public.users and enforce role = 'patient'
delete from public.users where role in ('admin', 'physician', 'nurse');

-- Drop old role constraint and apply patient-only constraint
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role = 'patient');
alter table public.users alter column role set default 'patient';

-- Ensure password column in public.users is nullable or dropped
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'password'
  ) then
    alter table public.users alter column password drop not null;
  end if;
end $$;

-- 7. Create safe public.staff_directory projection view for patient-side staff pickers
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

grant select on public.staff_directory to authenticated, anon;

-- 8. Update Automatic Profile Sync Trigger: auth.users -> (public.admins | public.users)
create or replace function public.sync_public_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_name text;
  v_role text;
  v_patient_id text;
begin
  if new.email is null then
    return new;
  end if;

  v_email := lower(new.email);
  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), 'Clinic User');
  v_role := lower(coalesce(new.raw_user_meta_data->>'role', ''));
  v_patient_id := new.raw_user_meta_data->>'patient_id';

  -- Route based on role
  if v_role in ('admin', 'physician', 'nurse') then
    -- Staff Account -> public.admins
    update public.admins
    set
      auth_user_id = new.id,
      name = coalesce(nullif(trim(name), ''), v_name),
      email = coalesce(email, v_email),
      role = v_role,
      updated_at = now()
    where lower(email) = v_email;

    if not exists (
      select 1 from public.admins a where a.auth_user_id = new.id or lower(a.email) = v_email
    ) then
      insert into public.admins (id, auth_user_id, name, email, role, active, created_at, updated_at)
      values (gen_random_uuid(), new.id, v_name, v_email, v_role, true, now(), now());
    end if;

  elsif v_role = 'patient' then
    -- Patient Account -> public.users
    update public.users
    set
      auth_user_id = new.id,
      name = coalesce(nullif(trim(name), ''), v_name),
      email = coalesce(email, v_email),
      patient_id = coalesce(patient_id, v_patient_id),
      role = 'patient',
      updated_at = now()
    where lower(email) = v_email;

    if not exists (
      select 1 from public.users u where u.auth_user_id = new.id or lower(u.email) = v_email
    ) then
      insert into public.users (id, auth_user_id, name, email, role, active, patient_id, created_at, updated_at)
      values (gen_random_uuid(), new.id, v_name, v_email, 'patient', true, v_patient_id, now(), now());
    end if;

  else
    -- Unknown/invalid/missing role: Fail safely, NEVER default to nurse!
    raise notice 'sync_public_user_from_auth: Skipping sync for % with unknown role: %', v_email, v_role;
  end if;

  return new;
exception
  when others then
    raise warning 'sync_public_user_from_auth failed for %: %', coalesce(new.email, '<null>'), sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_sync_public_user_from_auth_insert on auth.users;
create trigger trg_sync_public_user_from_auth_insert
after insert on auth.users
for each row execute function public.sync_public_user_from_auth();

drop trigger if exists trg_sync_public_user_from_auth_update on auth.users;
create trigger trg_sync_public_user_from_auth_update
after update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_public_user_from_auth();

-- 9. Role & Access Control Helper Functions
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select a.role
      from public.admins a
      where a.auth_user_id = auth.uid()
      limit 1
    ),
    (
      select u.role
      from public.users u
      where u.auth_user_id = auth.uid()
      limit 1
    ),
    null
  )::text;
$$;

create or replace function public.is_physician_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('physician', 'admin'), false);
$$;

create or replace function public.current_clinician_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select a.name
      from public.admins a
      where a.auth_user_id = auth.uid()
      limit 1
    ),
    ''
  )::text;
$$;

-- 10. Login Lockout Routing Functions
create or replace function public.get_login_lockout_status(p_email text)
returns table (
  locked_until timestamptz,
  is_locked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until timestamptz;
begin
  -- Check admins first
  select a.locked_until
    into v_locked_until
  from public.admins a
  where lower(a.email) = lower(p_email)
  limit 1;

  -- If not in admins, check users
  if v_locked_until is null and not exists (select 1 from public.admins a where lower(a.email) = lower(p_email)) then
    select u.locked_until
      into v_locked_until
    from public.users u
    where lower(u.email) = lower(p_email)
    limit 1;
  end if;

  return query
  select
    v_locked_until,
    (v_locked_until is not null and v_locked_until > now());
end;
$$;

create or replace function public.register_failed_login(
  p_email text,
  p_lock_after integer default 5,
  p_lock_minutes integer default 15,
  p_reason text default 'too_many_failed_attempts'
)
returns table (
  user_id uuid,
  failed_attempts integer,
  locked_until timestamptz,
  is_locked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admins%rowtype;
  v_user public.users%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
begin
  -- 1. Try staff (admins)
  select * into v_admin
  from public.admins a
  where lower(a.email) = lower(p_email)
  limit 1
  for update;

  if found then
    v_attempts := coalesce(v_admin.failed_login_attempts, 0) + 1;
    if v_attempts >= greatest(p_lock_after, 1) then
      v_locked_until := now() + make_interval(mins => greatest(p_lock_minutes, 1));
    else
      v_locked_until := null;
    end if;

    update public.admins
    set
      failed_login_attempts = v_attempts,
      last_failed_login_at = now(),
      locked_until = v_locked_until,
      lockout_reason = case when v_locked_until is null then null else coalesce(p_reason, 'too_many_failed_attempts') end,
      updated_at = now()
    where id = v_admin.id;

    return query
    select
      v_admin.id,
      v_attempts,
      v_locked_until,
      (v_locked_until is not null and v_locked_until > now());
    return;
  end if;

  -- 2. Try patients (users)
  select * into v_user
  from public.users u
  where lower(u.email) = lower(p_email)
  limit 1
  for update;

  if found then
    v_attempts := coalesce(v_user.failed_login_attempts, 0) + 1;
    if v_attempts >= greatest(p_lock_after, 1) then
      v_locked_until := now() + make_interval(mins => greatest(p_lock_minutes, 1));
    else
      v_locked_until := null;
    end if;

    update public.users
    set
      failed_login_attempts = v_attempts,
      last_failed_login_at = now(),
      locked_until = v_locked_until,
      lockout_reason = case when v_locked_until is null then null else coalesce(p_reason, 'too_many_failed_attempts') end,
      updated_at = now()
    where id = v_user.id;

    return query
    select
      v_user.id,
      v_attempts,
      v_locked_until,
      (v_locked_until is not null and v_locked_until > now());
    return;
  end if;

  return;
end;
$$;

create or replace function public.clear_login_lockout(
  p_email text,
  p_touch_last_login boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admins
  set
    failed_login_attempts = 0,
    last_failed_login_at = null,
    locked_until = null,
    lockout_reason = null,
    last_login_at = case when p_touch_last_login then now() else last_login_at end,
    updated_at = now()
  where lower(email) = lower(p_email);

  update public.users
  set
    failed_login_attempts = 0,
    last_failed_login_at = null,
    locked_until = null,
    lockout_reason = null,
    last_login_at = case when p_touch_last_login then now() else last_login_at end,
    updated_at = now()
  where lower(email) = lower(p_email);
end;
$$;

revoke all on function public.get_login_lockout_status(text) from public;
revoke all on function public.register_failed_login(text, integer, integer, text) from public;
revoke all on function public.clear_login_lockout(text, boolean) from public;

grant execute on function public.get_login_lockout_status(text) to anon, authenticated;
grant execute on function public.register_failed_login(text, integer, integer, text) to anon, authenticated;
grant execute on function public.clear_login_lockout(text, boolean) to authenticated;

-- 11. Enable Row Level Security & Configure Policies
alter table public.admins enable row level security;
alter table public.users enable row level security;

-- Admins Table Policies
drop policy if exists admins_select_policy on public.admins;
create policy admins_select_policy on public.admins
for select to authenticated
using (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.current_app_role() in ('admin', 'physician', 'nurse')
  )
);

drop policy if exists admins_update_policy on public.admins;
create policy admins_update_policy on public.admins
for update to authenticated
using (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.is_physician_or_admin()
  )
)
with check (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.is_physician_or_admin()
  )
);

-- Users (Patient) Table Policies
drop policy if exists users_select_policy on public.users;
create policy users_select_policy on public.users
for select to authenticated
using (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.current_app_role() in ('admin', 'physician', 'nurse')
  )
);

drop policy if exists users_update_policy on public.users;
create policy users_update_policy on public.users
for update to authenticated
using (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.is_physician_or_admin()
  )
)
with check (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.is_physician_or_admin()
  )
);

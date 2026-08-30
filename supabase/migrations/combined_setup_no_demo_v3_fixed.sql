-- Combined SQL v3 FIXED (dependency-safe order, patient-role compatible)
-- Generated on 2026-05-19
-- Order: schema -> security migration -> auth/rls -> seeds

do $$
begin
  begin
    execute 'create extension if not exists pgcrypto';
  exception when insufficient_privilege or read_only_sql_transaction then
    raise notice 'Skipping CREATE EXTENSION pgcrypto due to environment permissions.';
  end;
end $$;

-- ============================================================================
-- BEGIN FILE: schema.sql
-- ============================================================================
-- TUP EHR Supabase schema
-- Paste this whole file into the Supabase SQL Editor.
-- ADMINS (Staff Accounts: admin, physician, nurse)
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

-- USERS (Patient Accounts ONLY)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique,
  role text not null default 'patient' check (role = 'patient'),
  avatar text,
  active boolean not null default true,
  failed_login_attempts integer not null default 0,
  last_failed_login_at timestamptz,
  locked_until timestamptz,
  lockout_reason text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ROLE PERMISSIONS
-- This table defines module access per role for app-level RBAC checks.
create table if not exists public.role_permissions (
  role text not null check (role in ('admin', 'physician', 'nurse', 'patient')),
  module text not null,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role, module)
);

-- STUDENTS (master list)
create table if not exists public.students (
  id text primary key check (id ~ '^TUPM-[0-9]{2}-[0-9]{4}$'),
  name text not null,
  year integer not null check (year >= 1 and year <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PATIENTS
create table if not exists public.patients (
  id text primary key references public.students(id) on update cascade on delete restrict,
  name text not null,
  year integer not null check (year >= 1 and year <= 5),
  last_visit_date date,
  medications text,
  allergies text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.users
  add column if not exists patient_id text references public.patients(id) on update cascade on delete set null;

-- APPOINTMENTS
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.students(id) on update cascade on delete restrict,
  patient_name text,
  appointment_date date not null,
  appointment_time text not null,
  type text not null default 'Consult' check (type in ('Consult', 'Follow-up')),
  clinician_name text not null,
  clinician_id text,
  clinician text,
  source text not null default 'staff' check (source in ('staff', 'portal', 'kiosk')),
  department text not null default 'Medical Clinic' check (department in ('Medical Clinic', 'Dental Clinic')),
  appointment_type text not null default 'Future Appointment' check (appointment_type in ('Same-day Appointment', 'Future Appointment')),
  service_type text,
  queue_number integer,
  reference_code text,
  status text not null default 'Scheduled' check (status in ('Scheduled', 'Checked-in', 'Cancelled', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ENCOUNTERS
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(id) on update cascade on delete restrict,
  patient_name text,
  clinician_name text not null,
  clinician_id text,
  clinician text,
  encounter_date timestamptz not null default now(),
  chief_complaint text,
  hpi text,
  physical_exam text,
  assessment_plan text,
  vitals jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- INVENTORY
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  item_name text not null unique,
  category text not null default 'Uncategorized',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  unit text not null default 'pcs',
  reorder_level integer not null default 10 check (reorder_level >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- INVENTORY TRANSACTIONS
-- NOTE: no FK on item_name by design, because app inserts a transaction after item deletion.
create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  transaction_type text not null check (transaction_type in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  reason text,
  performed_by text,
  created_at timestamptz not null default now()
);

-- SETTINGS (key-value)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AUDIT LOGS
-- Includes both legacy and newer fields used across the app.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  action text not null,
  description text,
  performed_by text,
  detail text,
  message text,
  type text,
  meta jsonb,
  reference_id text,
  item_id text,
  encounter_id text,
  appointment_id text,
  created_at timestamptz not null default now()
);

-- PATIENT MESSAGES
create table if not exists public.patient_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(id) on update cascade on delete cascade,
  patient_name text,
  sender_role text not null check (sender_role in ('patient', 'physician', 'nurse', 'admin', 'clinic')),
  sender_name text,
  recipient_name text,
  concern_type text not null default 'General clinic inquiry' check (concern_type in ('Appointment concern', 'Follow-up question', 'Medical inquiry', 'Dental inquiry', 'General clinic inquiry')),
  message_text text not null,
  status text not null default 'sent' check (status in ('sent', 'read', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backward-compatible alignment for older databases.
alter table if exists public.appointments
  add column if not exists source text not null default 'staff',
  add column if not exists department text not null default 'Medical Clinic',
  add column if not exists appointment_type text not null default 'Future Appointment',
  add column if not exists service_type text,
  add column if not exists queue_number integer,
  add column if not exists reference_code text;

alter table if exists public.patient_messages
  add column if not exists concern_type text not null default 'General clinic inquiry',
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- PROFILES (optional helper table read by Dashboard fallback)
create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PATIENT PROFILES (extended clinical profile information)
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
  avatar_url text,
  profile_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure all columns exist if table was already created in prior run
alter table if exists public.patient_profiles
  add column if not exists notes text,
  add column if not exists avatar_url text,
  add column if not exists contact_number text,
  add column if not exists address text,
  add column if not exists emergency_contact text,
  add column if not exists emergency_contact_number text,
  add column if not exists blood_type text,
  add column if not exists allergies text,
  add column if not exists medications text,
  add column if not exists medical_history text,
  add column if not exists immunization_history text;

-- EVENTS (clinic drives, vaccination missions, seminars)
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

-- EVENT EMAIL LOGS (announcement blast tracking)
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

-- INDEXES
create index if not exists idx_users_email on public.users (email);
create unique index if not exists idx_users_unique_patient_id on public.users (patient_id) where role = 'patient' and patient_id is not null;
create unique index if not exists idx_users_unique_student_id on public.users (student_id) where role = 'patient' and student_id is not null;

create index if not exists idx_students_name on public.students (name);

create index if not exists idx_patients_name on public.patients (name);
create index if not exists idx_patients_last_visit_date on public.patients (last_visit_date);

create index if not exists idx_appointments_date on public.appointments (appointment_date);
create index if not exists idx_appointments_patient_id on public.appointments (patient_id);
create index if not exists idx_appointments_status on public.appointments (status);
create index if not exists idx_appointments_created_at on public.appointments (created_at desc);
create unique index if not exists idx_appointments_one_active_per_student on public.appointments (patient_id) where status in ('Scheduled', 'Checked-in');
create unique index if not exists idx_appointments_one_active_per_slot on public.appointments (department, appointment_date, appointment_time) where status in ('Scheduled', 'Checked-in');

create index if not exists idx_encounters_patient_id on public.encounters (patient_id);
create index if not exists idx_encounters_status on public.encounters (status);
create index if not exists idx_encounters_date on public.encounters (encounter_date desc);
create index if not exists idx_encounters_created_at on public.encounters (created_at desc);
create index if not exists idx_encounters_clinician_name on public.encounters (clinician_name);

create index if not exists idx_inventory_item_name on public.inventory (item_name);
create index if not exists idx_inventory_category on public.inventory (category);

create index if not exists idx_inventory_txn_item_name on public.inventory_transactions (item_name);
create index if not exists idx_inventory_txn_created_at on public.inventory_transactions (created_at desc);
create index if not exists idx_inventory_txn_type on public.inventory_transactions (transaction_type);

create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_performed_by on public.audit_logs (performed_by);
create index if not exists idx_patient_messages_patient_id on public.patient_messages (patient_id);
create index if not exists idx_patient_messages_created_at on public.patient_messages (created_at desc);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.has_role_permission(
  p_role text,
  p_module text,
  p_action text
)
returns boolean
language sql
stable
as $$
  select
    case
      when p_action = 'view' then rp.can_view
      when p_action = 'create' then rp.can_create
      when p_action = 'update' then rp.can_update
      when p_action = 'delete' then rp.can_delete
      else false
    end
  from public.role_permissions rp
  where rp.role = p_role and rp.module = p_module
  limit 1;
$$;

drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_students_set_updated_at on public.students;
create trigger trg_students_set_updated_at
before update on public.students
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_patients_set_updated_at on public.patients;
create trigger trg_patients_set_updated_at
before update on public.patients
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_appointments_set_updated_at on public.appointments;
create trigger trg_appointments_set_updated_at
before update on public.appointments
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_encounters_set_updated_at on public.encounters;
create trigger trg_encounters_set_updated_at
before update on public.encounters
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_set_updated_at on public.inventory;
create trigger trg_inventory_set_updated_at
before update on public.inventory
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_settings_set_updated_at on public.settings;
create trigger trg_settings_set_updated_at
before update on public.settings
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_role_permissions_set_updated_at on public.role_permissions;
create trigger trg_role_permissions_set_updated_at
before update on public.role_permissions
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_patient_messages_set_updated_at on public.patient_messages;
create trigger trg_patient_messages_set_updated_at
before update on public.patient_messages
for each row execute procedure public.set_updated_at();

-- Keep access simple for current frontend usage (anon key + direct table access)
alter table public.users disable row level security;
alter table public.role_permissions disable row level security;
alter table public.students disable row level security;
alter table public.patients disable row level security;
alter table public.appointments disable row level security;
alter table public.encounters disable row level security;
alter table public.inventory disable row level security;
alter table public.inventory_transactions disable row level security;
alter table public.settings disable row level security;
alter table public.audit_logs disable row level security;
alter table public.profiles disable row level security;
alter table public.patient_messages disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
grant usage, select on sequences to anon, authenticated;

-- Seed RBAC defaults
insert into public.role_permissions (role, module, can_view, can_create, can_update, can_delete) values
('admin', 'dashboard', true, true, true, true),
('admin', 'patients', true, true, true, true),
('admin', 'appointments', true, true, true, true),
('admin', 'encounters', true, true, true, true),
('admin', 'inventory', true, true, true, true),
('admin', 'reports', true, true, true, true),
('admin', 'settings', true, true, true, true),
('admin', 'users', true, true, true, true),
('physician', 'dashboard', true, true, true, true),
('physician', 'patients', true, true, true, true),
('physician', 'appointments', true, true, true, true),
('physician', 'encounters', true, true, true, true),
('physician', 'inventory', true, true, true, true),
('physician', 'reports', true, true, true, true),
('physician', 'settings', true, true, true, true),
('physician', 'users', true, false, false, false),
('nurse', 'dashboard', true, false, false, false),
('nurse', 'patients', true, true, true, false),
('nurse', 'appointments', true, true, true, false),
('nurse', 'encounters', true, true, true, false),
('nurse', 'inventory', true, true, true, false),
('nurse', 'reports', true, true, false, false),
('nurse', 'settings', false, false, false, false),
('nurse', 'users', false, false, false, false),
('patient', 'patient_dashboard', true, false, false, false),
('patient', 'patient_schedule', true, true, true, false),
('patient', 'patient_messages', true, true, false, false),
('patient', 'patient_records', true, false, false, false),
('patient', 'patient_profile', true, true, true, false)
on conflict (role, module) do update set
  can_view = excluded.can_view,
  can_create = excluded.can_create,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  updated_at = now();

-- Mock clinic users for login screen (supports both legacy/plain-password and auth-based schemas).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'password'
  ) then
    insert into public.users (name, email, password, role, active) values
    ('Dr. Rivera', 'physician@tupclinic.local', 'Physician@123', 'physician', true),
    ('Nurse Santos', 'nurse@tupclinic.local', 'Nurse@123', 'nurse', true)
    on conflict (email) do update set
      name = excluded.name,
      password = excluded.password,
      role = excluded.role,
      active = excluded.active,
      updated_at = now();
  else
    insert into public.users (name, email, role, active) values
    ('Dr. Rivera', 'physician@tupclinic.local', 'physician', true),
    ('Nurse Santos', 'nurse@tupclinic.local', 'nurse', true)
    on conflict (email) do update set
      name = excluded.name,
      role = excluded.role,
      active = excluded.active,
      updated_at = now();
  end if;
end
$$;

-- END FILE: schema.sql

-- ============================================================================
-- BEGIN FILE: supabase/migrations/20260414103000_security_abac_clinic_hours.sql
-- ============================================================================
-- Migration: security hardening + ABAC baseline + clinic-hours write guard
-- Safe for already-deployed schemas; idempotent where practical.
-- 1) Role cleanup: remove legacy 'user' and enforce allowed roles.
do $$
begin
  if to_regclass('public.users') is not null then
    update public.users
      set role = 'nurse'
    where role is null or lower(role) = 'user';
  end if;

  if to_regclass('public.role_permissions') is not null then
    delete from public.role_permissions
    where role is null or lower(role) = 'user';
  end if;
end
$$;

do $$
declare
  r record;
begin
  if to_regclass('public.users') is not null then
    for r in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'users'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%role%'
    loop
      execute format('alter table public.users drop constraint if exists %I', r.conname);
    end loop;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'users'
        and c.conname = 'users_role_check'
    ) then
      alter table public.users
        add constraint users_role_check
        check (role in ('admin', 'physician', 'nurse', 'patient'));
    end if;
  end if;

  if to_regclass('public.role_permissions') is not null then
    for r in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'role_permissions'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%role%'
    loop
      execute format('alter table public.role_permissions drop constraint if exists %I', r.conname);
    end loop;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'role_permissions'
        and c.conname = 'role_permissions_role_check'
    ) then
      alter table public.role_permissions
        add constraint role_permissions_role_check
        check (role in ('admin', 'physician', 'nurse', 'patient'));
    end if;
  end if;
end
$$;

-- 2) Users lockout support columns + helper procedures.
do $$
begin
  if to_regclass('public.users') is not null then
    alter table public.users
      add column if not exists failed_login_attempts integer not null default 0,
      add column if not exists last_failed_login_at timestamptz,
      add column if not exists locked_until timestamptz,
      add column if not exists lockout_reason text,
      add column if not exists last_login_at timestamptz;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.users'::regclass
        and conname = 'users_failed_login_attempts_check'
    ) then
      alter table public.users
        add constraint users_failed_login_attempts_check
        check (failed_login_attempts >= 0);
    end if;
  end if;
end
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
  v_user public.users%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
begin
  select *
    into v_user
  from public.users u
  where lower(u.email) = lower(p_email)
  limit 1
  for update;

  if not found then
    return;
  end if;

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

-- 3) Clinic-hours DB guard (07:00-19:00 Asia/Manila) for write operations.
create or replace function public.enforce_clinic_hours_write_guard()
returns trigger
language plpgsql
as $$
declare
  v_manila_now time;
  v_bypass boolean;
begin
  v_bypass := coalesce(current_setting('app.bypass_clinic_hours', true), 'off') = 'on'
    or current_user in ('postgres', 'supabase_admin', 'service_role');

  if not v_bypass then
    v_manila_now := (now() at time zone 'Asia/Manila')::time;

    if v_manila_now < time '07:00' or v_manila_now >= time '19:00' then
      raise exception 'Write operations are allowed only between 07:00 and 19:00 Asia/Manila.'
        using errcode = 'P0001',
              hint = 'Run writes during clinic hours or set app.bypass_clinic_hours=on from a trusted backend channel.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.apply_clinic_hours_guard(p_target_table regclass)
returns void
language plpgsql
as $$
declare
  v_table text;
  v_trigger text;
begin
  select relname into v_table from pg_class where oid = p_target_table;

  if v_table is null then
    return;
  end if;

  v_trigger := 'trg_' || v_table || '_clinic_hours_guard';

  execute format('drop trigger if exists %I on %s', v_trigger, p_target_table);
  execute format(
    'create trigger %I before insert or update or delete on %s for each row execute function public.enforce_clinic_hours_write_guard()',
    v_trigger,
    p_target_table
  );
end;
$$;

do $$
begin
  if to_regclass('public.users') is not null then
    perform public.apply_clinic_hours_guard('public.users'::regclass);
  end if;
  if to_regclass('public.students') is not null then
    perform public.apply_clinic_hours_guard('public.students'::regclass);
  end if;
  if to_regclass('public.patients') is not null then
    perform public.apply_clinic_hours_guard('public.patients'::regclass);
  end if;
  if to_regclass('public.appointments') is not null then
    perform public.apply_clinic_hours_guard('public.appointments'::regclass);
  end if;
  if to_regclass('public.encounters') is not null then
    perform public.apply_clinic_hours_guard('public.encounters'::regclass);
  end if;
  if to_regclass('public.inventory') is not null then
    perform public.apply_clinic_hours_guard('public.inventory'::regclass);
  end if;
  if to_regclass('public.inventory_transactions') is not null then
    perform public.apply_clinic_hours_guard('public.inventory_transactions'::regclass);
  end if;
  if to_regclass('public.settings') is not null then
    perform public.apply_clinic_hours_guard('public.settings'::regclass);
  end if;
  if to_regclass('public.role_permissions') is not null then
    perform public.apply_clinic_hours_guard('public.role_permissions'::regclass);
  end if;
end
$$;

-- 4) ABAC support fields.
do $$
begin
  if to_regclass('public.users') is not null then
    alter table public.users
      add column if not exists clearance_level smallint not null default 1,
      add column if not exists department text,
      add column if not exists abac_attributes jsonb not null default '{}'::jsonb;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.users'::regclass
        and conname = 'users_clearance_level_check'
    ) then
      alter table public.users
        add constraint users_clearance_level_check
        check (clearance_level between 1 and 5);
    end if;
  end if;

  if to_regclass('public.patients') is not null then
    alter table public.patients
      add column if not exists sensitivity_level text not null default 'normal',
      add column if not exists abac_tags text[] not null default '{}'::text[];

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.patients'::regclass
        and conname = 'patients_sensitivity_level_check'
    ) then
      alter table public.patients
        add constraint patients_sensitivity_level_check
        check (sensitivity_level in ('normal', 'restricted'));
    end if;
  end if;

  if to_regclass('public.encounters') is not null then
    alter table public.encounters
      add column if not exists sensitivity_level text not null default 'normal',
      add column if not exists abac_tags text[] not null default '{}'::text[];

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.encounters'::regclass
        and conname = 'encounters_sensitivity_level_check'
    ) then
      alter table public.encounters
        add constraint encounters_sensitivity_level_check
        check (sensitivity_level in ('normal', 'restricted'));
    end if;
  end if;
end
$$;

create index if not exists idx_patients_sensitivity_level on public.patients (sensitivity_level);
create index if not exists idx_encounters_sensitivity_level on public.encounters (sensitivity_level);
create index if not exists idx_users_clearance_level on public.users (clearance_level);

-- 4b) Optional break-glass logging table + helper function.
create table if not exists public.break_glass_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.admins(id) on update cascade on delete set null,
  patient_id text references public.patients(id) on update cascade on delete set null,
  encounter_id uuid references public.encounters(id) on update cascade on delete set null,
  justification text not null,
  access_scope text not null default 'read',
  approved_by uuid references public.admins(id) on update cascade on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_break_glass_user_id on public.break_glass_audit_logs (user_id);
create index if not exists idx_break_glass_patient_id on public.break_glass_audit_logs (patient_id);
create index if not exists idx_break_glass_encounter_id on public.break_glass_audit_logs (encounter_id);
create index if not exists idx_break_glass_created_at on public.break_glass_audit_logs (created_at desc);

create or replace function public.log_break_glass_access(
  p_user_id uuid,
  p_justification text,
  p_patient_id text default null,
  p_encounter_id uuid default null,
  p_access_scope text default 'read',
  p_approved_by uuid default null,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.break_glass_audit_logs (
    user_id,
    patient_id,
    encounter_id,
    justification,
    access_scope,
    approved_by,
    expires_at,
    metadata
  )
  values (
    p_user_id,
    p_patient_id,
    p_encounter_id,
    p_justification,
    coalesce(nullif(trim(p_access_scope), ''), 'read'),
    p_approved_by,
    p_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Keep table accessible with existing open-access pattern.
grant select, insert on public.break_glass_audit_logs to anon, authenticated;

-- END FILE: supabase/migrations/20260414103000_security_abac_clinic_hours.sql

-- ============================================================================
-- BEGIN FILE: schema_auth_rls.sql
-- ============================================================================
-- TUP Clinic EHR: Supabase Auth + RLS hardening schema
-- Run this in Supabase SQL Editor AFTER your base schema has been created.
-- This migration includes Auth/RLS support but keeps app password login compatibility.
-- -----------------------------------------------------------------------------
-- 1) USERS TABLE ALIGNMENT FOR auth.users
-- -----------------------------------------------------------------------------
alter table if exists public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists last_failed_login_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists lockout_reason text,
  add column if not exists last_login_at timestamptz,
  add column if not exists patient_id text references public.patients(id) on update cascade on delete set null;

alter table if exists public.appointments
  add column if not exists clinician_auth_user_id uuid references auth.users(id) on delete set null;

alter table if exists public.encounters
  add column if not exists clinician_auth_user_id uuid references auth.users(id) on delete set null;

alter table if exists public.patients
  add column if not exists sensitivity_level text not null default 'normal';

alter table if exists public.encounters
  add column if not exists sensitivity_level text not null default 'normal';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_sensitivity_level_check'
  ) then
    alter table public.patients
      add constraint patients_sensitivity_level_check
      check (sensitivity_level in ('normal', 'restricted'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.encounters'::regclass
      and conname = 'encounters_sensitivity_level_check'
  ) then
    alter table public.encounters
      add constraint encounters_sensitivity_level_check
      check (sensitivity_level in ('normal', 'restricted'));
  end if;
end
$$;

create table if not exists public.patient_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(id) on update cascade on delete cascade,
  patient_name text,
  sender_role text not null check (sender_role in ('patient', 'physician', 'nurse', 'admin', 'clinic')),
  sender_name text,
  recipient_name text,
  message_text text not null,
  status text not null default 'sent' check (status in ('sent', 'read', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_messages_patient_id on public.patient_messages (patient_id);
create index if not exists idx_patient_messages_created_at on public.patient_messages (created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'password'
  ) then
    alter table public.users
      alter column password drop not null;
  end if;
end
$$;

-- Keep password column for current app login flow (nurse/physician/patient credential login).
alter table if exists public.users
  add column if not exists password text;

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
    -- Unknown/missing role: Fail safely, do NOT default to nurse!
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

-- -----------------------------------------------------------------------------
-- 3) ROLE + CLINIC-HOURS HELPERS
-- -----------------------------------------------------------------------------
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

create or replace function public.can_access_sensitivity(p_sensitivity text)
returns boolean
language sql
stable
as $$
  select
    case
      when coalesce(lower(p_sensitivity), 'normal') = 'restricted' then public.is_physician_or_admin()
      else true
    end;
$$;

create or replace function public.is_within_clinic_hours()
returns boolean
language plpgsql
stable
as $$
declare
  v_manila_now time;
begin
  -- DEVELOPMENT MODE: Temporarily bypass clinic hours so development and testing can proceed 24/7.
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) LOGIN LOCKOUT RPCS (used by login page)
-- -----------------------------------------------------------------------------
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
  select a.locked_until
    into v_locked_until
  from public.admins a
  where lower(a.email) = lower(p_email)
  limit 1;

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

  -- 5. ANTI-OVERWRITE & DUPLICATE ACCOUNT DEFENSE
  -- Check if student ID is already associated with another user in public.users
  select id into v_existing_user_id
  from public.users
  where (patient_id = v_normalized_student_id or student_id = v_normalized_student_id)
    and auth_user_id is not null
    and auth_user_id <> v_auth_uid
  limit 1;

  if v_existing_user_id is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'These student details are already associated with an account. Please sign in or use Password Recovery.'
    );
  end if;

  -- Check if student ID is already associated with another profile in public.patient_profiles
  if exists (
    select 1 from public.patient_profiles
    where (patient_id = v_normalized_student_id or student_id = v_normalized_student_id)
      and user_id is not null
      and user_id <> v_auth_uid
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'These student details are already associated with an account. Please sign in or use Password Recovery.'
    );
  end if;

  -- 6. Insert master student record if it does NOT already exist (DO NOT OVERWRITE EXISTING)
  insert into public.students (id, name, year, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, now())
  on conflict (id) do nothing;

  -- 7. Insert master patient record if it does NOT already exist (DO NOT OVERWRITE EXISTING)
  insert into public.patients (id, name, year, sensitivity_level, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, 'normal', now())
  on conflict (id) do nothing;

  -- 8. Create or bind public.users application account
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
  where public.users.auth_user_id = v_auth_uid or public.users.auth_user_id is null
  returning id into v_user_id;

  -- 9. Insert or link public.patient_profiles (PRESERVES EXISTING MEDICAL / PROFILE DATA)
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
    user_id = case when public.patient_profiles.user_id is null then excluded.user_id else public.patient_profiles.user_id end,
    email = case when public.patient_profiles.email is null then excluded.email else public.patient_profiles.email end,
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

create or replace function public.set_clinician_auth_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.clinician_auth_user_id is null then
    new.clinician_auth_user_id := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.get_login_lockout_status(text) from public;
revoke all on function public.register_failed_login(text, integer, integer, text) from public;
revoke all on function public.clear_login_lockout(text, boolean) from public;

grant execute on function public.get_login_lockout_status(text) to anon, authenticated;
grant execute on function public.register_failed_login(text, integer, integer, text) to anon, authenticated;
grant execute on function public.clear_login_lockout(text, boolean) to authenticated;
grant execute on function public.complete_patient_registration(text, text, integer, text, text) to authenticated, anon;

drop trigger if exists trg_set_appointments_clinician_auth_user_id on public.appointments;
create trigger trg_set_appointments_clinician_auth_user_id
before insert on public.appointments
for each row execute function public.set_clinician_auth_user_id();

create or replace function public.check_one_active_appointment_per_student()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status in ('Scheduled', 'Checked-in') then
    if exists (
      select 1 from public.appointments
      where patient_id = new.patient_id
        and status in ('Scheduled', 'Checked-in')
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'Active appointment already exists for patient % (Status must be Cancelled before booking a new appointment)', new.patient_id
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_one_active_appointment on public.appointments;
create trigger trg_check_one_active_appointment
before insert or update on public.appointments
for each row execute function public.check_one_active_appointment_per_student();

create or replace function public.get_slot_occupancy(
  p_start_date date default current_date,
  p_end_date date default (current_date + 90)
)
returns table (
  department text,
  appointment_date text,
  appointment_time text,
  occupied_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select 
    coalesce(a.department, 'Medical Clinic')::text as department,
    a.appointment_date::text as appointment_date,
    a.appointment_time::text as appointment_time,
    count(*)::bigint as occupied_count
  from public.appointments a
  where a.appointment_date >= p_start_date
    and a.appointment_date <= p_end_date
    and a.status in ('Scheduled', 'Checked-in')
  group by coalesce(a.department, 'Medical Clinic'), a.appointment_date, a.appointment_time;
$$;

grant execute on function public.get_slot_occupancy(date, date) to authenticated, anon;

drop trigger if exists trg_set_encounters_clinician_auth_user_id on public.encounters;
create trigger trg_set_encounters_clinician_auth_user_id
before insert on public.encounters
for each row execute function public.set_clinician_auth_user_id();

-- -----------------------------------------------------------------------------
-- 5) RLS ENABLE + POLICY SETUP
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'users',
    'role_permissions',
    'students',
    'patients',
    'appointments',
    'encounters',
    'inventory',
    'inventory_transactions',
    'settings',
    'audit_logs',
    'profiles',
    'patient_messages',
    'break_glass_audit_logs'
  ];
begin
  foreach t in array tables
  loop
    if to_regclass(format('public.%s', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end
$$;

-- Remove broad anon access and keep explicit authenticated grants.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
revoke all on tables from anon;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
grant usage, select on sequences to authenticated;

-- Drop existing policies to avoid duplication conflicts.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- USERS: own row read/update; physician/admin can read all.
create policy users_select_policy
on public.users
for select
to authenticated
using (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or (public.current_app_role() = 'patient' and patient_id is not null)
    or public.is_physician_or_admin()
  )
);

create policy users_update_policy
on public.users
for update
to authenticated
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

-- ROLE PERMISSIONS: read by authenticated, write by admin only.
create policy role_permissions_select_policy
on public.role_permissions
for select
to authenticated
using (public.is_within_clinic_hours());

create policy role_permissions_write_policy
on public.role_permissions
for all
to authenticated
using (public.is_within_clinic_hours() and public.current_app_role() = 'admin')
with check (public.is_within_clinic_hours() and public.current_app_role() = 'admin');

-- Core clinical tables: authenticated can read during clinic hours.
create policy students_select_policy on public.students
for select to authenticated
using (public.is_within_clinic_hours());

create policy patients_select_policy on public.patients
for select to authenticated
using (
  public.is_within_clinic_hours()
  and public.can_access_sensitivity(sensitivity_level)
);

create policy appointments_select_policy on public.appointments
for select to authenticated
using (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or (
      public.current_app_role() = 'patient'
      and patient_id in (
        select u.patient_id
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.patient_id is not null
      )
    )
  )
);

create policy encounters_select_policy on public.encounters
for select to authenticated
using (
  public.is_within_clinic_hours()
  and public.can_access_sensitivity(sensitivity_level)
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or (
      public.current_app_role() = 'patient'
      and patient_id in (
        select u.patient_id
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.patient_id is not null
      )
    )
  )
);

create policy inventory_select_policy on public.inventory
for select to authenticated
using (public.is_within_clinic_hours());

create policy inventory_tx_select_policy on public.inventory_transactions
for select to authenticated
using (public.is_within_clinic_hours());

create policy settings_select_policy on public.settings
for select to authenticated
using (public.is_within_clinic_hours());

create policy profiles_select_policy on public.profiles
for select to authenticated
using (public.is_within_clinic_hours());

create policy audit_logs_select_policy on public.audit_logs
for select to authenticated
using (public.is_within_clinic_hours());

-- Insert/update for nurse/physician/admin in clinic hours.
create policy students_insert_policy on public.students
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy students_update_policy on public.students
for update to authenticated
using (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy patients_insert_policy on public.patients
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy patients_update_policy on public.patients
for update to authenticated
using (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy appointments_insert_policy on public.appointments
for insert to authenticated
with check (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or (
      public.current_app_role() = 'patient'
      and patient_id in (
        select u.patient_id
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.patient_id is not null
      )
    )
  )
);

create policy appointments_update_physician_admin_policy on public.appointments
for update to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin())
with check (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy appointments_update_nurse_own_policy on public.appointments
for update to authenticated
using (
  public.is_within_clinic_hours()
  and public.current_app_role() = 'nurse'
  and (
    clinician_auth_user_id = auth.uid()
    or lower(coalesce(clinician_name, '')) = lower(public.current_clinician_name())
  )
)
with check (
  public.is_within_clinic_hours()
  and public.current_app_role() = 'nurse'
  and (
    clinician_auth_user_id = auth.uid()
    or lower(coalesce(clinician_name, '')) = lower(public.current_clinician_name())
  )
);

create policy appointments_update_patient_own_policy on public.appointments
for update to authenticated
using (
  public.is_within_clinic_hours()
  and public.current_app_role() = 'patient'
  and patient_id in (
    select u.patient_id
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.patient_id is not null
  )
)
with check (
  public.is_within_clinic_hours()
  and public.current_app_role() = 'patient'
  and patient_id in (
    select u.patient_id
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.patient_id is not null
  )
);

create policy patient_messages_select_policy on public.patient_messages
for select to authenticated
using (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or (
      public.current_app_role() = 'patient'
      and (
        auth_user_id = auth.uid()
        or patient_id in (
          select u.patient_id
          from public.users u
          where u.auth_user_id = auth.uid()
            and u.patient_id is not null
        )
      )
    )
  )
);

create policy patient_messages_insert_policy on public.patient_messages
for insert to authenticated
with check (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or (
      public.current_app_role() = 'patient'
      and sender_role = 'patient'
      and (auth_user_id is null or auth_user_id = auth.uid())
      and patient_id in (
        select u.patient_id
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.patient_id is not null
      )
    )
  )
);

-- PATIENT PROFILES RLS
create policy patient_profiles_select_policy on public.patient_profiles
for select to authenticated
using (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or user_id = auth.uid()
    or patient_id in (
      select u.patient_id
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.patient_id is not null
    )
  )
);

create policy patient_profiles_update_policy on public.patient_profiles
for update to authenticated
using (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or user_id = auth.uid()
    or patient_id in (
      select u.patient_id
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.patient_id is not null
    )
  )
)
with check (
  public.is_within_clinic_hours()
  and (
    public.current_app_role() in ('admin', 'physician', 'nurse')
    or user_id = auth.uid()
    or patient_id in (
      select u.patient_id
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.patient_id is not null
    )
  )
);

-- EVENTS RLS
create policy events_select_policy on public.events
for select to anon, authenticated
using (
  (is_published = true and status = 'published')
  or public.current_app_role() in ('admin', 'physician', 'nurse')
);

create policy events_write_staff_policy on public.events
for all to authenticated
using (public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy event_email_logs_staff_policy on public.event_email_logs
for all to authenticated
using (public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy encounters_insert_policy on public.encounters
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy encounters_update_physician_admin_policy on public.encounters
for update to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin())
with check (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy encounters_update_nurse_own_policy on public.encounters
for update to authenticated
using (
  public.is_within_clinic_hours()
  and public.current_app_role() = 'nurse'
  and (
    clinician_auth_user_id = auth.uid()
    or lower(coalesce(clinician_name, '')) = lower(public.current_clinician_name())
  )
)
with check (
  public.is_within_clinic_hours()
  and public.current_app_role() = 'nurse'
  and (
    clinician_auth_user_id = auth.uid()
    or lower(coalesce(clinician_name, '')) = lower(public.current_clinician_name())
  )
);

create policy inventory_insert_policy on public.inventory
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy inventory_update_policy on public.inventory
for update to authenticated
using (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy inventory_tx_insert_policy on public.inventory_transactions
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy settings_write_policy on public.settings
for all to authenticated
using (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'))
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

create policy audit_logs_insert_policy on public.audit_logs
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician', 'nurse'));

-- Delete is physician/admin only.
create policy patients_delete_policy on public.patients
for delete to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy appointments_delete_policy on public.appointments
for delete to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy encounters_delete_policy on public.encounters
for delete to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy inventory_delete_policy on public.inventory
for delete to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy inventory_tx_delete_policy on public.inventory_transactions
for delete to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin());

-- Break glass logs
create policy break_glass_select_policy on public.break_glass_audit_logs
for select to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin());

create policy break_glass_insert_policy on public.break_glass_audit_logs
for insert to authenticated
with check (public.is_within_clinic_hours() and public.current_app_role() in ('admin', 'physician'));

-- -----------------------------------------------------------------------------
-- 6) FIELD-LEVEL GUARDS
-- -----------------------------------------------------------------------------
create or replace function public.guard_users_sensitive_updates()
returns trigger
language plpgsql
as $$
begin
  -- Allow system-level / SQL editor sessions
  if current_user in ('postgres', 'supabase_admin', 'service_role') or auth.uid() is null then
    return new;
  end if;

  if not public.is_physician_or_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only admin/physician can change roles.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Only admin/physician can change active status.';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'auth_user_id cannot be changed by this user.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_users_sensitive_updates on public.users;
create trigger trg_guard_users_sensitive_updates
before update on public.users
for each row execute function public.guard_users_sensitive_updates();

create or replace function public.guard_encounter_assessment_plan_updates()
returns trigger
language plpgsql
as $$
begin
  if public.current_app_role() = 'nurse'
     and new.assessment_plan is distinct from old.assessment_plan then
    raise exception 'Nurse role cannot modify assessment_plan.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_encounter_assessment_plan_updates on public.encounters;
create trigger trg_guard_encounter_assessment_plan_updates
before update on public.encounters
for each row execute function public.guard_encounter_assessment_plan_updates();

-- -----------------------------------------------------------------------------
-- 7) SEED/MAP CLINIC ACCOUNTS (role assignment happens in public.users)
-- -----------------------------------------------------------------------------
-- Create these users in Supabase Dashboard -> Authentication -> Users:
--   physician@tupclinic.local
--   nurse@tupclinic.local
-- Then run the role updates below.

do $$
declare
  v_physician_id uuid;
  v_nurse_id uuid;
  v_encrypted_pass_physician text;
  v_encrypted_pass_nurse text;
begin
  -- Bcrypt hashed passwords
  v_encrypted_pass_physician := crypt('Physician@123', gen_salt('bf'));
  v_encrypted_pass_nurse := crypt('Nurse@123', gen_salt('bf'));

  -- Provision Physician: physician@tupclinic.local / Physician@123
  select id into v_physician_id from auth.users where lower(email) = 'physician@tupclinic.local';
  if v_physician_id is null then
    v_physician_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      v_physician_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'physician@tupclinic.local',
      v_encrypted_pass_physician,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Dr. Rivera","role":"physician"}'::jsonb,
      now(),
      now(),
      '', '', '', ''
    );
  else
    update auth.users
    set
      encrypted_password = v_encrypted_pass_physician,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{name}', '"Dr. Rivera"'),
      updated_at = now()
    where id = v_physician_id;
  end if;

  -- Ensure identity for physician
  if not exists (select 1 from auth.identities where user_id = v_physician_id) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) then
      execute $dyn$
        insert into auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          provider_id,
          last_sign_in_at,
          created_at,
          updated_at
        ) values (
          $1,
          $1,
          json_build_object('sub', $1::text, 'email', 'physician@tupclinic.local'),
          'email',
          $1::text,
          now(),
          now(),
          now()
        )
      $dyn$ using v_physician_id;
    else
      execute $dyn$
        insert into auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        ) values (
          $1,
          $1,
          json_build_object('sub', $1::text, 'email', 'physician@tupclinic.local'),
          'email',
          now(),
          now(),
          now()
        )
      $dyn$ using v_physician_id;
    end if;
  end if;

  -- Provision Nurse: nurse@tupclinic.local / Nurse@123
  select id into v_nurse_id from auth.users where lower(email) = 'nurse@tupclinic.local';
  if v_nurse_id is null then
    v_nurse_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      v_nurse_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'nurse@tupclinic.local',
      v_encrypted_pass_nurse,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Nurse Santos","role":"nurse"}'::jsonb,
      now(),
      now(),
      '', '', '', ''
    );
  else
    update auth.users
    set
      encrypted_password = v_encrypted_pass_nurse,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{name}', '"Nurse Santos"'),
      updated_at = now()
    where id = v_nurse_id;
  end if;

  -- Ensure identity for nurse
  if not exists (select 1 from auth.identities where user_id = v_nurse_id) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) then
      execute $dyn$
        insert into auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          provider_id,
          last_sign_in_at,
          created_at,
          updated_at
        ) values (
          $1,
          $1,
          json_build_object('sub', $1::text, 'email', 'nurse@tupclinic.local'),
          'email',
          $1::text,
          now(),
          now(),
          now()
        )
      $dyn$ using v_nurse_id;
    else
      execute $dyn$
        insert into auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        ) values (
          $1,
          $1,
          json_build_object('sub', $1::text, 'email', 'nurse@tupclinic.local'),
          'email',
          now(),
          now(),
          now()
        )
      $dyn$ using v_nurse_id;
    end if;
  end if;

  -- Link public.admins profile records to auth.users
  insert into public.admins (id, auth_user_id, name, email, role, active, created_at, updated_at)
  values
    (gen_random_uuid(), v_physician_id, 'Dr. Rivera', 'physician@tupclinic.local', 'physician', true, now(), now()),
    (gen_random_uuid(), v_nurse_id, 'Nurse Santos', 'nurse@tupclinic.local', 'nurse', true, now(), now())
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

  -- Clean up any staff accounts from public.users
  delete from public.users where role in ('admin', 'physician', 'nurse');

end $$;

update public.appointments a
set clinician_auth_user_id = adm.auth_user_id
from public.admins adm
where a.clinician_auth_user_id is null
  and adm.auth_user_id is not null
  and lower(coalesce(a.clinician_name, '')) = lower(coalesce(adm.name, ''));

update public.encounters e
set clinician_auth_user_id = adm.auth_user_id
from public.admins adm
where e.clinician_auth_user_id is null
  and adm.auth_user_id is not null
  and lower(coalesce(e.clinician_name, '')) = lower(coalesce(adm.name, ''));

-- END FILE: schema_auth_rls.sql

-- ============================================================================
-- BEGIN FILE: mock_data_seed.sql
-- ============================================================================
-- Mock seed data for TUP Clinic EHR
-- Run this in Supabase SQL Editor after your schema/migrations are applied.
-- If clinic-hours DB guard is enabled, bypass for this seed session.
select set_config('app.bypass_clinic_hours', 'on', true);

-- 1) Students
insert into public.students (id, name, year)
values
('TUPM-21-1234', 'Juan Dela Cruz', 3),
('TUPM-20-4567', 'Maria Santos', 4),
('TUPM-22-5678', 'Ana Reyes', 2),
('TUPM-23-7890', 'Carlos Garcia', 1),
('TUPM-22-9876', 'Elena Lopez', 2),
('TUPM-21-6543', 'Miguel Torres', 3),
('TUPM-23-1278', 'Isabella Rodriguez', 1),
('TUPM-20-3456', 'Diego Fernandez', 4),
('TUPM-22-7891', 'Sofia Martinez', 2),
('TUPM-21-4321', 'Alejandro Ruiz', 3),
('TUPM-23-5678', 'Valentina Gomez', 1),
('TUPM-20-6789', 'Mateo Morales', 4),
('TUPM-22-8901', 'Camila Silva', 2),
('TUPM-21-7892', 'Sebastian Ramirez', 3),
('TUPM-23-4321', 'Luna Castillo', 1),
('TUPM-20-7893', 'Ethan Flores', 4),
('TUPM-22-3210', 'Mia Castro', 2),
('TUPM-21-9876', 'Daniel Mendoza', 3)
on conflict (id) do update
set
  name = excluded.name,
  year = excluded.year,
  updated_at = now();

-- 2) Patients (ensure all encounter patient_ids exist)
insert into public.patients (id, name, year, last_visit_date, sensitivity_level)
select
  s.id,
  s.name,
  s.year,
  case s.id
    when 'TUPM-21-1234' then date '2025-11-14'
    when 'TUPM-20-4567' then date '2025-10-28'
    else null
  end as last_visit_date,
  'normal' as sensitivity_level
from public.students s
where s.id in (
  'TUPM-21-1234','TUPM-20-4567','TUPM-22-5678','TUPM-23-7890','TUPM-22-9876','TUPM-21-6543',
  'TUPM-23-1278','TUPM-20-3456','TUPM-22-7891','TUPM-21-4321','TUPM-23-5678','TUPM-20-6789',
  'TUPM-22-8901','TUPM-21-7892','TUPM-23-4321','TUPM-20-7893'
)
on conflict (id) do update
set
  name = excluded.name,
  year = excluded.year,
  last_visit_date = coalesce(excluded.last_visit_date, public.patients.last_visit_date),
  updated_at = now();

-- 3) Appointments
insert into public.appointments
  (patient_id, clinician_name, appointment_date, appointment_time, type, status)
values
('TUPM-21-1234', 'Dr. Rivera', '2025-11-21', '09:00', 'Consult', 'Scheduled'),
('TUPM-20-4567', 'Nurse Santos', '2025-11-21', '09:30', 'Follow-up', 'Checked-in');

-- 4) Encounters
insert into public.encounters
  (patient_id, clinician_name, encounter_date, chief_complaint, assessment_plan, vitals)
values
('TUPM-21-1234', 'Dr. Rivera', '2025-11-15T10:00:00+08:00', 'Fever', 'Antibiotics prescribed, rest advised', '{"temp":"101.5","pulse":"90","bp":"120/80","weight":"60"}'::jsonb),
('TUPM-21-1234', 'Dr. Rivera', '2025-11-10T11:00:00+08:00', 'Cough', 'Cough syrup and rest', '{"temp":"98.6","pulse":"80","bp":"118/78","weight":"61"}'::jsonb),
('TUPM-20-4567', 'Dr. Rivera', '2025-11-14T09:30:00+08:00', 'Headache', 'Pain relievers and hydration', '{"temp":"97.5","pulse":"75","bp":"116/76","weight":"57"}'::jsonb),
('TUPM-22-5678', 'Dr. Rivera', '2025-11-16T13:00:00+08:00', 'Stomach pain', 'Dietary changes, antacids', '{"temp":"99.0","pulse":"78","bp":"119/79","weight":"55"}'::jsonb),
('TUPM-22-5678', 'Dr. Rivera', '2025-11-12T10:30:00+08:00', 'Sore throat', 'Gargle salt water, lozenges', '{"temp":"98.0","pulse":"82","bp":"121/81","weight":"56"}'::jsonb),
('TUPM-21-1234', 'Dr. Rivera', '2025-11-18T15:00:00+08:00', 'Fever', 'Antibiotics', '{"temp":"102.0","pulse":"92","bp":"125/85","weight":"59"}'::jsonb),
('TUPM-23-7890', 'Dr. Rivera', '2025-11-19T14:00:00+08:00', 'Allergic reaction', 'Antihistamines, observation', '{"temp":"98.2","pulse":"85","bp":"118/75","weight":"70"}'::jsonb),
('TUPM-22-9876', 'Dr. Rivera', '2025-11-17T09:00:00+08:00', 'Flu symptoms', 'Antiviral medication, fluids', '{"temp":"100.8","pulse":"88","bp":"122/82","weight":"62"}'::jsonb),
('TUPM-21-6543', 'Nurse Santos', '2025-11-13T11:30:00+08:00', 'Sore throat', 'Salt water gargle, lozenges', '{"temp":"98.5","pulse":"78","bp":"115/70","weight":"58"}'::jsonb),
('TUPM-23-1278', 'Dr. Rivera', '2025-11-20T16:00:00+08:00', 'Back pain', 'Pain medication, light exercise', '{"temp":"98.0","pulse":"75","bp":"120/80","weight":"68"}'::jsonb),
('TUPM-20-3456', 'Nurse Santos', '2025-11-11T08:00:00+08:00', 'Cold symptoms', 'Rest, decongestants', '{"temp":"99.5","pulse":"82","bp":"117/74","weight":"55"}'::jsonb),
('TUPM-22-7891', 'Dr. Rivera', '2025-11-21T10:00:00+08:00', 'Anxiety symptoms', 'Counseling referral, mild sedative', '{"temp":"98.6","pulse":"95","bp":"135/90","weight":"65"}'::jsonb),
('TUPM-21-4321', 'Dr. Rivera', '2025-11-09T12:00:00+08:00', 'Skin rash', 'Topical cream, allergy testing', '{"temp":"97.8","pulse":"72","bp":"112/68","weight":"63"}'::jsonb),
('TUPM-23-5678', 'Dr. Rivera', '2025-11-22T14:30:00+08:00', 'Sleep disturbance', 'Sleep hygiene counseling, melatonin', '{"temp":"98.1","pulse":"80","bp":"118/76","weight":"52"}'::jsonb),
('TUPM-20-6789', 'Nurse Santos', '2025-11-08T15:00:00+08:00', 'Dizziness', 'Monitor blood pressure, hydration', '{"temp":"98.4","pulse":"76","bp":"110/65","weight":"60"}'::jsonb),
('TUPM-22-8901', 'Dr. Rivera', '2025-11-23T11:15:00+08:00', 'Ear infection', 'Ear drops, antibiotics', '{"temp":"98.9","pulse":"85","bp":"119/78","weight":"48"}'::jsonb),
('TUPM-21-7892', 'Dr. Rivera', '2025-11-07T13:00:00+08:00', 'Joint pain', 'NSAIDs, physical therapy referral', '{"temp":"98.7","pulse":"83","bp":"122/84","weight":"72"}'::jsonb),
('TUPM-23-4321', 'Dr. Rivera', '2025-11-24T09:45:00+08:00', 'Migraine', 'Triptans, migraine prevention meds', '{"temp":"98.3","pulse":"88","bp":"124/86","weight":"58"}'::jsonb),
('TUPM-20-7893', 'Nurse Santos', '2025-11-06T10:30:00+08:00', 'Stress related symptoms', 'Counseling, stress management', '{"temp":"97.9","pulse":"82","bp":"115/72","weight":"61"}'::jsonb);

-- 5) Optional inventory rows (so transaction log has corresponding visible items)
insert into public.inventory (item_name, category, stock_quantity, unit, reorder_level)
values
('Paracetamol 500mg', 'Medications', 100, 'pcs', 20),
('Gauze', 'Consumables', 60, 'pcs', 15),
('Bandages 5cm', 'Consumables', 120, 'pcs', 20),
('Aspirin 300mg', 'Medications', 80, 'pcs', 20),
('Thermometers', 'Diagnostic Equipment', 20, 'pcs', 5),
('Blood Pressure Monitors', 'Diagnostic Equipment', 10, 'pcs', 3),
('Syringes 5ml', 'Consumables', 200, 'pcs', 40),
('Antiseptic Cream', 'First Aid / Disinfectants', 45, 'pcs', 10)
on conflict (item_name) do nothing;

-- 6) Inventory transactions
insert into public.inventory_transactions (item_name, transaction_type, quantity, reason, performed_by)
values
('Paracetamol 500mg', 'out', 5, 'Patient J. Dela Cruz', 'Dr. Rivera'),
('Gauze', 'out', 2, 'Dressing change', 'Nurse Santos'),
('Bandages 5cm', 'in', 50, 'New delivery', 'Dr. Rivera'),
('Aspirin 300mg', 'out', 2, 'Headache relief', 'Nurse Santos'),
('Thermometers', 'out', 1, 'Patient Maria Santos', 'Dr. Rivera'),
('Blood Pressure Monitors', 'in', 5, 'Clinic equipment', 'Admin'),
('Syringes 5ml', 'out', 10, 'Vaccinations', 'Nurse Santos'),
('Antiseptic Cream', 'out', 3, 'Wound treatment', 'Dr. Rivera');

-- END FILE: mock_data_seed.sql

-- ============================================================================
-- BEGIN FILE: mock_data_seed_2026_latest.sql
-- ============================================================================
-- Latest mock seed data for TUP Clinic EHR (2026)
-- Run this in Supabase SQL Editor after schema setup.
-- Safe to re-run: uses deterministic UUIDs + upserts where possible.
-- If clinic-hours DB guard is enabled, bypass for this seed session.
select set_config('app.bypass_clinic_hours', 'on', true);

-- 1) Students
insert into public.students (id, name, year)
values
('TUPM-21-1234', 'Juan Dela Cruz', 3),
('TUPM-20-4567', 'Maria Santos', 4),
('TUPM-22-5678', 'Ana Reyes', 2),
('TUPM-23-7890', 'Carlos Garcia', 1),
('TUPM-22-9876', 'Elena Lopez', 2),
('TUPM-21-6543', 'Miguel Torres', 3),
('TUPM-23-1278', 'Isabella Rodriguez', 1),
('TUPM-20-3456', 'Diego Fernandez', 4),
('TUPM-22-7891', 'Sofia Martinez', 2),
('TUPM-21-4321', 'Alejandro Ruiz', 3),
('TUPM-23-5678', 'Valentina Gomez', 1),
('TUPM-20-6789', 'Mateo Morales', 4),
('TUPM-22-8901', 'Camila Silva', 2),
('TUPM-21-7892', 'Sebastian Ramirez', 3),
('TUPM-23-4321', 'Luna Castillo', 1),
('TUPM-20-7893', 'Ethan Flores', 4),
('TUPM-22-3210', 'Mia Castro', 2),
('TUPM-21-9876', 'Daniel Mendoza', 3)
on conflict (id) do update
set
  name = excluded.name,
  year = excluded.year,
  updated_at = now();

-- 2) Patients
insert into public.patients (id, name, year, last_visit_date)
select
  s.id,
  s.name,
  s.year,
  null::date
from public.students s
where s.id in (
  'TUPM-21-1234','TUPM-20-4567','TUPM-22-5678','TUPM-23-7890','TUPM-22-9876','TUPM-21-6543',
  'TUPM-23-1278','TUPM-20-3456','TUPM-22-7891','TUPM-21-4321','TUPM-23-5678','TUPM-20-6789',
  'TUPM-22-8901','TUPM-21-7892','TUPM-23-4321','TUPM-20-7893','TUPM-22-3210','TUPM-21-9876'
)
on conflict (id) do update
set
  name = excluded.name,
  year = excluded.year,
  updated_at = now();

-- 3) Appointments (2026)
insert into public.appointments
  (id, patient_id, patient_name, clinician_name, appointment_date, appointment_time, type, status)
values
('b7d0aa65-644a-4dc5-87a8-5fa6e4b56001', 'TUPM-21-1234', 'Juan Dela Cruz', 'Dr. Rivera', '2026-04-14', '09:00', 'Consult', 'Checked-in'),
('b7d0aa65-644a-4dc5-87a8-5fa6e4b56002', 'TUPM-20-4567', 'Maria Santos', 'Nurse Santos', '2026-04-14', '09:30', 'Follow-up', 'Checked-in'),
('b7d0aa65-644a-4dc5-87a8-5fa6e4b56003', 'TUPM-22-5678', 'Ana Reyes', 'Dr. Rivera', '2026-04-15', '10:00', 'Consult', 'Scheduled'),
('b7d0aa65-644a-4dc5-87a8-5fa6e4b56004', 'TUPM-23-7890', 'Carlos Garcia', 'Nurse Santos', '2026-04-15', '10:30', 'Follow-up', 'Scheduled'),
('b7d0aa65-644a-4dc5-87a8-5fa6e4b56005', 'TUPM-22-9876', 'Elena Lopez', 'Dr. Rivera', '2026-04-16', '13:00', 'Consult', 'Scheduled'),
('b7d0aa65-644a-4dc5-87a8-5fa6e4b56006', 'TUPM-21-6543', 'Miguel Torres', 'Nurse Santos', '2026-04-16', '13:30', 'Follow-up', 'Scheduled')
on conflict (id) do update
set
  patient_id = excluded.patient_id,
  patient_name = excluded.patient_name,
  clinician_name = excluded.clinician_name,
  appointment_date = excluded.appointment_date,
  appointment_time = excluded.appointment_time,
  type = excluded.type,
  status = excluded.status,
  updated_at = now();

-- 4) Encounters (last 30 days in 2026 for dashboard trends)
insert into public.encounters
  (id, patient_id, patient_name, clinician_name, encounter_date, chief_complaint, assessment_plan, vitals)
values
('d5e34175-dac7-4ae7-a88d-2aa8a0f77001', 'TUPM-21-1234', 'Juan Dela Cruz', 'Dr. Rivera', '2026-03-20T09:15:00+08:00', 'Fever', 'Paracetamol and hydration', '{"temp":"38.2","pulse":"90","bp":"120/80","weight":"60"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77002', 'TUPM-20-4567', 'Maria Santos', 'Dr. Rivera', '2026-03-22T10:40:00+08:00', 'Headache', 'Rest, hydration, monitor symptoms', '{"temp":"36.9","pulse":"76","bp":"118/76","weight":"57"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77003', 'TUPM-22-5678', 'Ana Reyes', 'Dr. Rivera', '2026-03-25T11:20:00+08:00', 'Cough', 'Cough syrup and steam inhalation', '{"temp":"37.1","pulse":"82","bp":"119/79","weight":"55"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77004', 'TUPM-23-7890', 'Carlos Garcia', 'Nurse Santos', '2026-03-27T08:35:00+08:00', 'Sore throat', 'Warm saline gargle and lozenges', '{"temp":"37.0","pulse":"80","bp":"117/75","weight":"70"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77005', 'TUPM-22-9876', 'Elena Lopez', 'Dr. Rivera', '2026-03-29T14:10:00+08:00', 'Flu symptoms', 'Oseltamivir, rest, fluids', '{"temp":"38.4","pulse":"92","bp":"122/82","weight":"62"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77006', 'TUPM-21-6543', 'Miguel Torres', 'Nurse Santos', '2026-04-01T09:50:00+08:00', 'Cold symptoms', 'Decongestant and rest', '{"temp":"37.4","pulse":"84","bp":"116/74","weight":"58"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77007', 'TUPM-23-1278', 'Isabella Rodriguez', 'Dr. Rivera', '2026-04-03T15:25:00+08:00', 'Back pain', 'NSAID and posture advice', '{"temp":"36.8","pulse":"74","bp":"120/80","weight":"68"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77008', 'TUPM-20-3456', 'Diego Fernandez', 'Nurse Santos', '2026-04-05T10:05:00+08:00', 'Dizziness', 'Blood pressure monitoring', '{"temp":"36.7","pulse":"78","bp":"110/68","weight":"55"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77009', 'TUPM-22-7891', 'Sofia Martinez', 'Dr. Rivera', '2026-04-07T13:45:00+08:00', 'Anxiety symptoms', 'Counseling referral and follow-up', '{"temp":"36.9","pulse":"96","bp":"132/88","weight":"65"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77010', 'TUPM-21-4321', 'Alejandro Ruiz', 'Dr. Rivera', '2026-04-08T11:30:00+08:00', 'Skin rash', 'Topical corticosteroid for 5 days', '{"temp":"36.6","pulse":"72","bp":"114/70","weight":"63"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77011', 'TUPM-23-5678', 'Valentina Gomez', 'Dr. Rivera', '2026-04-09T14:20:00+08:00', 'Migraine', 'Triptan and trigger tracking', '{"temp":"36.8","pulse":"86","bp":"124/84","weight":"52"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77012', 'TUPM-20-6789', 'Nurse Santos', '2026-04-10T09:00:00+08:00', 'Stress related symptoms', 'Stress management guidance', '{"temp":"36.7","pulse":"82","bp":"115/72","weight":"60"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77013', 'TUPM-22-8901', 'Camila Silva', 'Dr. Rivera', '2026-04-11T10:10:00+08:00', 'Ear infection', 'Ear drops and antibiotic', '{"temp":"37.2","pulse":"84","bp":"118/78","weight":"48"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77014', 'TUPM-21-7892', 'Sebastian Ramirez', 'Dr. Rivera', '2026-04-12T16:00:00+08:00', 'Joint pain', 'NSAID and stretching exercises', '{"temp":"36.9","pulse":"83","bp":"122/84","weight":"72"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77015', 'TUPM-23-4321', 'Luna Castillo', 'Dr. Rivera', '2026-04-13T08:20:00+08:00', 'Fever', 'Hydration and antipyretic', '{"temp":"38.0","pulse":"89","bp":"121/79","weight":"58"}'::jsonb),
('d5e34175-dac7-4ae7-a88d-2aa8a0f77016', 'TUPM-20-7893', 'Ethan Flores', 'Nurse Santos', '2026-04-14T10:00:00+08:00', 'Cough', 'Symptomatic treatment and rest', '{"temp":"37.3","pulse":"81","bp":"116/73","weight":"61"}'::jsonb)
on conflict (id) do update
set
  patient_id = excluded.patient_id,
  patient_name = excluded.patient_name,
  clinician_name = excluded.clinician_name,
  encounter_date = excluded.encounter_date,
  chief_complaint = excluded.chief_complaint,
  assessment_plan = excluded.assessment_plan,
  vitals = excluded.vitals,
  updated_at = now();

-- Keep patient last_visit_date fresh based on seeded encounters.
update public.patients p
set
  last_visit_date = e.max_date,
  updated_at = now()
from (
  select patient_id, max(encounter_date::date) as max_date
  from public.encounters
  group by patient_id
) e
where p.id = e.patient_id;

-- 5) Inventory rows
insert into public.inventory (item_name, category, stock_quantity, unit, reorder_level)
values
('Paracetamol 500mg', 'Medications', 102, 'pcs', 20),
('Gauze', 'Consumables', 58, 'pcs', 15),
('Bandages 5cm', 'Consumables', 120, 'pcs', 20),
('Aspirin 300mg', 'Medications', 78, 'pcs', 20),
('Thermometers', 'Diagnostic Equipment', 19, 'pcs', 5),
('Blood Pressure Monitors', 'Diagnostic Equipment', 10, 'pcs', 3),
('Syringes 5ml', 'Consumables', 190, 'pcs', 40),
('Antiseptic Cream', 'First Aid / Disinfectants', 42, 'pcs', 10)
on conflict (item_name) do update
set
  category = excluded.category,
  stock_quantity = excluded.stock_quantity,
  unit = excluded.unit,
  reorder_level = excluded.reorder_level,
  updated_at = now();

-- 6) Inventory transactions (2026)
insert into public.inventory_transactions (id, item_name, transaction_type, quantity, reason, performed_by, created_at)
values
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41001', 'Paracetamol 500mg', 'out', 5, 'Patient J. Dela Cruz', 'Dr. Rivera', '2026-04-14T10:17:01+08:00'),
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41002', 'Gauze', 'out', 2, 'Dressing change', 'Nurse Santos', '2026-04-14T10:18:12+08:00'),
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41003', 'Bandages 5cm', 'in', 50, 'New delivery', 'Dr. Rivera', '2026-04-14T10:19:35+08:00'),
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41004', 'Aspirin 300mg', 'out', 2, 'Headache relief', 'Nurse Santos', '2026-04-14T10:22:41+08:00'),
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41005', 'Thermometers', 'out', 1, 'Patient M. Santos', 'Dr. Rivera', '2026-04-14T10:25:18+08:00'),
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41006', 'Syringes 5ml', 'out', 10, 'Vaccinations', 'Nurse Santos', '2026-04-14T10:28:04+08:00'),
('f4f8a30d-6fbb-4f15-b7ae-cf8a2fd41007', 'Antiseptic Cream', 'out', 3, 'Wound treatment', 'Dr. Rivera', '2026-04-14T10:30:11+08:00')
on conflict (id) do update
set
  item_name = excluded.item_name,
  transaction_type = excluded.transaction_type,
  quantity = excluded.quantity,
  reason = excluded.reason,
  performed_by = excluded.performed_by,
  created_at = excluded.created_at;

-- END FILE: mock_data_seed_2026_latest.sql

-- -----------------------------------------------------------------------------
-- APP COMPATIBILITY OVERRIDE (current frontend uses anon key + app-level auth)
-- Ensures booking/chat/records work without Supabase Auth sessions.
-- -----------------------------------------------------------------------------
alter table if exists public.users disable row level security;
alter table if exists public.role_permissions disable row level security;
alter table if exists public.students disable row level security;
alter table if exists public.patients disable row level security;
alter table if exists public.appointments disable row level security;
alter table if exists public.encounters disable row level security;
alter table if exists public.inventory disable row level security;
alter table if exists public.inventory_transactions disable row level security;
alter table if exists public.settings disable row level security;
alter table if exists public.audit_logs disable row level security;
alter table if exists public.profiles disable row level security;
alter table if exists public.patient_messages disable row level security;
alter table if exists public.break_glass_audit_logs disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
grant usage, select on sequences to anon, authenticated;



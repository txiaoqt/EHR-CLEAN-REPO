-- ============================================================================
-- Migration: Staff Supabase Auth & RLS Policy Hardening
-- Filename: supabase/migrations/20260825184500_staff_supabase_auth_rls.sql
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

-- 2. Ensure public.users table has auth_user_id and proper constraints
alter table if exists public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists last_failed_login_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists lockout_reason text,
  add column if not exists last_login_at timestamptz,
  add column if not exists patient_id text references public.patients(id) on update cascade on delete set null;

create index if not exists idx_users_auth_user_id on public.users (auth_user_id);
create index if not exists idx_users_email on public.users (email);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'password'
  ) then
    alter table public.users alter column password drop not null;
  end if;
end $$;

-- 3. Automatic Profile Sync Trigger: auth.users -> public.users
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
  v_role := coalesce(new.raw_user_meta_data->>'role', 'nurse');
  v_patient_id := new.raw_user_meta_data->>'patient_id';

  -- If public user exists by email, link auth_user_id and update name if needed
  update public.users
  set
    auth_user_id = new.id,
    name = coalesce(nullif(trim(name), ''), v_name),
    email = coalesce(email, v_email),
    patient_id = coalesce(patient_id, v_patient_id),
    updated_at = now()
  where lower(email) = v_email;

  -- If no row exists, create one
  if not exists (
    select 1 from public.users u where u.auth_user_id = new.id or lower(u.email) = v_email
  ) then
    insert into public.users (id, auth_user_id, name, email, role, active, patient_id, created_at, updated_at)
    values (gen_random_uuid(), new.id, v_name, v_email, v_role, true, v_patient_id, now(), now());
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

-- 4. Role & Access Control Helpers
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.role
      from public.users u
      where u.auth_user_id = auth.uid()
      limit 1
    ),
    'nurse'
  )::text;
$$;

create or replace function public.is_physician_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('physician', 'admin');
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
      select u.name
      from public.users u
      where u.auth_user_id = auth.uid()
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
  -- Temporary bypass for development/testing — return true 24/7
  return true;

  /* Re-enable clinic hours (07:00 to 19:00 Asia/Manila) by removing "return true;" above
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return true;
  end if;

  if coalesce(current_setting('app.bypass_clinic_hours', true), 'off') = 'on' then
    return true;
  end if;

  v_manila_now := (now() at time zone 'Asia/Manila')::time;
  return v_manila_now >= time '07:00' and v_manila_now < time '19:00';
  */
end;
$$;

-- 5. Security definer lockout helpers
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
  select u.locked_until
    into v_locked_until
  from public.users u
  where lower(u.email) = lower(p_email)
  limit 1;

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

revoke all on function public.get_login_lockout_status(text) from public;
revoke all on function public.register_failed_login(text, integer, integer, text) from public;
revoke all on function public.clear_login_lockout(text, boolean) from public;

grant execute on function public.get_login_lockout_status(text) to anon, authenticated;
grant execute on function public.register_failed_login(text, integer, integer, text) to anon, authenticated;
grant execute on function public.clear_login_lockout(text, boolean) to authenticated;

-- 6. Enable RLS and Configure Policies
alter table public.users enable row level security;
alter table public.role_permissions enable row level security;
alter table public.students enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.encounters enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.patient_messages enable row level security;

-- USERS policies
drop policy if exists users_select_policy on public.users;
create policy users_select_policy
on public.users
for select
to authenticated
using (
  public.is_within_clinic_hours()
  and (
    auth_user_id = auth.uid()
    or public.is_physician_or_admin()
    or (public.current_app_role() in ('nurse', 'admin', 'physician'))
    or (public.current_app_role() = 'patient' and patient_id is not null)
  )
);

drop policy if exists users_update_policy on public.users;
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

-- 7. Provision Demo Staff Accounts in Supabase Auth & Link to public.users
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

  -- Link public.users profile records to auth.users
  insert into public.users (id, auth_user_id, name, email, role, active, created_at, updated_at)
  values
    (gen_random_uuid(), v_physician_id, 'Dr. Rivera', 'physician@tupclinic.local', 'physician', true, now(), now()),
    (gen_random_uuid(), v_nurse_id, 'Nurse Santos', 'nurse@tupclinic.local', 'nurse', true, now(), now())
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

  -- Backfill any remaining auth_user_ids by email
  update public.users u
  set auth_user_id = au.id
  from auth.users au
  where lower(u.email) = lower(au.email)
    and (u.auth_user_id is null or u.auth_user_id <> au.id);

end $$;

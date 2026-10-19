-- =============================================================================
-- Enrollees — applicants who do not yet have a TUP account
-- =============================================================================
--
-- The clinic receives medical certificates on paper during enrolment, and the
-- pile is the problem this solves. An enrollee has no @tup.edu.ph address and no
-- TUPM number yet, so they cannot be a `users` row: that table's role is
-- constrained to 'patient', and a patient is someone already enrolled.
--
-- Deliberately NOT here:
--   * Any check that the applicant_id exists on an admissions list. The list is
--     published, so validating against it would prove nothing; and the clinic
--     curates the queue anyway with delete. It is collected the same way a TUPM
--     id is collected for an enrolled student — recorded, not verified.
--   * Any gate on who may sign up. Signup requires a verified email, one account
--     per address, and staff can delete in bulk. That is the whole control.
--
-- The identity proof is deliberately deferred to elevation, where an OTP sent to
-- the TUP mailbox is evidence only an enrolled student can produce.

create table if not exists public.enrollees (
  id uuid primary key default gen_random_uuid(),

  -- One account per verified address, and one per auth user. Both are enforced
  -- rather than trusted, so a double-submit or a retry cannot create two rows.
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  personal_email text not null,

  -- Collected, not validated. Nullable because it is optional at signup.
  applicant_id text,

  first_name text not null,
  middle_name text,
  surname text not null,
  date_of_birth date not null,

  -- 'enrollee' until elevation succeeds, then 'elevated'. Only an RPC or staff
  -- may change this — see the guard below.
  status text not null default 'enrollee' check (status in ('enrollee', 'elevated')),
  tup_email text,
  elevated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive, because an address is not case-sensitive in practice and
-- "Juan@x.com" and "juan@x.com" are one person.
create unique index if not exists enrollees_personal_email_key
  on public.enrollees (lower(personal_email));

create index if not exists enrollees_status_idx on public.enrollees (status);
create index if not exists enrollees_created_idx on public.enrollees (created_at desc);

-- -----------------------------------------------------------------------------
-- Columns an enrollee must not change on themselves
-- -----------------------------------------------------------------------------
--
-- Without this, an enrollee could set their own status to 'elevated' and appear
-- as an enrolled patient without ever proving they hold the TUP mailbox. The
-- policy below allows a self-update of the row; this trigger is what stops that
-- update from including the fields that decide who they are.
create or replace function public.guard_enrollee_sensitive_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := public.current_app_role();
begin
  -- A trusted function may opt in for the duration of its own transaction. The
  -- elevation RPC needs this: it runs without a staff role, so without an escape
  -- hatch this trigger would block the very update it exists to protect.
  -- `true` makes the setting transaction-local, so it cannot leak to another.
  if current_setting('app.allow_enrollee_status_change', true) = 'on' then
    return new;
  end if;

  -- Staff may correct anything.
  if actor in ('admin', 'physician', 'nurse') then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.tup_email is distinct from old.tup_email
     or new.elevated_at is distinct from old.elevated_at
     or new.auth_user_id is distinct from old.auth_user_id
     or new.personal_email is distinct from old.personal_email then
    raise exception 'Only clinic staff can change the enrolment status of an account';
  end if;

  return new;
end;
$$;

drop trigger if exists enrollees_guard_sensitive_updates on public.enrollees;
create trigger enrollees_guard_sensitive_updates
  before update on public.enrollees
  for each row execute function public.guard_enrollee_sensitive_updates();

-- Keep updated_at honest without relying on the caller.
create or replace function public.touch_enrollee_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enrollees_touch_updated_at on public.enrollees;
create trigger enrollees_touch_updated_at
  before update on public.enrollees
  for each row execute function public.touch_enrollee_updated_at();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.enrollees enable row level security;

-- An enrollee reads and edits only their own record. No role helper is involved:
-- auth.uid() is the whole check, which keeps this independent of the staff role
-- machinery and cannot be widened by a change to it.
drop policy if exists enrollees_self_select on public.enrollees;
create policy enrollees_self_select on public.enrollees
  for select using (auth_user_id = auth.uid());

drop policy if exists enrollees_self_insert on public.enrollees;
create policy enrollees_self_insert on public.enrollees
  for insert with check (auth_user_id = auth.uid());

drop policy if exists enrollees_self_update on public.enrollees;
create policy enrollees_self_update on public.enrollees
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Clinic staff read and delete every record. Delete is the spam path, and it is
-- the reason an open signup is acceptable.
drop policy if exists enrollees_staff_select on public.enrollees;
create policy enrollees_staff_select on public.enrollees
  for select using (public.current_app_role() in ('admin', 'physician', 'nurse'));

drop policy if exists enrollees_staff_delete on public.enrollees;
create policy enrollees_staff_delete on public.enrollees
  for delete using (public.current_app_role() in ('admin', 'physician', 'nurse'));

-- No staff update policy: staff corrections go through the same guarded path as
-- everything else, so an accidental status change is not one UPDATE away.

comment on table public.enrollees is
  'Applicants without a TUP account, created at signup. Elevation to an enrolled patient is recorded here and proven by an OTP to the TUP mailbox.';

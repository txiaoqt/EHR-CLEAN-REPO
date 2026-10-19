-- An enrollee may prepare student details, but cannot begin or complete
-- account elevation until the clinic has approved at least one certificate.
-- Keep the final transition guarded at the row level as well, so calling the
-- completion RPC directly cannot bypass the review decision.

create or replace function public.begin_enrollee_elevation(
  p_tup_email text,
  p_student_id text,
  p_year integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

  if not exists (
    select 1
    from public.enrollee_documents
    where enrollee_id = v_enrollee_id
      and status = 'approved'
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'The clinic must approve at least one medical certificate before you can elevate your account.'
    );
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

  perform pg_catalog.set_config('app.allow_enrollee_status_change', 'on', true);

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

revoke execute on function public.begin_enrollee_elevation(text, text, integer) from public, anon;
grant execute on function public.begin_enrollee_elevation(text, text, integer) to authenticated;

create or replace function public.require_approved_certificate_for_elevation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'enrollee'
     and new.status = 'elevated'
     and not exists (
       select 1
       from public.enrollee_documents
       where enrollee_id = old.id
         and status = 'approved'
     ) then
    raise exception 'At least one medical certificate must be approved before account elevation.';
  end if;

  return new;
end;
$$;

revoke execute on function public.require_approved_certificate_for_elevation() from public, anon, authenticated;

drop trigger if exists enrollees_require_approved_certificate on public.enrollees;
create trigger enrollees_require_approved_certificate
  before update of status on public.enrollees
  for each row
  when (old.status is distinct from new.status)
  execute function public.require_approved_certificate_for_elevation();

-- The completion RPC is authenticated-only; its final UPDATE is protected by
-- the trigger above, including requests from stale OTP sessions.
revoke execute on function public.complete_enrollee_elevation(uuid) from public, anon;
grant execute on function public.complete_enrollee_elevation(uuid) to authenticated;

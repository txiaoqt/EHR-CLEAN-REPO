-- Email verification code at sign-in (second step after the password).
-- Ships switched OFF: session_is_verified() is true for everyone until
-- private.login_verification_settings.enabled_at is set, which is done only
-- after all four portals are redeployed with the code screen.

create table if not exists private.login_verification_settings (
  id boolean primary key default true check (id),
  enabled_at timestamptz
);
insert into private.login_verification_settings (id) values (true) on conflict do nothing;

create table if not exists private.login_verifications (
  session_id uuid primary key,
  user_id uuid not null,
  code_hash text,
  expires_at timestamptz,
  sent_at timestamptz,
  sends int not null default 0,
  attempts int not null default 0,
  verified_at timestamptz
);
alter table private.login_verification_settings enable row level security;
alter table private.login_verifications enable row level security;
revoke all on private.login_verification_settings, private.login_verifications from anon, authenticated;

create or replace function private.session_is_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select
    -- switched off
    (select enabled_at from private.login_verification_settings) is null
    -- signed in before the switch-on, so nobody is locked out mid-shift
    or exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id'
      and s.created_at < (select enabled_at from private.login_verification_settings))
    -- predefined accounts: these addresses cannot receive mail
    or exists(select 1 from auth.users u where u.id=auth.uid()
      and (u.email ilike '%.local' or u.email ilike '%.invalid'))
    -- opened from an emailed link or code (sign-up, password reset), which already proved the mailbox
    or (auth.jwt()->'amr' is not null and not auth.jwt()->'amr' @> '[{"method":"password"}]'::jsonb)
    or exists(select 1 from private.login_verifications v
      where v.session_id::text=auth.jwt()->>'session_id' and v.verified_at is not null);
$$;

-- Called by the login-code server function only: the code must never reach the browser.
create or replace function public.issue_login_code(p_user uuid, p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text; v_row private.login_verifications; v_code text;
begin
  select u.email into v_email from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=p_user and s.id=p_session;
  if v_email is null then return jsonb_build_object('error','no_session'); end if;
  delete from private.login_verifications v
    where not exists(select 1 from auth.sessions s where s.id=v.session_id);
  select * into v_row from private.login_verifications where session_id=p_session for update;
  if v_row.verified_at is not null then return jsonb_build_object('error','already_verified'); end if;
  if v_row.sent_at > now() - interval '60 seconds' then return jsonb_build_object('error','too_soon'); end if;
  if v_row.sends >= 5 then return jsonb_build_object('error','too_many'); end if;
  v_code := lpad(((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into private.login_verifications as v (session_id,user_id,code_hash,expires_at,sent_at,sends)
    values (p_session,p_user,encode(extensions.digest(p_session::text||v_code,'sha256'),'hex'),
      now()+interval '10 minutes',now(),1)
    on conflict (session_id) do update set code_hash=excluded.code_hash,
      expires_at=excluded.expires_at, sent_at=excluded.sent_at, sends=v.sends+1, attempts=0;
  return jsonb_build_object('code',v_code,'email',v_email);
end;
$$;
revoke all on function public.issue_login_code(uuid,uuid) from public, anon, authenticated;
grant execute on function public.issue_login_code(uuid,uuid) to service_role;

create or replace function public.verify_login_code(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_sid text := auth.jwt()->>'session_id'; v_row private.login_verifications;
begin
  if auth.uid() is null or not private.session_is_live() then return 'expired'; end if;
  select * into v_row from private.login_verifications
    where session_id::text=v_sid and user_id=auth.uid() for update;
  if not found then return 'expired'; end if;
  if v_row.verified_at is not null then return 'ok'; end if;
  if v_row.expires_at < now() then return 'expired'; end if;
  if v_row.attempts >= 5 then return 'locked'; end if;
  if v_row.code_hash = encode(extensions.digest(v_sid||btrim(coalesce(p_code,'')),'sha256'),'hex') then
    update private.login_verifications set verified_at=now(), code_hash=null where session_id=v_row.session_id;
    return 'ok';
  end if;
  update private.login_verifications set attempts=attempts+1 where session_id=v_row.session_id;
  return 'wrong';
end;
$$;
revoke all on function public.verify_login_code(text) from public, anon;
grant execute on function public.verify_login_code(text) to authenticated;

-- Every role check goes through here, so an unverified session has no role.
create or replace function public.account_can_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_is_live() and not private.account_is_suspended(auth.uid())
    and private.session_is_verified()
    and not exists(select 1 from public.admins a where a.auth_user_id=auth.uid() and not a.active)
    and not exists(select 1 from public.users u where u.auth_user_id=auth.uid() and not u.active)
    and not exists(select 1 from public.enrollees e where e.auth_user_id=auth.uid() and e.status='elevated')
    and not exists(select 1 from private.staff_invitations i where i.auth_user_id=auth.uid()
      and i.status in ('sending','pending','revoked','failed')
      and not exists(select 1 from private.staff_invitations j where j.auth_user_id=i.auth_user_id and j.status='accepted'));
$$;

-- Some table rules check only the user id or clinic hours, not the role, so
-- every table also gets a blanket rule. app_policy_versions stays readable:
-- the login page shows it and it is public anyway.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname<>'app_policy_versions'
  loop
    execute format('drop policy if exists login_code_required on public.%I', t.relname);
    execute format('create policy login_code_required on public.%I as restrictive for all to authenticated
      using ((select private.session_is_verified())) with check ((select private.session_is_verified()))', t.relname);
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.get_my_portal_identity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid(); v_profile jsonb; v_inv private.staff_invitations; v_meta jsonb; v_email text;
begin
  if v_id is null then return null; end if;
  -- Before the live-session check: suspending revokes every session, and the
  -- open portal still has to learn why it is being signed out.
  if private.account_is_suspended(v_id) then
    return jsonb_build_object('active',false,'access_message','Your account is suspended. Contact the clinic administrator.');
  end if;
  if not private.session_is_live() then return null; end if;
  select jsonb_build_object('id',a.id,'auth_user_id',a.auth_user_id,'name',a.name,
    'email',a.email,'avatar',a.avatar,'role',a.role,'active',a.active,
    'department',a.department,'clearance_level',a.clearance_level,'locked_until',a.locked_until,
    'page_access',(select to_jsonb(r.pages) from public.role_page_access r where r.role=a.role))
    into v_profile from public.admins a where a.auth_user_id=v_id;
  if v_profile is not null then
    select * into v_inv from private.staff_invitations where auth_user_id=v_id
      order by created_at desc limit 1;
    if v_inv.status in ('sending','pending','revoked','failed') then
      if v_inv.status='pending' and v_inv.expires_at>now()
        and not private.account_is_suspended(v_id) then
        return v_profile || jsonb_build_object('active',true,'staff_setup_required',true,
          'invitation_id',v_inv.id,'invitation_expires_at',v_inv.expires_at);
      end if;
      return v_profile || jsonb_build_object('active',false,'access_message','This invitation has expired or was revoked. Ask the administrator for a new invitation.');
    end if;
  else
    select jsonb_build_object('id',u.id,'auth_user_id',u.auth_user_id,'name',u.name,
      'email',u.email,'avatar',coalesce(u.avatar,p.avatar_url),'role','patient',
      'active',u.active,'patient_id',u.patient_id,'locked_until',u.locked_until)
      into v_profile from public.users u left join public.patient_profiles p on p.patient_id=u.patient_id
      where u.auth_user_id=v_id limit 1;
    if v_profile is null then
      select jsonb_build_object('id',e.id,'auth_user_id',e.auth_user_id,
        'name',concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        'email',e.personal_email,'role','enrollee','active',e.status<>'elevated',
        'enrollee_status',e.status,'applicant_id',e.applicant_id,'elevated',e.status='elevated',
        'tup_email',e.tup_email,'elevated_student_id',e.elevated_student_id)
        into v_profile from public.enrollees e where e.auth_user_id=v_id;
    end if;
  end if;
  if v_profile is null then
    select raw_user_meta_data,email into v_meta,v_email from auth.users where id=v_id;
    if v_meta->>'role' in ('patient','enrollee') then
      v_profile:=jsonb_build_object('id',v_id,'auth_user_id',v_id,'email',v_email,
        'name',coalesce(v_meta->>'name',v_email),'role',v_meta->>'role','active',true,
        'enrollee_status','incomplete','patient_id',v_meta->>'patient_id',
        'first_name',v_meta->>'first_name','middle_name',v_meta->>'middle_name',
        'surname',v_meta->>'surname','suffix',v_meta->>'suffix',
        'date_of_birth',v_meta->>'date_of_birth','applicant_id',v_meta->>'applicant_id');
    else return null; end if;
  end if;
  -- Password accepted but the emailed code is still owed: the portal gets only
  -- what it needs to show the code screen, never the profile.
  if not private.session_is_verified() then
    return jsonb_build_object('role',v_profile->>'role','active',true,'verification_required',true,
      'email',(select email from auth.users where id=v_id));
  end if;
  return v_profile || jsonb_build_object('must_change_password',coalesce(
    (select must_change_password from private.account_controls where user_id=v_id),false));
end;
$function$;

-- Password re-checks before deletes used to sign in again, which opened a new
-- session without the emailed code and locked the user out mid-shift.
create or replace function public.verify_my_password(p_password text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.account_can_access() and exists(select 1 from auth.users u where u.id=auth.uid()
    and u.encrypted_password is not null
    and u.encrypted_password = extensions.crypt(coalesce(p_password,''), u.encrypted_password));
$$;
revoke all on function public.verify_my_password(text) from public, anon;
grant execute on function public.verify_my_password(text) to authenticated;

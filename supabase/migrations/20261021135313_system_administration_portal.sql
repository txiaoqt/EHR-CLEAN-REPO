-- Separate system administration from clinical work. Privileged writes go
-- through the authenticated Edge Function; user-editable metadata is never a role grant.
create schema if not exists private;

create table private.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_username text unique,
  suspended boolean not null default false,
  suspension_reason text,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  suspended_until timestamptz,
  must_change_password boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not suspended or length(trim(suspension_reason)) >= 5)
);
alter table private.account_controls enable row level security;

create table private.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  email text not null check (email = lower(trim(email))),
  role text not null check (role in ('physician', 'nurse')),
  department text not null default 'University Clinic',
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'sending' check (status in ('sending','pending','accepted','revoked','failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  send_count integer not null default 0,
  last_error text
);
create unique index staff_invitations_open_email on private.staff_invitations(email)
  where status in ('sending', 'pending');
create index staff_invitations_auth on private.staff_invitations(auth_user_id);
create index staff_invitations_created on private.staff_invitations(created_at desc);
alter table private.staff_invitations enable row level security;

create table private.system_admin_settings (
  singleton boolean primary key default true check (singleton),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table private.system_admin_settings enable row level security;
insert into private.system_admin_settings(value) values (jsonb_build_object(
  'clinic_name','TUP Manila University Clinic',
  'staff_portal_url','http://127.0.0.1:5175',
  'admin_portal_url','http://127.0.0.1:5173',
  'user_portal_url','http://127.0.0.1:5174',
  'invitation_expiry_minutes',5
));

create table private.admin_login_limits (
  identifier text primary key,
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
alter table private.admin_login_limits enable row level security;
revoke all on all tables in schema private from anon, authenticated;

create or replace function private.account_is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_controls c where c.user_id=p_user
    and c.suspended and (c.suspended_until is null or c.suspended_until > now()));
$$;
create or replace function private.is_system_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins a where a.auth_user_id=p_user
    and a.role='admin' and a.active) and not private.account_is_suspended(p_user);
$$;
create or replace function private.session_is_live()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from auth.sessions s
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
      and (s.not_after is null or s.not_after > now()));
$$;
create or replace function public.account_can_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_is_live() and not private.account_is_suspended(auth.uid())
    and not exists(select 1 from public.admins a where a.auth_user_id=auth.uid() and not a.active)
    and not exists(select 1 from public.users u where u.auth_user_id=auth.uid() and not u.active)
    and not exists(select 1 from public.enrollees e where e.auth_user_id=auth.uid() and e.status='elevated')
    and not exists(select 1 from private.staff_invitations i where i.auth_user_id=auth.uid()
      and i.status in ('sending','pending','revoked','failed')
      and not exists(select 1 from private.staff_invitations j where j.auth_user_id=i.auth_user_id and j.status='accepted'));
$$;
revoke all on function public.account_can_access() from public, anon;
grant execute on function public.account_can_access() to authenticated;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  -- Legacy clinical policies recognise 'admin'. A system administrator deliberately
  -- resolves to a different role, so administering accounts grants no clinical role.
  select case when public.account_can_access() then coalesce(
    (select case when a.role='admin' then 'system_admin' else a.role end
       from public.admins a where a.auth_user_id=auth.uid() and a.active limit 1),
    (select u.role from public.users u where u.auth_user_id=auth.uid() and u.active limit 1),
    (select 'enrollee' from public.enrollees e where e.auth_user_id=auth.uid() and e.status<>'elevated' limit 1)
  ) end;
$$;

-- A caller may read its own status even while suspended or finishing an invitation.
-- It cannot use this RPC to inspect somebody else's account.
create or replace function public.get_my_portal_identity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid:=auth.uid(); v_profile jsonb; v_inv private.staff_invitations; v_meta jsonb; v_email text;
begin
  if v_id is null or not private.session_is_live() then return null; end if;
  select jsonb_build_object('id',a.id,'auth_user_id',a.auth_user_id,'name',a.name,
    'email',a.email,'avatar',a.avatar,'role',a.role,'active',a.active,
    'department',a.department,'clearance_level',a.clearance_level,'locked_until',a.locked_until)
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
  if private.account_is_suspended(v_id) then
    return v_profile || jsonb_build_object('active',false,'access_message','Your account is suspended. Contact the clinic administrator.');
  end if;
  return v_profile || jsonb_build_object('must_change_password',coalesce(
    (select must_change_password from private.account_controls where user_id=v_id),false));
end;
$$;
revoke all on function public.get_my_portal_identity() from public, anon;
grant execute on function public.get_my_portal_identity() to authenticated;

-- Protect direct table writes as well as legacy SECURITY DEFINER write RPCs.
create or replace function private.guard_account_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if not public.account_can_access() then raise exception 'Account access is unavailable. Sign in again or contact the administrator.' using errcode='42501'; end if;
    if private.is_system_admin(auth.uid()) and tg_table_name not in ('admins','users','settings','audit_logs') then
      raise exception 'System administration does not grant clinical record access.' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create or replace function private.guard_account_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role
    or new.active is distinct from old.active or new.auth_user_id is distinct from old.auth_user_id
    or new.email is distinct from old.email or new.clearance_level is distinct from old.clearance_level
    or new.abac_attributes is distinct from old.abac_attributes) then
    raise exception 'Account permissions must be changed through system administration.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_admin_privileges before update on public.admins
  for each row execute function private.guard_account_privileges();
create trigger guard_user_privileges before update on public.users
  for each row execute function private.guard_account_privileges();

do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('create policy account_access_gate on public.%I as restrictive for all to authenticated using ((select public.account_can_access())%s) with check ((select public.account_can_access())%s)',
      t.tablename,
      case when t.tablename in ('admins','users','settings','audit_logs') then '' else ' and (select public.current_app_role()) is distinct from ''system_admin''' end,
      case when t.tablename in ('admins','users','settings','audit_logs') then '' else ' and (select public.current_app_role()) is distinct from ''system_admin''' end);
    execute format('create trigger account_access_guard before insert or update or delete on public.%I for each row execute function private.guard_account_access()', t.tablename);
  end loop;
end $$;
create policy account_access_gate on storage.objects as restrictive for all to authenticated
  using ((select public.account_can_access()) and (select public.current_app_role()) is distinct from 'system_admin')
  with check ((select public.account_can_access()) and (select public.current_app_role()) is distinct from 'system_admin');

-- Restrict audit visibility; entries remain immutable from all browser clients.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='audit_logs' and cmd='SELECT' loop
    execute format('drop policy %I on public.audit_logs',p.policyname);
  end loop;
end $$;
create policy audit_authorized_read on public.audit_logs for select to authenticated
  using ((select public.current_app_role()) in ('system_admin','physician'));
revoke update,delete on public.audit_logs from anon,authenticated;
create policy administrator_own_profile on public.admins for select to authenticated
  using (auth_user_id=(select auth.uid()));
create policy administrator_backup_settings on public.settings for select to authenticated
  using ((select public.current_app_role())='system_admin' and key in ('last_backup','last_backup_at'));

-- Retain directory column order used by patient messaging; omit system administrators.
create or replace view public.staff_directory as
select id,name,role,avatar,department,
  (active and not private.account_is_suspended(auth_user_id)) as active,auth_user_id
from public.admins where role in ('physician','nurse') and active;
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;

-- Auth updates may sync display data, but cannot grant a role or reactivate an account.
create or replace function public.sync_public_user_from_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text; v_name text; v_email text; v_patient_id text;
begin
  v_email:=lower(coalesce(new.email,''));
  v_name:=coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'full_name','');
  if exists(select 1 from public.admins where auth_user_id=new.id) then return new; end if;
  v_role:=lower(coalesce(new.raw_app_meta_data->>'staff_role',''));
  if v_role in ('admin','physician','nurse') then
    insert into public.admins(auth_user_id,name,email,role,active)
      values(new.id,coalesce(nullif(v_name,''),'Clinic staff'),v_email,v_role,v_role='admin')
      on conflict(email) do nothing;
    return new;
  end if;
  if new.raw_user_meta_data->>'role' in ('admin','physician','nurse','staff_invited') then return new; end if;
  if exists(select 1 from public.users where auth_user_id=new.id) then return new; end if;
  if new.raw_user_meta_data->>'role'='patient' or v_email like '%@tup.edu.ph' then
    v_name:=coalesce(nullif(v_name,''),split_part(v_email,'@',1));
    v_patient_id:=upper(trim(coalesce(new.raw_user_meta_data->>'patient_id',new.raw_user_meta_data->>'student_id','')));
    if v_patient_id ~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
      insert into public.students(id,name,year,updated_at) values(v_patient_id,v_name,1,now()) on conflict(id) do nothing;
      insert into public.patients(id,name,year,sensitivity_level,updated_at) values(v_patient_id,v_name,1,'normal',now()) on conflict(id) do nothing;
    else v_patient_id:=null; end if;
    insert into public.users(auth_user_id,name,email,role,patient_id,student_id,active)
      values(new.id,v_name,v_email,'patient',v_patient_id,v_patient_id,true) on conflict(email) do nothing;
  end if;
  return new;
end;
$$;

-- Admin directory returns identity and access metadata, never patient health fields.
create or replace function public.admin_portal_data(p_section text, p_search text default '',
  p_status text default 'all', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_offset integer:=greatest(0,least(p_page,100000)-1)*20;
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if p_section='settings' then
    return (select value from private.system_admin_settings where singleton);
  elsif p_section='overview' then
    return jsonb_build_object(
      'active_staff',(select count(*) from public.admins where role in ('physician','nurse') and active and not private.account_is_suspended(auth_user_id)),
      'pending_invitations',(select count(*) from private.staff_invitations where status='pending' and expires_at>now()),
      'suspended_accounts',(select count(*) from private.account_controls where suspended and (suspended_until is null or suspended_until>now())),
      'user_accounts',(select count(*) from auth.users u where exists(select 1 from public.users p where p.auth_user_id=u.id) or exists(select 1 from public.enrollees e where e.auth_user_id=u.id)),
      'failed_logins_today',(select count(*) from public.audit_logs where action='ADMIN_LOGIN_FAILED' and created_at>=date_trunc('day',now())),
      'recent_activity',(select coalesce(jsonb_agg(r),'[]'::jsonb) from (select id,user_name,action,description,created_at from public.audit_logs where action like 'ADMIN_%' or action like 'STAFF_INVITATION_%' order by created_at desc limit 8) r),
      'last_backup',(select value from public.settings where key='last_backup' limit 1));
  elsif p_section='invitations' then
    with rows as (select i.*,case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end as display_status
      from private.staff_invitations i where (p_search='' or i.name ilike '%'||left(p_search,120)||'%' or i.email ilike '%'||left(p_search,120)||'%')),
    filtered as (select * from rows where p_status='all' or display_status=p_status),
    page as (select * from filtered order by created_at desc,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  elsif p_section in ('staff','users') then
    with accounts as (
      select a.auth_user_id as id,a.id as profile_id,a.name,a.email,a.role,a.department,
        a.created_at,a.active,a.locked_until,null::text as identifier,false as retired
      from public.admins a where p_section='staff' and a.role in ('physician','nurse')
      union all
      select u.auth_user_id,u.id,u.name,u.email,'patient',null,u.created_at,u.active,u.locked_until,u.patient_id,false
      from public.users u where p_section='users'
      union all
      select e.auth_user_id,e.id,concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        e.personal_email,'enrollee',null,e.created_at,e.status<>'elevated',null,e.applicant_id,e.status='elevated'
      from public.enrollees e where p_section='users'
    ), rows as (select a.*,au.last_sign_in_at,c.suspension_reason,c.suspended_at,c.suspended_until,
        case when a.retired then 'retired'
          when private.account_is_suspended(a.id) then 'suspended'
          when exists(select 1 from private.staff_invitations i where i.auth_user_id=a.id and i.status<>'accepted') and not a.active then 'invited'
          when not a.active then 'inactive' when a.locked_until>now() then 'locked' else 'active' end as status
        from accounts a left join auth.users au on au.id=a.id left join private.account_controls c on c.user_id=a.id
        where p_search='' or a.name ilike '%'||left(p_search,120)||'%' or a.email ilike '%'||left(p_search,120)||'%' or a.identifier ilike '%'||left(p_search,120)||'%'),
      filtered as (select * from rows where p_status='all' or status=p_status),
      page as (select * from filtered order by name,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  raise exception 'Unknown administration section.';
end;
$$;
revoke all on function public.admin_portal_data(text,text,text,integer) from public,anon;
grant execute on function public.admin_portal_data(text,text,text,integer) to authenticated;

-- Service-only operations form one audited transaction. The Edge Function verifies
-- the caller JWT and supplies its user ID, never an actor ID supplied by the browser.
create or replace function public.system_admin_action(p_actor uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_row private.staff_invitations; v_target uuid; v_email text; v_role text;
  v_name text; v_result jsonb:='{}'; v_settings jsonb; v_actor_name text;
  v_key text; v_limit private.admin_login_limits; v_until timestamptz;
begin
  if p_action in ('login_target','login_failed','login_succeeded') then
    v_key:=left(coalesce(p_payload->>'rate_key',''),160);
    if v_key='' then raise exception 'Missing login identifier.'; end if;
    if p_action='login_target' then
      insert into private.admin_login_limits(identifier) values(v_key) on conflict do nothing;
      select * into v_limit from private.admin_login_limits where identifier=v_key for update;
      if v_limit.blocked_until>now() then return jsonb_build_object('blocked',true); end if;
      select a.auth_user_id,a.email into v_id,v_email from public.admins a
        join private.account_controls c on c.user_id=a.auth_user_id
        where lower(c.login_username)=lower(trim(p_payload->>'username')) and a.role='admin' and a.active
        and not private.account_is_suspended(a.auth_user_id);
      return jsonb_build_object('id',v_id,'email',v_email,'blocked',false);
    elsif p_action='login_failed' then
      update private.admin_login_limits set
        attempts=case when window_start<now()-interval '15 minutes' then 1 else attempts+1 end,
        window_start=case when window_start<now()-interval '15 minutes' then now() else window_start end,
        blocked_until=case when attempts>=4 and window_start>=now()-interval '15 minutes' then now()+interval '15 minutes' else null end
        where identifier=v_key;
      insert into public.audit_logs(user_name,action,description) values('System admin sign-in','ADMIN_LOGIN_FAILED','An administrator sign-in attempt failed.');
    else
      delete from private.admin_login_limits where identifier=v_key;
      insert into public.audit_logs(user_name,action,description) select name,'ADMIN_LOGIN_SUCCEEDED','Administrator signed in.' from public.admins where auth_user_id=p_actor and role='admin';
    end if;
    return '{}';
  end if;
  if p_action='complete_invitation' then
    v_target:=p_actor;
    select * into v_row from private.staff_invitations where auth_user_id=v_target and status='pending'
      order by created_at desc limit 1 for update;
    if v_row.id is null or v_row.expires_at<=now() or private.account_is_suspended(v_target) then
      raise exception 'This invitation is no longer available. Ask the administrator to resend it.';
    end if;
    if not exists(select 1 from auth.users where id=v_target and email_confirmed_at is not null) then raise exception 'Verify your invitation email first.'; end if;
    update private.staff_invitations set status='accepted',accepted_at=now(),last_error=null where id=v_row.id;
    update public.admins set active=true,name=v_row.name,role=v_row.role,department=v_row.department,updated_at=now() where auth_user_id=v_target;
    insert into public.audit_logs(user_name,action,description,meta) values(v_row.name,'STAFF_INVITATION_ACCEPTED','Staff member set their password and accepted the invitation.',jsonb_build_object('invitation_id',v_row.id,'role',v_row.role));
    return jsonb_build_object('accepted',true);
  end if;
  if not private.is_system_admin(p_actor) then raise exception 'System administrator access required.' using errcode='42501'; end if;
  select name into v_actor_name from public.admins where auth_user_id=p_actor;
  select value into v_settings from private.system_admin_settings where singleton;
  if p_action='invite_reserve' then
    v_email:=lower(trim(p_payload->>'email')); v_name:=trim(p_payload->>'name'); v_role:=p_payload->>'role';
    perform pg_advisory_xact_lock(hashtextextended(v_email,0));
    if v_email is null or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid staff email address.'; end if;
    if exists(select 1 from auth.users where lower(email)=v_email) then raise exception 'An account already uses this email. Manage its existing invitation or use another email.'; end if;
    insert into private.staff_invitations(name,email,role,department,created_by,expires_at)
      values(v_name,v_email,v_role,left(coalesce(nullif(trim(p_payload->>'department'),''),'University Clinic'),120),p_actor,
        now()+make_interval(mins=>least(60,greatest(5,(v_settings->>'invitation_expiry_minutes')::integer)))) returning * into v_row;
    v_result:=to_jsonb(v_row);
  elsif p_action in ('invite_get','invite_resend','invite_sent','invite_failed','invite_revoke') then
    select * into v_row from private.staff_invitations where id=(p_payload->>'id')::uuid for update;
    if v_row.id is null then raise exception 'Invitation not found.'; end if;
    if p_action='invite_get' then return to_jsonb(v_row); end if;
    if p_action='invite_resend' then
      if v_row.status='accepted' then raise exception 'This invitation has already been accepted.'; end if;
      if v_row.last_sent_at>now()-interval '60 seconds' and v_row.status<>'failed' then raise exception 'Wait one minute before resending this invitation.'; end if;
      update private.staff_invitations set status='sending',last_sent_at=now(),last_error=null,
        expires_at=now()+make_interval(mins=>least(60,greatest(5,(v_settings->>'invitation_expiry_minutes')::integer))) where id=v_row.id returning * into v_row;
      delete from auth.sessions where user_id=v_row.auth_user_id;
    elsif p_action='invite_sent' then
      if v_row.status<>'sending' then raise exception 'Invitation state changed. Refresh the list.'; end if;
      update private.staff_invitations set auth_user_id=(p_payload->>'auth_user_id')::uuid,status='pending',send_count=send_count+1,last_error=null where id=v_row.id returning * into v_row;
      insert into public.admins(auth_user_id,name,email,role,department,active)
        values(v_row.auth_user_id,v_row.name,v_row.email,v_row.role,v_row.department,false)
        on conflict(email) do update set auth_user_id=excluded.auth_user_id,name=excluded.name,role=excluded.role,department=excluded.department,active=false;
    elsif p_action='invite_failed' then
      update private.staff_invitations set status='failed',last_error=left(p_payload->>'message',300) where id=v_row.id returning * into v_row;
    else
      if v_row.status='accepted' then raise exception 'An accepted invitation cannot be revoked. Suspend the staff account instead.'; end if;
      update private.staff_invitations set status='revoked' where id=v_row.id returning * into v_row;
      delete from auth.sessions where user_id=v_row.auth_user_id;
    end if;
    v_result:=to_jsonb(v_row);
  elsif p_action='settings' then
    v_result:=v_settings || (p_payload - 'id');
    if (v_result->>'invitation_expiry_minutes')::integer not between 5 and 60 then raise exception 'Invitation expiry must be between 5 and 60 minutes.'; end if;
    update private.system_admin_settings set value=v_result,updated_at=now() where singleton;
  elsif p_action='save_profile' then
    if length(trim(p_payload->>'name')) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
    update public.admins set name=trim(p_payload->>'name'),updated_at=now() where auth_user_id=p_actor;
    v_result:=jsonb_build_object('saved',true);
  elsif p_action='password_changed' then
    update private.account_controls set must_change_password=false,updated_at=now() where user_id=p_actor;
  elsif p_action in ('suspend','reactivate','unlock','change_role','password_reset') then
    v_target:=(p_payload->>'id')::uuid;
    if v_target=p_actor then raise exception 'You cannot change your own access here. Use My Account.'; end if;
    if not exists(select 1 from auth.users where id=v_target) then raise exception 'Account not found.'; end if;
    if exists(select 1 from public.admins where auth_user_id=v_target and role='admin') then raise exception 'System administrator accounts are protected.'; end if;
    if p_action in ('suspend','reactivate') then
      if length(trim(coalesce(p_payload->>'reason','')))<5 then raise exception 'Provide an account access reason of at least 5 characters.'; end if;
      if p_action='suspend' then
        v_until:=nullif(p_payload->>'until','')::timestamptz;
        if v_until is not null and v_until<=now() then raise exception 'Choose a suspension end time in the future.'; end if;
        insert into private.account_controls(user_id,suspended,suspension_reason,suspended_at,suspended_by,suspended_until)
          values(v_target,true,trim(p_payload->>'reason'),now(),p_actor,v_until)
          on conflict(user_id) do update set suspended=true,suspension_reason=excluded.suspension_reason,suspended_at=now(),suspended_by=p_actor,suspended_until=excluded.suspended_until,updated_at=now();
      else
        update private.account_controls set suspended=false,updated_at=now() where user_id=v_target;
        update public.users set active=true,updated_at=now() where auth_user_id=v_target;
        update public.admins set active=true,updated_at=now() where auth_user_id=v_target and not exists(select 1 from private.staff_invitations where auth_user_id=v_target and status<>'accepted');
      end if;
      delete from auth.sessions where user_id=v_target;
    elsif p_action='unlock' then
      update public.admins set failed_login_attempts=0,locked_until=null,lockout_reason=null where auth_user_id=v_target;
      update public.users set failed_login_attempts=0,locked_until=null,lockout_reason=null where auth_user_id=v_target;
    elsif p_action='change_role' then
      v_role:=p_payload->>'role';
      if v_role not in ('physician','nurse') then raise exception 'Choose a clinical staff role.'; end if;
      if not exists(select 1 from public.admins where auth_user_id=v_target and role in ('physician','nurse')) then raise exception 'Only existing staff accounts can change clinical role.'; end if;
      update public.admins set role=v_role,updated_at=now() where auth_user_id=v_target;
      update private.staff_invitations set role=v_role where auth_user_id=v_target;
      delete from auth.sessions where user_id=v_target;
    end if;
    select email into v_email from auth.users where id=v_target;
    v_result:=jsonb_build_object('id',v_target,'email',v_email);
  else raise exception 'Unknown administration action.'; end if;
  insert into public.audit_logs(user_name,action,description,meta)
    values(v_actor_name,case when p_action like 'invite_%' then 'STAFF_INVITATION_'||upper(substr(p_action,8)) else 'ADMIN_'||upper(p_action) end,
      case p_action when 'suspend' then 'Account suspended: '||trim(p_payload->>'reason')
        when 'reactivate' then 'Account reactivated: '||trim(p_payload->>'reason')
        when 'settings' then 'System settings updated.' when 'save_profile' then 'Administrator profile updated.'
        when 'password_changed' then 'Administrator password changed.'
        else replace(initcap(replace(p_action,'_',' ')),'Invite ','Invitation ')||'.' end,
      jsonb_build_object('target_user_id',v_target,'invitation_id',v_row.id,'role',v_role));
  return v_result;
end;
$$;
revoke all on function public.system_admin_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.system_admin_action(uuid,text,jsonb) to service_role;

-- Internal functions are not callable by browser clients, even through an exposed schema.
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';

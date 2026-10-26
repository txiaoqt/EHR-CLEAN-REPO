-- A sign-in can be deleted while clinic documents and medical history remain.
-- Match the patient account FK instead of cascading through enrollee documents.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.enrollees'::regclass
    and confrelid='auth.users'::regclass and contype='f' loop
    execute format('alter table public.enrollees drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.enrollees add constraint enrollees_auth_user_id_fkey
  foreign key(auth_user_id) references auth.users(id) on delete set null;
alter table private.admin_account_deletions drop constraint admin_account_deletions_target_kind_check;
alter table private.admin_account_deletions add constraint admin_account_deletions_target_kind_check
  check(target_kind in ('invitation','administrator','user'));

create or replace function private.account_is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.account_controls c where c.user_id=p_user
      and c.suspended and (c.suspended_until is null or c.suspended_until>now()))
    or exists(select 1 from private.admin_account_deletions d where d.auth_user_id=p_user and d.completed_at is null);
$$;

-- Bind new audit actors to the authenticated session, not a display name or
-- a browser-supplied actor ID. Existing audit entries remain immutable.
create function private.stamp_audit_actor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then
    new.meta:=coalesce(new.meta,'{}'::jsonb)||jsonb_build_object('actor_user_id',auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_audit_actor() from public,anon,authenticated;
create trigger stamp_audit_actor before insert on public.audit_logs
  for each row execute function private.stamp_audit_actor();

create index if not exists audit_logs_target_account on public.audit_logs((meta->>'target_user_id'));
create index if not exists audit_logs_actor_account on public.audit_logs((meta->>'actor_user_id'));

create function public.admin_account_history(p_account uuid default null,p_search text default '',
  p_action text default 'all',p_date_from date default null,p_date_to date default null,
  p_page integer default 1,p_export boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_search text:=left(trim(coalesce(p_search,'')),120);
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if p_date_from>p_date_to then raise exception 'The start date must be on or before the end date.'; end if;
  with filtered as (
    select l.* from public.audit_logs l
    where (p_account is null or l.meta->>'target_user_id'=p_account::text or l.meta->>'actor_user_id'=p_account::text
      or exists(select 1 from public.enrollees e where e.auth_user_id=p_account and l.meta->>'enrollee_id'=e.id::text)
      or exists(select 1 from private.admin_account_deletions d where d.auth_user_id=p_account
        and d.target_kind='user' and l.meta->>'enrollee_id'=d.profile_id::text))
      and (p_action='all' or l.action=p_action)
      and (p_date_from is null or l.created_at>=p_date_from::timestamp at time zone 'Asia/Manila')
      and (p_date_to is null or l.created_at<(p_date_to+1)::timestamp at time zone 'Asia/Manila')
      and (v_search='' or concat_ws(' ',l.action,l.description,l.performed_by,l.user_name) ilike '%'||v_search||'%')
  ), page as (select * from filtered order by created_at desc,id desc
    limit case when p_export then 5000 else 25 end
    offset case when p_export then 0 else greatest(0,least(coalesce(p_page,1),100000)-1)*25 end)
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_account_history(uuid,text,text,date,date,integer,boolean) from public,anon;
grant execute on function public.admin_account_history(uuid,text,text,date,date,integer,boolean) to authenticated;

create or replace function public.admin_delete_account(p_actor uuid,p_kind text,p_target uuid,
  p_confirmation_email text,p_stage text default 'prepare')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request private.admin_account_deletions; v_inv private.staff_invitations;
  v_profile public.admins; v_auth uuid; v_actor_name text; v_email text; v_name text; v_role text; v_enrollee public.enrollees; v_patient public.users; v_auth_row auth.users;
begin
  if p_kind not in ('invitation','administrator','user') or p_kind is null
    or p_stage not in ('prepare','complete') or p_stage is null or p_target is null then
    raise exception 'Choose an account or invitation to delete.';
  end if;
  -- Serialize deletions and recheck authority after waiting. Two administrators
  -- cannot delete one another concurrently and leave the clinic without an admin.
  perform pg_advisory_xact_lock(hashtextextended('system-admin-account-deletion',0));
  if not private.is_system_admin(p_actor) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  select name into v_actor_name from public.admins where auth_user_id=p_actor;
  select * into v_request from private.admin_account_deletions
    where target_kind=p_kind and target_id=p_target for update;
  if v_request.target_id is not null then
    if lower(trim(coalesce(p_confirmation_email,'')))<>v_request.email then
      raise exception 'Type the account email address to confirm deletion.';
    end if;
    if v_request.completed_at is not null then return jsonb_build_object('completed',true); end if;
  elsif p_stage='complete' then
    raise exception 'Start the deletion before completing it.';
  else
    if p_kind='invitation' then
      select * into v_inv from private.staff_invitations where id=p_target for update;
      if v_inv.id is null then raise exception 'Invitation not found. Refresh the list.'; end if;
      if v_inv.status='accepted' then raise exception 'An accepted invitation cannot be deleted here. Manage its account instead.'; end if;
      if v_inv.status='sending' then raise exception 'This invitation is being sent. Wait for delivery to finish, then refresh and try again.'; end if;
      v_email:=v_inv.email; v_name:=v_inv.name; v_role:=v_inv.role;
      -- Recovery is limited to this exact, unaccepted invitation. Never delete
      -- an unrelated account just because it has the same email address.
      v_auth:=public.admin_invitation_auth_user(p_actor,v_inv.id);
      select * into v_profile from public.admins where auth_user_id=v_auth for update;
      if v_profile.id is not null and (v_profile.active or v_profile.role<>v_inv.role) then
        raise exception 'This invitation is linked to an existing account. Manage that account instead.';
      end if;
      if exists(select 1 from private.staff_invitations where auth_user_id=v_auth and status='accepted') then
        raise exception 'This account has already accepted an invitation. Manage that account instead.';
      end if;
    elsif p_kind='user' then
      select * into v_auth_row from auth.users where id=p_target for update;
      if v_auth_row.id is null or v_auth_row.deleted_at is not null then raise exception 'This sign-in no longer exists. Refresh the directory.'; end if;
      if exists(select 1 from public.admins where auth_user_id=p_target)
        or exists(select 1 from private.staff_invitations where auth_user_id=p_target) then
        raise exception 'Staff and administrator sign-ins cannot be deleted from User Accounts.';
      end if;
      select * into v_patient from public.users where auth_user_id=p_target for update;
      select * into v_enrollee from public.enrollees where auth_user_id=p_target for update;
      if v_patient.id is null and v_enrollee.id is null
        and coalesce(v_auth_row.raw_user_meta_data->>'role','') not in ('patient','enrollee') then
        raise exception 'No patient or enrollee sign-in is linked to this account.';
      end if;
      v_auth:=p_target; v_email:=lower(v_auth_row.email);
      v_role:=case when v_patient.id is not null then 'patient' when v_enrollee.id is not null then 'enrollee'
        else v_auth_row.raw_user_meta_data->>'role' end;
      v_name:=coalesce(v_patient.name,nullif(concat_ws(' ',v_enrollee.first_name,v_enrollee.middle_name,v_enrollee.surname,v_enrollee.suffix),''),
        v_auth_row.raw_user_meta_data->>'name',v_email);
      v_profile.id:=coalesce(v_enrollee.id,v_patient.id);
    else
      -- Use the profile ID, so an administrator without an Auth link can also be
      -- removed. Lock invitations before profiles, matching setup completion.
      perform 1 from private.staff_invitations i join public.admins a on a.auth_user_id=i.auth_user_id
        where a.id=p_target order by i.id for update of i;
      select * into v_profile from public.admins where id=p_target and role='admin' for update;
      if v_profile.id is null then raise exception 'Administrator not found. Refresh the list.'; end if;
      v_auth:=v_profile.auth_user_id; v_email:=lower(v_profile.email); v_name:=v_profile.name; v_role:=v_profile.role;
      if v_auth=p_actor then raise exception 'You cannot delete your own administrator account.'; end if;
      if not exists(select 1 from public.admins a where a.role='admin' and a.active
        and a.id<>p_target and a.auth_user_id is not null and not private.account_is_suspended(a.auth_user_id)) then
        raise exception 'At least one active administrator must remain.';
      end if;
      if exists(select 1 from private.staff_invitations where auth_user_id=v_auth and status<>'accepted')
        and not v_profile.active then
        raise exception 'Delete this administrator''s unaccepted invitation instead.';
      end if;
    end if;
    if v_auth=p_actor then raise exception 'You cannot delete your own administrator account.'; end if;
    if lower(trim(coalesce(p_confirmation_email,'')))<>v_email then
      raise exception 'Type the account email address to confirm deletion.';
    end if;
    if p_kind<>'user' and (exists(select 1 from public.users where auth_user_id=v_auth)
      or exists(select 1 from public.enrollees where auth_user_id=v_auth)) then
      raise exception 'This sign-in is also linked to a patient or enrollee. It cannot be deleted here.';
    end if;
    insert into private.admin_account_deletions(target_kind,target_id,auth_user_id,profile_id,name,email,role,requested_by)
      values(p_kind,p_target,v_auth,v_profile.id,v_name,v_email,v_role,p_actor) returning * into v_request;
    if p_kind='user' then
      update public.users set active=false,updated_at=now() where auth_user_id=v_auth;
    else
      update public.admins set active=false,updated_at=now() where id=v_profile.id;
    end if;
    update private.staff_invitations set status='revoked'
      where status<>'accepted' and (id=v_inv.id or auth_user_id=v_auth);
    if v_auth is not null and exists(select 1 from auth.users where id=v_auth) then
      insert into private.account_controls(user_id,suspended,suspension_reason,suspended_at,suspended_by)
        values(v_auth,true,'Account deletion requested',now(),p_actor)
        on conflict(user_id) do update set suspended=true,suspension_reason=excluded.suspension_reason,
          suspended_at=now(),suspended_by=p_actor,suspended_until=null,updated_at=now();
      delete from auth.sessions where user_id=v_auth;
    end if;
    insert into public.audit_logs(user_name,action,description,meta)
      values(v_actor_name,'ADMIN_DELETION_REQUESTED','Deletion requested for '||v_name||'.',
        jsonb_build_object('actor_user_id',p_actor,'target_kind',p_kind,'target_user_id',v_auth,'profile_id',v_profile.id,
          'invitation_id',v_inv.id,'target_email',v_email,'target_name',v_name,'role',v_role));
  end if;
  if p_stage='complete' then
    if exists(select 1 from auth.users where id=v_request.auth_user_id and deleted_at is null) then
      raise exception 'The sign-in has not been deleted yet. Retry deletion.';
    end if;
    -- Auth is soft-deleted, preserving historical FK links. Profile references
    -- use SET NULL; audit rows retain explicit actor and target snapshots.
    if p_kind='user' then
      update public.users set active=false,auth_user_id=null,updated_at=now() where auth_user_id=v_request.auth_user_id;
      update public.enrollees set auth_user_id=null where auth_user_id=v_request.auth_user_id;
    else
      delete from public.admins where id=v_request.profile_id;
    end if;
    delete from private.account_controls where user_id=v_request.auth_user_id;
    delete from private.staff_invitations where auth_user_id=v_request.auth_user_id
      or (p_kind='invitation' and id=p_target);
    update private.admin_account_deletions set completed_at=now()
      where target_kind=p_kind and target_id=p_target;
    insert into public.audit_logs(user_name,action,description,meta)
      values(v_actor_name,case when p_kind='invitation' then 'STAFF_INVITATION_DELETED' when p_kind='user' then 'ADMIN_USER_ACCOUNT_DELETED' else 'ADMIN_ACCOUNT_DELETED' end,
        case when p_kind='invitation' then 'Unaccepted invitation deleted for ' when p_kind='user' then 'User account deleted for ' else 'Administrator account deleted for ' end||v_request.name||'.',
        jsonb_build_object('actor_user_id',p_actor,'target_kind',p_kind,'target_user_id',v_request.auth_user_id,'profile_id',v_request.profile_id,
          'invitation_id',case when p_kind='invitation' then p_target end,'target_email',v_request.email,
          'target_name',v_request.name,'role',v_request.role));
    return jsonb_build_object('completed',true);
  end if;
  return jsonb_build_object('completed',false,'auth_user_id',v_request.auth_user_id,
    'auth_deleted',not exists(select 1 from auth.users where id=v_request.auth_user_id and deleted_at is null));
end;
$$;

create or replace function public.admin_portal_data(p_section text,p_search text default '',
  p_status text default 'all',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
      'pending_invitations',(select count(*) from private.staff_invitations where role in ('physician','nurse') and status='pending' and expires_at>now()),
      'suspended_accounts',(select count(*) from private.account_controls where suspended and (suspended_until is null or suspended_until>now())),
      'user_accounts',(select count(*) from auth.users u where u.deleted_at is null
        and not exists(select 1 from public.admins a where a.auth_user_id=u.id)
        and (exists(select 1 from public.users p where p.auth_user_id=u.id) or exists(select 1 from public.enrollees e where e.auth_user_id=u.id)
          or u.raw_user_meta_data->>'role' in ('patient','enrollee'))),
      'failed_logins_today',(select count(*) from public.audit_logs where action='ADMIN_LOGIN_FAILED' and created_at>=date_trunc('day',now())),
      'recent_activity',(select coalesce(jsonb_agg(r),'[]'::jsonb) from (select id,user_name,action,description,created_at from public.audit_logs where action like 'ADMIN_%' or action like 'STAFF_INVITATION_%' order by created_at desc limit 8) r),
      'last_backup',(select value from public.settings where key='last_backup' limit 1));
  elsif p_section in ('invitations','administrator_invitations') then
    with rows as (select i.*,exists(select 1 from private.admin_account_deletions d where d.completed_at is null
        and ((d.target_kind='invitation' and d.target_id=i.id) or d.auth_user_id=i.auth_user_id)) as deletion_pending,
      case when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
        and ((d.target_kind='invitation' and d.target_id=i.id) or d.auth_user_id=i.auth_user_id)) then 'deletion_pending'
        when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end as display_status
      from private.staff_invitations i
      where ((p_section='invitations' and i.role in ('physician','nurse')) or (p_section='administrator_invitations' and i.role='admin'))
        and (p_search='' or i.name ilike '%'||left(p_search,120)||'%' or i.email ilike '%'||left(p_search,120)||'%')),
    filtered as (select * from rows where p_status='all' or display_status=p_status),
    page as (select * from filtered order by created_at desc,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  elsif p_section in ('staff','administrators','users') then
    with accounts as (
      select a.auth_user_id as id,a.id as profile_id,a.name,a.email,a.role,a.department,
        a.created_at,a.active,a.locked_until,false as incomplete,
        case when a.role='admin' then (select c.login_username from private.account_controls c where c.user_id=a.auth_user_id) end as identifier,
        false as retired
      from public.admins a where (p_section='staff' and a.role in ('physician','nurse')) or (p_section='administrators' and a.role='admin')
      union all
      select u.auth_user_id,u.id,u.name,au.email,'patient',null,u.created_at,u.active,u.locked_until,false,u.patient_id,false
      from public.users u join auth.users au on au.id=u.auth_user_id and au.deleted_at is null where p_section='users'
        and not exists(select 1 from public.admins a where a.auth_user_id=u.auth_user_id)
      union all
      select e.auth_user_id,e.id,concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        au.email,'enrollee',null,e.created_at,e.status<>'elevated',null,false,e.applicant_id,e.status='elevated'
      from public.enrollees e join auth.users au on au.id=e.auth_user_id and au.deleted_at is null where p_section='users'
        and not exists(select 1 from public.admins a where a.auth_user_id=e.auth_user_id)
        and not exists(select 1 from public.users u where u.auth_user_id=e.auth_user_id)
      union all
      select au.id,au.id,coalesce(nullif(au.raw_user_meta_data->>'name',''),au.email),au.email,
        au.raw_user_meta_data->>'role',null,au.created_at,true,null,true,null,false
      from auth.users au where p_section='users' and au.deleted_at is null and au.raw_user_meta_data->>'role' in ('patient','enrollee')
        and not exists(select 1 from public.admins a where a.auth_user_id=au.id)
        and not exists(select 1 from public.users u where u.auth_user_id=au.id)
        and not exists(select 1 from public.enrollees e where e.auth_user_id=au.id)
    ), rows as (select a.*,au.last_sign_in_at,c.suspension_reason,c.suspended_at,c.suspended_until,
        i.id as invitation_id,i.status as invitation_status,
        exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) as deletion_pending,
        case when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) then 'deletion_pending'
          when a.retired then 'retired'
          when private.account_is_suspended(a.id) then 'suspended'
          when a.incomplete then 'incomplete'
          when not a.active and i.status='pending' and i.expires_at<=now() then 'expired'
          when not a.active and i.status='pending' then 'invited'
          when not a.active and i.status in ('revoked','failed','sending') then i.status
          when not a.active then 'inactive' when a.locked_until>now() then 'locked' else 'active' end as status
        from accounts a left join auth.users au on au.id=a.id left join private.account_controls c on c.user_id=a.id
        left join lateral (select inv.id,inv.status,inv.expires_at from private.staff_invitations inv
          where inv.auth_user_id=a.id and a.role in ('admin','physician','nurse')
          order by inv.created_at desc,inv.id desc limit 1) i on true
        where p_search='' or a.name ilike '%'||left(p_search,120)||'%' or a.email ilike '%'||left(p_search,120)||'%' or a.identifier ilike '%'||left(p_search,120)||'%'),
      filtered as (select * from rows where p_status='all' or status=p_status),
      page as (select * from filtered order by name,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  raise exception 'Unknown administration section.';
end;
$$;

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
      insert into public.audit_logs(user_name,action,description,meta) select name,'ADMIN_LOGIN_SUCCEEDED','Administrator signed in.',jsonb_build_object('actor_user_id',p_actor) from public.admins where auth_user_id=p_actor and role='admin';
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
    insert into public.audit_logs(user_name,action,description,meta) values(v_row.name,'STAFF_INVITATION_ACCEPTED','Staff member set their password and accepted the invitation.',jsonb_build_object('actor_user_id',p_actor,'target_user_id',v_target,'invitation_id',v_row.id,'role',v_row.role));
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
    if exists(select 1 from private.admin_account_deletions where auth_user_id=v_target and completed_at is null) then
      raise exception 'Account deletion is incomplete. Retry delete to finish cleanup.';
    end if;
    if exists(select 1 from public.admins where auth_user_id=v_target and role='admin') then raise exception 'System administrator accounts are protected.'; end if;
    if p_action='password_reset' and not exists(select 1 from public.admins where auth_user_id=v_target and role in ('physician','nurse')) then
      raise exception 'User accounts reset their password through Forgot password on the patient portal.';
    end if;
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
      jsonb_build_object('actor_user_id',p_actor,'target_user_id',v_target,'invitation_id',v_row.id,'role',v_role));
  return v_result;
end;
$$;

notify pgrst,'reload schema';

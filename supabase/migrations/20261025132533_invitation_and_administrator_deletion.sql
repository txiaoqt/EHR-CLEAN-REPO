-- Deletion spans Postgres and Auth. Keep a private, durable request so a failed
-- Auth call can be retried without restoring access or losing the target ID.
create table private.admin_account_deletions (
  target_kind text not null check(target_kind in ('invitation','administrator')),
  target_id uuid not null,
  auth_user_id uuid,
  profile_id uuid,
  name text not null,
  email text not null,
  role text not null,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(target_kind,target_id)
);
alter table private.admin_account_deletions enable row level security;
revoke all on private.admin_account_deletions from public,anon,authenticated;
create index admin_account_deletions_auth_pending on private.admin_account_deletions(auth_user_id)
  where completed_at is null;
create index admin_account_deletions_email_pending on private.admin_account_deletions(email)
  where completed_at is null;
create index staff_invitations_auth_latest on private.staff_invitations(auth_user_id,created_at desc,id desc);

create function private.guard_invitation_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status='sending' and new.status='revoked' then
    raise exception 'This invitation is being sent. Wait for delivery to finish before revoking or deleting it.';
  end if;
  if new.status in ('sending','pending','accepted') and exists(
    select 1 from private.admin_account_deletions d where d.completed_at is null
      and (d.email=new.email or d.auth_user_id=new.auth_user_id
        or (d.target_kind='invitation' and d.target_id=new.id))) then
    raise exception 'Deletion is incomplete for this account. Finish deleting it before sending another invitation.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_invitation_deletion() from public,anon,authenticated;
create trigger guard_invitation_deletion before insert or update on private.staff_invitations
  for each row execute function private.guard_invitation_deletion();

-- Only the authenticated Edge Function calls this RPC with its verified actor.
-- Preparing always disables access; completing requires Auth deletion evidence.
create function public.admin_delete_account(p_actor uuid,p_kind text,p_target uuid,
  p_confirmation_email text,p_stage text default 'prepare')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request private.admin_account_deletions; v_inv private.staff_invitations;
  v_profile public.admins; v_auth uuid; v_actor_name text; v_email text; v_name text; v_role text;
begin
  if p_kind not in ('invitation','administrator') or p_kind is null
    or p_stage not in ('prepare','complete') or p_stage is null or p_target is null then
    raise exception 'Choose an invitation or administrator to delete.';
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
    if exists(select 1 from public.users where auth_user_id=v_auth)
      or exists(select 1 from public.enrollees where auth_user_id=v_auth) then
      raise exception 'This sign-in is also linked to a patient or enrollee. It cannot be deleted here.';
    end if;
    insert into private.admin_account_deletions(target_kind,target_id,auth_user_id,profile_id,name,email,role,requested_by)
      values(p_kind,p_target,v_auth,v_profile.id,v_name,v_email,v_role,p_actor) returning * into v_request;
    update public.admins set active=false,updated_at=now() where id=v_profile.id;
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
        jsonb_build_object('target_kind',p_kind,'target_user_id',v_auth,'profile_id',v_profile.id,
          'invitation_id',v_inv.id,'target_email',v_email,'target_name',v_name,'role',v_role));
  end if;
  if p_stage='complete' then
    if exists(select 1 from auth.users where id=v_request.auth_user_id and deleted_at is null) then
      raise exception 'The sign-in has not been deleted yet. Retry deletion.';
    end if;
    -- Auth is soft-deleted, preserving historical FK links. Profile references
    -- use SET NULL; audit rows retain explicit actor and target snapshots.
    delete from public.admins where id=v_request.profile_id;
    delete from private.account_controls where user_id=v_request.auth_user_id;
    delete from private.staff_invitations where auth_user_id=v_request.auth_user_id
      or (p_kind='invitation' and id=p_target);
    update private.admin_account_deletions set completed_at=now()
      where target_kind=p_kind and target_id=p_target;
    insert into public.audit_logs(user_name,action,description,meta)
      values(v_actor_name,case when p_kind='invitation' then 'STAFF_INVITATION_DELETED' else 'ADMIN_ACCOUNT_DELETED' end,
        case when p_kind='invitation' then 'Unaccepted invitation deleted for ' else 'Administrator account deleted for ' end||v_request.name||'.',
        jsonb_build_object('target_kind',p_kind,'target_user_id',v_request.auth_user_id,'profile_id',v_request.profile_id,
          'invitation_id',case when p_kind='invitation' then p_target end,'target_email',v_request.email,
          'target_name',v_request.name,'role',v_request.role));
    return jsonb_build_object('completed',true);
  end if;
  return jsonb_build_object('completed',false,'auth_user_id',v_request.auth_user_id,
    'auth_deleted',not exists(select 1 from auth.users where id=v_request.auth_user_id and deleted_at is null));
end;
$$;
revoke all on function public.admin_delete_account(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_delete_account(uuid,text,uuid,text,text) to service_role;

-- Auth maintenance must not recreate a previously deleted portal profile.
create or replace function public.sync_public_user_from_auth()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_role text; v_name text; v_email text; v_patient_id text;
begin
  if new.deleted_at is not null then return new; end if;
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
      'user_accounts',(select count(*) from auth.users u where exists(select 1 from public.users p where p.auth_user_id=u.id) or exists(select 1 from public.enrollees e where e.auth_user_id=u.id)),
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
        a.created_at,a.active,a.locked_until,
        case when a.role='admin' then (select c.login_username from private.account_controls c where c.user_id=a.auth_user_id) end as identifier,
        false as retired
      from public.admins a where (p_section='staff' and a.role in ('physician','nurse')) or (p_section='administrators' and a.role='admin')
      union all
      select u.auth_user_id,u.id,u.name,u.email,'patient',null,u.created_at,u.active,u.locked_until,u.patient_id,false
      from public.users u where p_section='users'
      union all
      select e.auth_user_id,e.id,concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        e.personal_email,'enrollee',null,e.created_at,e.status<>'elevated',null,e.applicant_id,e.status='elevated'
      from public.enrollees e where p_section='users'
    ), rows as (select a.*,au.last_sign_in_at,c.suspension_reason,c.suspended_at,c.suspended_until,
        i.id as invitation_id,i.status as invitation_status,
        exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) as deletion_pending,
        case when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) then 'deletion_pending'
          when a.retired then 'retired'
          when private.account_is_suspended(a.id) then 'suspended'
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
revoke all on function public.admin_portal_data(text,text,text,integer) from public,anon;
grant execute on function public.admin_portal_data(text,text,text,integer) to authenticated;
notify pgrst,'reload schema';

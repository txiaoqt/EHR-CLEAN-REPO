-- An invitation can stay on 'sending' when the email went out but recording it
-- failed. It is now shown as expired once past its time, and after two minutes it
-- can be deleted (Resend was already allowed by the database after one minute).

CREATE OR REPLACE FUNCTION public.admin_portal_data(p_section text, p_search text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_offset integer:=greatest(0,least(p_page,100000)-1)*20;
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if p_section='settings' then
    return (select value from private.system_admin_settings where singleton);
  elsif p_section='overview' then
    return jsonb_build_object(
      'active_staff',(select count(*) from public.admins where role in ('physician','nurse','dentist','clerk') and active and not private.account_is_suspended(auth_user_id)),
      'pending_invitations',(select count(*) from private.staff_invitations where role in ('physician','nurse','dentist','clerk') and status='pending' and expires_at>now()),
      'suspended_accounts',(select count(*) from private.account_controls where suspended and (suspended_until is null or suspended_until>now())),
      'user_accounts',(select count(*) from auth.users u where u.deleted_at is null
        and not exists(select 1 from public.admins a where a.auth_user_id=u.id)
        and (exists(select 1 from public.users p where p.auth_user_id=u.id) or exists(select 1 from public.enrollees e where e.auth_user_id=u.id)
          or u.raw_user_meta_data->>'role' in ('patient','enrollee')))
        +(select count(*) from private.admin_account_deletions d where d.target_kind='user' and d.completed_at is null
          and not exists(select 1 from auth.users au where au.id=d.auth_user_id and au.deleted_at is null)),
      'failed_logins_today',(select count(*) from public.audit_logs where action='ADMIN_LOGIN_FAILED' and created_at>=date_trunc('day',now())),
      'recent_activity',(select coalesce(jsonb_agg(r),'[]'::jsonb) from (select id,user_name,action,description,created_at from public.audit_logs where action like 'ADMIN_%' or action like 'STAFF_INVITATION_%' order by created_at desc limit 8) r),
      'last_backup',(select value from public.settings where key='last_backup' limit 1));
  elsif p_section in ('invitations','administrator_invitations') then
    with rows as (select i.*,exists(select 1 from private.admin_account_deletions d where d.completed_at is null
        and ((d.target_kind='invitation' and d.target_id=i.id) or d.auth_user_id=i.auth_user_id)) as deletion_pending,
      case when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
        and ((d.target_kind='invitation' and d.target_id=i.id) or d.auth_user_id=i.auth_user_id)) then 'deletion_pending'
        when i.status in ('pending','sending') and i.expires_at<=now() then 'expired' else i.status end as display_status
      from private.staff_invitations i
      where ((p_section='invitations' and i.role in ('physician','nurse','dentist','clerk')) or (p_section='administrator_invitations' and i.role='admin'))
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
      from public.admins a where (p_section='staff' and a.role in ('physician','nurse','dentist','clerk')) or (p_section='administrators' and a.role='admin')
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
      union all
      -- Registered by clinic staff (medical or dental) but not yet signed up in the
      -- patient portal: no sign-in and no email. Signing up with the same ID joins this record.
      select null::uuid,null::uuid,p.name,null,'patient',null,p.created_at,true,null::timestamptz,false,p.id,false
      from public.patients p where p_section='users' and p.archived_at is null
        and not exists(select 1 from public.users u where upper(coalesce(u.patient_id,u.student_id))=upper(p.id))
      union all
      select d.auth_user_id,d.profile_id,d.name,d.email,d.role,null,d.requested_at,false,null,false,null,false
      from private.admin_account_deletions d where p_section='users' and d.target_kind='user' and d.completed_at is null
        and not exists(select 1 from auth.users au where au.id=d.auth_user_id and au.deleted_at is null)
    ), rows as (select a.*,au.last_sign_in_at,c.suspension_reason,c.suspended_at,c.suspended_until,
        i.id as invitation_id,i.status as invitation_status,
        exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) as deletion_pending,
        case when a.id is null and a.profile_id is null then 'not_signed_up'
          when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) then 'deletion_pending'
          when a.retired then 'retired'
          when private.account_is_suspended(a.id) then 'suspended'
          when a.incomplete then 'incomplete'
          when not a.active and i.status in ('pending','sending') and i.expires_at<=now() then 'expired'
          when not a.active and i.status='pending' then 'invited'
          when not a.active and i.status in ('revoked','failed','sending') then i.status
          when not a.active then 'inactive' when a.locked_until>now() then 'locked' else 'active' end as status
        from accounts a left join auth.users au on au.id=a.id left join private.account_controls c on c.user_id=a.id
        left join lateral (select inv.id,inv.status,inv.expires_at from private.staff_invitations inv
          where inv.auth_user_id=a.id and a.role in ('admin','physician','nurse','dentist','clerk')
          order by inv.created_at desc,inv.id desc limit 1) i on true
        where p_search='' or a.name ilike '%'||left(p_search,120)||'%' or a.email ilike '%'||left(p_search,120)||'%' or a.identifier ilike '%'||left(p_search,120)||'%'),
      filtered as (select * from rows where p_status='all' or status=p_status),
      page as (select * from filtered order by name,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  raise exception 'Unknown administration section.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_actor uuid, p_kind text, p_target uuid, p_confirmation_email text, p_stage text DEFAULT 'prepare'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      if v_inv.status='sending' and v_inv.last_sent_at > now() - interval '2 minutes' then raise exception 'This invitation is being sent. Wait for delivery to finish, then refresh and try again.'; end if;
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
      -- TESTING PHASE: deleting a user account removes all of its clinic data.
      perform private.purge_account_data(v_request.auth_user_id);
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
        case when p_kind='invitation' then 'Unaccepted invitation deleted for ' when p_kind='user' then 'User account and clinic data deleted for ' else 'Administrator account deleted for ' end||v_request.name||'.',
        jsonb_build_object('actor_user_id',p_actor,'target_kind',p_kind,'target_user_id',v_request.auth_user_id,'profile_id',v_request.profile_id,
          'invitation_id',case when p_kind='invitation' then p_target end,'target_email',v_request.email,
          'target_name',v_request.name,'role',v_request.role));
    return jsonb_build_object('completed',true);
  end if;
  return jsonb_build_object('completed',false,'auth_user_id',v_request.auth_user_id,
    'auth_deleted',not exists(select 1 from auth.users where id=v_request.auth_user_id and deleted_at is null));
end;
$function$;

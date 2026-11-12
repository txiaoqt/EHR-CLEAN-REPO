-- TESTING PHASE: deleting a patient/enrollee account from Admin removes every
-- record tied to it, so a tester's single TUP account can be reused.
-- Before go-live, restore the retain-and-archive behaviour of
-- 20261112110000_patient_archive.sql (unlink, do not purge).

create or replace function private.purge_patient_data(p_patient_id text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if p_patient_id is null or p_patient_id = '' then return; end if;
  -- Children that RESTRICT deletes go first; the rest cascade or set null.
  delete from public.encounters where patient_id = p_patient_id;
  delete from public.dental_services where patient_id = p_patient_id;
  delete from public.dental_records where patient_id = p_patient_id;
  delete from public.appointments where patient_id = p_patient_id;
  delete from public.patient_record_forms where subject_type = 'patient' and subject_id = p_patient_id;
  delete from public.users where patient_id = p_patient_id or student_id = p_patient_id;
  delete from public.patients where id = p_patient_id;
  delete from public.students where id = p_patient_id;
end;
$$;

create or replace function private.purge_account_data(p_auth_user_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_pid text; v_enrollee uuid;
begin
  if p_auth_user_id is null then return; end if;
  for v_pid in select coalesce(patient_id, student_id) from public.users where auth_user_id = p_auth_user_id loop
    perform private.purge_patient_data(v_pid);
  end loop;
  delete from public.users where auth_user_id = p_auth_user_id;
  for v_enrollee in select id from public.enrollees where auth_user_id = p_auth_user_id loop
    delete from public.patient_record_forms where subject_type = 'enrollee' and subject_id = v_enrollee::text;
    delete from public.enrollees where id = v_enrollee; -- documents and messages cascade
  end loop;
  delete from private.app_policy_acceptances where user_id = p_auth_user_id;
  delete from private.app_policy_accounts where user_id = p_auth_user_id;
end;
$$;

revoke all on function private.purge_patient_data(text) from public, anon, authenticated;
revoke all on function private.purge_account_data(uuid) from public, anon, authenticated;

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

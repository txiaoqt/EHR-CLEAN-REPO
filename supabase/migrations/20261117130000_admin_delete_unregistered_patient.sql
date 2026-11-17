-- Patients registered by a clinic but never signed up have no sign-in, so the
-- admin's Delete Account (which deletes by sign-in) cannot reach them. This deletes
-- the record and its clinic data by TUPM ID, confirmed by typing that ID.
create or replace function public.admin_delete_unregistered_patient(p_patient_id text, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id text := upper(trim(coalesce(p_patient_id,''))); v_name text; v_actor text;
begin
  if not private.session_is_live() or not public.account_can_access() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if v_id = '' or upper(trim(coalesce(p_confirmation,''))) <> v_id then
    raise exception 'Type the patient ID to confirm deletion.';
  end if;
  select name into v_name from public.patients where upper(id) = v_id;
  if v_name is null then raise exception 'This patient no longer exists. Refresh the directory.'; end if;
  if exists(select 1 from public.users u where upper(coalesce(u.patient_id,u.student_id)) = v_id) then
    raise exception 'This patient has signed up. Use Delete Account instead.';
  end if;
  perform private.purge_patient_data(v_id);
  select name into v_actor from public.admins where auth_user_id = auth.uid();
  insert into public.audit_logs(user_name,action,description,meta)
    values(v_actor,'ADMIN_PATIENT_RECORD_DELETED','Patient record and clinic data deleted for '||v_name||' ('||v_id||').',
      jsonb_build_object('actor_user_id',auth.uid(),'patient_id',v_id,'target_name',v_name));
  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function public.admin_delete_unregistered_patient(text,text) from public, anon;
grant execute on function public.admin_delete_unregistered_patient(text,text) to authenticated;

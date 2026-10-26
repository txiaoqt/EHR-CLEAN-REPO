-- Patients cannot write arbitrary audit records. Record only their own verified
-- sign-in, deriving identity and session from Auth and deduplicating per session.
create unique index audit_logs_one_sign_in_per_session on public.audit_logs((meta->>'session_id'))
  where action='LOGIN_SUCCESS' and meta->>'session_id' is not null;

create function public.record_my_sign_in()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile jsonb; v_name text; v_session text:=auth.jwt()->>'session_id';
begin
  if not public.account_can_access() then
    raise exception 'An active sign-in session is required.' using errcode='42501';
  end if;
  v_profile:=public.get_my_portal_identity();
  if v_profile is null or not coalesce((v_profile->>'active')::boolean,false)
    or coalesce((v_profile->>'staff_setup_required')::boolean,false) then
    raise exception 'An active portal account is required.' using errcode='42501';
  end if;
  v_name:=coalesce(nullif(v_profile->>'name',''),v_profile->>'email','Portal account');
  insert into public.audit_logs(user_name,performed_by,action,description,meta)
    values(v_name,v_name,'LOGIN_SUCCESS','Account signed in to the portal.',
      jsonb_build_object('actor_user_id',auth.uid(),'session_id',v_session,'role',v_profile->>'role'))
    on conflict do nothing;
  return jsonb_build_object('recorded',true);
end;
$$;
revoke all on function public.record_my_sign_in() from public,anon;
grant execute on function public.record_my_sign_in() to authenticated;
notify pgrst,'reload schema';

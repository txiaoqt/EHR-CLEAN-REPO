-- Server-only initial username provisioning. Auth and the authoritative admin
-- profile must already exist; this cannot promote a patient or clinical staff.
create or replace function public.provision_system_admin_username(p_user uuid,p_username text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_username !~ '^[a-z][a-z0-9_]{2,39}$' then raise exception 'Use a valid administrator username.'; end if;
  if not exists(select 1 from public.admins where auth_user_id=p_user and role='admin' and active) then
    raise exception 'A trusted administrator Auth account must already exist.' using errcode='42501';
  end if;
  insert into private.account_controls(user_id,login_username,must_change_password)
    values(p_user,p_username,true)
    on conflict(user_id) do update set login_username=excluded.login_username,updated_at=now();
end;
$$;
revoke all on function public.provision_system_admin_username(uuid,text) from public,anon,authenticated;
grant execute on function public.provision_system_admin_username(uuid,text) to service_role;

-- Recover an Auth identity only when this exact invitation created it. This
-- makes a retry safe if SMTP succeeds but the following DB response is lost.
create or replace function public.admin_invitation_auth_user(p_actor uuid,p_invitation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_inv private.staff_invitations; v_user uuid;
begin
  if not private.is_system_admin(p_actor) then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select * into v_inv from private.staff_invitations where id=p_invitation;
  if v_inv.id is null or v_inv.status='accepted' then raise exception 'No pending invitation is available.'; end if;
  if v_inv.auth_user_id is not null then return v_inv.auth_user_id; end if;
  select id into v_user from auth.users where lower(email)=v_inv.email and invited_at is not null
    and raw_user_meta_data->>'invitation_id'=v_inv.id::text
    and raw_user_meta_data->>'role'='staff_invited';
  if v_user is null and exists(select 1 from auth.users where lower(email)=v_inv.email) then
    raise exception 'An existing account uses this email and cannot be replaced by this invitation.';
  end if;
  return v_user;
end;
$$;
revoke all on function public.admin_invitation_auth_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_invitation_auth_user(uuid,uuid) to service_role;
notify pgrst,'reload schema';

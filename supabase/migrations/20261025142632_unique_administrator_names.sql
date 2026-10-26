-- Names are unique among administrators, including inactive accounts. Clinical
-- staff names are unaffected. Expression indexes backstop concurrent requests.
create unique index administrators_name_unique
  on public.admins(lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))) where role='admin';
create unique index administrator_invitation_name_unique
  on private.staff_invitations(lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g'))))
  where role='admin' and status in ('sending','pending');

create function private.guard_administrator_name()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_key text;
begin
  if new.role<>'admin' then return new; end if;
  new.name:=btrim(regexp_replace(coalesce(new.name,''),'[[:space:]]+',' ','g'));
  if length(new.name) not between 2 and 120 then raise exception 'Use a full name with 2-120 characters.'; end if;
  v_key:=lower(new.name);
  perform pg_advisory_xact_lock(hashtextextended('administrator-name:'||v_key,0));
  if exists(select 1 from public.admins a where a.role='admin' and a.id is distinct from new.id
      and lower(btrim(regexp_replace(a.name,'[[:space:]]+',' ','g')))=v_key)
    or exists(select 1 from private.staff_invitations i where i.role='admin' and i.status in ('sending','pending')
      and (new.auth_user_id is null or i.auth_user_id is distinct from new.auth_user_id)
      and lower(btrim(regexp_replace(i.name,'[[:space:]]+',' ','g')))=v_key) then
    raise exception 'Another administrator already uses this name. Choose a different name.' using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_administrator_name() from public,anon,authenticated;
create trigger guard_administrator_name before insert or update of name,role,auth_user_id on public.admins
  for each row execute function private.guard_administrator_name();

create function private.guard_administrator_invitation_name()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_key text;
begin
  if new.role<>'admin' or new.status not in ('sending','pending') then return new; end if;
  new.name:=btrim(regexp_replace(coalesce(new.name,''),'[[:space:]]+',' ','g'));
  if length(new.name) not between 2 and 120 then raise exception 'Use a full name with 2-120 characters.'; end if;
  v_key:=lower(new.name);
  perform pg_advisory_xact_lock(hashtextextended('administrator-name:'||v_key,0));
  if exists(select 1 from public.admins a where a.role='admin'
      and (new.auth_user_id is null or a.auth_user_id is distinct from new.auth_user_id)
      and lower(btrim(regexp_replace(a.name,'[[:space:]]+',' ','g')))=v_key)
    or exists(select 1 from private.staff_invitations i where i.id is distinct from new.id and i.role='admin'
      and i.status in ('sending','pending') and lower(btrim(regexp_replace(i.name,'[[:space:]]+',' ','g')))=v_key) then
    raise exception 'Another administrator already uses this name. Choose a different name.' using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_administrator_invitation_name() from public,anon,authenticated;
create trigger guard_administrator_invitation_name before insert or update of name,role,status,auth_user_id
  on private.staff_invitations for each row execute function private.guard_administrator_invitation_name();

create function public.update_administrator_name(p_actor uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_name text:=btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')); v_before text;
begin
  if not private.is_system_admin(p_actor) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if length(v_name) not between 2 and 120 then raise exception 'Use a full name with 2-120 characters.'; end if;
  select name into v_before from public.admins where auth_user_id=p_actor and role='admin' for update;
  if not private.is_system_admin(p_actor) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if v_before=v_name then return jsonb_build_object('saved',false,'name',v_name); end if;
  begin
    update public.admins set name=v_name,updated_at=now() where auth_user_id=p_actor and role='admin';
  exception when unique_violation then
    raise exception 'Another administrator already uses this name. Choose a different name.' using errcode='23505';
  end;
  insert into public.audit_logs(user_name,action,description,meta)
    values(v_name,'ADMIN_NAME_CHANGED','Administrator changed their name.',
      jsonb_build_object('actor_user_id',p_actor,'target_user_id',p_actor,'previous_name',v_before,'name',v_name));
  return jsonb_build_object('saved',true,'name',v_name);
end;
$$;
revoke all on function public.update_administrator_name(uuid,text) from public,anon,authenticated;
grant execute on function public.update_administrator_name(uuid,text) to service_role;
notify pgrst,'reload schema';

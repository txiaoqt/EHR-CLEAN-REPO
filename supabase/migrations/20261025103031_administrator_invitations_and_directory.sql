-- Administrator invitations use the existing trusted invitation lifecycle.
-- Pending accounts remain inactive and cannot use administration or clinical APIs.
alter table private.staff_invitations drop constraint staff_invitations_role_check;
alter table private.staff_invitations add constraint staff_invitations_role_check
  check (role in ('physician','nurse','admin'));

create unique index account_controls_login_username_ci
  on private.account_controls(lower(login_username)) where login_username is not null;

-- Only the authenticated Edge Function can complete an administrator invitation.
-- The assigned role comes from the invitation, never from editable Auth metadata.
create or replace function public.complete_administrator_invitation(p_actor uuid,p_username text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inv private.staff_invitations; v_username text:=lower(trim(coalesce(p_username,'')));
begin
  select * into v_inv from private.staff_invitations
    where auth_user_id=p_actor and status='pending' and role='admin'
    order by created_at desc limit 1 for update;
  if v_inv.id is null or v_inv.expires_at<=now() or private.account_is_suspended(p_actor) then
    raise exception 'This administrator invitation is no longer available. Ask for a new invitation.';
  end if;
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then
    raise exception 'Verify your invitation email first.';
  end if;
  if v_username!~'^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'Use 3-40 lowercase letters, numbers or underscores, starting with a letter.';
  end if;
  if not exists(select 1 from public.admins where auth_user_id=p_actor and role='admin' and not active) then
    raise exception 'No pending administrator account is available.';
  end if;
  begin
    insert into private.account_controls(user_id,login_username,must_change_password)
      values(p_actor,v_username,false)
      on conflict(user_id) do update set login_username=excluded.login_username,
        must_change_password=false,updated_at=now();
  exception when unique_violation then
    raise exception 'That administrator username is already taken. Choose another username.';
  end;
  update private.staff_invitations set status='accepted',accepted_at=now(),last_error=null where id=v_inv.id;
  update public.admins set active=true,name=v_inv.name,department=v_inv.department,updated_at=now()
    where auth_user_id=p_actor and role='admin';
  insert into public.audit_logs(user_name,action,description,meta)
    values(v_inv.name,'ADMIN_INVITATION_ACCEPTED','Administrator chose their username and password and accepted the invitation.',
      jsonb_build_object('invitation_id',v_inv.id,'role','admin','target_user_id',p_actor));
  -- Setup JWTs cannot become privileged sessions after the account is activated.
  delete from auth.sessions where user_id=p_actor;
  return jsonb_build_object('accepted',true,'role','admin','username',v_username);
end;
$$;
revoke all on function public.complete_administrator_invitation(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_administrator_invitation(uuid,text) to service_role;

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
    with rows as (select i.*,case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end as display_status
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
notify pgrst,'reload schema';

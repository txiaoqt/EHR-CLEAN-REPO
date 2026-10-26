-- A removed Auth identity is excluded from the directory. The sole exception
-- is an explicitly pending cleanup request, labelled Deletion pending with a
-- retry action. This prevents an interrupted Auth/database deletion being hidden.
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
      union all
      select d.auth_user_id,d.profile_id,d.name,d.email,d.role,null,d.requested_at,false,null,false,null,false
      from private.admin_account_deletions d where p_section='users' and d.target_kind='user' and d.completed_at is null
        and not exists(select 1 from auth.users au where au.id=d.auth_user_id and au.deleted_at is null)
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
notify pgrst,'reload schema';

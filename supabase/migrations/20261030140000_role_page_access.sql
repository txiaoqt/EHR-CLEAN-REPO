-- Which Staff Portal pages each clinic role can open. The system administrator
-- sets this per role before inviting; every account with that role follows it.
-- Dashboard, Help, Settings and My Profile are always available and not listed.
-- Audit Trail and Backup & Recovery stay physician-only: nurses have no data
-- access behind them, so they cannot be granted here.
create table if not exists public.role_page_access (
  role text primary key check (role in ('physician','nurse')),
  pages text[] not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.role_page_access enable row level security;
-- No direct access: staff read their own list through get_my_portal_identity,
-- administrators through the functions below.
revoke all on public.role_page_access from public, anon, authenticated;

create or replace function private.role_page_options(p_role text)
returns text[] language sql immutable set search_path = '' as $$
  select array['appointments','patients','enrollees','archive-files','medical-log',
    'inventory','reports','events','patient-messages']
    || case when p_role='physician' then array['audit-trail','backup-recovery'] else array[]::text[] end;
$$;

insert into public.role_page_access(role,pages)
values ('physician',private.role_page_options('physician')),('nurse',private.role_page_options('nurse'))
on conflict (role) do nothing;

create or replace function public.admin_role_page_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  return (select jsonb_object_agg(role,jsonb_build_object('pages',pages,'options',private.role_page_options(role),'updated_at',updated_at))
    from public.role_page_access);
end;
$$;

create or replace function public.admin_set_role_page_access(p_role text, p_pages text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin text; v_pages text[];
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if p_role not in ('physician','nurse') then
    raise exception 'Page access can only be set for physicians and nurses.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(coalesce(p_pages,'{}')) p where p <> all(private.role_page_options(p_role))) then
    raise exception 'One of the selected pages is not available to this role.' using errcode='22023';
  end if;
  -- Keep the sidebar order regardless of the order the pages were ticked.
  select coalesce(array_agg(o order by n),'{}') into v_pages
    from unnest(private.role_page_options(p_role)) with ordinality t(o,n) where o = any(coalesce(p_pages,'{}'));
  insert into public.role_page_access(role,pages,updated_at,updated_by) values(p_role,v_pages,now(),auth.uid())
    on conflict (role) do update set pages=excluded.pages,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  select name into v_admin from public.admins where auth_user_id=auth.uid();
  insert into public.audit_logs(user_name,action,description,meta)
    values(coalesce(v_admin,'System administrator'),'STAFF_PAGE_ACCESS_UPDATED',
      'Updated the Staff Portal pages available to the '||p_role||' role ('||cardinality(v_pages)||' pages).',
      jsonb_build_object('role',p_role,'pages',to_jsonb(v_pages)));
  return jsonb_build_object('role',p_role,'pages',to_jsonb(v_pages));
end;
$$;

revoke all on function public.admin_role_page_access() from public, anon;
revoke all on function public.admin_set_role_page_access(text,text[]) from public, anon;
grant execute on function public.admin_role_page_access() to authenticated;
grant execute on function public.admin_set_role_page_access(text,text[]) to authenticated;

-- Same as 20261021135313 plus page_access for physicians and nurses, so the
-- periodic identity refresh also picks up changes the administrator saves.
create or replace function public.get_my_portal_identity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid:=auth.uid(); v_profile jsonb; v_inv private.staff_invitations; v_meta jsonb; v_email text;
begin
  if v_id is null or not private.session_is_live() then return null; end if;
  select jsonb_build_object('id',a.id,'auth_user_id',a.auth_user_id,'name',a.name,
    'email',a.email,'avatar',a.avatar,'role',a.role,'active',a.active,
    'department',a.department,'clearance_level',a.clearance_level,'locked_until',a.locked_until,
    'page_access',(select to_jsonb(r.pages) from public.role_page_access r where r.role=a.role))
    into v_profile from public.admins a where a.auth_user_id=v_id;
  if v_profile is not null then
    select * into v_inv from private.staff_invitations where auth_user_id=v_id
      order by created_at desc limit 1;
    if v_inv.status in ('sending','pending','revoked','failed') then
      if v_inv.status='pending' and v_inv.expires_at>now()
        and not private.account_is_suspended(v_id) then
        return v_profile || jsonb_build_object('active',true,'staff_setup_required',true,
          'invitation_id',v_inv.id,'invitation_expires_at',v_inv.expires_at);
      end if;
      return v_profile || jsonb_build_object('active',false,'access_message','This invitation has expired or was revoked. Ask the administrator for a new invitation.');
    end if;
  else
    select jsonb_build_object('id',u.id,'auth_user_id',u.auth_user_id,'name',u.name,
      'email',u.email,'avatar',coalesce(u.avatar,p.avatar_url),'role','patient',
      'active',u.active,'patient_id',u.patient_id,'locked_until',u.locked_until)
      into v_profile from public.users u left join public.patient_profiles p on p.patient_id=u.patient_id
      where u.auth_user_id=v_id limit 1;
    if v_profile is null then
      select jsonb_build_object('id',e.id,'auth_user_id',e.auth_user_id,
        'name',concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        'email',e.personal_email,'role','enrollee','active',e.status<>'elevated',
        'enrollee_status',e.status,'applicant_id',e.applicant_id,'elevated',e.status='elevated',
        'tup_email',e.tup_email,'elevated_student_id',e.elevated_student_id)
        into v_profile from public.enrollees e where e.auth_user_id=v_id;
    end if;
  end if;
  if v_profile is null then
    select raw_user_meta_data,email into v_meta,v_email from auth.users where id=v_id;
    if v_meta->>'role' in ('patient','enrollee') then
      v_profile:=jsonb_build_object('id',v_id,'auth_user_id',v_id,'email',v_email,
        'name',coalesce(v_meta->>'name',v_email),'role',v_meta->>'role','active',true,
        'enrollee_status','incomplete','patient_id',v_meta->>'patient_id',
        'first_name',v_meta->>'first_name','middle_name',v_meta->>'middle_name',
        'surname',v_meta->>'surname','suffix',v_meta->>'suffix',
        'date_of_birth',v_meta->>'date_of_birth','applicant_id',v_meta->>'applicant_id');
    else return null; end if;
  end if;
  if private.account_is_suspended(v_id) then
    return v_profile || jsonb_build_object('active',false,'access_message','Your account is suspended. Contact the clinic administrator.');
  end if;
  return v_profile || jsonb_build_object('must_change_password',coalesce(
    (select must_change_password from private.account_controls where user_id=v_id),false));
end;
$$;

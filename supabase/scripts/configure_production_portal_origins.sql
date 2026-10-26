-- Replace initial localhost destinations with the production domains supplied
-- for this project. Preserve any origins that have already been customized.
with previous as (
  select value from private.system_admin_settings where singleton
), proposed as (
  select value || jsonb_build_object(
    'admin_portal_url',case when value->>'admin_portal_url' in ('http://127.0.0.1:5173','http://localhost:5173')
      then 'https://tup-icare-admin.vercel.app' else value->>'admin_portal_url' end,
    'staff_portal_url',case when value->>'staff_portal_url' in ('http://127.0.0.1:5175','http://localhost:5175')
      then 'https://tup-icare-staff.me' else value->>'staff_portal_url' end,
    'user_portal_url',case when value->>'user_portal_url' in ('http://127.0.0.1:5174','http://localhost:5174')
      then 'https://tup-icare.tech' else value->>'user_portal_url' end
  ) as value from previous
), changed as (
  update private.system_admin_settings s set value=p.value,updated_at=now()
    from proposed p where s.singleton and s.value is distinct from p.value returning s.value
), audited as (
  insert into public.audit_logs(user_name,action,description,meta)
    select 'System configuration','ADMIN_SETTINGS',
      'Production patient, staff and administrator portal URLs configured.',
      jsonb_build_object('source','administrator-invitations-deployment') from changed returning id
)
select coalesce((select value from changed),(select value from previous)) as portal_settings,
  (select count(*) from audited) as changes_recorded;

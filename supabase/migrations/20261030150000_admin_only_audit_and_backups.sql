-- Audit Trail and Backup & Recovery live in the System Admin Portal only.
-- Physicians previously read every audit entry (all users' actions) from the
-- Staff Portal; staff now have no read access. Inserts are unchanged, so staff
-- actions are still recorded.
drop policy if exists audit_authorized_read on public.audit_logs;
create policy audit_authorized_read on public.audit_logs for select to authenticated
  using ((select public.current_app_role()) = 'system_admin');

-- The two pages are no longer staff pages, so they cannot be granted per role.
create or replace function private.role_page_options(p_role text)
returns text[] language sql immutable set search_path = '' as $$
  select array['appointments','patients','enrollees','archive-files','medical-log',
    'inventory','reports','events','patient-messages'];
$$;

update public.role_page_access
  set pages = array(select p from unnest(pages) p where p = any(private.role_page_options(role)))
  where not pages <@ private.role_page_options(role);

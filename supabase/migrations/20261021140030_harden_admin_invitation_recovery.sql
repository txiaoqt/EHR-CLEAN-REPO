-- Preserve existing policy/photo helpers while keeping the new admin internals private.
-- Browser clients need EXECUTE on helpers that are called from RLS policies.
grant usage on schema private to authenticated;
grant execute on function private.app_policy_status() to authenticated;
grant execute on function private.app_policy_accept(text,boolean,boolean) to authenticated;
grant execute on function private.can_read_appointment_photo(text) to authenticated;
grant execute on function private.can_delete_own_unlinked_appointment_photo(text) to authenticated;

create or replace function private.can_publish_clinic_staff_presence()
returns boolean language sql stable security definer set search_path='' as $$
  select public.account_can_access() and public.current_app_role() in ('physician','nurse');
$$;
revoke all on function private.can_publish_clinic_staff_presence() from public,anon;
grant execute on function private.can_publish_clinic_staff_presence() to authenticated;

create or replace view public.staff_directory as
select id,name,role,avatar,department,
  (active and not private.account_is_suspended(auth_user_id)) as active,auth_user_id
from public.admins
where role in ('physician','nurse') and active and public.account_can_access();
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;
notify pgrst,'reload schema';

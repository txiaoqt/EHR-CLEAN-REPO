-- Dentists publish their own online status like physicians and nurses, so the
-- Dental Portal sidebar shows Active instead of staying on "Checking".
create or replace function private.can_publish_clinic_staff_presence()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.account_can_access() and public.current_app_role() in ('physician','nurse','dentist');
$$;

-- Dentist rows are visible only to dentists: patients book and message medical
-- staff from this view, and dental appointments are never booked by patients.
create or replace view public.staff_directory as
 select id,
    name,
    role,
    avatar,
    department,
    (active and (not private.account_is_suspended(auth_user_id))) as active,
    auth_user_id
   from public.admins
  where active and public.account_can_access()
    and (role = any (array['physician'::text, 'nurse'::text])
      or (role = 'dentist' and public.current_app_role() = 'dentist'));

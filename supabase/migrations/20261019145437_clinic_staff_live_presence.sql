-- Private per-staff presence topics. Reads disclose online status only; only a
-- verified active staff account can track itself on its own Auth-ID topic.
-- Existing public Postgres Changes subscriptions remain unchanged.
create or replace function private.can_publish_clinic_staff_presence()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.admins a
    where a.auth_user_id = (select auth.uid()) and a.active = true
      and a.role in ('physician', 'nurse', 'admin')
  );
$$;
revoke all on function private.can_publish_clinic_staff_presence() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.can_publish_clinic_staff_presence() to authenticated;

create policy clinic_staff_presence_receive
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and (select auth.uid()) is not null
  and (select realtime.topic()) like 'clinic-staff-presence:%'
);

create policy clinic_staff_presence_publish_self
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and (select realtime.topic()) = 'clinic-staff-presence:' || (select auth.uid())::text
  and (select private.can_publish_clinic_staff_presence())
);

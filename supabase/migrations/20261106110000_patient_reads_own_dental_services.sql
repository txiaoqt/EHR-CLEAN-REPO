-- Records has a Dental History tab, so a patient reads the services the dentist
-- logged for them. Read-only: dental rows are still written by dentists alone.
create policy patient_own_dental_services on public.dental_services for select to authenticated
  using ((select public.current_app_role()) = 'patient' and patient_id in (
    select u.patient_id from public.users u where u.auth_user_id = (select auth.uid()) and u.patient_id is not null));

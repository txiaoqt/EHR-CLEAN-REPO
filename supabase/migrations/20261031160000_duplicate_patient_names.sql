-- Sign-up duplicate check. A student finishing sign-up cannot read the patient
-- directory yet, so this answers one yes/no question: is this first name and
-- surname already registered under a different TUPM ID? It never returns the
-- other ID or name, and only a verified @tup.edu.ph session may ask.
create or replace function public.signup_name_registered_elsewhere(p_first_name text, p_surname text, p_student_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->>'email', '') like '%@tup.edu.ph'
    and exists (
      select 1 from public.students s
      where lower(btrim(s.first_name)) = lower(btrim(p_first_name))
        and lower(btrim(s.surname)) = lower(btrim(p_surname))
        and upper(s.id) <> upper(btrim(p_student_id))
    );
$$;
revoke all on function public.signup_name_registered_elsewhere(text, text, text) from public, anon;
grant execute on function public.signup_name_registered_elsewhere(text, text, text) to authenticated;

-- TUPM-26-2627 was a second, empty entry for Angel Keith Carbon (TUPM-01-1234),
-- typed in by staff. Remove it only while nothing refers to it.
do $$
begin
  if exists (select 1 from public.students where id = 'TUPM-26-2627')
    and not exists (select 1 from public.users where patient_id = 'TUPM-26-2627' or student_id = 'TUPM-26-2627')
    and not exists (select 1 from public.patient_profiles where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.appointments where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.encounters where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.patient_message_conversations where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.dental_records where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.patient_messages where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.patient_settings where patient_id = 'TUPM-26-2627')
    and not exists (select 1 from public.inventory_transactions where patient_id = 'TUPM-26-2627')
  then
    delete from public.patients where id = 'TUPM-26-2627';
    delete from public.students where id = 'TUPM-26-2627';
  end if;
end $$;

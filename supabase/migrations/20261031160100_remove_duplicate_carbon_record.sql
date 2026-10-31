-- Finishes 20261031160000: TUPM-26-2627 also had a patient_settings row (portal
-- preferences only, no clinical data), so the guarded removal skipped it.
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
    and not exists (select 1 from public.inventory_transactions where patient_id = 'TUPM-26-2627')
  then
    delete from public.patient_settings where patient_id = 'TUPM-26-2627';
    delete from public.patients where id = 'TUPM-26-2627';
    delete from public.students where id = 'TUPM-26-2627';
  end if;
end $$;

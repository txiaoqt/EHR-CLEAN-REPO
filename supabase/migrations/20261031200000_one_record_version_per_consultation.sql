-- One version of the pink form per consultation, not per save. The procedure
-- visit that follows a consultation (and any Edit Record) updates that
-- consultation's version, so what the procedure settled on is what is kept.
CREATE OR REPLACE FUNCTION public.save_dental_visit(p_patient_id text, p_record jsonb, p_service jsonb, p_appointment_id uuid DEFAULT NULL::uuid, p_next jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_dentist text;
  v_service_id uuid;
  v_next_id uuid;
begin
  if public.current_app_role() is distinct from 'dentist' then
    raise exception 'Only dentists can record dental visits.' using errcode = '42501';
  end if;
  select name into v_dentist from public.admins where auth_user_id = auth.uid();

  -- A consultation (a visit logged without an appointment) starts a new version of
  -- the record; its procedure visit and later edits update that same version.
  perform set_config('dental.new_visit', case when p_appointment_id is null and p_service is not null then 'on' else 'off' end, true);

  if p_record is not null then
    insert into public.dental_records as r (patient_id, surname, first_name, middle_name, college_course_unit,
      classification, address, date_of_birth, sex, place_of_birth, emergency_name, emergency_address,
      emergency_contact, emergency_relationship, tooth_chart, remarks)
    values (p_patient_id, trim(p_record->>'surname'), trim(p_record->>'first_name'), nullif(trim(p_record->>'middle_name'), ''),
      nullif(trim(p_record->>'college_course_unit'), ''), coalesce(nullif(p_record->>'classification', ''), 'Student'),
      nullif(trim(p_record->>'address'), ''), nullif(p_record->>'date_of_birth', '')::date, nullif(p_record->>'sex', ''),
      nullif(trim(p_record->>'place_of_birth'), ''), nullif(trim(p_record->>'emergency_name'), ''),
      nullif(trim(p_record->>'emergency_address'), ''), nullif(trim(p_record->>'emergency_contact'), ''),
      nullif(trim(p_record->>'emergency_relationship'), ''), coalesce(p_record->'tooth_chart', '{}'::jsonb),
      nullif(trim(p_record->>'remarks'), ''))
    on conflict (patient_id) do update set surname = excluded.surname, first_name = excluded.first_name,
      middle_name = excluded.middle_name, college_course_unit = excluded.college_course_unit,
      classification = excluded.classification, address = excluded.address, date_of_birth = excluded.date_of_birth,
      sex = excluded.sex, place_of_birth = excluded.place_of_birth, emergency_name = excluded.emergency_name,
      emergency_address = excluded.emergency_address, emergency_contact = excluded.emergency_contact,
      emergency_relationship = excluded.emergency_relationship, tooth_chart = excluded.tooth_chart,
      remarks = excluded.remarks, updated_by = auth.uid();
  elsif not exists (select 1 from public.dental_records where patient_id = p_patient_id) then
    raise exception 'Log the consultation (page 1 of the pink form) before recording a procedure.' using errcode = '22023';
  end if;

  if p_service is not null then
    insert into public.dental_services (patient_id, appointment_id, service_date, service_rendered, medicine, anesthesia, teeth, dentist_name)
    values (p_patient_id, p_appointment_id,
      coalesce(nullif(p_service->>'service_date', '')::date, (now() at time zone 'Asia/Manila')::date),
      trim(p_service->>'service_rendered'), nullif(trim(p_service->>'medicine'), ''), nullif(trim(p_service->>'anesthesia'), ''),
      coalesce((select array_agg(t) from jsonb_array_elements_text(p_service->'teeth') t), '{}'),
      coalesce(v_dentist, 'Dentist'))
    returning id into v_service_id;
  end if;

  if p_appointment_id is not null then
    update public.appointments set status = 'Completed'
      where id = p_appointment_id and patient_id = p_patient_id and department = 'Dental Clinic';
    if not found then raise exception 'That dental appointment was not found.' using errcode = '22023'; end if;
  end if;

  if p_next is not null and nullif(p_next->>'date', '') is not null then
    insert into public.appointments (patient_id, patient_name, appointment_date, appointment_time, type, clinician_name,
      source, department, appointment_type, service_type, status)
    values (p_patient_id,
      coalesce((select concat_ws(' ', first_name, middle_name, surname) from public.dental_records where patient_id = p_patient_id), p_patient_id),
      (p_next->>'date')::date, p_next->>'time', 'Follow-up', coalesce(nullif(trim(p_next->>'dentist'), ''), v_dentist, 'Dentist'),
      'staff', 'Dental Clinic', 'Future Appointment', nullif(trim(p_next->>'procedure'), ''), 'Scheduled')
    returning id into v_next_id;
  end if;

  return jsonb_build_object('service_id', v_service_id, 'next_appointment_id', v_next_id);
end;
$function$;

create or replace function private.keep_dental_record_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_latest uuid;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('dental.new_visit', true), '') <> 'on' then
    select id into v_latest from public.dental_record_versions
      where patient_id = new.patient_id order by saved_at desc limit 1;
  end if;
  if v_latest is null then
    insert into public.dental_record_versions (patient_id, record, saved_by)
    values (new.patient_id, to_jsonb(new) - 'updated_by', auth.uid());
  else
    update public.dental_record_versions set record = to_jsonb(new) - 'updated_by', saved_by = auth.uid()
      where id = v_latest;
  end if;
  return null;
end;
$$;

-- Versions already saved by a procedure visit are copies of their consultation's
-- version: drop any version identical to the one before it.
delete from public.dental_record_versions v
using (
  select id, record - 'updated_at' as body,
    lag(record - 'updated_at') over (partition by patient_id order by saved_at) as prev
  from public.dental_record_versions
) d
where v.id = d.id and d.body = d.prev;

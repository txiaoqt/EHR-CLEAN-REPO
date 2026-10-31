-- Dental Clinic portal: a fourth deployment for the dentist role.
--
-- Separation is enforced here rather than in each page: restrictive policies give
-- a dentist only Dental Clinic rows and everyone else only Medical Clinic rows, so
-- the existing medical pages need no department filters and cannot leak dental data.

-- 1. The dentist role --------------------------------------------------------
alter table public.admins drop constraint admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('admin','physician','nurse','dentist'));
alter table private.staff_invitations drop constraint staff_invitations_role_check;
alter table private.staff_invitations add constraint staff_invitations_role_check check (role in ('physician','nurse','dentist','admin'));
alter table public.role_page_access drop constraint role_page_access_role_check;
alter table public.role_page_access add constraint role_page_access_role_check check (role in ('physician','nurse','dentist'));
alter table public.patient_messages drop constraint patient_messages_sender_role_check;
alter table public.patient_messages add constraint patient_messages_sender_role_check
  check (sender_role in ('patient','physician','nurse','dentist','admin','clinic'));

-- Dental Portal pages the administrator can turn on or off. Must match
-- DENTAL_PAGE_OPTIONS in src/staffPageAccess.mjs.
create or replace function private.role_page_options(p_role text)
returns text[] language sql immutable set search_path = '' as $$
  select case when p_role = 'dentist'
    then array['appointments','consultation-log','patients','inventory','reports','patient-messages']
    else array['appointments','patients','enrollees','archive-files','medical-log',
      'inventory','reports','events','patient-messages'] end;
$$;
insert into public.role_page_access(role, pages) values ('dentist', private.role_page_options('dentist'))
  on conflict (role) do nothing;

insert into private.system_admin_settings(singleton, value) values (true, '{}'::jsonb) on conflict (singleton) do nothing;
update private.system_admin_settings
  set value = value || jsonb_build_object('dental_portal_url', 'http://127.0.0.1:5176')
  where singleton and not value ? 'dental_portal_url';

-- 2. Department of a row, as the caller's clinic sees it ----------------------
create or replace function private.in_my_clinic(p_dental boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_dental, false) = (coalesce(public.current_app_role(), '') = 'dentist');
$$;

create or replace function private.is_dental_conversation(p_concern text, p_recipient_role text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_concern, '') = 'Dental inquiry' or coalesce(p_recipient_role, '') = 'dentist';
$$;

create or replace function private.conversation_in_my_clinic(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.in_my_clinic((select private.is_dental_conversation(c.concern_type, c.recipient_role)
    from public.patient_message_conversations c where c.id = p_conversation_id));
$$;
grant execute on function private.in_my_clinic(boolean), private.is_dental_conversation(text, text),
  private.conversation_in_my_clinic(uuid) to authenticated;

-- 3. Appointments ------------------------------------------------------------
-- The dental appointments booked through the patient portal were test data. Dental
-- appointments now come only from a dentist's consultation log.
delete from public.appointments where department = 'Dental Clinic';

create policy clinic_department_separation on public.appointments as restrictive for all to authenticated
  using ((select public.current_app_role()) = 'patient' or private.in_my_clinic(department = 'Dental Clinic'))
  with check ((select public.current_app_role()) = 'patient' or private.in_my_clinic(department = 'Dental Clinic'));
-- The first dental visit is onsite, so patients never book one.
create policy dental_appointments_by_dentist on public.appointments as restrictive for insert to authenticated
  with check (department <> 'Dental Clinic' or (select public.current_app_role()) = 'dentist');
create policy dentist_appointments on public.appointments for all to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');

-- One scheduled appointment per patient per clinic, not across both clinics.
create or replace function public.check_one_active_appointment_per_student()
returns trigger language plpgsql as $function$
BEGIN
  IF NEW.status = 'Scheduled' THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE patient_id = NEW.patient_id
        AND department = NEW.department
        AND status = 'Scheduled'
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Active appointment already exists for patient % (Status must be Cancelled before booking a new appointment)', NEW.patient_id
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Two dentists work side by side, so a dental slot is taken per dentist.
create or replace function public.check_slot_capacity_per_appointment()
returns trigger language plpgsql as $function$
BEGIN
  IF NEW.status = 'Scheduled' THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE department = NEW.department
        AND appointment_date = NEW.appointment_date
        AND appointment_time = NEW.appointment_time
        AND status = 'Scheduled'
        AND (NEW.department <> 'Dental Clinic' OR lower(clinician_name) = lower(NEW.clinician_name))
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'This time slot is no longer available. Please select another available slot.'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Inventory: one stock list per clinic -------------------------------------
-- The default lets the existing Inventory page insert without knowing its clinic.
alter table public.inventory add column department text not null
  default (case when public.current_app_role() = 'dentist' then 'Dental Clinic' else 'Medical Clinic' end)
  check (department in ('Medical Clinic','Dental Clinic'));
alter table public.inventory_transactions add column department text not null
  default (case when public.current_app_role() = 'dentist' then 'Dental Clinic' else 'Medical Clinic' end)
  check (department in ('Medical Clinic','Dental Clinic'));
alter table public.inventory drop constraint inventory_item_name_key;
alter table public.inventory add constraint inventory_department_item_name_key unique (department, item_name);

create policy clinic_department_separation on public.inventory as restrictive for all to authenticated
  using (private.in_my_clinic(department = 'Dental Clinic')) with check (private.in_my_clinic(department = 'Dental Clinic'));
create policy clinic_department_separation on public.inventory_transactions as restrictive for all to authenticated
  using (private.in_my_clinic(department = 'Dental Clinic')) with check (private.in_my_clinic(department = 'Dental Clinic'));
create policy dentist_inventory on public.inventory for all to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');
create policy dentist_inventory_transactions on public.inventory_transactions for all to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');

-- shortcut: placeholder dental stock until the clinic sends its inventory list; delete these rows then.
insert into public.inventory(item_name, category, stock_quantity, unit, reorder_level, department) values
  ('Lidocaine 2% with Epinephrine', 'Anesthetic', 40, 'cartridges', 15, 'Dental Clinic'),
  ('Dental Needle 27G Short', 'Anesthetic', 60, 'pcs', 20, 'Dental Clinic'),
  ('Composite Resin A2', 'Restorative', 8, 'syringes', 3, 'Dental Clinic'),
  ('Glass Ionomer Cement', 'Restorative', 5, 'kits', 2, 'Dental Clinic'),
  ('Prophylaxis Paste', 'Preventive', 12, 'jars', 4, 'Dental Clinic'),
  ('Fluoride Varnish', 'Preventive', 30, 'unit doses', 10, 'Dental Clinic'),
  ('Cotton Rolls', 'Consumable', 500, 'pcs', 100, 'Dental Clinic'),
  ('Patient Bibs', 'Consumable', 150, 'pcs', 50, 'Dental Clinic'),
  ('Examination Gloves (Medium)', 'Protective', 4, 'boxes', 5, 'Dental Clinic'),
  ('Mefenamic Acid 500mg', 'Medicine', 100, 'capsules', 30, 'Dental Clinic')
on conflict (department, item_name) do nothing;

-- 5. Patient messages: dental inquiries go to the dental clinic -----------------
create policy clinic_department_separation on public.patient_message_conversations as restrictive for all to authenticated
  using ((select public.current_app_role()) = 'patient' or private.in_my_clinic(private.is_dental_conversation(concern_type, recipient_role)))
  with check ((select public.current_app_role()) = 'patient' or private.in_my_clinic(private.is_dental_conversation(concern_type, recipient_role)));
create policy clinic_department_separation on public.patient_messages as restrictive for all to authenticated
  using ((select public.current_app_role()) = 'patient' or private.conversation_in_my_clinic(conversation_id))
  with check ((select public.current_app_role()) = 'patient' or private.conversation_in_my_clinic(conversation_id));
create policy dentist_conversations on public.patient_message_conversations for select to authenticated
  using ((select public.current_app_role()) = 'dentist');
create policy dentist_conversations_update on public.patient_message_conversations for update to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');
create policy dentist_messages on public.patient_messages for select to authenticated
  using ((select public.current_app_role()) = 'dentist');
create policy dentist_messages_update on public.patient_messages for update to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');

-- 6. What a dentist reads and writes outside the dental tables -----------------
create policy dentist_students_insert on public.students for insert to authenticated
  with check ((select public.current_app_role()) = 'dentist');
create policy dentist_students_update on public.students for update to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');
create policy dentist_patient_profiles on public.patient_profiles for select to authenticated
  using ((select public.current_app_role()) = 'dentist');
create policy dentist_users on public.users for select to authenticated
  using ((select public.current_app_role()) = 'dentist');
create policy dentist_colleagues on public.admins for select to authenticated
  using ((select public.current_app_role()) = 'dentist' and role = 'dentist');
create policy dentist_audit_insert on public.audit_logs for insert to authenticated
  with check ((select public.current_app_role()) = 'dentist');

-- 7. The pink form (F-DTL-8.1d-TDC) --------------------------------------------
-- Page 1: the patient's details and tooth chart, one row per patient.
create table public.dental_records (
  patient_id text primary key references public.students(id) on update cascade on delete restrict,
  surname text not null check (length(trim(surname)) between 1 and 80),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  middle_name text check (length(middle_name) <= 80),
  college_course_unit text check (length(college_course_unit) <= 160),
  classification text not null default 'Student' check (classification in ('Student','Faculty','Admin','Other')),
  address text check (length(address) <= 300),
  date_of_birth date,
  sex text check (sex in ('F','M')),
  place_of_birth text check (length(place_of_birth) <= 160),
  emergency_name text check (length(emergency_name) <= 160),
  emergency_address text check (length(emergency_address) <= 300),
  emergency_contact text check (length(emergency_contact) <= 40),
  emergency_relationship text check (length(emergency_relationship) <= 60),
  -- {"16": "caries", ...}: FDI tooth number to its condition.
  tooth_chart jsonb not null default '{}'::jsonb check (jsonb_typeof(tooth_chart) = 'object'),
  remarks text check (length(remarks) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- Page 2: one row per visit (date, service rendered, medicine, anesthesia, signature).
create table public.dental_services (
  id uuid primary key default gen_random_uuid(),
  -- Through the record, so every page-2 row has its page 1.
  patient_id text not null references public.dental_records(patient_id) on update cascade on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  service_date date not null default (now() at time zone 'Asia/Manila')::date,
  service_rendered text not null check (length(trim(service_rendered)) between 1 and 500),
  medicine text check (length(medicine) <= 300),
  anesthesia text check (length(anesthesia) <= 300),
  teeth text[] not null default '{}',
  dentist_name text not null,
  dentist_auth_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index dental_services_patient_idx on public.dental_services(patient_id, service_date desc);
create index dental_services_date_idx on public.dental_services(service_date desc);

alter table public.dental_records enable row level security;
alter table public.dental_services enable row level security;
create policy dentist_dental_records on public.dental_records for all to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');
create policy dentist_dental_services on public.dental_services for all to authenticated
  using ((select public.current_app_role()) = 'dentist') with check ((select public.current_app_role()) = 'dentist');
grant select, insert, update, delete on public.dental_records, public.dental_services to authenticated;
create trigger dental_records_account_access before insert or update or delete on public.dental_records
  for each row execute function private.guard_account_access();
create trigger dental_services_account_access before insert or update or delete on public.dental_services
  for each row execute function private.guard_account_access();
create trigger dental_records_set_updated_at before update on public.dental_records
  for each row execute function public.set_updated_at();

-- One visit, saved together: the pink form, the service row, closing the
-- appointment it came from, and the next appointment. Runs as the dentist, so RLS
-- and the appointment triggers still apply.
create or replace function public.save_dental_visit(
  p_patient_id text, p_record jsonb, p_service jsonb,
  p_appointment_id uuid default null, p_next jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_dentist text;
  v_service_id uuid;
  v_next_id uuid;
begin
  if public.current_app_role() is distinct from 'dentist' then
    raise exception 'Only dentists can record dental visits.' using errcode = '42501';
  end if;
  select name into v_dentist from public.admins where auth_user_id = auth.uid();

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
$$;
revoke all on function public.save_dental_visit(text, jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.save_dental_visit(text, jsonb, jsonb, uuid, jsonb) to authenticated;

-- 8. Existing functions that name the clinical roles (generated below from their
-- live definitions with only the role lists changed) -------------------------

CREATE OR REPLACE FUNCTION public.system_admin_action(p_actor uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_row private.staff_invitations; v_target uuid; v_email text; v_role text;
  v_name text; v_result jsonb:='{}'; v_settings jsonb; v_actor_name text;
  v_key text; v_limit private.admin_login_limits; v_until timestamptz;
begin
  if p_action in ('login_target','login_failed','login_succeeded') then
    v_key:=left(coalesce(p_payload->>'rate_key',''),160);
    if v_key='' then raise exception 'Missing login identifier.'; end if;
    if p_action='login_target' then
      insert into private.admin_login_limits(identifier) values(v_key) on conflict do nothing;
      select * into v_limit from private.admin_login_limits where identifier=v_key for update;
      if v_limit.blocked_until>now() then return jsonb_build_object('blocked',true); end if;
      select a.auth_user_id,a.email into v_id,v_email from public.admins a
        join private.account_controls c on c.user_id=a.auth_user_id
        where lower(c.login_username)=lower(trim(p_payload->>'username')) and a.role='admin' and a.active
        and not private.account_is_suspended(a.auth_user_id);
      return jsonb_build_object('id',v_id,'email',v_email,'blocked',false);
    elsif p_action='login_failed' then
      update private.admin_login_limits set
        attempts=case when window_start<now()-interval '15 minutes' then 1 else attempts+1 end,
        window_start=case when window_start<now()-interval '15 minutes' then now() else window_start end,
        blocked_until=case when attempts>=4 and window_start>=now()-interval '15 minutes' then now()+interval '15 minutes' else null end
        where identifier=v_key;
      insert into public.audit_logs(user_name,action,description) values('System admin sign-in','ADMIN_LOGIN_FAILED','An administrator sign-in attempt failed.');
    else
      delete from private.admin_login_limits where identifier=v_key;
      insert into public.audit_logs(user_name,action,description,meta) select name,'ADMIN_LOGIN_SUCCEEDED','Administrator signed in.',jsonb_build_object('actor_user_id',p_actor) from public.admins where auth_user_id=p_actor and role='admin';
    end if;
    return '{}';
  end if;
  if p_action='complete_invitation' then
    v_target:=p_actor;
    select * into v_row from private.staff_invitations where auth_user_id=v_target and status='pending'
      order by created_at desc limit 1 for update;
    if v_row.id is null or v_row.expires_at<=now() or private.account_is_suspended(v_target) then
      raise exception 'This invitation is no longer available. Ask the administrator to resend it.';
    end if;
    if not exists(select 1 from auth.users where id=v_target and email_confirmed_at is not null) then raise exception 'Verify your invitation email first.'; end if;
    update private.staff_invitations set status='accepted',accepted_at=now(),last_error=null where id=v_row.id;
    update public.admins set active=true,name=v_row.name,role=v_row.role,department=v_row.department,updated_at=now() where auth_user_id=v_target;
    insert into public.audit_logs(user_name,action,description,meta) values(v_row.name,'STAFF_INVITATION_ACCEPTED','Staff member set their password and accepted the invitation.',jsonb_build_object('actor_user_id',p_actor,'target_user_id',v_target,'invitation_id',v_row.id,'role',v_row.role));
    return jsonb_build_object('accepted',true);
  end if;
  if not private.is_system_admin(p_actor) then raise exception 'System administrator access required.' using errcode='42501'; end if;
  select name into v_actor_name from public.admins where auth_user_id=p_actor;
  select value into v_settings from private.system_admin_settings where singleton;
  if p_action='invite_reserve' then
    v_email:=lower(trim(p_payload->>'email')); v_name:=trim(p_payload->>'name'); v_role:=p_payload->>'role';
    perform pg_advisory_xact_lock(hashtextextended(v_email,0));
    if v_email is null or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid staff email address.'; end if;
    if exists(select 1 from auth.users where lower(email)=v_email) then raise exception 'An account already uses this email. Manage its existing invitation or use another email.'; end if;
    insert into private.staff_invitations(name,email,role,department,created_by,expires_at)
      values(v_name,v_email,v_role,left(coalesce(nullif(trim(p_payload->>'department'),''),'University Clinic'),120),p_actor,
        now()+make_interval(mins=>least(60,greatest(5,(v_settings->>'invitation_expiry_minutes')::integer)))) returning * into v_row;
    v_result:=to_jsonb(v_row);
  elsif p_action in ('invite_get','invite_resend','invite_sent','invite_failed','invite_revoke') then
    select * into v_row from private.staff_invitations where id=(p_payload->>'id')::uuid for update;
    if v_row.id is null then raise exception 'Invitation not found.'; end if;
    if p_action='invite_get' then return to_jsonb(v_row); end if;
    if p_action='invite_resend' then
      if v_row.status='accepted' then raise exception 'This invitation has already been accepted.'; end if;
      if v_row.last_sent_at>now()-interval '60 seconds' and v_row.status<>'failed' then raise exception 'Wait one minute before resending this invitation.'; end if;
      update private.staff_invitations set status='sending',last_sent_at=now(),last_error=null,
        expires_at=now()+make_interval(mins=>least(60,greatest(5,(v_settings->>'invitation_expiry_minutes')::integer))) where id=v_row.id returning * into v_row;
      delete from auth.sessions where user_id=v_row.auth_user_id;
    elsif p_action='invite_sent' then
      if v_row.status<>'sending' then raise exception 'Invitation state changed. Refresh the list.'; end if;
      update private.staff_invitations set auth_user_id=(p_payload->>'auth_user_id')::uuid,status='pending',send_count=send_count+1,last_error=null where id=v_row.id returning * into v_row;
      insert into public.admins(auth_user_id,name,email,role,department,active)
        values(v_row.auth_user_id,v_row.name,v_row.email,v_row.role,v_row.department,false)
        on conflict(email) do update set auth_user_id=excluded.auth_user_id,name=excluded.name,role=excluded.role,department=excluded.department,active=false;
    elsif p_action='invite_failed' then
      update private.staff_invitations set status='failed',last_error=left(p_payload->>'message',300) where id=v_row.id returning * into v_row;
    else
      if v_row.status='accepted' then raise exception 'An accepted invitation cannot be revoked. Suspend the staff account instead.'; end if;
      update private.staff_invitations set status='revoked' where id=v_row.id returning * into v_row;
      delete from auth.sessions where user_id=v_row.auth_user_id;
    end if;
    v_result:=to_jsonb(v_row);
  elsif p_action='settings' then
    v_result:=v_settings || (p_payload - 'id');
    if (v_result->>'invitation_expiry_minutes')::integer not between 5 and 60 then raise exception 'Invitation expiry must be between 5 and 60 minutes.'; end if;
    update private.system_admin_settings set value=v_result,updated_at=now() where singleton;
  elsif p_action='save_profile' then
    if length(trim(p_payload->>'name')) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
    update public.admins set name=trim(p_payload->>'name'),updated_at=now() where auth_user_id=p_actor;
    v_result:=jsonb_build_object('saved',true);
  elsif p_action='password_changed' then
    update private.account_controls set must_change_password=false,updated_at=now() where user_id=p_actor;
  elsif p_action in ('suspend','reactivate','unlock','change_role','password_reset') then
    v_target:=(p_payload->>'id')::uuid;
    if v_target=p_actor then raise exception 'You cannot change your own access here. Use My Account.'; end if;
    if not exists(select 1 from auth.users where id=v_target) then raise exception 'Account not found.'; end if;
    if exists(select 1 from private.admin_account_deletions where auth_user_id=v_target and completed_at is null) then
      raise exception 'Account deletion is incomplete. Retry delete to finish cleanup.';
    end if;
    if exists(select 1 from public.admins where auth_user_id=v_target and role='admin') then raise exception 'System administrator accounts are protected.'; end if;
    if p_action='password_reset' and not exists(select 1 from public.admins where auth_user_id=v_target and role in ('physician','nurse','dentist')) then
      raise exception 'User accounts reset their password through Forgot password on the patient portal.';
    end if;
    if p_action in ('suspend','reactivate') then
      if length(trim(coalesce(p_payload->>'reason','')))<5 then raise exception 'Provide an account access reason of at least 5 characters.'; end if;
      if p_action='suspend' then
        v_until:=nullif(p_payload->>'until','')::timestamptz;
        if v_until is not null and v_until<=now() then raise exception 'Choose a suspension end time in the future.'; end if;
        insert into private.account_controls(user_id,suspended,suspension_reason,suspended_at,suspended_by,suspended_until)
          values(v_target,true,trim(p_payload->>'reason'),now(),p_actor,v_until)
          on conflict(user_id) do update set suspended=true,suspension_reason=excluded.suspension_reason,suspended_at=now(),suspended_by=p_actor,suspended_until=excluded.suspended_until,updated_at=now();
      else
        update private.account_controls set suspended=false,updated_at=now() where user_id=v_target;
        update public.users set active=true,updated_at=now() where auth_user_id=v_target;
        update public.admins set active=true,updated_at=now() where auth_user_id=v_target and not exists(select 1 from private.staff_invitations where auth_user_id=v_target and status<>'accepted');
      end if;
      delete from auth.sessions where user_id=v_target;
    elsif p_action='unlock' then
      update public.admins set failed_login_attempts=0,locked_until=null,lockout_reason=null where auth_user_id=v_target;
      update public.users set failed_login_attempts=0,locked_until=null,lockout_reason=null where auth_user_id=v_target;
    elsif p_action='change_role' then
      v_role:=p_payload->>'role';
      if v_role not in ('physician','nurse','dentist') then raise exception 'Choose a clinical staff role.'; end if;
      if not exists(select 1 from public.admins where auth_user_id=v_target and role in ('physician','nurse','dentist')) then raise exception 'Only existing staff accounts can change clinical role.'; end if;
      update public.admins set role=v_role,updated_at=now() where auth_user_id=v_target;
      update private.staff_invitations set role=v_role where auth_user_id=v_target;
      delete from auth.sessions where user_id=v_target;
    end if;
    select email into v_email from auth.users where id=v_target;
    v_result:=jsonb_build_object('id',v_target,'email',v_email);
  else raise exception 'Unknown administration action.'; end if;
  insert into public.audit_logs(user_name,action,description,meta)
    values(v_actor_name,case when p_action like 'invite_%' then 'STAFF_INVITATION_'||upper(substr(p_action,8)) else 'ADMIN_'||upper(p_action) end,
      case p_action when 'suspend' then 'Account suspended: '||trim(p_payload->>'reason')
        when 'reactivate' then 'Account reactivated: '||trim(p_payload->>'reason')
        when 'settings' then 'System settings updated.' when 'save_profile' then 'Administrator profile updated.'
        when 'password_changed' then 'Administrator password changed.'
        else replace(initcap(replace(p_action,'_',' ')),'Invite ','Invitation ')||'.' end,
      jsonb_build_object('actor_user_id',p_actor,'target_user_id',v_target,'invitation_id',v_row.id,'role',v_role));
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_portal_data(p_section text, p_search text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_offset integer:=greatest(0,least(p_page,100000)-1)*20;
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if p_section='settings' then
    return (select value from private.system_admin_settings where singleton);
  elsif p_section='overview' then
    return jsonb_build_object(
      'active_staff',(select count(*) from public.admins where role in ('physician','nurse','dentist') and active and not private.account_is_suspended(auth_user_id)),
      'pending_invitations',(select count(*) from private.staff_invitations where role in ('physician','nurse','dentist') and status='pending' and expires_at>now()),
      'suspended_accounts',(select count(*) from private.account_controls where suspended and (suspended_until is null or suspended_until>now())),
      'user_accounts',(select count(*) from auth.users u where u.deleted_at is null
        and not exists(select 1 from public.admins a where a.auth_user_id=u.id)
        and (exists(select 1 from public.users p where p.auth_user_id=u.id) or exists(select 1 from public.enrollees e where e.auth_user_id=u.id)
          or u.raw_user_meta_data->>'role' in ('patient','enrollee')))
        +(select count(*) from private.admin_account_deletions d where d.target_kind='user' and d.completed_at is null
          and not exists(select 1 from auth.users au where au.id=d.auth_user_id and au.deleted_at is null)),
      'failed_logins_today',(select count(*) from public.audit_logs where action='ADMIN_LOGIN_FAILED' and created_at>=date_trunc('day',now())),
      'recent_activity',(select coalesce(jsonb_agg(r),'[]'::jsonb) from (select id,user_name,action,description,created_at from public.audit_logs where action like 'ADMIN_%' or action like 'STAFF_INVITATION_%' order by created_at desc limit 8) r),
      'last_backup',(select value from public.settings where key='last_backup' limit 1));
  elsif p_section in ('invitations','administrator_invitations') then
    with rows as (select i.*,exists(select 1 from private.admin_account_deletions d where d.completed_at is null
        and ((d.target_kind='invitation' and d.target_id=i.id) or d.auth_user_id=i.auth_user_id)) as deletion_pending,
      case when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
        and ((d.target_kind='invitation' and d.target_id=i.id) or d.auth_user_id=i.auth_user_id)) then 'deletion_pending'
        when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end as display_status
      from private.staff_invitations i
      where ((p_section='invitations' and i.role in ('physician','nurse','dentist')) or (p_section='administrator_invitations' and i.role='admin'))
        and (p_search='' or i.name ilike '%'||left(p_search,120)||'%' or i.email ilike '%'||left(p_search,120)||'%')),
    filtered as (select * from rows where p_status='all' or display_status=p_status),
    page as (select * from filtered order by created_at desc,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  elsif p_section in ('staff','administrators','users') then
    with accounts as (
      select a.auth_user_id as id,a.id as profile_id,a.name,a.email,a.role,a.department,
        a.created_at,a.active,a.locked_until,false as incomplete,
        case when a.role='admin' then (select c.login_username from private.account_controls c where c.user_id=a.auth_user_id) end as identifier,
        false as retired
      from public.admins a where (p_section='staff' and a.role in ('physician','nurse','dentist')) or (p_section='administrators' and a.role='admin')
      union all
      select u.auth_user_id,u.id,u.name,au.email,'patient',null,u.created_at,u.active,u.locked_until,false,u.patient_id,false
      from public.users u join auth.users au on au.id=u.auth_user_id and au.deleted_at is null where p_section='users'
        and not exists(select 1 from public.admins a where a.auth_user_id=u.auth_user_id)
      union all
      select e.auth_user_id,e.id,concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        au.email,'enrollee',null,e.created_at,e.status<>'elevated',null,false,e.applicant_id,e.status='elevated'
      from public.enrollees e join auth.users au on au.id=e.auth_user_id and au.deleted_at is null where p_section='users'
        and not exists(select 1 from public.admins a where a.auth_user_id=e.auth_user_id)
        and not exists(select 1 from public.users u where u.auth_user_id=e.auth_user_id)
      union all
      select au.id,au.id,coalesce(nullif(au.raw_user_meta_data->>'name',''),au.email),au.email,
        au.raw_user_meta_data->>'role',null,au.created_at,true,null,true,null,false
      from auth.users au where p_section='users' and au.deleted_at is null and au.raw_user_meta_data->>'role' in ('patient','enrollee')
        and not exists(select 1 from public.admins a where a.auth_user_id=au.id)
        and not exists(select 1 from public.users u where u.auth_user_id=au.id)
        and not exists(select 1 from public.enrollees e where e.auth_user_id=au.id)
      union all
      select d.auth_user_id,d.profile_id,d.name,d.email,d.role,null,d.requested_at,false,null,false,null,false
      from private.admin_account_deletions d where p_section='users' and d.target_kind='user' and d.completed_at is null
        and not exists(select 1 from auth.users au where au.id=d.auth_user_id and au.deleted_at is null)
    ), rows as (select a.*,au.last_sign_in_at,c.suspension_reason,c.suspended_at,c.suspended_until,
        i.id as invitation_id,i.status as invitation_status,
        exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) as deletion_pending,
        case when exists(select 1 from private.admin_account_deletions d where d.completed_at is null
          and (d.auth_user_id=a.id or d.profile_id=a.profile_id)) then 'deletion_pending'
          when a.retired then 'retired'
          when private.account_is_suspended(a.id) then 'suspended'
          when a.incomplete then 'incomplete'
          when not a.active and i.status='pending' and i.expires_at<=now() then 'expired'
          when not a.active and i.status='pending' then 'invited'
          when not a.active and i.status in ('revoked','failed','sending') then i.status
          when not a.active then 'inactive' when a.locked_until>now() then 'locked' else 'active' end as status
        from accounts a left join auth.users au on au.id=a.id left join private.account_controls c on c.user_id=a.id
        left join lateral (select inv.id,inv.status,inv.expires_at from private.staff_invitations inv
          where inv.auth_user_id=a.id and a.role in ('admin','physician','nurse','dentist')
          order by inv.created_at desc,inv.id desc limit 1) i on true
        where p_search='' or a.name ilike '%'||left(p_search,120)||'%' or a.email ilike '%'||left(p_search,120)||'%' or a.identifier ilike '%'||left(p_search,120)||'%'),
      filtered as (select * from rows where p_status='all' or status=p_status),
      page as (select * from filtered order by name,id limit 20 offset v_offset)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(page) from page),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  raise exception 'Unknown administration section.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_name text; v_email text; v_patient_id text;
begin
  if new.deleted_at is not null then return new; end if;
  v_email:=lower(coalesce(new.email,''));
  v_name:=coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'full_name','');
  if exists(select 1 from public.admins where auth_user_id=new.id) then return new; end if;
  v_role:=lower(coalesce(new.raw_app_meta_data->>'staff_role',''));
  if v_role in ('admin','physician','nurse','dentist') then
    insert into public.admins(auth_user_id,name,email,role,active)
      values(new.id,coalesce(nullif(v_name,''),'Clinic staff'),v_email,v_role,v_role='admin')
      on conflict(email) do nothing;
    return new;
  end if;
  if new.raw_user_meta_data->>'role' in ('admin','physician','nurse','dentist','staff_invited') then return new; end if;
  if exists(select 1 from public.users where auth_user_id=new.id) then return new; end if;
  if new.raw_user_meta_data->>'role'='patient' or v_email like '%@tup.edu.ph' then
    v_name:=coalesce(nullif(v_name,''),split_part(v_email,'@',1));
    v_patient_id:=upper(trim(coalesce(new.raw_user_meta_data->>'patient_id',new.raw_user_meta_data->>'student_id','')));
    if v_patient_id ~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
      insert into public.students(id,name,year,updated_at) values(v_patient_id,v_name,1,now()) on conflict(id) do nothing;
      insert into public.patients(id,name,year,sensitivity_level,updated_at) values(v_patient_id,v_name,1,'normal',now()) on conflict(id) do nothing;
    else v_patient_id:=null; end if;
    insert into public.users(auth_user_id,name,email,role,patient_id,student_id,active)
      values(new.id,v_name,v_email,'patient',v_patient_id,v_patient_id,true) on conflict(email) do nothing;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_role_page_access(p_role text, p_pages text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin text; v_pages text[];
begin
  if not private.session_is_live() or not private.is_system_admin(auth.uid()) then
    raise exception 'System administrator access required.' using errcode='42501';
  end if;
  if p_role not in ('physician','nurse','dentist') then
    raise exception 'Page access can only be set for physicians, nurses and dentists.' using errcode='22023';
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
      'Updated the portal pages available to the '||p_role||' role ('||cardinality(v_pages)||' pages).',
      jsonb_build_object('role',p_role,'pages',to_jsonb(v_pages)));
  return jsonb_build_object('role',p_role,'pages',to_jsonb(v_pages));
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_patient_message(p_conversation_id uuid, p_message_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_auth_id uuid;
  v_caller_role text;
  v_conv RECORD;
  v_sender_name text;
  v_msg_id uuid;
BEGIN
  v_caller_auth_id := auth.uid();
  IF v_caller_auth_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  IF trim(p_message_text) = '' THEN
    RAISE EXCEPTION 'Message text cannot be empty' USING ERRCODE = '22000';
  END IF;

  SELECT *
  INTO v_conv
  FROM public.patient_message_conversations
  WHERE id = p_conversation_id;

  IF v_conv.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '22000';
  END IF;

  v_caller_role := public.current_app_role();

  IF v_caller_role = 'patient' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = v_caller_auth_id
        AND u.patient_id = v_conv.patient_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized conversation access' USING ERRCODE = '42501';
    END IF;

    SELECT u.name INTO v_sender_name FROM public.users u WHERE u.auth_user_id = v_caller_auth_id LIMIT 1;

    INSERT INTO public.patient_messages (
      conversation_id,
      patient_id,
      auth_user_id,
      patient_name,
      sender_role,
      sender_name,
      recipient_name,
      concern_type,
      message_text,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_conv.id,
      v_conv.patient_id,
      v_caller_auth_id,
      v_conv.patient_name,
      'patient',
      coalesce(v_sender_name, 'Student'),
      v_conv.recipient_name,
      v_conv.concern_type,
      trim(p_message_text),
      'sent',
      now(),
      now()
    ) RETURNING id INTO v_msg_id;

  ELSIF v_caller_role IN ('physician', 'nurse', 'admin', 'dentist') THEN
    IF NOT private.conversation_in_my_clinic(v_conv.id) THEN
      RAISE EXCEPTION 'This conversation belongs to the other clinic.' USING ERRCODE = '42501';
    END IF;
    -- Dental inquiries are answered by any dentist.
    IF v_caller_role <> 'dentist' AND
 v_caller_role <> 'admin' AND v_conv.recipient_staff_id IS NOT NULL THEN
      IF v_conv.recipient_auth_user_id <> v_caller_auth_id
         AND v_conv.recipient_staff_id <> public.current_staff_admin_id() THEN
        RAISE EXCEPTION 'Unauthorized to reply in another clinician direct conversation' USING ERRCODE = '42501';
      END IF;
    END IF;

    SELECT a.name INTO v_sender_name FROM public.admins a WHERE a.auth_user_id = v_caller_auth_id LIMIT 1;

    INSERT INTO public.patient_messages (
      conversation_id,
      patient_id,
      auth_user_id,
      patient_name,
      sender_role,
      sender_name,
      recipient_name,
      concern_type,
      message_text,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_conv.id,
      v_conv.patient_id,
      v_caller_auth_id,
      v_conv.patient_name,
      v_caller_role,
      coalesce(v_sender_name, 'Clinic Staff'),
      v_conv.patient_name,
      v_conv.concern_type,
      trim(p_message_text),
      'sent',
      now(),
      now()
    ) RETURNING id INTO v_msg_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized role' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_message_conversations
  SET updated_at = now()
  WHERE id = v_conv.id;

  RETURN jsonb_build_object(
    'status', 'success',
    'message_id', v_msg_id,
    'conversation_id', v_conv.id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_message_attachment(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_rows integer;
BEGIN
  v_role := current_app_role();

  -- Only clinic staff resolve conversations, so only they clear attachments.
  IF v_role IS NULL OR v_role NOT IN ('admin', 'physician', 'nurse', 'dentist') THEN
    RETURN false;
  END IF;

  UPDATE public.patient_messages
     SET attachment_path = NULL,
         attachment_removed_at = now(),
         updated_at = now()
   WHERE id = p_message_id
     AND attachment_path IS NOT NULL
     AND private.conversation_in_my_clinic(conversation_id);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_resolved_conversation(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role   text;
  v_status text;
BEGIN
  v_role := current_app_role();

  -- Only clinic staff curate the history.
  IF v_role IS NULL OR v_role NOT IN ('admin', 'physician', 'nurse', 'dentist') THEN
    RETURN false;
  END IF;

  SELECT status
    INTO v_status
    FROM public.patient_message_conversations
   WHERE id = p_conversation_id;

  IF v_status IS NULL OR NOT private.conversation_in_my_clinic(p_conversation_id) THEN
    RETURN false;
  END IF;

  -- A live consultation must be closed before it can be removed.
  IF lower(v_status) = 'open' THEN
    RAISE EXCEPTION 'An open inquiry must be resolved before it can be deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.patient_message_conversations WHERE id = p_conversation_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_patient_inquiry(p_recipient_staff_id uuid DEFAULT NULL::uuid, p_concern_type text DEFAULT 'General clinic inquiry'::text, p_message_text text DEFAULT ''::text, p_recipient_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_auth_id uuid;
  v_patient_id text;
  v_patient_name text;
  v_staff_id uuid := NULL;
  v_staff_auth_id uuid := NULL;
  v_staff_name text := 'Clinic Personnel (General)';
  v_staff_role text := 'clinic';
  v_conv_id uuid;
  v_msg_id uuid;
BEGIN
  v_caller_auth_id := auth.uid();
  IF v_caller_auth_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller's registered patient identity
  SELECT u.patient_id, u.name
  INTO v_patient_id, v_patient_name
  FROM public.users u
  WHERE u.auth_user_id = v_caller_auth_id
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Only registered patients can initiate clinic inquiries' USING ERRCODE = '42501';
  END IF;

  IF trim(p_message_text) = '' THEN
    RAISE EXCEPTION 'Message content cannot be empty' USING ERRCODE = '22000';
  END IF;

  IF p_concern_type NOT IN ('General clinic inquiry', 'Appointment concern', 'Follow-up question', 'Medical inquiry', 'Dental inquiry') THEN
    RAISE EXCEPTION 'Invalid concern category' USING ERRCODE = '22000';
  END IF;

  -- Resolve recipient staff member
  IF p_recipient_staff_id IS NOT NULL THEN
    SELECT a.id, a.auth_user_id, a.name, a.role
    INTO v_staff_id, v_staff_auth_id, v_staff_name, v_staff_role
    FROM public.admins a
    WHERE a.id = p_recipient_staff_id AND a.active = true
    LIMIT 1;

    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'Selected clinic recipient was not found or is inactive' USING ERRCODE = '22000';
    END IF;
  ELSIF p_recipient_name IS NOT NULL AND p_recipient_name <> '' AND p_recipient_name <> 'Clinic Personnel (General)' THEN
    SELECT a.id, a.auth_user_id, a.name, a.role
    INTO v_staff_id, v_staff_auth_id, v_staff_name, v_staff_role
    FROM public.admins a
    WHERE lower(trim(a.name)) = lower(trim(p_recipient_name)) AND a.active = true
    LIMIT 1;
  END IF;

  -- A dental inquiry goes to the Dental Clinic, whichever medical staff was picked.
  IF p_concern_type = 'Dental inquiry' THEN
    v_staff_id := NULL; v_staff_auth_id := NULL;
    v_staff_name := 'Dental Clinic'; v_staff_role := 'dentist';
  END IF;

  -- 1. Create Conversation
  INSERT INTO public.patient_message_conversations (
    patient_id,
    patient_name,
    recipient_staff_id,
    recipient_auth_user_id,
    recipient_name,
    recipient_role,
    concern_type,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_patient_id,
    coalesce(v_patient_name, 'Student'),
    v_staff_id,
    v_staff_auth_id,
    v_staff_name,
    v_staff_role,
    p_concern_type,
    'open',
    now(),
    now()
  ) RETURNING id INTO v_conv_id;

  -- 2. Create Initial Message
  INSERT INTO public.patient_messages (
    conversation_id,
    patient_id,
    auth_user_id,
    patient_name,
    sender_role,
    sender_name,
    recipient_name,
    concern_type,
    message_text,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_conv_id,
    v_patient_id,
    v_caller_auth_id,
    coalesce(v_patient_name, 'Student'),
    'patient',
    coalesce(v_patient_name, 'Student'),
    v_staff_name,
    p_concern_type,
    trim(p_message_text),
    'sent',
    now(),
    now()
  ) RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'conversation_id', v_conv_id,
    'message_id', v_msg_id,
    'recipient_name', v_staff_name,
    'concern_type', p_concern_type
  );
END;
$function$;

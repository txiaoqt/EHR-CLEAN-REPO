-- =============================================================================
-- Faculty members as patients
-- =============================================================================
-- Faculty share the student tables; the ID format tells them apart:
--   student  TUPM-YY-XXXX
--   faculty  TUPM + MMDDYY date of birth + '-' + 3-digit employee number
--            (e.g. TUPM120172-001)
-- patients.patient_type is derived from the ID, so every existing query,
-- policy and RPC keeps working and only the pages need to filter on it.
-- Faculty have no year level, so year becomes nullable.

alter table public.students drop constraint if exists chk_students_id_format;
alter table public.students add constraint chk_students_id_format
  check (id ~ '^TUPM-[0-9]{2}-[0-9]{4}$' or id ~ '^TUPM[0-9]{6}-[0-9]{3}$');

alter table public.students alter column year drop not null;
alter table public.patients alter column year drop not null;

alter table public.patients add column if not exists patient_type text
  generated always as (case when id like 'TUPM-%' then 'student' else 'faculty' end) stored;
create index if not exists idx_patients_patient_type on public.patients(patient_type);

-- Same function as 20261031170000, accepting both ID formats.
CREATE OR REPLACE FUNCTION public.complete_patient_registration(p_student_id text, p_name text, p_year integer, p_contact_number text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_uid uuid;
  v_auth_email text;
  v_normalized_student_id text;
  v_faculty boolean;
  v_clean_name text;
  v_clean_year integer;
  v_user_id uuid;
  v_email_student_id text;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required. Please log in or verify OTP.');
  end if;

  select lower(email) into v_auth_email from auth.users where id = v_auth_uid;
  if v_auth_email is null or not v_auth_email like '%@tup.edu.ph' then
    return jsonb_build_object('success', false, 'error', 'Only official @tup.edu.ph email addresses are authorized.');
  end if;

  v_normalized_student_id := upper(trim(p_student_id));
  v_faculty := v_normalized_student_id ~ '^TUPM[0-9]{6}-[0-9]{3}$';
  if not v_faculty and v_normalized_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid ID format. Students use TUPM-YY-XXXX (e.g. TUPM-23-5030); faculty use TUPM + birthdate + employee number (e.g. TUPM120172-001).');
  end if;

  v_clean_name := trim(p_name);
  if v_clean_name is null or length(v_clean_name) < 2 then
    return jsonb_build_object('success', false, 'error', 'Full name is required.');
  end if;

  if p_date_of_birth is not null
     and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    return jsonb_build_object('success', false, 'error', 'Please enter a valid date of birth.');
  end if;

  if v_faculty then
    v_clean_year := null;
    if p_date_of_birth is not null and substr(v_normalized_student_id, 5, 6) <> to_char(p_date_of_birth, 'MMDDYY') then
      return jsonb_build_object('success', false, 'error', 'The Employee ID does not match the date of birth. The six digits after TUPM are your birthdate as MMDDYY.');
    end if;
  else
    v_clean_year := coalesce(p_year, 1);
    if v_clean_year < 1 or v_clean_year > 6 then
      v_clean_year := 1;
    end if;
  end if;

  -- An ID already bound to another sign-in is never reassigned.
  if exists (
    select 1 from public.users
    where (patient_id = v_normalized_student_id or student_id = v_normalized_student_id)
      and auth_user_id is not null and auth_user_id <> v_auth_uid
  ) or exists (
    select 1 from public.patient_profiles
    where (patient_id = v_normalized_student_id or student_id = v_normalized_student_id)
      and user_id is not null and user_id <> v_auth_uid
  ) then
    return jsonb_build_object('success', false,
      'error', 'These details are already associated with an account. Please sign in or use Password Recovery.');
  end if;

  -- One TUP email, one ID. A row for this email under another ID (even one with
  -- no sign-in attached, such as a deleted account's) means this is the same
  -- person with a different ID; creating a second patient would split them.
  -- The caller has proven they own this email, so naming its ID is safe.
  select coalesce(u.patient_id, u.student_id) into v_email_student_id
  from public.users u
  where lower(u.email) = v_auth_email and coalesce(u.patient_id, u.student_id) is not null
    and upper(coalesce(u.patient_id, u.student_id)) <> v_normalized_student_id
  limit 1;
  if v_email_student_id is null then
    select pp.patient_id into v_email_student_id
    from public.patient_profiles pp
    where lower(pp.email) = v_auth_email and upper(pp.patient_id) <> v_normalized_student_id
    limit 1;
  end if;
  if v_email_student_id is not null then
    return jsonb_build_object('success', false,
      'error', 'This email is already registered as ' || v_email_student_id
        || '. Sign in or use Password Recovery. If that ID is wrong, contact the clinic.');
  end if;

  -- Master records are created, never overwritten.
  insert into public.students (id, name, year, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, now())
  on conflict (id) do nothing;

  insert into public.patients (id, name, year, date_of_birth, sensitivity_level, updated_at)
  values (v_normalized_student_id, v_clean_name, v_clean_year, p_date_of_birth, 'normal', now())
  on conflict (id) do update set
    date_of_birth = coalesce(public.patients.date_of_birth, excluded.date_of_birth),
    updated_at = now()
  where public.patients.date_of_birth is null and excluded.date_of_birth is not null;

  insert into public.users (id, auth_user_id, name, email, role, patient_id, student_id, active, created_at, updated_at)
  values (gen_random_uuid(), v_auth_uid, v_clean_name, v_auth_email, 'patient',
          v_normalized_student_id, v_normalized_student_id, true, now(), now())
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    role = 'patient',
    patient_id = excluded.patient_id,
    student_id = excluded.student_id,
    active = true,
    updated_at = now()
  where public.users.auth_user_id = v_auth_uid or public.users.auth_user_id is null
  returning id into v_user_id;

  -- The email row belongs to a different sign-in: reporting success would be false.
  if v_user_id is null then
    return jsonb_build_object('success', false,
      'error', 'These details are already associated with an account. Please sign in or use Password Recovery.');
  end if;

  insert into public.patient_profiles (patient_id, user_id, student_id, full_name, email, year, contact_number, address, updated_at)
  values (v_normalized_student_id, v_auth_uid, v_normalized_student_id, v_clean_name, v_auth_email,
          v_clean_year, p_contact_number, p_address, now())
  on conflict (patient_id) do update set
    user_id = coalesce(public.patient_profiles.user_id, excluded.user_id),
    email = coalesce(public.patient_profiles.email, excluded.email),
    contact_number = coalesce(public.patient_profiles.contact_number, excluded.contact_number),
    address = coalesce(public.patient_profiles.address, excluded.address),
    updated_at = now()
  where public.patient_profiles.user_id is null or public.patient_profiles.user_id = v_auth_uid;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'auth_user_id', v_auth_uid,
    'student_id', v_normalized_student_id,
    'name', v_clean_name,
    'email', v_auth_email,
    'role', 'patient'
  );
end;
$function$;

-- Same trigger as 20261107100000, provisioning faculty IDs too (no year level).
CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_name text; v_email text; v_patient_id text; v_year integer;
begin
  if new.deleted_at is not null then return new; end if;
  v_email:=lower(coalesce(new.email,''));
  v_name:=coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'full_name','');
  if exists(select 1 from public.admins where auth_user_id=new.id) then return new; end if;
  v_role:=lower(coalesce(new.raw_app_meta_data->>'staff_role',''));
  if v_role in ('admin','physician','nurse','dentist','clerk') then
    insert into public.admins(auth_user_id,name,email,role,active)
      values(new.id,coalesce(nullif(v_name,''),'Clinic staff'),v_email,v_role,v_role='admin')
      on conflict(email) do nothing;
    return new;
  end if;
  if new.raw_user_meta_data->>'role' in ('admin','physician','nurse','dentist','clerk','staff_invited') then return new; end if;
  if exists(select 1 from public.users where auth_user_id=new.id) then return new; end if;
  if new.raw_user_meta_data->>'role'='patient' or v_email like '%@tup.edu.ph' then
    v_name:=coalesce(nullif(v_name,''),split_part(v_email,'@',1));
    v_patient_id:=upper(trim(coalesce(new.raw_user_meta_data->>'patient_id',new.raw_user_meta_data->>'student_id','')));
    if v_patient_id ~ '^TUPM-[0-9]{2}-[0-9]{4}$' or v_patient_id ~ '^TUPM[0-9]{6}-[0-9]{3}$' then
      v_year:=case when v_patient_id like 'TUPM-%' then 1 end;
      insert into public.students(id,name,year,updated_at) values(v_patient_id,v_name,v_year,now()) on conflict(id) do nothing;
      insert into public.patients(id,name,year,sensitivity_level,updated_at) values(v_patient_id,v_name,v_year,'normal',now()) on conflict(id) do nothing;
    else v_patient_id:=null; end if;
    insert into public.users(auth_user_id,name,email,role,patient_id,student_id,active)
      values(new.id,v_name,v_email,'patient',v_patient_id,v_patient_id,true) on conflict(email) do nothing;
  end if;
  return new;
end;
$function$;

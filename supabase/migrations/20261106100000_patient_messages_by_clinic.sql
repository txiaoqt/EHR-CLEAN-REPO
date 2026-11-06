-- Patient messaging, split into Medical and Dental.
--  * Patients now see dentists in staff_directory, so an online dentist can be
--    messaged from the Dental tab. Booking still lists medical staff only.
--  * A dental inquiry goes to the dentist the patient chose, and a dentist sees
--    only conversations addressed to them plus the unassigned Dental Clinic queue,
--    the same rule physicians and nurses already follow.
--  * create_patient_inquiry takes the clinic the patient picked.

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
      or (role = 'dentist' and public.current_app_role() in ('dentist', 'patient')));

-- Dentists: own direct conversations and the unassigned dental queue only.
drop policy dentist_conversations on public.patient_message_conversations;
drop policy dentist_conversations_update on public.patient_message_conversations;
drop policy dentist_messages on public.patient_messages;
drop policy dentist_messages_update on public.patient_messages;

create or replace function private.is_my_conversation(p_staff_id uuid, p_auth_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_staff_id is null or p_auth_id = (select auth.uid()) or p_staff_id = public.current_staff_admin_id();
$$;
create or replace function private.is_my_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.is_my_conversation(c.recipient_staff_id, c.recipient_auth_user_id)
    from public.patient_message_conversations c where c.id = p_conversation_id), false);
$$;
grant execute on function private.is_my_conversation(uuid, uuid), private.is_my_conversation(uuid) to authenticated;

create policy dentist_conversations on public.patient_message_conversations for select to authenticated
  using ((select public.current_app_role()) = 'dentist' and private.is_my_conversation(recipient_staff_id, recipient_auth_user_id));
create policy dentist_conversations_update on public.patient_message_conversations for update to authenticated
  using ((select public.current_app_role()) = 'dentist' and private.is_my_conversation(recipient_staff_id, recipient_auth_user_id))
  with check ((select public.current_app_role()) = 'dentist');
create policy dentist_messages on public.patient_messages for select to authenticated
  using ((select public.current_app_role()) = 'dentist' and private.is_my_conversation(conversation_id));
create policy dentist_messages_update on public.patient_messages for update to authenticated
  using ((select public.current_app_role()) = 'dentist' and private.is_my_conversation(conversation_id))
  with check ((select public.current_app_role()) = 'dentist');

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
    -- A direct conversation is answered only by its recipient, dentists included;
    -- an unassigned one (the clinic's general queue) by anyone in that clinic.
    IF v_caller_role <> 'admin' AND v_conv.recipient_staff_id IS NOT NULL THEN
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

drop function public.create_patient_inquiry(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.create_patient_inquiry(p_recipient_staff_id uuid DEFAULT NULL::uuid, p_concern_type text DEFAULT 'General clinic inquiry'::text, p_message_text text DEFAULT ''::text, p_recipient_name text DEFAULT NULL::text, p_clinic text DEFAULT NULL::text)
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
  v_dental boolean;
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

  -- The patient picks a clinic, then someone in it. A dental inquiry stays with
  -- the dentist chosen; without one it goes to the Dental Clinic's general queue.
  v_dental := coalesce(p_clinic = 'dental', p_concern_type = 'Dental inquiry');
  IF p_clinic = 'medical' AND p_concern_type = 'Dental inquiry' THEN
    RAISE EXCEPTION 'Send dental inquiries from the Dental tab' USING ERRCODE = '22000';
  END IF;
  IF v_staff_id IS NOT NULL AND (v_staff_role = 'dentist') IS DISTINCT FROM v_dental THEN
    RAISE EXCEPTION '%', CASE WHEN v_dental THEN 'Choose a dentist for a dental inquiry'
      ELSE 'Choose a physician or nurse for a medical inquiry' END USING ERRCODE = '22000';
  END IF;
  IF v_dental AND v_staff_id IS NULL THEN
    v_staff_auth_id := NULL; v_staff_name := 'Dental Clinic'; v_staff_role := 'dentist';
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

grant execute on function public.create_patient_inquiry(uuid, text, text, text, text) to authenticated;

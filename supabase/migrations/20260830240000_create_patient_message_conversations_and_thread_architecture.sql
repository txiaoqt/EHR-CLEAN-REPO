-- ============================================================================
-- Migration: 20260830240000_create_patient_message_conversations_and_thread_architecture.sql
-- Description:
--   1. Creates public.patient_message_conversations table for true multi-conversation
--      partitioning by conversation_id.
--   2. Modifies public.patient_messages to reference conversation_id.
--   3. Safely migrates existing legacy messages without data loss.
--   4. Updates public.staff_directory to expose auth_user_id for stable recipient mapping.
--   5. Enforces strict RLS on conversations and messages (patient ownership & clinician recipient isolation).
--   6. Provides atomic RPC create_patient_inquiry and send_patient_message functions.
--   7. Configures Supabase Realtime publication with full replica identity.
-- ============================================================================

-- 1. Create Conversations Table
CREATE TABLE IF NOT EXISTS public.patient_message_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE CASCADE,
  patient_name text,
  recipient_staff_id uuid REFERENCES public.admins(id) ON DELETE SET NULL,
  recipient_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_name text NOT NULL DEFAULT 'Clinic Personnel (General)',
  recipient_role text NOT NULL DEFAULT 'clinic',
  concern_type text NOT NULL DEFAULT 'General clinic inquiry' CHECK (concern_type IN ('General clinic inquiry', 'Appointment concern', 'Follow-up question', 'Medical inquiry', 'Dental inquiry')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pmc_patient_id ON public.patient_message_conversations (patient_id);
CREATE INDEX IF NOT EXISTS idx_pmc_recipient_staff_id ON public.patient_message_conversations (recipient_staff_id);
CREATE INDEX IF NOT EXISTS idx_pmc_recipient_auth_user_id ON public.patient_message_conversations (recipient_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_pmc_updated_at ON public.patient_message_conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmc_status ON public.patient_message_conversations (status);

-- 2. Add conversation_id to patient_messages
ALTER TABLE IF EXISTS public.patient_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.patient_message_conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_patient_messages_conversation_id ON public.patient_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_patient_messages_conv_created ON public.patient_messages (conversation_id, created_at ASC);

-- 3. Data Migration for Legacy Messages
DO $$
DECLARE
  rec RECORD;
  v_conv_id uuid;
  v_staff_id uuid;
  v_auth_id uuid;
  v_role text;
BEGIN
  FOR rec IN (
    SELECT DISTINCT
      pm.patient_id,
      coalesce(pm.patient_name, (SELECT u.name FROM public.users u WHERE u.patient_id = pm.patient_id LIMIT 1)) AS p_name,
      coalesce(pm.recipient_name, 'Clinic Personnel (General)') AS r_name,
      pm.concern_type
    FROM public.patient_messages pm
    WHERE pm.conversation_id IS NULL
  ) LOOP
    v_staff_id := NULL;
    v_auth_id := NULL;
    v_role := 'clinic';

    IF rec.r_name <> 'Clinic Personnel (General)' THEN
      SELECT a.id, a.auth_user_id, a.role
      INTO v_staff_id, v_auth_id, v_role
      FROM public.admins a
      WHERE lower(trim(a.name)) = lower(trim(rec.r_name))
      LIMIT 1;
    END IF;

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
      rec.patient_id,
      rec.p_name,
      v_staff_id,
      v_auth_id,
      rec.r_name,
      coalesce(v_role, 'clinic'),
      rec.concern_type,
      'open',
      now(),
      now()
    ) RETURNING id INTO v_conv_id;

    UPDATE public.patient_messages
    SET conversation_id = v_conv_id
    WHERE conversation_id IS NULL
      AND patient_id = rec.patient_id
      AND coalesce(recipient_name, 'Clinic Personnel (General)') = rec.r_name
      AND concern_type = rec.concern_type;
  END LOOP;
END $$;

-- 4. Update Safe staff_directory view (preserving column positions and appending auth_user_id)
CREATE OR REPLACE VIEW public.staff_directory AS
SELECT
  id,
  name,
  role,
  avatar,
  department,
  active,
  auth_user_id
FROM public.admins
WHERE active = true;

GRANT SELECT ON public.staff_directory TO anon, authenticated;

-- 5. Helper function for staff identity resolution in RLS
CREATE OR REPLACE FUNCTION public.current_staff_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM public.admins a
  WHERE a.auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- 6. Row Level Security on Conversations
ALTER TABLE public.patient_message_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmc_select_policy ON public.patient_message_conversations;
CREATE POLICY pmc_select_policy ON public.patient_message_conversations
FOR SELECT TO authenticated
USING (
  public.is_within_clinic_hours()
  AND (
    -- Admin oversight
    public.current_app_role() = 'admin'
    -- Direct clinician (or general clinic queue when unassigned)
    OR (
      public.current_app_role() IN ('physician', 'nurse')
      AND (
        recipient_auth_user_id = auth.uid()
        OR recipient_staff_id = public.current_staff_admin_id()
        OR recipient_staff_id IS NULL
      )
    )
    -- Patient ownership
    OR (
      public.current_app_role() = 'patient'
      AND patient_id IN (
        SELECT u.patient_id FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.patient_id IS NOT NULL
      )
    )
  )
);

DROP POLICY IF EXISTS pmc_insert_policy ON public.patient_message_conversations;
CREATE POLICY pmc_insert_policy ON public.patient_message_conversations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_within_clinic_hours()
  AND (
    public.current_app_role() IN ('admin', 'physician', 'nurse')
    OR (
      public.current_app_role() = 'patient'
      AND patient_id IN (
        SELECT u.patient_id FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.patient_id IS NOT NULL
      )
    )
  )
);

DROP POLICY IF EXISTS pmc_update_policy ON public.patient_message_conversations;
CREATE POLICY pmc_update_policy ON public.patient_message_conversations
FOR UPDATE TO authenticated
USING (
  public.is_within_clinic_hours()
  AND (
    public.current_app_role() = 'admin'
    OR (
      public.current_app_role() IN ('physician', 'nurse')
      AND (
        recipient_auth_user_id = auth.uid()
        OR recipient_staff_id = public.current_staff_admin_id()
        OR recipient_staff_id IS NULL
      )
    )
    OR (
      public.current_app_role() = 'patient'
      AND patient_id IN (
        SELECT u.patient_id FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.patient_id IS NOT NULL
      )
    )
  )
);

-- 7. Row Level Security on Messages
ALTER TABLE public.patient_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_messages_select_policy ON public.patient_messages;
CREATE POLICY patient_messages_select_policy ON public.patient_messages
FOR SELECT TO authenticated
USING (
  public.is_within_clinic_hours()
  AND (
    conversation_id IN (
      SELECT c.id
      FROM public.patient_message_conversations c
      WHERE (
        public.current_app_role() = 'admin'
        OR (
          public.current_app_role() IN ('physician', 'nurse')
          AND (
            c.recipient_auth_user_id = auth.uid()
            OR c.recipient_staff_id = public.current_staff_admin_id()
            OR c.recipient_staff_id IS NULL
          )
        )
        OR (
          public.current_app_role() = 'patient'
          AND c.patient_id IN (
            SELECT u.patient_id FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.patient_id IS NOT NULL
          )
        )
      )
    )
    OR (
      conversation_id IS NULL
      AND (
        public.current_app_role() IN ('admin', 'physician', 'nurse')
        OR (
          public.current_app_role() = 'patient'
          AND patient_id IN (
            SELECT u.patient_id FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.patient_id IS NOT NULL
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS patient_messages_insert_policy ON public.patient_messages;
CREATE POLICY patient_messages_insert_policy ON public.patient_messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_within_clinic_hours()
  AND (
    public.current_app_role() IN ('admin', 'physician', 'nurse')
    OR (
      public.current_app_role() = 'patient'
      AND sender_role = 'patient'
      AND (auth_user_id IS NULL OR auth_user_id = auth.uid())
      AND patient_id IN (
        SELECT u.patient_id
        FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.patient_id IS NOT NULL
      )
    )
  )
);

-- 8. RPC: Atomic Inquiry Creation
CREATE OR REPLACE FUNCTION public.create_patient_inquiry(
  p_recipient_staff_id uuid DEFAULT NULL,
  p_concern_type text DEFAULT 'General clinic inquiry',
  p_message_text text DEFAULT '',
  p_recipient_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.create_patient_inquiry TO authenticated;

-- 9. RPC: Send Message in Existing Conversation
CREATE OR REPLACE FUNCTION public.send_patient_message(
  p_conversation_id uuid,
  p_message_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  ELSIF v_caller_role IN ('physician', 'nurse', 'admin') THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.send_patient_message TO authenticated;

-- 10. Realtime Publications and Grants
ALTER TABLE public.patient_message_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.patient_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'patient_message_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_message_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'patient_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_messages;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_message_conversations TO authenticated;
GRANT SELECT, INSERT ON public.patient_messages TO authenticated;

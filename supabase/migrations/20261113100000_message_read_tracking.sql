-- Unread message notifications. Each conversation remembers when the patient
-- and the staff side last read it; messages from the other side after that
-- time are unread.
ALTER TABLE public.patient_message_conversations
  ADD COLUMN IF NOT EXISTS patient_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_last_read_at timestamptz;

-- Existing threads start as read, so nobody opens the portal to a flood of old "new" messages.
UPDATE public.patient_message_conversations
   SET patient_last_read_at = coalesce(patient_last_read_at, now()),
       staff_last_read_at = coalesce(staff_last_read_at, now());

-- SECURITY INVOKER: the conversation update policies decide who may mark which thread.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF public.current_app_role() = 'patient' THEN
    UPDATE public.patient_message_conversations SET patient_last_read_at = now() WHERE id = p_conversation_id;
  ELSE
    UPDATE public.patient_message_conversations SET staff_last_read_at = now() WHERE id = p_conversation_id;
  END IF;
END;
$$;

-- Unread count per conversation for the signed-in user. SECURITY INVOKER, so
-- row-level security limits it to conversations the caller can already read.
CREATE OR REPLACE FUNCTION public.my_unread_message_counts()
RETURNS TABLE (conversation_id uuid, unread bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.id, count(m.id)
    FROM public.patient_message_conversations c
    JOIN public.patient_messages m ON m.conversation_id = c.id
   WHERE CASE WHEN public.current_app_role() = 'patient'
              THEN m.sender_role <> 'patient' AND m.created_at > coalesce(c.patient_last_read_at, '-infinity')
              ELSE m.sender_role = 'patient' AND m.created_at > coalesce(c.staff_last_read_at, '-infinity')
         END
   GROUP BY c.id;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.my_unread_message_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_unread_message_counts() TO authenticated;

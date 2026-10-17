-- ============================================================================
-- Migration: delete a resolved inquiry
-- ============================================================================
--
-- Staff can clear closed inquiries out of History.
--
-- WHY AN RPC RATHER THAN A DELETE POLICY
--   A DELETE policy on patient_message_conversations would let a caller remove
--   ANY conversation, including one still open and mid-consultation. This
--   function refuses anything that is not resolved, so History can be tidied
--   without risking a live thread.
--
-- Cascade already handles the rest:
--   patient_message_conversations -> patient_messages        ON DELETE CASCADE
--   patient_messages              -> patient_message_reactions ON DELETE CASCADE
--
-- Storage files are NOT removed here — a plpgsql function cannot delete the
-- underlying object. The client deletes them first and only then calls this,
-- so a clinical photo is never orphaned by a half-finished delete.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_resolved_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_status text;
BEGIN
  v_role := current_app_role();

  -- Only clinic staff curate the history.
  IF v_role IS NULL OR v_role NOT IN ('admin', 'physician', 'nurse') THEN
    RETURN false;
  END IF;

  SELECT status
    INTO v_status
    FROM public.patient_message_conversations
   WHERE id = p_conversation_id;

  IF v_status IS NULL THEN
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
$$;

COMMENT ON FUNCTION public.delete_resolved_conversation(uuid) IS
  'Staff-only: deletes a RESOLVED inquiry and, by cascade, its messages and reactions.';

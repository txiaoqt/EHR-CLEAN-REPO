-- ============================================================================
-- Migration: clear a message's attachment after the file is deleted
-- ============================================================================
--
-- BUG THIS FIXES
--   Resolving a conversation deleted the photo from Storage but the follow-up
--   bookkeeping never happened:
--
--     conversation: resolved
--     files left in storage: 0        <- deletion worked
--     attachment_path: still set      <- update did NOT
--     attachment_removed_at: NULL
--
--   The thread therefore showed "This photo is no longer available" instead of
--   "Chat resolved. Photo has been removed."
--
--   Cause: public.patient_messages has only INSERT and SELECT policies — there
--   is no UPDATE policy. An RLS-blocked UPDATE affects 0 rows and returns NO
--   error, so the failure was invisible to the app.
--
-- WHY AN RPC RATHER THAN AN UPDATE POLICY
--   Adding a general UPDATE policy would let either side rewrite message text,
--   which a clinical record should not allow. This function can only clear an
--   attachment, and only for clinic staff.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_message_attachment(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_rows integer;
BEGIN
  v_role := current_app_role();

  -- Only clinic staff resolve conversations, so only they clear attachments.
  IF v_role IS NULL OR v_role NOT IN ('admin', 'physician', 'nurse') THEN
    RETURN false;
  END IF;

  UPDATE public.patient_messages
     SET attachment_path = NULL,
         attachment_removed_at = now(),
         updated_at = now()
   WHERE id = p_message_id
     AND attachment_path IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.clear_message_attachment(uuid) IS
  'Staff-only: marks a message photo as removed after the file is deleted from Storage.';

-- ---------------------------------------------------------------------------
-- Repair rows whose file is already gone but whose path was never cleared —
-- including the one left behind before this migration.
-- ---------------------------------------------------------------------------
UPDATE public.patient_messages m
   SET attachment_path = NULL,
       attachment_removed_at = COALESCE(m.attachment_removed_at, now()),
       updated_at = now()
 WHERE m.attachment_path IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM storage.objects o
      WHERE o.bucket_id = 'message-attachments'
        AND o.name = m.attachment_path
   );

-- ============================================================================
-- Migration: reactions are closed once an inquiry is resolved
-- ============================================================================
--
-- A resolved conversation is a closed record. Both sides should be able to read
-- it, but neither should be able to add or remove reactions.
--
-- The portals disable the control, but a UI guard alone is not enforcement — a
-- direct API call would still get through. This trigger is the actual rule.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.block_reaction_on_resolved_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT c.status
    INTO v_status
    FROM public.patient_messages m
    JOIN public.patient_message_conversations c ON c.id = m.conversation_id
   WHERE m.id = NEW.message_id;

  -- Messages with no conversation (legacy rows) are left alone.
  IF v_status IS NOT NULL AND lower(v_status) <> 'open' THEN
    RAISE EXCEPTION 'This inquiry has been resolved, so reactions are closed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_reaction_on_resolved ON public.patient_message_reactions;
CREATE TRIGGER trg_block_reaction_on_resolved
  BEFORE INSERT ON public.patient_message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.block_reaction_on_resolved_conversation();

COMMENT ON FUNCTION public.block_reaction_on_resolved_conversation() IS
  'Rejects a reaction on any message belonging to a resolved conversation.';

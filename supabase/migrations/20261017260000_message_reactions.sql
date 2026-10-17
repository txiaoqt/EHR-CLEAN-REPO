-- ============================================================================
-- Migration: emoji reactions on patient messages
-- ============================================================================
--
-- Lets either side acknowledge a message with a tap — a quick "seen it",
-- "thanks", or a bit of warmth in what is otherwise a clinical thread.
--
-- One row per (message, person, emoji), so tapping the same emoji twice toggles
-- it off rather than stacking. Removing the message removes its reactions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.patient_messages (id) ON DELETE CASCADE,
  reactor_auth_user_id uuid NOT NULL,
  reactor_name text,
  reactor_role text,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tapping the same emoji twice is a toggle, so this pair must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_message_reactions_unique
  ON public.patient_message_reactions (message_id, reactor_auth_user_id, emoji);

CREATE INDEX IF NOT EXISTS idx_patient_message_reactions_message
  ON public.patient_message_reactions (message_id);

-- ---------------------------------------------------------------------------
-- Access: any signed-in user may read reactions; a person may only add or
-- remove their own.
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Message Reactions Read" ON public.patient_message_reactions;
CREATE POLICY "Message Reactions Read"
  ON public.patient_message_reactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Message Reactions Insert" ON public.patient_message_reactions;
CREATE POLICY "Message Reactions Insert"
  ON public.patient_message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (reactor_auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Message Reactions Delete" ON public.patient_message_reactions;
CREATE POLICY "Message Reactions Delete"
  ON public.patient_message_reactions FOR DELETE
  TO authenticated
  USING (reactor_auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime, so a reaction appears on the other side without a refresh.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'patient_message_reactions'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_message_reactions;
  END IF;
END $$;

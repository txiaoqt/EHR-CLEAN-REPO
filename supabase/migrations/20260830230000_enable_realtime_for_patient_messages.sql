-- ============================================================================
-- Migration: 20260830230000_enable_realtime_for_patient_messages.sql
-- Description:
--   1. Configures replica identity to FULL on public.patient_messages so realtime
--      change payloads contain all columns for updates/deletes.
--   2. Ensures public.patient_messages is enrolled in the supabase_realtime publication.
--   3. Preserves all existing RLS policies and table security.
-- ============================================================================

ALTER TABLE public.patient_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'patient_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_messages;
  END IF;
END $$;

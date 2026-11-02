-- EnrolleeMessageThread subscribes to enrollee_messages, but the table was never
-- added to the realtime publication, so replies only appeared after a reload.
-- RLS still decides who receives each change (the enrollee and clinic staff).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'enrollee_messages'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollee_messages;
  END IF;
END $$;

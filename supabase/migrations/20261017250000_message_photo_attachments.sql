-- ============================================================================
-- Migration: photo attachments on patient messages
-- ============================================================================
--
-- Patients and staff need to send photographs through the message thread — a
-- rash, a wound, a medicine box — so an online inquiry can be assessed properly
-- without a visit.
--
-- The photo lives in Storage; the message row carries only its path and
-- metadata. Once the conversation is resolved the file is deleted and the path
-- is cleared, so nothing clinical is retained after the inquiry closes.
--
-- The bucket is PRIVATE. The other buckets (profile-images, signatures) are
-- public, but a photograph of a patient's skin condition must not be readable
-- by anyone who happens to have the URL, so the app reads these through
-- short-lived signed URLs instead.
-- ============================================================================

ALTER TABLE public.patient_messages
  ADD COLUMN IF NOT EXISTS attachment_path text;

ALTER TABLE public.patient_messages
  ADD COLUMN IF NOT EXISTS attachment_name text;

ALTER TABLE public.patient_messages
  ADD COLUMN IF NOT EXISTS attachment_type text;

ALTER TABLE public.patient_messages
  ADD COLUMN IF NOT EXISTS attachment_size integer;

-- Set when the file is deleted on resolve, so the thread can say so honestly.
ALTER TABLE public.patient_messages
  ADD COLUMN IF NOT EXISTS attachment_removed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_patient_messages_with_attachment
  ON public.patient_messages (conversation_id)
  WHERE attachment_path IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Private bucket for message photographs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'message-attachments',
      'message-attachments',
      false,                 -- private: read through signed URLs only
      5242880,               -- 5 MB
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    -- No public read policy: the bucket is private, and access is granted by
    -- signed URL. These policies govern the signed-URL creation and upload.
    DROP POLICY IF EXISTS "Message Attachments Read" ON storage.objects;
    CREATE POLICY "Message Attachments Read"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'message-attachments');

    DROP POLICY IF EXISTS "Message Attachments Write" ON storage.objects;
    CREATE POLICY "Message Attachments Write"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'message-attachments');

    DROP POLICY IF EXISTS "Message Attachments Delete" ON storage.objects;
    CREATE POLICY "Message Attachments Delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'message-attachments');
  END IF;
END $$;

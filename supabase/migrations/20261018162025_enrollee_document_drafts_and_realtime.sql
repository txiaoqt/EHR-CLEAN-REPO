-- -----------------------------------------------------------------------------
-- Enrollee documents: explicit drafts, batch submission, and live review updates
-- -----------------------------------------------------------------------------

-- A file is not a submission until the applicant confirms it. Saved drafts have
-- no submitted timestamp and remain private from the clinic review queue.
ALTER TABLE public.enrollee_documents
  ALTER COLUMN submitted_at DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.enrollee_documents
  DROP CONSTRAINT IF EXISTS enrollee_documents_status_check;

ALTER TABLE public.enrollee_documents
  ADD CONSTRAINT enrollee_documents_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'needs_revision'));

-- Keep the existing RPC name for deployed clients, but recording a file now
-- saves a draft. Only submit_enrollee_documents can move it into review.
CREATE OR REPLACE FUNCTION public.record_enrollee_document(
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enrollee uuid;
  v_document_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  SELECT id INTO v_enrollee
    FROM public.enrollees
   WHERE auth_user_id = v_uid
   LIMIT 1;
  IF v_enrollee IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No enrollee account is linked to this sign-in.');
  END IF;

  IF NOT public.record_form_complete('enrollee', v_enrollee::text) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Complete your clinic record before saving a certificate.');
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 10485760 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Each file must be 10 MB or smaller.');
  END IF;

  IF coalesce(p_mime_type, '') NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please upload a photo (JPG, PNG, WEBP) or a PDF.');
  END IF;

  IF p_storage_path IS NULL OR p_storage_path NOT LIKE v_enrollee::text || '/%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid upload path.');
  END IF;

  INSERT INTO public.enrollee_documents (
    enrollee_id, storage_path, file_name, mime_type, size_bytes, status, submitted_at
  )
  VALUES (
    v_enrollee, p_storage_path, p_file_name, p_mime_type, p_size_bytes, 'draft', NULL
  )
  RETURNING id INTO v_document_id;

  RETURN jsonb_build_object('success', true, 'document_id', v_document_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_enrollee_document(text, text, text, bigint) TO authenticated;

-- Give the client an explicit draft-saving RPC so an older database version
-- cannot silently treat a save action as a submitted document.
CREATE OR REPLACE FUNCTION public.save_enrollee_document(
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.record_enrollee_document(
    p_storage_path,
    p_file_name,
    p_mime_type,
    p_size_bytes
  );
$$;

GRANT EXECUTE ON FUNCTION public.save_enrollee_document(text, text, text, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_enrollee_documents(p_document_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enrollee uuid;
  v_draft_count bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  IF p_document_ids IS NULL OR cardinality(p_document_ids) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose at least one draft to submit.');
  END IF;

  SELECT id INTO v_enrollee
    FROM public.enrollees
   WHERE auth_user_id = v_uid
   LIMIT 1;
  IF v_enrollee IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No enrollee account is linked to this sign-in.');
  END IF;

  IF NOT public.record_form_complete('enrollee', v_enrollee::text) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Complete your clinic record before submitting a certificate.');
  END IF;

  SELECT count(*) INTO v_draft_count
    FROM public.enrollee_documents
   WHERE id = ANY(p_document_ids)
     AND enrollee_id = v_enrollee
     AND status = 'draft';

  IF v_draft_count <> cardinality(p_document_ids) THEN
    RETURN jsonb_build_object('success', false, 'error', 'One or more drafts are no longer available to submit. Refresh and try again.');
  END IF;

  -- The update guard blocks applicant status changes. This narrowly scoped RPC
  -- verifies ownership and draft state before opening the transition.
  PERFORM set_config('app.allow_enrollee_document_review', 'on', true);

  UPDATE public.enrollee_documents
     SET status = 'pending',
         submitted_at = now(),
         revision_note = NULL,
         revision_due_at = NULL,
         reviewed_by = NULL,
         reviewed_at = NULL
   WHERE id = ANY(p_document_ids)
     AND enrollee_id = v_enrollee
     AND status = 'draft';

  RETURN jsonb_build_object('success', true, 'submitted_count', v_draft_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_enrollee_documents(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_enrollee_document_draft(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enrollee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  SELECT id INTO v_enrollee
    FROM public.enrollees
   WHERE auth_user_id = v_uid
   LIMIT 1;
  IF v_enrollee IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No enrollee account is linked to this sign-in.');
  END IF;

  DELETE FROM public.enrollee_documents
   WHERE id = p_document_id
     AND enrollee_id = v_enrollee
     AND status = 'draft';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only saved drafts can be removed.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_enrollee_document_draft(uuid) TO authenticated;

-- An applicant can delete their own saved draft, or an upload with no metadata
-- row yet (cleanup after a failed draft save). Submitted files stay protected.
DROP POLICY IF EXISTS enrollee_docs_self_delete_draft ON storage.objects;
CREATE POLICY enrollee_docs_self_delete_draft ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'enrollee-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT e.id::text
        FROM public.enrollees e
       WHERE e.auth_user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1
          FROM public.enrollee_documents d
         WHERE d.storage_path = storage.objects.name
           AND d.status = 'draft'
           AND d.enrollee_id IN (
             SELECT e.id
               FROM public.enrollees e
              WHERE e.auth_user_id = auth.uid()
           )
      )
      OR NOT EXISTS (
        SELECT 1
          FROM public.enrollee_documents d
         WHERE d.storage_path = storage.objects.name
      )
    )
  );

-- Review lists and decision RPCs must never turn an applicant's draft into a
-- clinic decision.
CREATE OR REPLACE FUNCTION public.review_enrollee_document(
  p_document_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := public.current_app_role();
  v_reviewer text;
BEGIN
  IF v_actor NOT IN ('admin', 'physician', 'nurse') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only clinic staff can review documents.');
  END IF;

  IF p_decision NOT IN ('approved', 'needs_revision') THEN
    RETURN jsonb_build_object('success', false, 'error', 'A decision must be either approved or needs revision.');
  END IF;

  IF p_decision = 'needs_revision' AND nullif(trim(coalesce(p_note, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please say what needs changing — the applicant sees this note.');
  END IF;

  SELECT name INTO v_reviewer
    FROM public.admins
   WHERE auth_user_id = auth.uid()
   LIMIT 1;

  PERFORM set_config('app.allow_enrollee_document_review', 'on', true);

  UPDATE public.enrollee_documents
     SET status = p_decision,
         revision_note = CASE WHEN p_decision = 'needs_revision' THEN trim(p_note) ELSE NULL END,
         revision_due_at = CASE WHEN p_decision = 'needs_revision' THEN now() + interval '5 days' ELSE NULL END,
         reviewed_by = coalesce(v_reviewer, 'Clinic staff'),
         reviewed_at = now()
   WHERE id = p_document_id
     AND status IN ('pending', 'needs_revision');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'That document is no longer awaiting review.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_enrollee_document(uuid, text, text) TO authenticated;

-- Postgres Changes publishes submitted documents and their later review status.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'enrollee_documents'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollee_documents;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'enrollees'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollees;
    END IF;
  END IF;
END;
$$;

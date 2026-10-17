-- ============================================================================
-- Migration: patient acknowledgement of a visit
-- ============================================================================
--
-- The Medical Log's SIGNATURE column currently carries only the attending
-- clinician's signature — staff attest that they recorded the visit.
--
-- This adds the second half: the patient confirming what they were given.
-- Clinically that is the more useful of the two, because it is the patient
-- saying "yes, this is what I received". It is stored separately so the log can
-- show both and they can never be confused for one another.
--
-- WHY AN RPC
--   A patient has no UPDATE rights on public.encounters (staff own the clinical
--   record), so the acknowledgement is written through a SECURITY DEFINER
--   function that will only ever touch these two columns, and only on a visit
--   belonging to the caller.
-- ============================================================================

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS patient_signature_path text;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS patient_signed_at timestamptz;

COMMENT ON COLUMN public.encounters.patient_signature_path IS
  'Patient''s drawn acknowledgement that they received the treatment/medicines recorded on this visit.';

-- ---------------------------------------------------------------------------
-- The patient signs their own visit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patient_acknowledge_visit(
  p_encounter_id uuid,
  p_signature_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_patient_id text;
  v_rows       integer;
BEGIN
  IF p_encounter_id IS NULL OR p_signature_path IS NULL OR btrim(p_signature_path) = '' THEN
    RETURN false;
  END IF;

  v_role := current_app_role();
  IF v_role IS NULL OR v_role <> 'patient' THEN
    RETURN false;
  END IF;

  -- Resolve the caller's own patient id; a patient may only sign their own visit.
  SELECT u.patient_id
    INTO v_patient_id
    FROM public.users u
   WHERE u.auth_user_id = auth.uid()
     AND u.patient_id IS NOT NULL
   LIMIT 1;

  IF v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.encounters
     SET patient_signature_path = p_signature_path,
         patient_signed_at = now(),
         updated_at = now()
   WHERE id = p_encounter_id
     AND patient_id = v_patient_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.patient_acknowledge_visit(uuid, text) IS
  'Patient-only: records the caller''s signature acknowledging their own visit.';

-- ---------------------------------------------------------------------------
-- Storage: patient acknowledgements live alongside clinician signatures, in a
-- clearly separate folder so the two can never be mistaken for each other.
-- The bucket already exists and is public, as signatures are not sensitive
-- clinical photographs.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_encounters_patient_signature
  ON public.encounters (patient_id)
  WHERE patient_signature_path IS NOT NULL;

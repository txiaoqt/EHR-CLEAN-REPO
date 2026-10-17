-- ============================================================================
-- Migration: schema for the Medical Log (VAF-MDC)
-- ============================================================================
--
-- The clinic's paper Medical Log has six columns. Three of them had no home in
-- the database:
--
--   DATE         -> encounters.encounter_date        (existed)
--   NAME         -> encounters.patient_name          (existed)
--   SEX          -> did not exist
--   DEPT./COURSE -> did not exist
--   COMPLAINT    -> encounters.chief_complaint       (existed)
--   SIGNATURE    -> did not exist
--
-- And the form's medicine section records what was dispensed to that patient on
-- that visit — but inventory_transactions had no patient or encounter link at
-- all, so dispensing was anonymous stock movement:
--
--   (id, item_name, transaction_type, quantity, reason, performed_by, created_at)
--
-- This adds the missing pieces. Nothing is dropped and every statement is
-- idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SEX and DEPT./COURSE on the patient profile
--    (patient_profiles is the patient's own record — blood type, allergies and
--    emergency contact already live here, so demographics belong here too.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS sex text;

ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS course text;

-- The printed log renders M/F, so constrain to those two values rather than
-- letting free text reach the form.
ALTER TABLE public.patient_profiles
  DROP CONSTRAINT IF EXISTS patient_profiles_sex_check;

ALTER TABLE public.patient_profiles
  ADD CONSTRAINT patient_profiles_sex_check
  CHECK (sex IS NULL OR sex IN ('Male', 'Female'));

CREATE INDEX IF NOT EXISTS idx_patient_profiles_course
  ON public.patient_profiles (course);

-- ---------------------------------------------------------------------------
-- 2. Tie dispensed stock to the visit that dispensed it
--    Nullable: existing stock movements are adjustments, not prescriptions.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS patient_id text;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS encounter_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_encounter
  ON public.inventory_transactions (encounter_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_patient
  ON public.inventory_transactions (patient_id);

-- ON DELETE SET NULL: deleting a visit must not delete the stock history.
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_encounter_id_fkey;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_encounter_id_fkey
  FOREIGN KEY (encounter_id) REFERENCES public.encounters (id) ON DELETE SET NULL;

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_patient_id_fkey;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. Signature — a drawn image plus a typed attestation
--    The image gives the printed log its handwritten look; signed_by/signed_at
--    are the part that is actually verifiable, and they mirror what logAudit
--    already records for the encounter.
-- ---------------------------------------------------------------------------
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS signature_path text;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS signed_by text;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Storage bucket for signature images
--    Follows the same idempotent pattern as the profile-images bucket.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'signatures',
      'signatures',
      true,
      524288, -- 512 KB: a signature PNG is tiny
      ARRAY['image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = true,
      file_size_limit = 524288,
      allowed_mime_types = ARRAY['image/png', 'image/webp'];
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "Signatures Read" ON storage.objects;
    CREATE POLICY "Signatures Read"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'signatures');

    DROP POLICY IF EXISTS "Signatures Write" ON storage.objects;
    CREATE POLICY "Signatures Write"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'signatures');

    DROP POLICY IF EXISTS "Signatures Update" ON storage.objects;
    CREATE POLICY "Signatures Update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'signatures')
      WITH CHECK (bucket_id = 'signatures');
  END IF;
END $$;

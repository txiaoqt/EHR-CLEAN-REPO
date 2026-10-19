-- Keep appointment photos private and connect a scheduled encounter to its booking.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS photo_path text;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS appointment_id uuid;

ALTER TABLE public.encounters
  DROP CONSTRAINT IF EXISTS encounters_appointment_id_fkey;

ALTER TABLE public.encounters
  ADD CONSTRAINT encounters_appointment_id_fkey
  FOREIGN KEY (appointment_id)
  REFERENCES public.appointments (id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_encounters_unique_appointment
  ON public.encounters (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_with_photo
  ON public.appointments (photo_path)
  WHERE photo_path IS NOT NULL;

-- Run these lookups as the migration owner so appointment RLS (including the
-- clinic-hours condition) cannot make a linked photo appear unlinked.
CREATE OR REPLACE FUNCTION public.can_read_appointment_photo(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.photo_path = p_path
       AND (
         public.current_app_role() IN ('admin', 'physician', 'nurse')
         OR (
           public.current_app_role() = 'patient'
           AND EXISTS (
             SELECT 1
               FROM public.users u
              WHERE u.auth_user_id = auth.uid()
                AND u.patient_id = a.patient_id
           )
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_delete_own_unlinked_appointment_photo(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_app_role() = 'patient'
     AND split_part(p_path, '/', 1) = auth.uid()::text
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments a WHERE a.photo_path = p_path
     );
$$;

REVOKE ALL ON FUNCTION public.can_read_appointment_photo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_delete_own_unlinked_appointment_photo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_appointment_photo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_own_unlinked_appointment_photo(text) TO authenticated;

-- Appointment photos can contain sensitive clinical information. Keep them in
-- a private bucket and provide staff access only when an appointment row links
-- the object. Patients can upload under their own Auth UID and can read their
-- own linked photo. The upload path is <auth uid>/<random filename>.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'storage'
       AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'appointment-photos',
      'appointment-photos',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'storage'
       AND table_name = 'objects'
  ) THEN
    DROP POLICY IF EXISTS appointment_photos_patient_upload ON storage.objects;
    CREATE POLICY appointment_photos_patient_upload
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'appointment-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND public.current_app_role() = 'patient'
      );

    DROP POLICY IF EXISTS appointment_photos_patient_read ON storage.objects;
    CREATE POLICY appointment_photos_patient_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'appointment-photos'
        AND public.current_app_role() = 'patient'
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND public.can_read_appointment_photo(storage.objects.name)
      );

    DROP POLICY IF EXISTS appointment_photos_staff_read ON storage.objects;
    CREATE POLICY appointment_photos_staff_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'appointment-photos'
        AND public.current_app_role() IN ('admin', 'physician', 'nurse')
        AND public.can_read_appointment_photo(storage.objects.name)
      );

    -- This permits cleanup if an upload succeeded but the appointment insert
    -- failed. Once an appointment links the object, patients cannot delete it.
    DROP POLICY IF EXISTS appointment_photos_patient_delete_unlinked ON storage.objects;
    CREATE POLICY appointment_photos_patient_delete_unlinked
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'appointment-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND public.current_app_role() = 'patient'
        AND public.can_delete_own_unlinked_appointment_photo(storage.objects.name)
      );
  END IF;
END $$;

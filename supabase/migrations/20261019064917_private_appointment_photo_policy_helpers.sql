-- Keep SECURITY DEFINER policy helpers outside PostgREST's exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_read_appointment_photo(p_path text)
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

CREATE OR REPLACE FUNCTION private.can_delete_own_unlinked_appointment_photo(p_path text)
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

REVOKE ALL ON FUNCTION private.can_read_appointment_photo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_delete_own_unlinked_appointment_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_appointment_photo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_delete_own_unlinked_appointment_photo(text) TO authenticated;

DROP POLICY IF EXISTS appointment_photos_patient_read ON storage.objects;
CREATE POLICY appointment_photos_patient_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'appointment-photos'
    AND public.current_app_role() = 'patient'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND private.can_read_appointment_photo(storage.objects.name)
  );

DROP POLICY IF EXISTS appointment_photos_staff_read ON storage.objects;
CREATE POLICY appointment_photos_staff_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'appointment-photos'
    AND public.current_app_role() IN ('admin', 'physician', 'nurse')
    AND private.can_read_appointment_photo(storage.objects.name)
  );

DROP POLICY IF EXISTS appointment_photos_patient_delete_unlinked ON storage.objects;
CREATE POLICY appointment_photos_patient_delete_unlinked
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'appointment-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_app_role() = 'patient'
    AND private.can_delete_own_unlinked_appointment_photo(storage.objects.name)
  );

DROP FUNCTION IF EXISTS public.can_read_appointment_photo(text);
DROP FUNCTION IF EXISTS public.can_delete_own_unlinked_appointment_photo(text);

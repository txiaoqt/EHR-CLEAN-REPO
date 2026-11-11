-- One scheduled appointment per patient per clinic. The trigger
-- check_one_active_appointment_per_student was made per-clinic in
-- 20261031100000_dental_clinic.sql, but this index still allowed only one
-- across both clinics, so a dental appointment blocked a medical booking.
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_student;
CREATE UNIQUE INDEX idx_appointments_one_active_per_student
  ON public.appointments (patient_id, COALESCE(department, 'Medical Clinic'))
  WHERE status = 'Scheduled';

-- Accounts registered before sign-up asked for a birthday have none, and only
-- staff may update patients. A patient may fill in their own birthday once;
-- changing a recorded one stays with the clinic.
CREATE OR REPLACE FUNCTION public.set_my_date_of_birth(p_date_of_birth date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_date_of_birth IS NULL OR p_date_of_birth > current_date OR p_date_of_birth < date '1900-01-01' THEN
    RAISE EXCEPTION 'Enter a valid date of birth.' USING ERRCODE = '22007';
  END IF;
  UPDATE public.patients p SET date_of_birth = p_date_of_birth, updated_at = now()
   WHERE p.date_of_birth IS NULL
     AND p.id = (SELECT u.patient_id FROM public.users u
                  WHERE u.auth_user_id = (SELECT auth.uid()) AND u.active AND u.patient_id IS NOT NULL);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your birthday is already on file. Ask the clinic to correct it.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_date_of_birth(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_date_of_birth(date) TO authenticated;

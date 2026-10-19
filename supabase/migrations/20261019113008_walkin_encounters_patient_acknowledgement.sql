-- Give staff-created walk-ins an explicit identity in the shared visit log,
-- and let patients acknowledge any completed visit (booked or walk-in).

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS visit_type text;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS patient_signature_path text;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS patient_signed_at timestamptz;

COMMENT ON COLUMN public.encounters.visit_type IS
  'Visit workflow that created this encounter, such as Walk-in or Scheduled.';

COMMENT ON COLUMN public.encounters.patient_signature_path IS
  'Patient acknowledgement signature for a completed standalone encounter.';

COMMENT ON COLUMN public.encounters.patient_signed_at IS
  'Time the patient acknowledged a completed standalone encounter.';

CREATE INDEX IF NOT EXISTS idx_encounters_patient_signature
  ON public.encounters (patient_id)
  WHERE patient_signature_path IS NOT NULL;

-- The existing RPC only targets appointments. Replace it with a function that
-- can write to exactly one completed visit, after checking ownership and the
-- signature object's expected path.
DROP FUNCTION IF EXISTS public.patient_acknowledge_visit(uuid, text);

CREATE OR REPLACE FUNCTION public.patient_acknowledge_visit(
  p_appointment_id uuid,
  p_encounter_id uuid,
  p_signature_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id text;
  v_rows integer;
BEGIN
  -- Exactly one visit id is accepted, and the object path is bound to it.
  IF (p_appointment_id IS NULL) = (p_encounter_id IS NULL)
     OR p_signature_path IS NULL
     OR btrim(p_signature_path) = '' THEN
    RETURN false;
  END IF;

  IF public.current_app_role() IS DISTINCT FROM 'patient' THEN
    RETURN false;
  END IF;

  SELECT u.patient_id
    INTO v_patient_id
    FROM public.users u
   WHERE u.auth_user_id = auth.uid()
     AND u.patient_id IS NOT NULL
   LIMIT 1;

  IF v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    IF p_signature_path IS DISTINCT FROM ('patient-ack/' || p_appointment_id::text || '.png') THEN
      RETURN false;
    END IF;

    UPDATE public.appointments
       SET patient_signature_path = p_signature_path,
           patient_signed_at = now(),
           updated_at = now()
     WHERE id = p_appointment_id
       AND patient_id = v_patient_id
       AND lower(status) = 'completed';
  ELSE
    IF p_signature_path IS DISTINCT FROM ('patient-ack/' || p_encounter_id::text || '.png') THEN
      RETURN false;
    END IF;

    UPDATE public.encounters
       SET patient_signature_path = p_signature_path,
           patient_signed_at = now(),
           updated_at = now()
     WHERE id = p_encounter_id
       AND patient_id = v_patient_id
       AND lower(status) = 'completed';
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

COMMENT ON FUNCTION public.patient_acknowledge_visit(uuid, uuid, text) IS
  'Patient-only: records the caller''s acknowledgement on their own completed appointment or walk-in encounter.';

REVOKE ALL ON FUNCTION public.patient_acknowledge_visit(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_acknowledge_visit(uuid, uuid, text) TO authenticated;

-- Keep the existing view column order and types so current page queries remain
-- compatible. Prefer a direct appointment link; retain a single deterministic
-- same-day match for legacy encounter rows that predate appointment_id.
CREATE OR REPLACE VIEW public.medical_log_visits
WITH (security_invoker = true)
AS
SELECT
  a.id AS visit_id,
  'appointment'::text AS visit_source,
  a.id AS appointment_id,
  e.id AS encounter_id,
  a.patient_id,
  COALESCE(e.patient_name, a.patient_name) AS patient_name,
  a.appointment_date AS visit_date,
  a.appointment_time::text AS visit_time,
  a.department,
  a.service_type,
  a.appointment_type,
  a.status AS appointment_status,
  e.status AS encounter_status,
  e.chief_complaint,
  e.assessment_plan,
  COALESCE(e.clinician_name, a.clinician_name) AS clinician_name,
  a.patient_signature_path,
  a.patient_signed_at,
  e.vitals,
  e.hpi,
  e.physical_exam,
  e.sensitivity_level
FROM public.appointments a
LEFT JOIN LATERAL (
  SELECT e.*
    FROM public.encounters e
   WHERE e.patient_id = a.patient_id
     AND (
       e.appointment_id = a.id
       OR (
         e.appointment_id IS NULL
         AND e.visit_type IS DISTINCT FROM 'Walk-in'
         AND (e.encounter_date AT TIME ZONE 'Asia/Manila')::date = a.appointment_date
         AND a.id = (
           SELECT a2.id
             FROM public.appointments a2
            WHERE a2.patient_id = a.patient_id
              AND a2.appointment_date = a.appointment_date
              AND lower(a2.status) <> 'cancelled'
            ORDER BY a2.appointment_time, a2.id
            LIMIT 1
         )
       )
     )
   ORDER BY CASE WHEN e.appointment_id = a.id THEN 0 ELSE 1 END,
            e.encounter_date DESC,
            e.id
   LIMIT 1
) e ON true
WHERE lower(a.status) <> 'cancelled'

UNION ALL

-- Explicit walk-ins remain visible even when that patient also has a separate
-- appointment on the same date. Legacy unmatched encounters keep the former
-- no-booking behavior.
SELECT
  e.id,
  'encounter'::text,
  NULL::uuid,
  e.id,
  e.patient_id,
  e.patient_name,
  (e.encounter_date AT TIME ZONE 'Asia/Manila')::date,
  to_char(e.encounter_date AT TIME ZONE 'Asia/Manila', 'HH12:MI AM'),
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  e.status,
  e.chief_complaint,
  e.assessment_plan,
  e.clinician_name,
  e.patient_signature_path,
  e.patient_signed_at,
  e.vitals,
  e.hpi,
  e.physical_exam,
  e.sensitivity_level
FROM public.encounters e
WHERE e.appointment_id IS NULL
  AND (
    e.visit_type = 'Walk-in'
    OR (
      e.visit_type IS DISTINCT FROM 'Scheduled'
      AND NOT EXISTS (
        SELECT 1
          FROM public.appointments a
         WHERE a.patient_id = e.patient_id
           AND a.appointment_date = (e.encounter_date AT TIME ZONE 'Asia/Manila')::date
           AND lower(a.status) <> 'cancelled'
      )
    )
  );

COMMENT ON VIEW public.medical_log_visits IS
  'One row per booked visit or standalone encounter; explicit completed walk-ins remain separate from same-day appointments.';

-- ============================================================================
-- Migration: carry the full clinical note through the visit view
-- ============================================================================
--
-- The patient profile could show an encounter's complaint and assessment, but
-- not the history of present illness or the physical exam — the fields the
-- clinician actually filled in on the form. Those columns have to travel with
-- the view for the record to be readable where it is reviewed.
--
-- CREATE OR REPLACE VIEW can only append columns, so these are added last.
-- ============================================================================

CREATE OR REPLACE VIEW public.medical_log_visits
WITH (security_invoker = true)
AS
SELECT
  a.id                                  AS visit_id,
  'appointment'::text                   AS visit_source,
  a.id                                  AS appointment_id,
  e.id                                  AS encounter_id,
  a.patient_id,
  COALESCE(e.patient_name, a.patient_name) AS patient_name,
  a.appointment_date                    AS visit_date,
  a.appointment_time::text              AS visit_time,
  a.department,
  a.service_type,
  a.appointment_type,
  a.status                              AS appointment_status,
  e.status                              AS encounter_status,
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
LEFT JOIN public.encounters e
       ON e.patient_id = a.patient_id
      AND (e.encounter_date AT TIME ZONE 'Asia/Manila')::date = a.appointment_date
WHERE lower(a.status) <> 'cancelled'

UNION ALL

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
  NULL::text,
  NULL::timestamptz,
  e.vitals,
  e.hpi,
  e.physical_exam,
  e.sensitivity_level
FROM public.encounters e
WHERE NOT EXISTS (
  SELECT 1
    FROM public.appointments a
   WHERE a.patient_id = e.patient_id
     AND a.appointment_date = (e.encounter_date AT TIME ZONE 'Asia/Manila')::date
     AND lower(a.status) <> 'cancelled'
);

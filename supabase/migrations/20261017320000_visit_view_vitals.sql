-- ============================================================================
-- Migration: carry vitals through the visit view
-- ============================================================================
--
-- The patient's Records page showed a vitals summary from the encounter. The
-- visit view replaced that source, so the column has to come with it or the
-- patient loses information they could previously see.
--
-- CREATE OR REPLACE VIEW can only append columns, so `vitals` is added last.
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
  e.vitals
FROM public.appointments a
LEFT JOIN public.encounters e
       ON e.patient_id = a.patient_id
      AND e.encounter_date::date = a.appointment_date
WHERE lower(a.status) <> 'cancelled'

UNION ALL

SELECT
  e.id,
  'encounter'::text,
  NULL::uuid,
  e.id,
  e.patient_id,
  e.patient_name,
  e.encounter_date::date,
  e.encounter_date::time::text,
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
  e.vitals
FROM public.encounters e
WHERE NOT EXISTS (
  SELECT 1
    FROM public.appointments a
   WHERE a.patient_id = e.patient_id
     AND a.appointment_date = e.encounter_date::date
     AND lower(a.status) <> 'cancelled'
);

-- ============================================================================
-- Migration: one action to complete a visit, and a timezone fix
-- ============================================================================
--
-- 1. TIMEZONE
--    medical_log_visits cast a timestamptz to a date using the session
--    timezone, which is UTC:
--
--      timestamptz '2026-10-17 07:00:00+08'  ->  ::date              = 2026-10-16
--                                            ->  AT TIME ZONE Manila = 2026-10-17
--
--    The clinic opens at 07:00, so any encounter between 07:00 and 07:59
--    Manila was dated the previous day — and then failed to match its
--    appointment, so a booked visit appeared as a walk-in on the wrong row.
--    No rows were affected yet; this closes the window before one is.
--
-- 2. ONE COMPLETE ACTION
--    Completing a visit meant setting TWO statuses in two places:
--      appointments.status  -> the booking
--      encounters.status    -> the clinical note
--    They cannot be merged (a walk-in has no appointment; the booking status
--    governs the slot and the one-booking rule), but they must never be set
--    separately. complete_visit() moves both, and resolves the counterpart
--    itself so the two cannot disagree.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The view, with Manila-correct dates
-- ---------------------------------------------------------------------------
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
  e.vitals
FROM public.encounters e
WHERE NOT EXISTS (
  SELECT 1
    FROM public.appointments a
   WHERE a.patient_id = e.patient_id
     AND a.appointment_date = (e.encounter_date AT TIME ZONE 'Asia/Manila')::date
     AND lower(a.status) <> 'cancelled'
);

-- ---------------------------------------------------------------------------
-- 2. Complete a visit — both records, one call
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_visit(
  p_appointment_id uuid DEFAULT NULL,
  p_encounter_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_appt    uuid := p_appointment_id;
  v_enc     uuid := p_encounter_id;
  v_appt_n  integer := 0;
  v_enc_n   integer := 0;
BEGIN
  v_role := current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'physician', 'nurse') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not permitted.');
  END IF;

  IF v_appt IS NULL AND v_enc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nothing to complete.');
  END IF;

  -- Resolve the counterpart, so the two records cannot end up disagreeing.
  IF v_appt IS NOT NULL AND v_enc IS NULL THEN
    SELECT e.id INTO v_enc
      FROM public.encounters e
      JOIN public.appointments a ON a.id = v_appt
     WHERE e.patient_id = a.patient_id
       AND (e.encounter_date AT TIME ZONE 'Asia/Manila')::date = a.appointment_date
     LIMIT 1;
  ELSIF v_enc IS NOT NULL AND v_appt IS NULL THEN
    SELECT a.id INTO v_appt
      FROM public.appointments a
      JOIN public.encounters e ON e.id = v_enc
     WHERE a.patient_id = e.patient_id
       AND a.appointment_date = (e.encounter_date AT TIME ZONE 'Asia/Manila')::date
       AND lower(a.status) <> 'cancelled'
     LIMIT 1;
  END IF;

  -- A cancelled booking stays cancelled: the visit did not happen.
  IF v_appt IS NOT NULL THEN
    UPDATE public.appointments
       SET status = 'Completed', updated_at = now()
     WHERE id = v_appt
       AND lower(status) <> 'cancelled';
    GET DIAGNOSTICS v_appt_n = ROW_COUNT;
  END IF;

  IF v_enc IS NOT NULL THEN
    UPDATE public.encounters
       SET status = 'completed', updated_at = now()
     WHERE id = v_enc
       AND lower(status) IS DISTINCT FROM 'completed';
    GET DIAGNOSTICS v_enc_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appt,
    'encounter_id', v_enc,
    'appointment_completed', v_appt_n > 0,
    'encounter_completed', v_enc_n > 0
  );
END;
$$;

COMMENT ON FUNCTION public.complete_visit(uuid, uuid) IS
  'Staff-only: completes a visit — the appointment and the encounter together, resolving whichever was not supplied.';

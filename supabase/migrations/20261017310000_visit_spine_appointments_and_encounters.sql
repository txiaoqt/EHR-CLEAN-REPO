-- ============================================================================
-- Migration: the visit spine — appointments and encounters as one log
-- ============================================================================
--
-- PROBLEM
--   Marking an appointment "Completed" did not create an encounter, and both
--   the patient's Records page and the Medical Log read only encounters. So a
--   visit could be completed and be invisible everywhere:
--
--     TUPM-01-1234  2 Completed appointments (2026-10-17)  ->  0 encounters
--     patient portal: "No completed visits yet"
--     Medical Log:    the visit never appeared
--
--   The two tables are entirely disjoint today: 4 live appointments, 76
--   encounters, and not one encounter matches an appointment on the same
--   patient and date.
--
-- THE MODEL THIS ADOPTS
--   A VISIT is either:
--     * an appointment that is not cancelled (booked, scheduled or completed), or
--     * an encounter with no appointment that day — a walk-in.
--
--   Both belong on the clinic's log, which is why the paper form is filled in
--   for walk-ins and booked patients alike.
--
--   Because a visit may have no encounter (a completed appointment with no
--   clinical note), the patient's signature and the dispensing both hang off
--   the VISIT, not the encounter.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dispensing can belong to a booked visit, not only to an encounter
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS appointment_id uuid;

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_appointment_id_fkey;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES public.appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_appointment
  ON public.inventory_transactions (appointment_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_transactions_unique_dispense_appointment
  ON public.inventory_transactions (appointment_id, item_name)
  WHERE appointment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. The patient's signature belongs to the visit
--    Moved off encounters: a completed appointment has no encounter to hold it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_signature_path text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_signed_at timestamptz;

ALTER TABLE public.encounters
  DROP COLUMN IF EXISTS patient_signature_path;

ALTER TABLE public.encounters
  DROP COLUMN IF EXISTS patient_signed_at;

-- ---------------------------------------------------------------------------
-- 3. The acknowledgement now targets an appointment
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.patient_acknowledge_visit(uuid, text);

CREATE OR REPLACE FUNCTION public.patient_acknowledge_visit(
  p_appointment_id uuid,
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
  IF p_appointment_id IS NULL OR p_signature_path IS NULL OR btrim(p_signature_path) = '' THEN
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

  UPDATE public.appointments
     SET patient_signature_path = p_signature_path,
         patient_signed_at = now(),
         updated_at = now()
   WHERE id = p_appointment_id
     AND patient_id = v_patient_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.patient_acknowledge_visit(uuid, text) IS
  'Patient-only: records the caller''s signature acknowledging their own visit (an appointment).';

-- ---------------------------------------------------------------------------
-- 4. One row per visit, whatever produced it
--
--    security_invoker: the view must respect the caller's RLS, otherwise a
--    patient querying it would read every patient's visits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.medical_log_visits
WITH (security_invoker = true)
AS
-- Booked visits: every appointment that is not cancelled.
SELECT
  a.id                                  AS visit_id,
  'appointment'::text                   AS visit_source,
  a.id                                  AS appointment_id,
  e.id                                  AS encounter_id,
  a.patient_id,
  COALESCE(e.patient_name, a.patient_name) AS patient_name,
  a.appointment_date                    AS visit_date,
  -- appointment_time is text ('01:00 PM'); cast both sides to text so the
  -- union can match them.
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
  a.patient_signed_at
FROM public.appointments a
LEFT JOIN public.encounters e
       ON e.patient_id = a.patient_id
      AND e.encounter_date::date = a.appointment_date
WHERE lower(a.status) <> 'cancelled'

UNION ALL

-- Walk-ins: an encounter with no appointment that day.
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
  NULL::timestamptz
FROM public.encounters e
WHERE NOT EXISTS (
  SELECT 1
    FROM public.appointments a
   WHERE a.patient_id = e.patient_id
     AND a.appointment_date = e.encounter_date::date
     AND lower(a.status) <> 'cancelled'
);

COMMENT ON VIEW public.medical_log_visits IS
  'One row per clinic visit: a non-cancelled appointment, or a walk-in encounter with no appointment that day.';

-- ---------------------------------------------------------------------------
-- 5. Show the already-completed visits to the patients who are missing them
--    (no data is invented — these rows already exist in appointments)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_patient_signature
  ON public.appointments (patient_id)
  WHERE patient_signature_path IS NOT NULL;

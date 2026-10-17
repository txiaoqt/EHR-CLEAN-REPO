-- ============================================================================
-- Migration: make encounters.patient_name reliable
-- ============================================================================
--
-- `encounters.patient_name` was written as NULL by the encounter form, so the
-- column was empty on most rows:
--
--     total encounters: 76
--     with a name:      14
--     NULL:             62
--     disagreeing with the patient record: 1
--
-- Every reader then had to patch around it. Encounters.jsx carries a batch
-- fetch for the missing names (lines 80-90) and a per-row fallback (lines
-- 136-139) purely for this, and the Medical Log had to join the profile to show
-- a name at all — which is also why its search returned nothing for a patient
-- who was plainly visible on screen.
--
-- This backfills the column from the patient record and keeps it in step from
-- now on, so one column is authoritative and the workarounds are no longer
-- load-bearing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill from the patient record (fixes the NULLs and the stale one)
-- ---------------------------------------------------------------------------
UPDATE public.encounters e
   SET patient_name = p.name
  FROM public.patients p
 WHERE p.id = e.patient_id
   AND e.patient_name IS DISTINCT FROM p.name;

-- ---------------------------------------------------------------------------
-- 2. Keep it in step when a patient's name is corrected
--    (the register showed exactly one drifted row, so drift is real)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_encounter_patient_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.encounters
     SET patient_name = NEW.name
   WHERE patient_id = NEW.id
     AND patient_name IS DISTINCT FROM NEW.name;

  -- AFTER trigger: the return value is ignored.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_encounter_patient_name ON public.patients;
CREATE TRIGGER trg_sync_encounter_patient_name
  AFTER UPDATE OF name ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_encounter_patient_name();

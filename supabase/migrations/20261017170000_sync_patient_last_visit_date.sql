-- ============================================================================
-- Migration: keep patients.last_visit_date in step with encounters
-- ============================================================================
--
-- PROBLEM
--   `patients.last_visit_date` is only ever set by the seed script, which
--   computes it once from the encounters that existed at seed time:
--
--       -- Keep patient last_visit_date fresh based on seeded encounters.
--       last_visit_date = e.max_date
--
--   Nothing updates it at runtime — no trigger, no function, and the app never
--   writes the column. So the moment a patient is seen again, the Patients list
--   keeps showing their seeding-era date. Observed before this migration:
--
--       TUPM-22-8901  last_visit 2026-04-11  but latest encounter 2026-09-05
--       TUPM-20-7893  last_visit 2026-04-14  but latest encounter 2025-11-06
--       TUPM-21-7892  last_visit 2026-04-12  but latest encounter 2025-11-07
--
-- FIX
--   Recompute the column from the encounters table on every insert, update or
--   delete of an encounter. Recomputing (rather than only moving forward) also
--   handles an encounter being corrected to an earlier date or deleted, so the
--   value can never drift in either direction.
--
--   The UPDATE is guarded by IS DISTINCT FROM, so the common case — an
--   encounter update that does not change the latest date — writes nothing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_patient_last_visit_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id text;
  v_latest     date;
BEGIN
  v_patient_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.patient_id ELSE NEW.patient_id END;
  IF v_patient_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT max(e.encounter_date)::date
    INTO v_latest
    FROM public.encounters e
   WHERE e.patient_id = v_patient_id;

  UPDATE public.patients p
     SET last_visit_date = v_latest,
         updated_at = now()
   WHERE p.id = v_patient_id
     AND p.last_visit_date IS DISTINCT FROM v_latest;

  -- AFTER trigger: the return value is ignored.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_patient_last_visit_date ON public.encounters;
CREATE TRIGGER trg_sync_patient_last_visit_date
  AFTER INSERT OR UPDATE OR DELETE ON public.encounters
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_patient_last_visit_date();

-- ---------------------------------------------------------------------------
-- Backfill: correct every patient whose stored date disagrees with their
-- encounters, including the stale rows listed above.
-- ---------------------------------------------------------------------------
UPDATE public.patients p
   SET last_visit_date = e.latest,
       updated_at = now()
  FROM (
    SELECT patient_id, max(encounter_date)::date AS latest
      FROM public.encounters
     WHERE patient_id IS NOT NULL
     GROUP BY patient_id
  ) e
 WHERE p.id = e.patient_id
   AND p.last_visit_date IS DISTINCT FROM e.latest;

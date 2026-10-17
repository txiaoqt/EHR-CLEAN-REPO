-- ============================================================================
-- Migration: clear corrupt emergency-contact values
-- ============================================================================
--
-- One patient profile carried keyboard-mash junk in both emergency-contact
-- fields — a 21-digit "name" and a 31-digit "number":
--
--   TUPM-23-5009  emergency_contact        = '421412412412414412421'
--                 emergency_contact_number = '2313123123123123124124124124124'
--
-- This predates the enrichment migration (which only wrote the two fields for
-- the patients it lists). Both are cleared to NULL — "not recorded" — rather
-- than inventing a guardian for a named student.
--
-- The WHERE clause is pattern-based, so it can only ever match digit-only
-- strings and cannot damage a real name or phone number.
-- ============================================================================

UPDATE public.patient_profiles
   SET emergency_contact        = NULL,
       emergency_contact_number = NULL,
       updated_at               = now()
 WHERE (emergency_contact        ~ '^[0-9]{6,}$')
    OR (emergency_contact_number ~ '^[0-9]{10,}$');

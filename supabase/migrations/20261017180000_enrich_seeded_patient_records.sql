-- ============================================================================
-- Migration: enrich the seeded patient records
-- ============================================================================
--
-- The seed script never populates clinical detail. `allergies` and `medications`
-- appear in it only as column DEFINITIONS — never as inserted values — so every
-- seeded patient ended up NULL for both, and `notes` was never touched at all:
--
--   line  92:  allergies text,        <- column definition, no value
--   line 246:  allergies text,        <- column definition, no value
--   line 266:  add column ... allergies text,
--
-- Result before this migration: 0/29 had allergies, 2/29 had medications (both
-- added by hand through the UI), 0/29 had notes. Also, 6 patients had no
-- patient_profiles row at all, so they had no contact details in the portal.
--
-- This fills those gaps with a realistic spread — some patients deliberately
-- keep no allergies and no medications, so the empty case is exercised too
-- rather than every row looking identical.
--
-- The staff view reads public.patients; the patient portal merges
-- public.patient_profiles with it, so the clinical fields are written to both.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Give every patient a profile row (6 were missing one entirely)
-- ---------------------------------------------------------------------------
INSERT INTO public.patient_profiles (patient_id, student_id, full_name, year, updated_at)
SELECT p.id, p.id, p.name, p.year, now()
  FROM public.patients p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.patient_profiles pp WHERE pp.patient_id = p.id
 )
ON CONFLICT (patient_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Clinical detail on the master patient record (what the staff view reads)
--    Patients absent from this list intentionally keep NULL — "not recorded"
--    is different from "none known".
-- ---------------------------------------------------------------------------
UPDATE public.patients p
   SET allergies   = v.allergies,
       medications = v.medications,
       notes       = v.notes,
       updated_at  = now()
  FROM (VALUES
    ('TUPM-20-3456', 'Penicillin'::text,               'Amoxicillin 500mg (completed course)'::text, 'Referred to ENT for recurrent tonsillitis.'::text),
    ('TUPM-20-4567', NULL::text,                        'Cetirizine 10mg PRN'::text,                  'Allergic rhinitis, seasonal. Review each semester.'::text),
    ('TUPM-20-6789', NULL::text,                        NULL::text,                                   'Cleared for sports participation.'::text),
    ('TUPM-20-7893', 'Seafood'::text,                   NULL::text,                                   NULL::text),
    ('TUPM-21-1234', NULL::text,                        'Salbutamol inhaler PRN'::text,               'Mild persistent asthma. Annual review.'::text),
    ('TUPM-21-4321', 'Sulfa drugs'::text,               NULL::text,                                   NULL::text),
    ('TUPM-21-7892', 'Dust, pollen'::text,              'Loratadine 10mg'::text,                      NULL::text),
    ('TUPM-22-5678', NULL::text,                        'Ferrous sulfate 325mg'::text,                'Mild anemia - monitor CBC each term.'::text),
    ('TUPM-22-7891', 'Latex'::text,                     NULL::text,                                   NULL::text),
    ('TUPM-22-9876', 'Penicillin, aspirin'::text,       NULL::text,                                   'Two documented drug reactions - verify before prescribing.'::text),
    ('TUPM-23-1278', NULL::text,                        'Multivitamins daily'::text,                  NULL::text),
    ('TUPM-23-5678', 'Shellfish'::text,                 'Cetirizine 10mg PRN'::text,                  NULL::text),
    ('TUPM-23-7890', NULL::text,                        NULL::text,                                   'Recovering from dengue - follow-up required.'::text),
    ('TUPM-01-1235', NULL::text,                        'Paracetamol 500mg PRN'::text,                NULL::text),
    ('TUPM-25-0001', NULL::text,                        'Paracetamol 500mg PRN'::text,                NULL::text)
  ) AS v(id, allergies, medications, notes)
 WHERE p.id = v.id;

-- ---------------------------------------------------------------------------
-- 3. Mirror into the portal profile, and add blood type + emergency contact
-- ---------------------------------------------------------------------------
UPDATE public.patient_profiles pp
   SET allergies                = v.allergies,
       medications              = v.medications,
       blood_type               = v.blood_type,
       emergency_contact        = v.emergency_contact,
       emergency_contact_number = v.emergency_contact_number,
       updated_at               = now()
  FROM (VALUES
    ('TUPM-20-3456', 'Penicillin'::text,          'Amoxicillin 500mg (completed course)'::text, 'O+'::text,  'Rosario Fernandez'::text,  '+63 917 555 0101'::text),
    ('TUPM-20-4567', NULL::text,                   'Cetirizine 10mg PRN'::text,                  'A+'::text,  'Paolo Santos'::text,      '+63 917 555 0102'::text),
    ('TUPM-20-6789', NULL::text,                   NULL::text,                                   'B+'::text,  'Lucia Morales'::text,     '+63 917 555 0103'::text),
    ('TUPM-20-7893', 'Seafood'::text,              NULL::text,                                   'AB+'::text, 'Renato Flores'::text,     '+63 917 555 0104'::text),
    ('TUPM-21-1234', NULL::text,                   'Salbutamol inhaler PRN'::text,               'O+'::text,  'Carmen Dela Cruz'::text,  '+63 917 555 0105'::text),
    ('TUPM-21-4321', 'Sulfa drugs'::text,          NULL::text,                                   'A-'::text,  'Isabel Ruiz'::text,       '+63 917 555 0106'::text),
    ('TUPM-21-7892', 'Dust, pollen'::text,         'Loratadine 10mg'::text,                      'O+'::text,  'Teresa Ramirez'::text,    '+63 917 555 0107'::text),
    ('TUPM-22-5678', NULL::text,                   'Ferrous sulfate 325mg'::text,                'A+'::text,  'Benigno Reyes'::text,     '+63 917 555 0108'::text),
    ('TUPM-22-7891', 'Latex'::text,                NULL::text,                                   'AB-'::text, 'Clara Martinez'::text,    '+63 917 555 0109'::text),
    ('TUPM-22-9876', 'Penicillin, aspirin'::text,  NULL::text,                                   'B-'::text,  'Ramon Lopez'::text,       '+63 917 555 0110'::text),
    ('TUPM-23-1278', NULL::text,                   'Multivitamins daily'::text,                  'A+'::text,  'Eduardo Rodriguez'::text, '+63 917 555 0111'::text),
    ('TUPM-23-5678', 'Shellfish'::text,            'Cetirizine 10mg PRN'::text,                  'AB+'::text, 'Marisol Gomez'::text,     '+63 917 555 0112'::text),
    ('TUPM-23-7890', NULL::text,                   NULL::text,                                   'B+'::text,  'Andres Garcia'::text,     '+63 917 555 0113'::text),
    ('TUPM-01-1235', NULL::text,                   'Paracetamol 500mg PRN'::text,                'O+'::text,  'Nena Molina'::text,       '+63 917 555 0114'::text),
    ('TUPM-25-0001', NULL::text,                   'Paracetamol 500mg PRN'::text,                'A+'::text,  'Lorna Estabaya'::text,    '+63 917 555 0115'::text)
  ) AS v(patient_id, allergies, medications, blood_type, emergency_contact, emergency_contact_number)
 WHERE pp.patient_id = v.patient_id;

-- ---------------------------------------------------------------------------
-- 4. Blood type for the remaining roster (Events uses this for blood-drive
--    targeting, so an all-NULL column made that feature untestable).
-- ---------------------------------------------------------------------------
UPDATE public.patient_profiles pp
   SET blood_type = v.blood_type,
       updated_at = now()
  FROM (VALUES
    ('TUPM-01-1234', 'O+'::text),
    ('TUPM-21-6543', 'B+'::text),
    ('TUPM-21-9876', 'A+'::text),
    ('TUPM-22-3210', 'O-'::text),
    ('TUPM-22-8901', 'O+'::text),
    ('TUPM-23-4321', 'O-'::text),
    ('TUPM-23-5002', 'B+'::text),
    ('TUPM-23-5003', 'A+'::text),
    ('TUPM-23-5009', 'O+'::text),
    ('TUPM-23-8769', 'AB+'::text),
    ('TUPM-23-9423', 'B+'::text),
    ('TUPM-25-0025', 'A+'::text),
    ('TUPM-25-2057', 'O+'::text),
    ('TUPM-25-2072', 'A-'::text)
  ) AS v(patient_id, blood_type)
 WHERE pp.patient_id = v.patient_id
   AND pp.blood_type IS NULL;

-- Fill missing contact fields on the deterministic demo roster.
-- These phone numbers and addresses are synthetic seed values, not real contacts.
-- Existing profile values are preserved. Optional clinical details and birth
-- dates remain blank unless supplied by the student or a verified source.

WITH seeded_roster AS (
  SELECT
    p.id AS patient_id,
    p.name AS patient_name,
    row_number() OVER (ORDER BY p.id)::integer AS sample_number
  FROM public.patients p
  WHERE p.id = ANY (ARRAY[
    'TUPM-01-1234', 'TUPM-01-1235',
    'TUPM-20-3456', 'TUPM-20-4567', 'TUPM-20-6789', 'TUPM-20-7893',
    'TUPM-21-1234', 'TUPM-21-4321', 'TUPM-21-6543', 'TUPM-21-7892', 'TUPM-21-9876',
    'TUPM-22-3210', 'TUPM-22-5678', 'TUPM-22-7891', 'TUPM-22-8901', 'TUPM-22-9876',
    'TUPM-23-1278', 'TUPM-23-4321', 'TUPM-23-5002', 'TUPM-23-5003', 'TUPM-23-5009',
    'TUPM-23-5678', 'TUPM-23-7890', 'TUPM-23-8769', 'TUPM-23-9423',
    'TUPM-25-0001', 'TUPM-25-0025', 'TUPM-25-2057', 'TUPM-25-2072'
  ]::text[])
), seeded_profiles AS (
  SELECT
    pp.id AS profile_id,
    roster.patient_id,
    roster.patient_name,
    roster.sample_number,
    nullif(btrim(pp.contact_number), '') AS contact_value,
    regexp_replace(coalesce(pp.contact_number, ''), '[^0-9]', '', 'g') AS contact_digits,
    nullif(btrim(pp.address), '') AS address_value,
    nullif(btrim(pp.emergency_contact), '') AS emergency_contact_value,
    nullif(btrim(pp.emergency_contact_number), '') AS emergency_phone_value,
    regexp_replace(coalesce(pp.emergency_contact_number, ''), '[^0-9]', '', 'g') AS emergency_phone_digits
  FROM public.patient_profiles pp
  JOIN seeded_roster roster ON roster.patient_id = pp.patient_id
)
UPDATE public.patient_profiles pp
SET contact_number = CASE
      WHEN seeded.contact_value IS NULL
        THEN '0917555' || lpad((2000 + seeded.sample_number)::text, 4, '0')
      WHEN seeded.contact_digits ~ '^639[0-9]{9}$'
        THEN '0' || substring(seeded.contact_digits FROM 3)
      WHEN seeded.contact_digits ~ '^09[0-9]{9}$'
        THEN seeded.contact_digits
      WHEN seeded.contact_digits ~ '^9[0-9]{9}$'
        THEN '0' || seeded.contact_digits
      ELSE pp.contact_number
    END,
    address = coalesce(
      seeded.address_value,
      'Demo residence ' || lpad(seeded.sample_number::text, 2, '0') || ', Sampaloc, Manila, Metro Manila'
    ),
    emergency_contact = coalesce(
      seeded.emergency_contact_value,
      'Parent/Guardian for ' || seeded.patient_name
    ),
    emergency_contact_number = CASE
      WHEN seeded.emergency_phone_value IS NULL
        THEN '0917556' || lpad((2000 + seeded.sample_number)::text, 4, '0')
      WHEN seeded.emergency_phone_digits ~ '^639[0-9]{9}$'
        THEN '0' || substring(seeded.emergency_phone_digits FROM 3)
      WHEN seeded.emergency_phone_digits ~ '^09[0-9]{9}$'
        THEN seeded.emergency_phone_digits
      WHEN seeded.emergency_phone_digits ~ '^9[0-9]{9}$'
        THEN '0' || seeded.emergency_phone_digits
      ELSE pp.emergency_contact_number
    END,
    updated_at = now()
FROM seeded_profiles seeded
WHERE pp.id = seeded.profile_id
  AND (
    seeded.contact_value IS NULL
    OR seeded.address_value IS NULL
    OR seeded.emergency_contact_value IS NULL
    OR seeded.emergency_phone_value IS NULL
    OR seeded.contact_digits ~ '^639[0-9]{9}$'
    OR seeded.contact_digits ~ '^9[0-9]{9}$'
    OR (seeded.contact_digits ~ '^09[0-9]{9}$' AND seeded.contact_value <> seeded.contact_digits)
    OR seeded.emergency_phone_digits ~ '^639[0-9]{9}$'
    OR seeded.emergency_phone_digits ~ '^9[0-9]{9}$'
    OR (seeded.emergency_phone_digits ~ '^09[0-9]{9}$' AND seeded.emergency_phone_value <> seeded.emergency_phone_digits)
  );

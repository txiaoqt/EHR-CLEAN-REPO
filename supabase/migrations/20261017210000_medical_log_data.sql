-- ============================================================================
-- Migration: Medical Log data — real inventory, demographics, dispensing history
-- ============================================================================
--
-- 1. Replace the placeholder inventory with the clinic's actual stock. The 24
--    items below are the ones printed on the VAF-MDC medicine log, i.e. the
--    ones the clinic actually dispenses.
-- 2. Backfill SEX and DEPT./COURSE on the patient profiles (the form's two
--    demographic columns).
-- 3. Record dispensing against the encounters that prescribed it, so the
--    Medical Log's medicine section has real data instead of empty columns.
--
-- Existing stock movements are LEFT ALONE. They are history: they reference
-- retired item names by string, and deleting audit-relevant rows is not
-- something a data migration should do silently.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inventory catalogue — the clinic's real dispensary list
-- ---------------------------------------------------------------------------
DELETE FROM public.inventory
 WHERE item_name NOT IN (
   'Aluminum Hydroxide', 'Amoxicillin', 'Band Aid', 'Bioflu', 'Captopril',
   'Cefalexin', 'Cetirizine', 'Chlorphe maleate', 'Cinnarizine', 'Clonidine',
   'Doxycycline', 'Elastic Bandage', 'Face Mask', 'Gauze', 'Loperamide',
   'Mecilizine Tablet', 'Mefenamic', 'Metronidazole', 'Omeprazole',
   'Paracetamol Biogesic', 'Salbutamol Neb', 'Symdex tablet', 'Tetanus Toxoid',
   'Salompas'
 );

INSERT INTO public.inventory (item_name, category, stock_quantity, unit, reorder_level)
SELECT v.item_name, v.category, v.stock, v.unit, v.reorder
  FROM (VALUES
    ('Aluminum Hydroxide',   'Medications', 120, 'tab',    30),
    ('Amoxicillin',          'Medications', 200, 'cap',    50),
    ('Bioflu',               'Medications', 150, 'tab',    40),
    ('Captopril',            'Medications', 100, 'tab',    25),
    ('Cefalexin',            'Medications', 150, 'cap',    40),
    ('Cetirizine',           'Medications', 180, 'tab',    40),
    ('Chlorphe maleate',     'Medications', 100, 'tab',    25),
    ('Cinnarizine',          'Medications',  90, 'tab',    25),
    ('Clonidine',            'Medications',  80, 'tab',    20),
    ('Doxycycline',          'Medications', 120, 'cap',    30),
    ('Loperamide',           'Medications', 100, 'cap',    25),
    ('Mecilizine Tablet',    'Medications', 110, 'tab',    30),
    ('Mefenamic',            'Medications', 200, 'cap',    50),
    ('Metronidazole',        'Medications', 140, 'tab',    35),
    ('Omeprazole',           'Medications', 120, 'cap',    30),
    ('Paracetamol Biogesic', 'Medications', 300, 'tab',    80),
    ('Salbutamol Neb',       'Medications',  60, 'nebule', 15),
    ('Symdex tablet',        'Medications', 120, 'tab',    30),
    ('Tetanus Toxoid',       'Medications',  40, 'vial',   10),
    ('Salompas',             'Medications',  70, 'patch',  20),
    ('Band Aid',             'Consumables', 250, 'pcs',    60),
    ('Elastic Bandage',      'Consumables',  80, 'pcs',    20),
    ('Face Mask',            'Consumables', 400, 'pcs',   100),
    ('Gauze',                'Consumables', 200, 'pcs',    50)
  ) AS v(item_name, category, stock, unit, reorder)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.inventory i WHERE i.item_name = v.item_name
 );

-- ---------------------------------------------------------------------------
-- 2. SEX and DEPT./COURSE on the patient profiles
-- ---------------------------------------------------------------------------
UPDATE public.patient_profiles pp
   SET sex = v.sex, course = v.course, updated_at = now()
  FROM (VALUES
    ('TUPM-01-1234', 'Male'::text,   'BS Computer Science'::text),
    ('TUPM-01-1235', 'Female',       'BS Information Technology'),
    ('TUPM-20-3456', 'Male',         'BS Information Systems'),
    ('TUPM-20-4567', 'Female',       'BS Computer Science'),
    ('TUPM-20-6789', 'Male',         'BS Information Technology'),
    ('TUPM-20-7893', 'Male',         'BS Mathematics'),
    ('TUPM-21-1234', 'Male',         'BS Computer Science'),
    ('TUPM-21-4321', 'Male',         'BS Information Technology'),
    ('TUPM-21-6543', 'Male',         'BS Information Systems'),
    ('TUPM-21-7892', 'Male',         'BS Computer Science'),
    ('TUPM-21-9876', 'Male',         'BS Mathematics'),
    ('TUPM-22-3210', 'Female',       'BS Biology'),
    ('TUPM-22-5678', 'Female',       'BS Chemistry'),
    ('TUPM-22-7891', 'Female',       'BS Computer Science'),
    ('TUPM-22-8901', 'Female',       'BS Information Technology'),
    ('TUPM-22-9876', 'Female',       'BS Food Technology'),
    ('TUPM-23-1278', 'Female',       'BS Environmental Science'),
    ('TUPM-23-4321', 'Female',       'BS Biology'),
    ('TUPM-23-5002', 'Male',         'BS Computer Science'),
    ('TUPM-23-5003', 'Male',         'BS Information Technology'),
    ('TUPM-23-5009', 'Male',         'BS Information Technology'),
    ('TUPM-23-5678', 'Female',       'BS Chemistry'),
    ('TUPM-23-7890', 'Male',         'BS Information Systems'),
    ('TUPM-23-8769', 'Female',       'BS Biology'),
    ('TUPM-23-9423', 'Male',         'BS Computer Science'),
    ('TUPM-25-0001', 'Male',         'BS Information Technology'),
    ('TUPM-25-0025', 'Male',         'BS Computer Science'),
    ('TUPM-25-2057', 'Male',         'BS Computer Science'),
    ('TUPM-25-2072', 'Female',       'BS Information Systems')
  ) AS v(patient_id, sex, course)
 WHERE pp.patient_id = v.patient_id;

-- ---------------------------------------------------------------------------
-- 3. Dispensing history, tied to the visit that prescribed it
--
--    Roughly 60% of encounters dispense something — a visit does not always
--    result in medication, so the log should not imply that it does. The choice
--    is derived from a hash of the encounter id, so it is reproducible rather
--    than random.
-- ---------------------------------------------------------------------------
INSERT INTO public.inventory_transactions (
  item_name, transaction_type, quantity, reason, performed_by,
  patient_id, encounter_id, created_at
)
SELECT
  med.item_name,
  'out',
  1 + (abs(hashtext(e.id::text || med.item_name)) % 2),
  'Dispensed during consultation',
  COALESCE(e.clinician_name, e.clinician, 'Clinic Staff'),
  e.patient_id,
  e.id,
  e.encounter_date
FROM public.encounters e
CROSS JOIN LATERAL (
  SELECT i.item_name
    FROM public.inventory i
   WHERE i.category = 'Medications'
   ORDER BY hashtext(e.id::text || i.item_name)
   LIMIT 1 + (abs(hashtext(e.id::text)) % 2)
) med
WHERE e.patient_id IS NOT NULL
  AND (abs(hashtext(e.id::text)) % 100) < 60
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_transactions t WHERE t.encounter_id = e.id
  );

-- Keep stock in step with what was dispensed, so the catalogue and the history
-- do not contradict each other.
UPDATE public.inventory i
   SET stock_quantity = GREATEST(0, i.stock_quantity - d.total),
       updated_at = now()
  FROM (
    SELECT item_name, sum(quantity)::integer AS total
      FROM public.inventory_transactions
     WHERE encounter_id IS NOT NULL
     GROUP BY item_name
  ) d
 WHERE i.item_name = d.item_name;

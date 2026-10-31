-- 20261019115240 filled the demo roster's empty emergency contacts with generated
-- values ("Parent/Guardian for <name>", 0917556xxxx). Students never entered
-- them, so forms showed made-up contacts; clear exactly those generated values.
update public.patient_profiles
set emergency_contact = case when emergency_contact like 'Parent/Guardian for %' then null else emergency_contact end,
    emergency_contact_number = case when emergency_contact_number ~ '^0917556[0-9]{4}$' then null else emergency_contact_number end,
    updated_at = now()
where emergency_contact like 'Parent/Guardian for %' or emergency_contact_number ~ '^0917556[0-9]{4}$';

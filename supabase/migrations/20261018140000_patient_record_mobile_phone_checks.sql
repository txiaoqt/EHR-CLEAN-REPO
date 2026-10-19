-- Philippine mobile numbers entered on the Patient Record Form:
-- exactly 11 digits, starting with 09. NOT VALID avoids scanning/rejecting
-- existing rows at migration time while enforcing the rule on every new or
-- updated record. The client strips pasted spaces/dashes before submission.
alter table public.patient_record_forms
  drop constraint if exists patient_record_forms_cell_phone_ph_mobile;
alter table public.patient_record_forms
  add constraint patient_record_forms_cell_phone_ph_mobile
  check (cell_phone is null or cell_phone ~ '^09[0-9]{9}$')
  not valid;

alter table public.patient_record_forms
  drop constraint if exists patient_record_forms_guardian_cp_ph_mobile;
alter table public.patient_record_forms
  add constraint patient_record_forms_guardian_cp_ph_mobile
  check (guardian_cp is null or guardian_cp ~ '^09[0-9]{9}$')
  not valid;

-- Archive for patients who graduated, left TUP, or whose account was deleted.
-- Records are retained (they are medical records); an archived patient only
-- leaves the active Patients list. Staff with patient update access (admin,
-- physician, nurse) archive and restore through the existing update policy.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- Deleting a user account (admin_delete_account) sets users.active = false.
-- That archives the patient as 'Account deleted'; a new sign-up for the same
-- patient restores them.
CREATE OR REPLACE FUNCTION private.sync_patient_archive_with_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.active IS FALSE AND (TG_OP = 'INSERT' OR OLD.active IS DISTINCT FROM FALSE) THEN
    UPDATE public.patients SET archived_at = now(), archived_reason = 'Account deleted'
     WHERE id = NEW.patient_id AND archived_at IS NULL;
  ELSIF NEW.active IS TRUE THEN
    UPDATE public.patients SET archived_at = NULL, archived_reason = NULL
     WHERE id = NEW.patient_id AND archived_reason = 'Account deleted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_patient_archive_with_account ON public.users;
CREATE TRIGGER trg_sync_patient_archive_with_account
  AFTER INSERT OR UPDATE OF active ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.sync_patient_archive_with_account();

-- Accounts already deleted before this migration.
UPDATE public.patients p SET archived_at = now(), archived_reason = 'Account deleted'
 WHERE p.archived_at IS NULL
   AND EXISTS (SELECT 1 FROM public.users u WHERE u.patient_id = p.id AND NOT u.active)
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.patient_id = p.id AND u.active);

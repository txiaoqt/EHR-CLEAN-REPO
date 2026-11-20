-- Allow system administrators to remove clinic staff accounts through the same
-- staged, retryable flow used for administrators and patient portal accounts.
ALTER TABLE private.admin_account_deletions
  DROP CONSTRAINT admin_account_deletions_target_kind_check;
ALTER TABLE private.admin_account_deletions
  ADD CONSTRAINT admin_account_deletions_target_kind_check
  CHECK (target_kind IN ('invitation','administrator','staff','user'));

-- Match the stale-send recovery window used by admin_delete_account. A recent
-- invitation send remains protected; an abandoned send can be revoked/deleted.
CREATE OR REPLACE FUNCTION private.guard_invitation_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF tg_op = 'UPDATE'
     AND old.status = 'sending'
     AND new.status = 'revoked'
     AND old.last_sent_at > now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'This invitation is being sent. Wait for delivery to finish before revoking or deleting it.';
  END IF;
  IF new.status IN ('sending','pending','accepted') AND EXISTS (
    SELECT 1
    FROM private.admin_account_deletions d
    WHERE d.completed_at IS NULL
      AND (d.email = new.email OR d.auth_user_id = new.auth_user_id
        OR (d.target_kind = 'invitation' AND d.target_id = new.id))
  ) THEN
    RAISE EXCEPTION 'Deletion is incomplete for this account. Finish deleting it before sending another invitation.';
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(
  p_actor uuid,
  p_kind text,
  p_target uuid,
  p_confirmation_email text,
  p_stage text DEFAULT 'prepare'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request private.admin_account_deletions;
  v_inv private.staff_invitations;
  v_profile public.admins;
  v_auth uuid;
  v_actor_name text;
  v_email text;
  v_name text;
  v_role text;
  v_enrollee public.enrollees;
  v_patient public.users;
  v_auth_row auth.users;
BEGIN
  IF p_kind NOT IN ('invitation','administrator','staff','user') OR p_kind IS NULL
     OR p_stage NOT IN ('prepare','complete') OR p_stage IS NULL OR p_target IS NULL THEN
    RAISE EXCEPTION 'Choose an account or invitation to delete.';
  END IF;

  -- Serialize deletions and recheck authority after waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended('system-admin-account-deletion',0));
  IF NOT private.is_system_admin(p_actor) THEN
    RAISE EXCEPTION 'System administrator access required.' USING errcode='42501';
  END IF;
  SELECT name INTO v_actor_name FROM public.admins WHERE auth_user_id=p_actor;
  SELECT * INTO v_request FROM private.admin_account_deletions
    WHERE target_kind=p_kind AND target_id=p_target FOR UPDATE;
  IF v_request.target_id IS NOT NULL THEN
    IF lower(trim(coalesce(p_confirmation_email,'')))<>v_request.email THEN
      RAISE EXCEPTION 'Type the account email address to confirm deletion.';
    END IF;
    IF v_request.completed_at IS NOT NULL THEN
      RETURN jsonb_build_object('completed',true);
    END IF;
  ELSIF p_stage='complete' THEN
    RAISE EXCEPTION 'Start the deletion before completing it.';
  ELSE
    IF p_kind='invitation' THEN
      SELECT * INTO v_inv FROM private.staff_invitations WHERE id=p_target FOR UPDATE;
      IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invitation not found. Refresh the list.'; END IF;
      IF v_inv.status='accepted' THEN
        RAISE EXCEPTION 'An accepted invitation cannot be deleted here. Manage its account instead.';
      END IF;
      IF v_inv.status='sending' AND v_inv.last_sent_at > now() - interval '2 minutes' THEN
        RAISE EXCEPTION 'This invitation is being sent. Wait for delivery to finish, then refresh and try again.';
      END IF;
      v_email:=v_inv.email;
      v_name:=v_inv.name;
      v_role:=v_inv.role;
      -- Recovery is limited to this exact, unaccepted invitation.
      v_auth:=public.admin_invitation_auth_user(p_actor,v_inv.id);
      SELECT * INTO v_profile FROM public.admins WHERE auth_user_id=v_auth FOR UPDATE;
      IF v_profile.id IS NOT NULL AND (v_profile.active OR v_profile.role<>v_inv.role) THEN
        RAISE EXCEPTION 'This invitation is linked to an existing account. Manage that account instead.';
      END IF;
      IF EXISTS(SELECT 1 FROM private.staff_invitations WHERE auth_user_id=v_auth AND status='accepted') THEN
        RAISE EXCEPTION 'This account has already accepted an invitation. Manage that account instead.';
      END IF;
    ELSIF p_kind='user' THEN
      SELECT * INTO v_auth_row FROM auth.users WHERE id=p_target FOR UPDATE;
      IF v_auth_row.id IS NULL OR v_auth_row.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'This sign-in no longer exists. Refresh the directory.';
      END IF;
      IF EXISTS(SELECT 1 FROM public.admins WHERE auth_user_id=p_target)
         OR EXISTS(SELECT 1 FROM private.staff_invitations WHERE auth_user_id=p_target) THEN
        RAISE EXCEPTION 'Staff and administrator sign-ins cannot be deleted from User Accounts.';
      END IF;
      SELECT * INTO v_patient FROM public.users WHERE auth_user_id=p_target FOR UPDATE;
      SELECT * INTO v_enrollee FROM public.enrollees WHERE auth_user_id=p_target FOR UPDATE;
      IF v_patient.id IS NULL AND v_enrollee.id IS NULL
         AND coalesce(v_auth_row.raw_user_meta_data->>'role','') NOT IN ('patient','enrollee') THEN
        RAISE EXCEPTION 'No patient or enrollee sign-in is linked to this account.';
      END IF;
      v_auth:=p_target;
      v_email:=lower(v_auth_row.email);
      v_role:=CASE WHEN v_patient.id IS NOT NULL THEN 'patient'
        WHEN v_enrollee.id IS NOT NULL THEN 'enrollee'
        ELSE v_auth_row.raw_user_meta_data->>'role' END;
      v_name:=coalesce(v_patient.name,
        nullif(concat_ws(' ',v_enrollee.first_name,v_enrollee.middle_name,v_enrollee.surname,v_enrollee.suffix),''),
        v_auth_row.raw_user_meta_data->>'name',v_email);
      v_profile.id:=coalesce(v_enrollee.id,v_patient.id);
    ELSE
      -- Lock invitations before profiles, matching invitation completion.
      PERFORM 1
      FROM private.staff_invitations i
      JOIN public.admins a ON a.auth_user_id=i.auth_user_id
      WHERE a.id=p_target
      ORDER BY i.id
      FOR UPDATE OF i;
      SELECT * INTO v_profile
      FROM public.admins
      WHERE id=p_target
        AND ((p_kind='administrator' AND role='admin')
          OR (p_kind='staff' AND role IN ('physician','nurse','dentist','clerk')))
      FOR UPDATE;
      IF v_profile.id IS NULL THEN
        IF p_kind='staff' THEN RAISE EXCEPTION 'Staff account not found. Refresh the directory.'; END IF;
        RAISE EXCEPTION 'Administrator not found. Refresh the list.';
      END IF;
      v_auth:=v_profile.auth_user_id;
      v_email:=lower(v_profile.email);
      v_name:=v_profile.name;
      v_role:=v_profile.role;
      IF p_kind='administrator' THEN
        IF v_auth=p_actor THEN RAISE EXCEPTION 'You cannot delete your own administrator account.'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.admins a WHERE a.role='admin' AND a.active
          AND a.id<>p_target AND a.auth_user_id IS NOT NULL
          AND NOT private.account_is_suspended(a.auth_user_id)) THEN
          RAISE EXCEPTION 'At least one active administrator must remain.';
        END IF;
        IF EXISTS(SELECT 1 FROM private.staff_invitations
          WHERE auth_user_id=v_auth AND status<>'accepted') AND NOT v_profile.active THEN
          RAISE EXCEPTION 'Delete this administrator''s unaccepted invitation instead.';
        END IF;
      ELSIF EXISTS(SELECT 1 FROM private.staff_invitations
          WHERE auth_user_id=v_auth AND status<>'accepted') AND NOT v_profile.active THEN
        RAISE EXCEPTION 'Delete this staff member''s unaccepted invitation instead.';
      END IF;
    END IF;

    IF v_auth=p_actor THEN RAISE EXCEPTION 'You cannot delete your own account.'; END IF;
    IF lower(trim(coalesce(p_confirmation_email,'')))<>v_email THEN
      RAISE EXCEPTION 'Type the account email address to confirm deletion.';
    END IF;
    IF p_kind<>'user' AND (EXISTS(SELECT 1 FROM public.users WHERE auth_user_id=v_auth)
      OR EXISTS(SELECT 1 FROM public.enrollees WHERE auth_user_id=v_auth)) THEN
      RAISE EXCEPTION 'This sign-in is also linked to a patient or enrollee. It cannot be deleted here.';
    END IF;

    INSERT INTO private.admin_account_deletions
      (target_kind,target_id,auth_user_id,profile_id,name,email,role,requested_by)
    VALUES (p_kind,p_target,v_auth,v_profile.id,v_name,v_email,v_role,p_actor)
    RETURNING * INTO v_request;
    IF p_kind='user' THEN
      UPDATE public.users SET active=false,updated_at=now() WHERE auth_user_id=v_auth;
    ELSE
      UPDATE public.admins SET active=false,updated_at=now() WHERE id=v_profile.id;
    END IF;
    UPDATE private.staff_invitations SET status='revoked'
      WHERE status<>'accepted' AND (id=v_inv.id OR auth_user_id=v_auth);
    IF v_auth IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=v_auth) THEN
      INSERT INTO private.account_controls(user_id,suspended,suspension_reason,suspended_at,suspended_by)
        VALUES(v_auth,true,'Account deletion requested',now(),p_actor)
        ON CONFLICT(user_id) DO UPDATE SET suspended=true,suspension_reason=excluded.suspension_reason,
          suspended_at=now(),suspended_by=p_actor,suspended_until=null,updated_at=now();
      DELETE FROM auth.sessions WHERE user_id=v_auth;
    END IF;
    INSERT INTO public.audit_logs(user_name,action,description,meta)
    VALUES (v_actor_name,'ADMIN_DELETION_REQUESTED','Deletion requested for '||v_name||'.',
      jsonb_build_object('actor_user_id',p_actor,'target_kind',p_kind,'target_user_id',v_auth,
        'profile_id',v_profile.id,'invitation_id',v_inv.id,'target_email',v_email,
        'target_name',v_name,'role',v_role));
  END IF;

  IF p_stage='complete' THEN
    IF EXISTS(SELECT 1 FROM auth.users WHERE id=v_request.auth_user_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'The sign-in has not been deleted yet. Retry deletion.';
    END IF;
    -- Patient account deletion purges clinic data; staff and administrator
    -- profile deletion retains clinical records and historical audit snapshots.
    IF p_kind='user' THEN
      PERFORM private.purge_account_data(v_request.auth_user_id);
    ELSE
      DELETE FROM public.admins WHERE id=v_request.profile_id;
    END IF;
    DELETE FROM private.account_controls WHERE user_id=v_request.auth_user_id;
    DELETE FROM private.staff_invitations
      WHERE auth_user_id=v_request.auth_user_id OR (p_kind='invitation' AND id=p_target);
    UPDATE private.admin_account_deletions SET completed_at=now()
      WHERE target_kind=p_kind AND target_id=p_target;
    INSERT INTO public.audit_logs(user_name,action,description,meta)
    VALUES (v_actor_name,
      CASE WHEN p_kind='invitation' THEN 'STAFF_INVITATION_DELETED'
        WHEN p_kind='user' THEN 'ADMIN_USER_ACCOUNT_DELETED'
        WHEN p_kind='staff' THEN 'ADMIN_STAFF_ACCOUNT_DELETED'
        ELSE 'ADMIN_ACCOUNT_DELETED' END,
      CASE WHEN p_kind='invitation' THEN 'Unaccepted invitation deleted for '
        WHEN p_kind='user' THEN 'User account and clinic data deleted for '
        WHEN p_kind='staff' THEN 'Staff account deleted for '
        ELSE 'Administrator account deleted for ' END||v_request.name||'.',
      jsonb_build_object('actor_user_id',p_actor,'target_kind',p_kind,
        'target_user_id',v_request.auth_user_id,'profile_id',v_request.profile_id,
        'invitation_id',CASE WHEN p_kind='invitation' THEN p_target END,
        'target_email',v_request.email,'target_name',v_request.name,'role',v_request.role));
    RETURN jsonb_build_object('completed',true);
  END IF;
  RETURN jsonb_build_object('completed',false,'auth_user_id',v_request.auth_user_id,
    'auth_deleted',NOT EXISTS(SELECT 1 FROM auth.users
      WHERE id=v_request.auth_user_id AND deleted_at IS NULL));
END;
$function$;

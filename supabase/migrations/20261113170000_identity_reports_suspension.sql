-- A suspended user's open portal is told it was suspended instead of being
-- signed out silently (suspension revokes sessions, so the live-session check
-- used to return null before the suspension check ran).
CREATE OR REPLACE FUNCTION public.get_my_portal_identity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid(); v_profile jsonb; v_inv private.staff_invitations; v_meta jsonb; v_email text;
begin
  if v_id is null then return null; end if;
  -- Before the live-session check: suspending revokes every session, and the
  -- open portal still has to learn why it is being signed out.
  if private.account_is_suspended(v_id) then
    return jsonb_build_object('active',false,'access_message','Your account is suspended. Contact the clinic administrator.');
  end if;
  if not private.session_is_live() then return null; end if;
  select jsonb_build_object('id',a.id,'auth_user_id',a.auth_user_id,'name',a.name,
    'email',a.email,'avatar',a.avatar,'role',a.role,'active',a.active,
    'department',a.department,'clearance_level',a.clearance_level,'locked_until',a.locked_until,
    'page_access',(select to_jsonb(r.pages) from public.role_page_access r where r.role=a.role))
    into v_profile from public.admins a where a.auth_user_id=v_id;
  if v_profile is not null then
    select * into v_inv from private.staff_invitations where auth_user_id=v_id
      order by created_at desc limit 1;
    if v_inv.status in ('sending','pending','revoked','failed') then
      if v_inv.status='pending' and v_inv.expires_at>now()
        and not private.account_is_suspended(v_id) then
        return v_profile || jsonb_build_object('active',true,'staff_setup_required',true,
          'invitation_id',v_inv.id,'invitation_expires_at',v_inv.expires_at);
      end if;
      return v_profile || jsonb_build_object('active',false,'access_message','This invitation has expired or was revoked. Ask the administrator for a new invitation.');
    end if;
  else
    select jsonb_build_object('id',u.id,'auth_user_id',u.auth_user_id,'name',u.name,
      'email',u.email,'avatar',coalesce(u.avatar,p.avatar_url),'role','patient',
      'active',u.active,'patient_id',u.patient_id,'locked_until',u.locked_until)
      into v_profile from public.users u left join public.patient_profiles p on p.patient_id=u.patient_id
      where u.auth_user_id=v_id limit 1;
    if v_profile is null then
      select jsonb_build_object('id',e.id,'auth_user_id',e.auth_user_id,
        'name',concat_ws(' ',e.first_name,e.middle_name,e.surname,e.suffix),
        'email',e.personal_email,'role','enrollee','active',e.status<>'elevated',
        'enrollee_status',e.status,'applicant_id',e.applicant_id,'elevated',e.status='elevated',
        'tup_email',e.tup_email,'elevated_student_id',e.elevated_student_id)
        into v_profile from public.enrollees e where e.auth_user_id=v_id;
    end if;
  end if;
  if v_profile is null then
    select raw_user_meta_data,email into v_meta,v_email from auth.users where id=v_id;
    if v_meta->>'role' in ('patient','enrollee') then
      v_profile:=jsonb_build_object('id',v_id,'auth_user_id',v_id,'email',v_email,
        'name',coalesce(v_meta->>'name',v_email),'role',v_meta->>'role','active',true,
        'enrollee_status','incomplete','patient_id',v_meta->>'patient_id',
        'first_name',v_meta->>'first_name','middle_name',v_meta->>'middle_name',
        'surname',v_meta->>'surname','suffix',v_meta->>'suffix',
        'date_of_birth',v_meta->>'date_of_birth','applicant_id',v_meta->>'applicant_id');
    else return null; end if;
  end if;
  return v_profile || jsonb_build_object('must_change_password',coalesce(
    (select must_change_password from private.account_controls where user_id=v_id),false));
end;
$function$;

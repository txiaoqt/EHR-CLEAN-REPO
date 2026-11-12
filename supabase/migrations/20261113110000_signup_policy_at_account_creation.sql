-- Sign-up can send the verification code before the policies are agreed to.
-- The agreement is now recorded at Create Account, after the email is verified,
-- instead of being required when the code is sent (the step that creates the
-- Auth account). Portal acceptance at first sign-in is unchanged.
create or replace function private.app_policy_capture_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_version text;
  v_signup jsonb;
begin
  -- Only accounts created after this migration enter the new-account cohort.
  insert into private.app_policy_accounts(user_id) values (new.id);
  if coalesce(lower(new.raw_user_meta_data->>'role'), '') not in ('patient', 'enrollee') then
    return new;
  end if;
  if new.raw_app_meta_data->'policy_signup_exempt' = 'true'::jsonb then return new; end if;

  -- Older clients still send the agreement with the code; record it when valid.
  select version into v_version from public.app_policy_versions where is_active;
  v_signup := new.raw_user_meta_data->'policy_agreement';
  if v_version is not null and v_signup->>'version' = v_version
    and v_signup->'accepted_terms' = 'true'::jsonb
    and v_signup->'accepted_privacy' = 'true'::jsonb then
    insert into private.app_policy_acceptances(user_id, policy_version, stage, accepted_terms, accepted_privacy)
      values (new.id, v_version, 'signup', true, true);
  end if;
  return new;
end;
$$;
revoke all on function private.app_policy_capture_signup() from public, anon, authenticated;

-- Called by the sign-up form at Create Account, once the code is verified.
create or replace function public.record_signup_policy_agreement(p_policy_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version text;
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = v_uid
    and lower(raw_user_meta_data->>'role') in ('patient', 'enrollee')) then
    raise exception 'Only patient and enrollee sign-ups record this agreement.' using errcode = '42501';
  end if;
  select version into v_version from public.app_policy_versions where is_active;
  if v_version is null or p_policy_version is distinct from v_version then
    raise exception 'POLICY_VERSION_CHANGED';
  end if;
  insert into private.app_policy_acceptances(user_id, policy_version, stage, accepted_terms, accepted_privacy)
    values (v_uid, v_version, 'signup', true, true)
    on conflict do nothing;
end;
$$;
revoke all on function public.record_signup_policy_agreement(text) from public, anon;
grant execute on function public.record_signup_policy_agreement(text) to authenticated;

-- =============================================================================
-- Completing an enrollee's registration
-- =============================================================================
--
-- The counterpart to complete_patient_registration, which cannot be reused: that
-- function requires the caller's address to end in @tup.edu.ph, which is exactly
-- what an enrollee does not have.
--
-- Signup runs in two steps, mirroring the patient flow:
--   1. auth.signUp with role 'enrollee' in the metadata, which sends the OTP.
--      sync_public_user_from_auth deliberately skips an unrecognised role, so no
--      patient row is created — verified by reading that trigger, not assumed.
--   2. This function, after the OTP is confirmed, which writes the enrollee row.
--
-- The email-verification check is not decoration. Without it, calling this RPC
-- with any signed-in session would create an enrollee row for an unconfirmed
-- address, and the whole point of the OTP is that the address is real.

create or replace function public.complete_enrollee_registration(
  p_first_name text,
  p_middle_name text,
  p_surname text,
  p_date_of_birth date,
  p_applicant_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_confirmed_at timestamptz;
  v_first text := trim(coalesce(p_first_name, ''));
  v_middle text := nullif(trim(coalesce(p_middle_name, '')), '');
  v_surname text := trim(coalesce(p_surname, ''));
  v_applicant text := nullif(upper(trim(coalesce(p_applicant_id, ''))), '');
begin
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required. Please verify your code first.');
  end if;

  select lower(email), email_confirmed_at
    into v_auth_email, v_confirmed_at
  from auth.users
  where id = v_auth_uid;

  if v_auth_email is null then
    return jsonb_build_object('success', false, 'error', 'Account not found.');
  end if;

  -- An enrollee may hold a @tup.edu.ph address only after elevation, so that
  -- address must go through the elevation flow rather than this one.
  if v_auth_email like '%@tup.edu.ph' then
    return jsonb_build_object(
      'success', false,
      'error', 'This address is already a TUP account. Use the enrolled student sign-in instead.'
    );
  end if;

  if v_confirmed_at is null then
    return jsonb_build_object('success', false, 'error', 'Please verify your email address before continuing.');
  end if;

  if length(v_first) < 1 or length(v_surname) < 1 then
    return jsonb_build_object('success', false, 'error', 'First name and surname are required.');
  end if;
  if length(v_first) > 80 or length(v_surname) > 80 or length(coalesce(v_middle, '')) > 80 then
    return jsonb_build_object('success', false, 'error', 'A name field is too long.');
  end if;

  if p_date_of_birth is null then
    return jsonb_build_object('success', false, 'error', 'Date of birth is required.');
  end if;
  -- Sanity bounds rather than a rule about who may enrol: nobody applying to
  -- college was born in the future, and a 1900 birth date is a typo.
  if p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01' then
    return jsonb_build_object('success', false, 'error', 'Please check the date of birth.');
  end if;

  -- The applicant id is NOT validated against any list, deliberately: the
  -- admissions list is published, so checking it would prove nothing, and the
  -- clinic curates the queue by review and deletion. It is recorded the same way
  -- a TUPM id is recorded for an enrolled student.
  if v_applicant is not null and length(v_applicant) > 32 then
    return jsonb_build_object('success', false, 'error', 'The applicant ID is too long.');
  end if;

  -- One account per address, and a repeat call is a retry rather than a second
  -- enrollee. Both are enforced by the table; this makes the retry succeed
  -- quietly instead of surfacing a constraint error to the applicant.
  insert into public.enrollees (
    auth_user_id, personal_email, applicant_id,
    first_name, middle_name, surname, date_of_birth
  )
  values (
    v_auth_uid, v_auth_email, v_applicant,
    v_first, v_middle, v_surname, p_date_of_birth
  )
  on conflict (auth_user_id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    surname = excluded.surname,
    date_of_birth = excluded.date_of_birth,
    applicant_id = coalesce(excluded.applicant_id, public.enrollees.applicant_id),
    updated_at = now();

  return jsonb_build_object('success', true);
exception
  when unique_violation then
    -- The address is already on another enrollee record. Reachable only by a
    -- genuine clash, since the same account retrying hits the conflict clause
    -- above rather than this.
    return jsonb_build_object(
      'success', false,
      'error', 'An enrollee account already exists for this email address.'
    );
end;
$$;

grant execute on function public.complete_enrollee_registration(text, text, text, date, text)
  to authenticated;

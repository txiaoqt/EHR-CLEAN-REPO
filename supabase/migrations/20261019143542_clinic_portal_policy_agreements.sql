-- Versioned portal agreements. Existing accounts are not backfilled.
-- The JSON below is the immutable v1 snapshot from supabase/policies/clinic-portal-v1.json.
-- New policy text must be published under a new version, not edited in place.
create table public.app_policy_versions (
  version text primary key check (length(btrim(version)) > 0),
  title text not null,
  effective_date date not null,
  terms jsonb not null check (jsonb_typeof(terms) = 'array' and jsonb_array_length(terms) > 0),
  privacy jsonb not null check (jsonb_typeof(privacy) = 'array' and jsonb_array_length(privacy) > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index app_policy_versions_one_active on public.app_policy_versions (is_active) where is_active;
alter table public.app_policy_versions enable row level security;
revoke all on public.app_policy_versions from public, anon, authenticated;
grant select on public.app_policy_versions to anon, authenticated;
create policy app_policy_versions_read on public.app_policy_versions for select to anon, authenticated using (true);

create table private.app_policy_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  required_from timestamptz not null default now()
);
create table private.app_policy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null references public.app_policy_versions(version),
  stage text not null check (stage in ('signup', 'portal')),
  accepted_terms boolean not null check (accepted_terms),
  accepted_privacy boolean not null check (accepted_privacy),
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_version, stage)
);
create index app_policy_acceptances_version on private.app_policy_acceptances(policy_version);
alter table private.app_policy_accounts enable row level security;
alter table private.app_policy_acceptances enable row level security;
revoke all on private.app_policy_accounts, private.app_policy_acceptances from public, anon, authenticated;
comment on table private.app_policy_acceptances is
  'Immutable server-timestamped evidence; signup acknowledgement is separate from portal acceptance. No direct client writes.';

insert into public.app_policy_versions(version, title, effective_date, terms, privacy, is_active)
select doc->>'version', doc->>'title', (doc->>'effective_date')::date, doc->'terms', doc->'privacy', true
from (select $clinic_policy_v1$
{
  "version": "1.0",
  "effective_date": "2026-10-19",
  "title": "TUP Clinic Portal policies",
  "terms": [
    {
      "heading": "About the portal",
      "paragraphs": [
        "These Terms of Service govern your use of the TUP Manila Clinic portal for student and enrollee accounts. The portal supports account registration, appointment booking, clinic inquiries, health records, visit acknowledgements, and enrollee medical certificate submission and review.",
        "By agreeing, you accept these rules for using the portal. The Privacy Policy explains how information is handled. Acknowledging that notice is separate from consent to a medical procedure or any optional use of your information."
      ]
    },
    {
      "heading": "Your account and information",
      "paragraphs": [
        "Use your own identity and an email address you control. Provide accurate student or applicant details and report errors to the clinic. Keep passwords and verification codes private, and sign out when using a shared device.",
        "Submit information about another person, including an emergency contact, only when you are authorized to provide it and have informed them where appropriate. If you are a minor and need help understanding these terms or providing health information, ask a parent or guardian and the clinic for assistance."
      ]
    },
    {
      "heading": "Appointments, inquiries, and clinical decisions",
      "paragraphs": [
        "An appointment request is subject to the clinic's availability and recorded booking status. Booking, uploading a document, or sending an inquiry does not guarantee a consultation, medical clearance, prescription, certificate approval, or account elevation.",
        "The portal is not monitored as an emergency service. For urgent care, go directly to the clinic or the nearest emergency department. Online descriptions, photos, status labels, and record summaries do not replace a clinician's examination, advice, or official decision."
      ]
    },
    {
      "heading": "Health details, documents, and visit acknowledgements",
      "paragraphs": [
        "Share only relevant, accurate information and readable files that you are entitled to submit. Optional appointment photos and optional health disclosures may be left blank. The clinic record form is optional for enrolled students and remains part of the enrollee requirements shown in the portal.",
        "A recorded visit acknowledgement confirms that you reviewed that visit record, including any medicines listed. It can be requested even when no medicine was given. Read the record before signing and contact the clinic if it is incorrect. This acknowledgement is not consent to unrelated treatment and does not waive your rights."
      ]
    },
    {
      "heading": "Acceptable use",
      "items": [
        "Do not impersonate another person or submit forged, misleading, or unauthorized records.",
        "Do not share another person's health information without authority.",
        "Do not attempt to bypass access controls, change another person's records, introduce harmful files, or disrupt the service.",
        "Do not use clinic messaging to harass others or send unlawful or unrelated material."
      ],
      "paragraphs": [
        "The clinic may restrict an account to investigate misuse, protect information, or meet an official requirement. Contact the clinic to ask about a restriction or correct information."
      ]
    },
    {
      "heading": "Availability and electronic records",
      "paragraphs": [
        "Access may be limited by clinic hours, account eligibility, maintenance, network availability, or your assigned role. Keep copies of documents you need. If an online action cannot be completed, contact the clinic through its official channels.",
        "The system records the policy version and the time of your agreement. Account actions, appointment updates, submitted files, messages, and visit acknowledgements may also form part of clinic records. Portal records remain subject to clinical review, applicable law, and institutional records procedures."
      ]
    },
    {
      "heading": "Declining, changes, and questions",
      "paragraphs": [
        "You may decline before creating an account. If you decline the required agreement after signing in, you will be signed out and cannot continue to the portal. Contact the clinic about access to services through another channel; declining these portal terms is not a waiver of your rights or an instruction to destroy clinical records.",
        "Material policy changes will be identified by a new version. Accounts subject to this agreement will be asked to review and accept the current version before continuing. For questions about these terms, contact the TUP Manila University Medical and Dental Clinic using the University's official contact directory."
      ]
    }
  ],
  "privacy": [
    {
      "heading": "Who handles your information",
      "paragraphs": [
        "This notice describes information handled through the TUP Manila Clinic portal for clinic services and enrollee medical requirements. TUP Manila, through its University Medical and Dental Clinic and authorized university personnel, is responsible for the institutional records processed through this service.",
        "For privacy questions, requests to exercise your rights, or the University's designated data protection contact, approach the clinic or use TUP Manila's official contact directory: https://www.tup.edu.ph/page/contact-us. The clinic is listed under Medical/Dental, local 607."
      ]
    },
    {
      "heading": "Information processed through the portal",
      "items": [
        "Account and identity details: name, email address, student or applicant identifier, birthday, degree or course, year level, and other registration information you provide.",
        "Contact details: phone numbers, addresses, and emergency contacts you submit.",
        "Health and visit details: relevant health history, allergies, medications, conditions or disability information you choose to share, complaints, appointment descriptions and photos, clinician notes, vital signs, medicines recorded for a visit, and visit acknowledgement signatures.",
        "Enrollee requirements: clinic record forms, medical certificate files, review status and remarks, and account elevation records.",
        "Service and security records: inquiries and attachments, appointment activity, authentication and verification events, audit records, and the policy version and server-recorded time of agreement."
      ]
    },
    {
      "heading": "Purposes and basis for processing",
      "paragraphs": [
        "Information is used to identify the correct patient or applicant, verify accounts and enrollee requirements, arrange visits, prepare for consultations, provide and document care, communicate with you, manage medicine dispensing, and maintain authorized clinic reports and records. It is also used to protect accounts and investigate errors or misuse.",
        "Health information is sensitive personal information. The clinic must process personal information on a lawful basis under the Data Privacy Act of 2012 and applicable rules. Depending on the activity, this may involve providing medical care under appropriate safeguards, fulfilling a legal or official duty, protecting life and health, or obtaining specific consent where required. This portal acknowledgement does not authorize every possible use of your information."
      ]
    },
    {
      "heading": "Required and optional information",
      "paragraphs": [
        "Required fields are identified in the relevant process. If required information is missing, the related online request may not be completed. Appointment photos, optional health disclosures, and the clinic record form for enrolled students may be left blank. Enrollee requirements are identified separately.",
        "Choosing not to provide an optional photo or optional health disclosure does not by itself prevent portal access. Do not upload information about someone else or unrelated documents unless the clinic has requested them and you have authority to provide them."
      ]
    },
    {
      "heading": "Access, sharing, and service providers",
      "paragraphs": [
        "Authorized clinic physicians, nurses, administrators, and university personnel may access information needed for their assigned duties. Clinic reporting and authorized exports may contain visit information. Information may be disclosed when required or permitted by law or when necessary to protect life and health.",
        "Supabase provides the application's account authentication, database, and file storage services. Email delivery and hosting providers may process the information needed to operate those services. Their access must remain limited to authorized service purposes and applicable safeguards. The portal does not offer your health information as a public directory or for advertising."
      ]
    },
    {
      "heading": "Storage, devices, and retention",
      "paragraphs": [
        "The application uses authenticated sessions, role-based access controls, database access rules, and audit records. Your browser stores session information and limited application settings to keep the service working. Protect downloaded records and sign out on shared devices. No system can guarantee absolute security.",
        "Clinic information is retained for the period required for the relevant clinical, enrolment, legal, and institutional records purposes, including required archives and backups. Retention periods depend on the record type; request the applicable schedule from the clinic or University's data protection contact. Account sign-out, withdrawal of consent, or account closure does not automatically erase records that must lawfully be retained."
      ]
    },
    {
      "heading": "Your choices and rights",
      "paragraphs": [
        "Subject to applicable law and justified limitations, you may ask to be informed about processing, access your personal information, correct inaccuracies, object to certain processing, request blocking or erasure, and exercise other rights under the Data Privacy Act. Where processing relies on consent, you may withdraw that consent; the clinic must explain the consequences for the particular optional activity.",
        "Send requests or report suspected misuse to the clinic or University's designated data protection contact. Identity verification may be needed before records are released or changed. You may also seek guidance or raise a privacy complaint with the National Privacy Commission at https://privacy.gov.ph."
      ]
    },
    {
      "heading": "Automated functions and policy updates",
      "paragraphs": [
        "The portal uses recorded information to display queue availability, appointment and visit statuses, reminders, counts, and eligibility steps. Clinicians and authorized staff make clinical and certificate-review decisions; a status or automated count is not a medical diagnosis.",
        "The agreement record identifies the policy version you reviewed. When an updated agreement is required, the current notice will be available for review before you continue. Ask the clinic if a proposed use of your information is not explained here."
      ]
    }
  ]
}
$clinic_policy_v1$::jsonb as doc) snapshot;

create or replace function private.app_policy_prevent_content_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.version is distinct from old.version or new.title is distinct from old.title
    or new.effective_date is distinct from old.effective_date
    or new.terms is distinct from old.terms or new.privacy is distinct from old.privacy then
    raise exception 'Publish changed policy content as a new version.';
  end if;
  return new;
end;
$$;
revoke all on function private.app_policy_prevent_content_change() from public, anon, authenticated;
create trigger app_policy_versions_immutable before update on public.app_policy_versions
  for each row execute function private.app_policy_prevent_content_change();

-- This trigger records explicit signup evidence for the two self-service signup
-- flows. It never uses editable metadata to grant a role or authorize access.
-- Trusted provisioning can omit signup evidence using app_metadata only; the
-- first portal agreement is still required for that new account.
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

  select version into v_version from public.app_policy_versions where is_active;
  if v_version is null then raise exception 'No active portal policy is available.'; end if;
  v_signup := new.raw_user_meta_data->'policy_agreement';
  if v_signup->>'version' is distinct from v_version
    or v_signup->'accepted_terms' is distinct from 'true'::jsonb
    or v_signup->'accepted_privacy' is distinct from 'true'::jsonb then
    raise exception 'POLICY_AGREEMENT_REQUIRED: Review and agree to the current portal policies before signup.';
  end if;
  insert into private.app_policy_acceptances(user_id, policy_version, stage, accepted_terms, accepted_privacy)
    values (new.id, v_version, 'signup', true, true);
  return new;
end;
$$;
revoke all on function private.app_policy_capture_signup() from public, anon, authenticated;
create trigger zz_app_policy_signup after insert on auth.users
  for each row execute function private.app_policy_capture_signup();

create or replace function public.get_active_app_policy()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version', version, 'title', title, 'effective_date', effective_date,
    'terms', terms, 'privacy', privacy)
  from public.app_policy_versions where is_active;
$$;
revoke all on function public.get_active_app_policy() from public;
grant execute on function public.get_active_app_policy() to anon, authenticated;

-- SECURITY DEFINER is necessary only for private agreement evidence. Public RPC
-- wrappers remain invokers; helpers validate auth.uid() and never accept a user ID.
create or replace function private.app_policy_status()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_policy jsonb;
  v_version text;
begin
  if v_uid is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  v_policy := public.get_active_app_policy();
  v_version := v_policy->>'version';
  if v_version is null then raise exception 'No active portal policy is available.'; end if;
  return jsonb_build_object(
    'policy', v_policy,
    'required', exists(select 1 from private.app_policy_accounts where user_id = v_uid),
    'accepted', exists(select 1 from private.app_policy_acceptances
      where user_id = v_uid and policy_version = v_version and stage = 'portal')
  );
end;
$$;
create or replace function private.app_policy_accept(
  p_policy_version text, p_accepted_terms boolean, p_accepted_privacy boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version text;
begin
  if v_uid is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_accepted_terms is distinct from true or p_accepted_privacy is distinct from true then
    raise exception 'Both policy acknowledgements are required.' using errcode = '22023';
  end if;
  -- Hold the active version stable while recording its acceptance.
  select version into v_version from public.app_policy_versions where is_active for share;
  if p_policy_version is null or v_version is null or p_policy_version <> v_version then
    raise exception 'POLICY_VERSION_CHANGED: Review the current policies.' using errcode = '22023';
  end if;
  insert into private.app_policy_acceptances(user_id, policy_version, stage, accepted_terms, accepted_privacy)
    values (v_uid, v_version, 'portal', true, true)
    on conflict (user_id, policy_version, stage) do nothing;
  return private.app_policy_status();
end;
$$;
revoke all on function private.app_policy_status() from public, anon, authenticated;
revoke all on function private.app_policy_accept(text, boolean, boolean) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.app_policy_status() to authenticated;
grant execute on function private.app_policy_accept(text, boolean, boolean) to authenticated;

create or replace function public.get_my_app_policy_status()
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.app_policy_status();
$$;
create or replace function public.accept_app_policy(
  p_policy_version text, p_accepted_terms boolean, p_accepted_privacy boolean
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.app_policy_accept(p_policy_version, p_accepted_terms, p_accepted_privacy);
$$;
revoke all on function public.get_my_app_policy_status() from public, anon;
revoke all on function public.accept_app_policy(text, boolean, boolean) from public, anon;
grant execute on function public.get_my_app_policy_status() to authenticated;
grant execute on function public.accept_app_policy(text, boolean, boolean) to authenticated;
notify pgrst, 'reload schema';

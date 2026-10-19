# Clinic portal policies

The policy text in `clinic-portal-v1.json` is an application-specific draft for
the TUP Manila Clinic portal. The migration embeds an identical, versioned
snapshot. The app reads the published database version through
`get_active_app_policy`; it does not load a separate, potentially different
copy of the text from the frontend.

Have the clinic or its designated data protection/legal contact review the
wording before production use, particularly the applicable retention schedule,
designated privacy contact, provider arrangements, and handling of minors.
No unverified retention period or data protection email address is asserted.

References reviewed when drafting:

- [National Privacy Commission: right to be informed](https://privacy.gov.ph/the-right-to-be-informed/)
- [National Privacy Commission: data privacy terms](https://privacy.gov.ph/glossary-of-data-privacy-terms/)
- [TUP Manila official contact directory](https://www.tup.edu.ph/page/contact-us)

## Agreement flow

1. New students and enrollees review both documents before entering signup.
   Neither checkbox is preselected. Sending the verification email already
   creates an Auth account, so that step also requires agreement.
2. An Auth insertion trigger verifies the current version and both explicit
   acknowledgements, then writes server-timestamped signup evidence.
3. OTP verification temporarily signs the applicant in. Registration stays on
   its form until complete, then signs out the temporary session.
4. On the first actual sign-in, new accounts must confirm both policies before
   any protected portal page mounts. The server records a separate portal
   acceptance. Declining signs out the current session.
5. A later sign-in checks the server record for the active version. Client
   storage and editable auth metadata are never used to decide acceptance.

Accounts that existed before migration are intentionally not backfilled into
the new-account cohort. Existing staff authorization and business data rules
remain independent of the application agreement gate.

Acceptance tables live in the private schema with RLS enabled and no direct
client grants. Authenticated RPC helpers use `auth.uid()`, never a supplied
user identifier. Signup and portal timestamps come from the server. Repeated
acceptance is idempotent and preserves the first timestamp.

The security advisor's informational "RLS Enabled No Policy" finding on the
two private tables is intentional: client access is denied and the checked
RPC helpers are the only application access path. Do not grant table access
merely to silence that informational finding.

The Auth insertion trigger enrolls all new accounts in the cohort and validates
signup evidence for the app's two self-service roles. A trusted provisioning
service can set `app_metadata.policy_signup_exempt = true` for an account it
creates without self-service signup; that does not waive the portal agreement
for a student/enrollee. Ordinary clients cannot set app metadata.

## Publishing an update

Create a new migration and version with the complete reviewed text. In a single
transaction deactivate the old version and publish the new one as active.
Do not update a published document in place: a trigger rejects edits to its
content/version/date. Existing acceptance records must continue to refer to
the exact documents originally presented.

New-account cohort members must accept the active version when the gate checks
their next sign-in/session restoration. If a version changes while the gate is
open, the acceptance RPC rejects the old version and the UI reloads the current
documents with both checkboxes cleared.

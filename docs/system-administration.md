# System administration

## Run the portals

| Command | Surface | Local URL |
| --- | --- | --- |
| `npm run dev` / `npm run dev:admin` | System administrator | http://127.0.0.1:5173 |
| `npm run dev:staff` | Physician and nurse | http://127.0.0.1:5175 |
| `npm run dev:user` | Patient and enrollee | http://127.0.0.1:5174 |

Each surface uses its mode file. Keep `VITE_DEPLOY_SURFACE` out of shared `.env`.
Build with `build:admin`, `build:staff`, or `build:user`. Different ports keep
the Supabase sessions independent. Restart an existing dev server after changing its mode.

## Admin functions

- Overview: actual account counts, pending invitations, recent administration activity.
  Last Verified Backup uses the same authorized workflow history as Backup & Recovery,
  with the saved verified timestamp as a fallback. Failed or running attempts do not
  replace a successful backup. Dates use Asia/Manila; Refresh and window focus recheck
  the status, and active backups are polled every 12 seconds. An unavailable history
  service is distinguished from an empty history.
- Administrators: administrator directory, usernames and sign-in details; separate
  invitations tab with delivery status, resend, revocation and deletion. Other
  administrators can be deleted; self-deletion and removal of the last active
  administrator are blocked on the server.
- Staff Accounts: directory, role changes, access management, password reset emails;
  Invitations tab: send, resend, revoke, delete, expiry and delivery status.
- User Accounts: patient/enrollee identity and access metadata, suspension with a
  reason and optional end date, reactivation, confirmed sign-in deletion, and account
  history. Password resets use the patient portal's Forgot password flow.
- Audit Trail: immutable activity records, account filters, date/action/search filters and exports.
- Backup & Recovery: existing verified GitHub backup history and dispatch controls.
- Account dropdown: Change name and Change password open focused dialogs. Current
  password is required to change it; all sessions end afterward. The initial
  password-change requirement uses a blocking modal with a Sign out option.

Administrator names are unique across administrator profiles and open administrator
invitations, ignoring capitalization and repeated/outer whitespace. The database
enforces this for name changes, invitations and direct profile writes, including
concurrent requests. Name changes update the header/sidebar and record the stable
account UUID in the audit trail. The former `/admin/account` route redirects to
Overview; there is no separate account page or sidebar item.
Invitation forms and Change Name use separate First Name, Middle Name (Optional),
Last Name and Suffix (Optional) fields, matching signup. First and last names are
required; the existing name formatter composes the display name for invitations,
profiles and uniqueness checks. Existing names are shown as Current Name when
editing, without guessing how a multiword name should be split.

System administration does not grant a clinical role. The existing physician and
nurse screens run under `staff`. Pending invitations grant setup access only.
System Settings has been removed from the admin interface, sidebar and page search.
Its former `/admin/settings` URL redirects to Overview. Saved clinic identity,
portal URLs and invitation validity remain in the private server configuration.

## Supabase deployment

For Vercel, `vercel.json` uses the project’s environment variable during its
generic production build. Set `VITE_DEPLOY_SURFACE=admin`, `staff`, or `user` in
the corresponding Vercel project. Change a legacy staff project from `admin` to
`staff` before it rebuilds. The new admin project uses `admin`.

For a new database, review and apply
`supabase/scripts/configure_production_portal_origins.sql` as a database
administrator. It replaces the initial localhost portal URLs with this project's
production domains and preserves customized origins. Future domain changes belong
in the private `system_admin_settings` configuration through a controlled database
update. Add the staff `/staff/setup`, admin `/admin/setup`, and recovery callback
URLs to Supabase Auth's redirect allowlist, then resend any invitation that still
targets localhost. Updating the configuration does not rewrite an already-sent email.

Migrations are in `supabase/migrations/*system_administration_portal.sql`,
`*harden_admin_invitation_recovery.sql`, `*admin_bootstrap_and_invitation_repair.sql`,
`*administrator_invitations_and_directory.sql`, and
`*invitation_and_administrator_deletion.sql`, followed by
`*live_user_accounts_and_account_history.sql`.
The follow-up `*account_sign_in_audit.sql` records patient logins through a limited
session-bound RPC, without opening arbitrary audit-table writes to users.
`*retain_enrollee_after_auth_deletion.sql` keeps the existing enrolment guard and
allows detaching a deleted Auth identity without changing other protected fields.
`*recover_user_deletion_cleanup.sql` keeps an interrupted cleanup row visible as
Deletion pending even after Auth has been removed, so Retry delete stays available.
The `system-admin` Edge Function handles invitations and administrative writes.
It authenticates JWTs in its handler and checks live database sessions and
authoritative profiles; gateway JWT verification is disabled only to allow its
public username sign-in action. Service keys never reach the browser.

`backup-control` retains its gateway JWT verification and also checks the live
account identity. Both functions use Supabase-provided server environment variables.

## Invite user email template

Paste `supabase/templates/staff-invitation.html` into **Authentication → Emails →
Invite user**. Subject: **You’re invited to the TUP Manila Clinic**.
The template follows the supplied clinic email design and uses:

- `{{ .Data.name }}`, `{{ .Data.staff_role_label }}` and `{{ .Data.portal_label }}`
- `{{ .Data.staff_setup_url }}` (the server-configured staff origin + `/staff/setup`,
  or admin origin + `/admin/setup`; the existing template key is retained)
- `{{ .Data.invitation_minutes }}` and `{{ .TokenHash }}`

The link opens the setup screen and verifies the invitation token in the app.
The staff member chooses a password; an invited administrator chooses a unique
username and password. Both sign in again after setup; setup sessions are revoked.
Existing administrator accounts remain protected from staff suspension and role
changes. A separate delete action requires typing the account email address.
The preview does
not activate an account. Revocation and suspension also invalidate live sessions.

Deletion first disables access and revokes sessions, then uses Supabase Auth's
server-only soft deletion and removes the directory profile and invitation rows.
Historical Auth foreign keys, clinical records and audit entries are retained.
The email and administrator username can be used for a new invitation. A private
deletion request makes interrupted cleanup retryable; the table shows **Deletion
pending** with **Retry delete** until cleanup finishes. Resending or accepting an
invitation during deletion is blocked. An invitation being sent must finish
delivery before deletion; accepted invitations are managed through their account.
Revoked, expired, failed and sending invitations have the same status in their
directory row, rather than all being shown as **Invited**.

User Accounts joins profiles to existing, non-deleted Supabase Auth identities.
Retained clinic profiles without a sign-in are excluded; incomplete patient and
enrollee registrations appear from Auth until their profile is completed. Counts
use the same live identity rules. The open directory and admin audit trail refresh
every 15 seconds while visible, and on window focus, reconnect or returning to the
tab. Requests are cancelled when filters change; background refresh keeps rows in
place. No browser access to the private Auth schema is granted.

Deleting a patient/enrollee sign-in soft-deletes Auth, revokes sessions, and detaches
the retained clinic profile. Enrollee documents and messages remain available to
authorized clinic staff; the Auth foreign key uses SET NULL instead of cascading
through those submissions. No existing profile is deleted to fix an orphaned entry.

The History link filters on the selected Auth UUID using `admin_account_history`.
It includes records with that account as actor or target, uses the same filter for
display and export, and retains the link after sign-in deletion. New browser audit
inserts have their actor UUID stamped from the authenticated session; service
administration actions record their verified actor explicitly. Legacy login rows
without an account UUID are retained but are not assigned by name, since names can
be shared or changed. The selected account is shown above the audit table.
Patient and staff successful logins use `record_my_sign_in`: identity and text are
server-derived, with one event per Auth session. Suspended, expired, anonymous and
setup-only sessions cannot call it. Audit table write policies remain unchanged.

The default invitation window is **5 minutes** to match the supplied Auth email
template. Supabase's own email OTP expiration may be shorter than a configured
invitation window; keep the window at or below the Auth OTP expiry.

In **Authentication → URL Configuration**, allow the deployed staff and admin setup URLs
and each portal's `/auth/callback` URL. These are used by recovery emails and
resends for an email address that has already been verified. Use HTTPS on deployed
origins; the default local settings use the ports above.

Production setup destinations for this project:

- Staff: `https://tup-icare-staff.me/staff/setup`
- Administrators: `https://tup-icare-admin.vercel.app/admin/setup`

After deploying this update, paste the updated Invite user HTML in Supabase so
administrator invitations also show the correct portal and account labels.

## Initial administrator

New passwords across signup, account elevation, invitation setup, recovery and
password changes require at least **8 characters**, **one uppercase letter**,
**one number** and **one supported special character**. The forms show the same
live checklist, and submit buttons require a valid password and matching
confirmation. The shared policy is in
`supabase/functions/_shared/passwordPolicy.mjs`; the administration function uses
the same validator. Existing passwords remain usable for sign-in.

To configure Supabase Auth enforcement, supply `SUPABASE_ACCESS_TOKEN` through
the environment or ignored `.env.supabase.local`, then run
`node scripts/admin/configure-password-policy.mjs --apply`. The script updates
only `password_min_length` and `password_required_characters` and verifies that
other Auth settings remain unchanged. Use `--show` to inspect the public payload
without a token, or run without `--apply` to verify the deployed policy.

The initial username is `ehradmin`; the password is provisioned through the Auth
Admin API, not stored in the frontend, mode files, or this repository. The reserved
internal Auth address is not a mailbox. The required Change password modal handles
the initial password update; later changes are in the account dropdown.

For a new database, after migrations, run `scripts/admin/bootstrap-admin.mjs` with
`EHR_ADMIN_INITIAL_PASSWORD` set in your shell environment. It uses the supported
Supabase CLI API-key command in memory, creates a trusted Auth account, and assigns
the username through a service-only RPC. Running it again does not reset a password.

## Checks

```
node src/scripts/test_system_admin_migration.mjs
node src/scripts/test_deploy_surface_matrix.mjs
node src/scripts/test_portal_surface_role_guard.mjs
node src/scripts/test_device_guard.mjs
```

The migration test uses a disposable local PostgreSQL runtime. The live integration
test (`scripts/admin/test-admin-live.mjs`) requires the initial password in the
shell environment, creates disposable `admin-smoke-*` accounts at `test.invalid`,
checks actual deployed endpoints, and removes its Auth/profile fixtures. It keeps
test audit entries. It writes a non-secret report to ignored `scratch/`.

Browser inspection is separate from these build/database/API checks.

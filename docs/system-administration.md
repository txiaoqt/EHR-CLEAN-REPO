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
- Staff Accounts: directory, role changes, access management, password reset emails;
  Invitations tab: send, resend, revoke, expiry and delivery status.
- User Accounts: patient/enrollee identity and access metadata, suspension with a
  reason and optional end date, reactivation, temporary lockout reset, account history.
- Audit Trail: immutable activity records, account filters, date/action/search filters and exports.
- Backup & Recovery: existing verified GitHub backup history and dispatch controls.
- System Settings: clinic name, portal URLs, invitation window.
- My Account: display name and password; current password required to change it.

System administration does not grant a clinical role. The existing physician and
nurse screens run under `staff`. Pending invitations grant setup access only.

## Supabase deployment

For Vercel, `vercel.json` uses the project’s environment variable during its
generic production build. Set `VITE_DEPLOY_SURFACE=admin`, `staff`, or `user` in
the corresponding Vercel project. Change a legacy staff project from `admin` to
`staff` before it rebuilds. The new admin project uses `admin`.

After the deployed origins are known, update all three portal URLs in **System
Settings**. Add the staff `/staff/setup` URL and the recovery callback URLs to
Supabase Auth's redirect allowlist, then resend any invitation that still targets
localhost. Changing settings does not rewrite an already-sent email.

Migrations are in `supabase/migrations/*system_administration_portal.sql`,
`*harden_admin_invitation_recovery.sql`, and `*admin_bootstrap_and_invitation_repair.sql`.
The `system-admin` Edge Function handles invitations and administrative writes.
It authenticates JWTs in its handler and checks live database sessions and
authoritative profiles; gateway JWT verification is disabled only to allow its
public username sign-in action. Service keys never reach the browser.

`backup-control` retains its gateway JWT verification and also checks the live
account identity. Both functions use Supabase-provided server environment variables.

## Invite user email template

Paste `supabase/templates/staff-invitation.html` into **Authentication → Emails →
Invite user**. Subject: **You’re invited to the TUP Manila Clinic Staff Portal**.
The template follows the supplied clinic email design and uses:

- `{{ .Data.name }}` and `{{ .Data.staff_role_label }}`
- `{{ .Data.staff_setup_url }}` (the server-configured staff origin + `/staff/setup`)
- `{{ .Data.invitation_minutes }}` and `{{ .TokenHash }}`

The link opens the setup screen and verifies the invitation token in the app.
The staff member chooses a password, then signs in normally. The preview does
not activate an account. Revocation and suspension also invalidate live sessions.

The default invitation window is **5 minutes** to match the supplied Auth email
template. Supabase's own email OTP expiration may be shorter than a configured
invitation window; keep the window at or below the Auth OTP expiry.

In **Authentication → URL Configuration**, allow the deployed staff setup URL
and each portal's `/auth/callback` URL. These are used by recovery emails and
resends for an email address that has already been verified. Use HTTPS on deployed
origins; the default local settings use the ports above.

## Initial administrator

The initial username is `ehradmin`; the password is provisioned through the Auth
Admin API, not stored in the frontend, mode files, or this repository. The reserved
internal Auth address is not a mailbox. Change the initial password in My Account.

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

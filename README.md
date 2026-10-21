# TUP Clinic EHR

This project is a **React + Vite frontend** that talks **directly to Supabase**.

There is no Python backend in the current architecture.

## Stack

- Frontend: React + Vite (repo root)
- Database/Auth/Storage: Supabase
- Hosting: Vercel (configured via `vercel.json`)

## Local Development

From repo root:

```bash
npm install
npm run dev
# Separate clinic staff and patient/enrollee sessions:
npm run dev:staff
npm run dev:user
```

## Environment Variables

Set these in `.env` (or in Vercel project settings):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Local surfaces are selected by `.env.admin`, `.env.staff`, and `.env.user` through
the matching npm commands. Keep `VITE_DEPLOY_SURFACE` out of shared `.env`.

See [.env.example](.env.example).

## Build

```bash
npm run build
```

## Vercel Deployment

- `vercel.json` is already configured to:
  - install from the repo root
  - build from the repo root
  - publish `dist`
  - handle SPA routing fallback

After importing the repo in Vercel, add both Supabase variables and the project’s
`VITE_DEPLOY_SURFACE` value below, then deploy. The generic Vercel build command
uses that environment value. No service role key belongs in a frontend project.

## Three Portal Deployments

Deploy the same repo in three Vercel projects with different environment values:

- Admin portal deployment:
  - `VITE_DEPLOY_SURFACE=admin`
  - shows the dedicated system administrator login and account/security modules
- Staff portal deployment:
  - `VITE_DEPLOY_SURFACE=staff`
  - shows nurse/physician login and the existing clinical modules
- User portal deployment:
  - `VITE_DEPLOY_SURFACE=user`
  - shows patient login/signup + patient modules

An existing staff deployment that previously used `admin` must change its
environment value to `staff` before redeploying this version.

After deployment, configure the actual origins in **Admin → System Settings**.
The invitation destination is **the staff origin + `/staff/setup`**. In Supabase
Authentication → URL Configuration, add that setup URL and the staff/user
`/auth/callback` URLs. Update the origins before resending a local test invitation.

See [System administration](docs/system-administration.md) for email templates,
initial admin setup, access controls, and verification commands.

# Database & Storage backup

A manual, verified backup of the production database and Storage, uploaded to
Cloudflare R2. It runs as a GitHub Actions workflow, so no laptop has to be on
and no credentials have to be stored on a clinic machine.

## What it does

1. Dumps the database with `pg_dump`, in a container pinned to the server's
   major version — a runner's bundled client can be older than the server, and
   `pg_dump` refuses a newer server, which would only surface at restore time.
2. Downloads every object from every Storage bucket.
3. Writes `manifest.json` and `SHA256SUMS`, then verifies the checksums.
4. Packages the payload deterministically (`tar --sort=name --mtime=@0`,
   `gzip -n`) so the same data produces the same bytes.
5. Uploads to R2, then **verifies by size and by re-downloading and comparing
   the SHA-256** — a successful upload does not by itself prove the bytes
   survived.
6. Deletes the temporary directory, refusing any path it did not create.

## Setting it up

Add these seven **repository secrets** (Settings → Secrets and variables →
Actions → New repository secret). The runner fails immediately, naming any that
are missing, and never prints their values.

| Secret | Where it comes from |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string (URI). Use the **direct** connection, not the pooler. |
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_SECRET_KEY` | Project Settings → API → service_role key. Needed to read every bucket; it bypasses RLS, so it must never reach the browser. |
| `R2_ACCESS_KEY_ID` | Cloudflare → R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | Same token |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | The bucket to write into |

Then: **Actions → EHR manual backup → Run workflow**.

## Creating the R2 token

The four `R2_*` secrets come from one Cloudflare API token.

1. **Create the bucket** — dashboard → Storage & databases → R2 → Overview →
   Create bucket. Keep it **private**; it holds database dumps.
2. **Create the token** — R2 → Overview → **Manage R2 API Tokens** →
   Create API token.
   - Permissions: **Object Read & Write**. The runner uploads *and* re-downloads
     to verify the SHA-256, so it needs both.
   - Bucket scope: **Apply to specific buckets only** → your backup bucket. A
     token scoped to all buckets can read every file in the account.
3. **Copy both values immediately.** The confirmation page shows the
   **Access Key ID** and **Secret Access Key**. The secret **is shown once and
   cannot be retrieved again** — if it is lost, delete the token and make a new
   one. This is the most common way this setup stalls.
4. **Note the S3 endpoint**, shown at the bottom of that same page:

   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

   Buckets created with a jurisdiction use a suffixed endpoint — `eu.`, `us.` or
   `fedramp.` before `r2.`. A plain endpoint against a jurisdiction bucket fails
   authentication without saying why.

Region is not a secret: R2 requires `auto`, and the runner sets it.

### Checking the token before trusting it

```bash
AWS_ACCESS_KEY_ID=<access-key-id> \
AWS_SECRET_ACCESS_KEY=<secret-access-key> \
AWS_DEFAULT_REGION=auto \
aws s3api head-bucket --bucket <bucket> \
  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

No output means success. `403` means the permissions or bucket scope are wrong;
`404` usually means the bucket name or Account ID is. This is the same call the
workflow makes as its preflight, so if it passes here it will pass there.

## Running it from the app (optional)

The **Backup & Recovery** page can show live run history and start a run, through
the `backup-control` edge function. It is optional — the workflow above works on
its own — and it needs four more secrets on the **function** (Supabase → Edge
Functions → Secrets), separate from the repository secrets:

| Function secret | Value |
|---|---|
| `GITHUB_BACKUP_TOKEN` | A **fine-grained** PAT with `Actions: read and write` on this repository. See below. |
| `GITHUB_BACKUP_REPOSITORY` | `owner/repo`, e.g. `txiaoqt/EHR-CLEAN-REPO` |
| `GITHUB_BACKUP_WORKFLOW` | `backup.yml` |
| `GITHUB_BACKUP_REF` | `main` |
| `GITHUB_BACKUP_DISPATCH_ENABLED` | `true` to allow starting runs from the page. **Leave unset at first.** |

`GITHUB_BACKUP_TOKEN` is confusingly named: it is a secret on the **function**, not a
GitHub repository secret, because the function uses it to reach the GitHub API.
`SUPABASE_URL` and the service key are not needed — the runtime injects them.

### Creating the GitHub token

Go to **github.com/settings/personal-access-tokens/new** (your account settings,
not the repository's).

| Field | Value |
|---|---|
| Expiration | Set one. A token with no expiry is a permanent credential. |
| Repository access | **Only select repositories** → this repository |
| Repository permissions → **Actions** | **Read and write** |
| Metadata | Read-only (selected automatically, required) |

`Actions: write` is needed because the function posts a **workflow dispatch**.
It does **not** need `Contents` — the function never reads repository files, and
`Contents: write` is the permission other guides recommend for a *repository*
dispatch, which is a different endpoint.

Copy the `github_pat_…` value; it is shown once.

If the repository is org-owned, the org may restrict fine-grained tokens and
require approval. A token that authenticates but returns `403` is usually that,
not a permissions mistake.

### Checking the token

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/actions/workflows/backup.yml
```

`200` means the token can read the workflow. `403` means the permission or the
org approval; `404` usually means the repository or workflow filename is wrong.

Deploy it with:

```bash
supabase functions deploy backup-control
```

**Leave `GITHUB_BACKUP_DISPATCH_ENABLED` unset until you have run the workflow
once from GitHub and read its log.** The page will show history and status either
way; only the "Create backup now" button depends on it. A backup button that
nobody has ever watched run is worse than no button.

The function holds the GitHub token server-side; the browser never receives it.
It also re-checks the caller's role, because a hidden sidebar link is not access
control.

## Running it

Manual dispatch **only**. The runner refuses any other trigger on purpose: a
backup on a schedule nobody reads is a backup nobody has checked, and it gives a
false sense that someone is watching.

Archives land at `backups/<backupId>/ehr-backup-<backupId>.tar.gz`, where
`backupId` embeds the run id and attempt, so two runs of the same commit cannot
overwrite each other.

## Restoring

```bash
# Download the archive
aws s3 cp s3://$R2_BUCKET_NAME/backups/<backupId>/ehr-backup-<backupId>.tar.gz . \
  --endpoint-url $R2_ENDPOINT

tar -xzf ehr-backup-<backupId>.tar.gz
cd payload && sha256sum --check SHA256SUMS   # verify before trusting it

# Database — this restores over the target, so point it at a scratch database
# first and diff, unless you are certain.
psql "$TARGET_DB_URL" -f database/schema-and-data.sql
```

Storage objects are under `storage/<bucket>/<path>` and can be re-uploaded with
the Storage API or the Supabase dashboard.

## What is NOT in the backup

- **Auth users and identities.** They live in the `auth` schema, which `pg_dump`
  over the connection string does not reach. The manifest records this
  explicitly, and the runner logs a warning, so a restore does not assume
  otherwise. If losing the user list is unacceptable, back up the `auth` schema
  separately.
- **Bucket configuration** (policies, public flags) — only the objects.
- **Edge functions** — they live in the repository.

## Limits

- Manual only, so the effective backup frequency is however often someone
  remembers. If a defined recovery point is needed, add a `schedule:` trigger —
  but read the logs, or it is decoration.
- No retention policy: nothing prunes old archives. R2 lifecycle rules can, and
  should.
- No restore drill has been run. **An untested backup is a hope, not a backup.**

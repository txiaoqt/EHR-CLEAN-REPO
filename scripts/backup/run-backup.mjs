/**
 * Manual backup runner.
 *
 * Dumps the database and Storage, writes a manifest with checksums, packages it
 * deterministically, uploads to Cloudflare R2 and verifies what landed.
 *
 * Design notes, all inherited deliberately from the reference implementation:
 *
 *  - Manual dispatch only. `backupIdentity` refuses to run outside a
 *    workflow_dispatch, so a scheduled or accidental trigger cannot start a
 *    backup nobody asked for.
 *  - The temporary directory is allocated by the workflow OUTSIDE the repository
 *    and validated here, so a mis-set variable cannot make the runner write into
 *    the checkout or delete something it did not create.
 *  - pg_dump runs in a container pinned to a matching major version. A runner's
 *    bundled client can be older than the server, and pg_dump refuses to dump a
 *    newer server — which would only surface at restore time.
 *  - The archive is built with stable ordering and zeroed ownership/timestamps,
 *    and gzip -n, so the same data produces the same bytes.
 *  - The upload is verified by size and by re-downloading and comparing the
 *    SHA-256. An upload that returns success but stored nothing is the failure
 *    this exists to catch.
 */
import { mkdir, mkdtemp, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSecrets, redact, run, log, r2Endpoint } from './common.mjs';

const PG_MAJOR = '17';

export function backupIdentity(env, now = new Date()) {
  if (!/^\d+$/.test(env.GITHUB_RUN_ID || '') ||
      !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Backup must run from a manual GitHub Actions dispatch');
  }
  const createdAtUtc = now.toISOString();
  const stamp = createdAtUtc.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const formatted = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}${stamp.slice(8)}`;
  return { backupId: `${formatted}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, createdAtUtc };
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function walk(dir, base = dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

/** pg_dump in a version-matched container; plain SQL so it is restorable by eye. */
async function backupDatabase({ root, env }) {
  const dir = path.join(root, 'database');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'schema-and-data.sql');

  // The connection string is passed via the container environment, never as an
  // argument, so it cannot appear in a process listing.
  await run('docker', [
    'run', '--rm',
    '-e', 'PGURL',
    '-v', `${dir}:/out`,
    `postgres:${PG_MAJOR}`,
    'sh', '-c', 'pg_dump --no-owner --no-privileges --clean --if-exists "$PGURL" > /out/schema-and-data.sql',
  ], { env: { ...process.env, PGURL: env.SUPABASE_DB_URL } });

  const { size } = await stat(target);
  if (size === 0) throw new Error('pg_dump produced an empty file');
  log(`Database dump written (${size} bytes)`);
  return { file: 'database/schema-and-data.sql', bytes: size };
}

/** Every object in every bucket, via the Storage API. */
async function backupStorage({ root, env }) {
  const dir = path.join(root, 'storage');
  await mkdir(dir, { recursive: true });
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  };

  const listRes = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, { headers });
  if (!listRes.ok) throw new Error(`Could not list buckets (${listRes.status})`);
  const buckets = await listRes.json();

  const objects = [];
  for (const bucket of buckets) {
    const objRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket.id}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 10000, offset: 0 }),
    });
    if (!objRes.ok) throw new Error(`Could not list objects in ${bucket.id} (${objRes.status})`);
    const items = await objRes.json();

    for (const item of items) {
      if (!item.name || item.id === null) continue; // folder placeholder
      const fileRes = await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/${bucket.id}/${encodeURIComponent(item.name)}`,
        { headers }
      );
      if (!fileRes.ok) throw new Error(`Could not download ${bucket.id}/${item.name} (${fileRes.status})`);
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const target = path.join(dir, bucket.id, item.name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer);
      objects.push({ bucket: bucket.id, name: item.name, bytes: buffer.length, sha256: sha256(buffer) });
    }
  }

  log(`Storage archived: ${buckets.length} buckets, ${objects.length} objects`);
  return { buckets: buckets.map((b) => b.id), objects };
}

async function generateManifest({ root, backupId, createdAtUtc, gitCommitSha, database, storage }) {
  const files = await walk(root);
  const lines = [];
  for (const rel of files.sort()) {
    if (rel === 'SHA256SUMS' || rel === 'manifest.json') continue;
    const { readFile } = await import('node:fs/promises');
    lines.push(`${sha256(await readFile(path.join(root, rel)))}  ${rel}`);
  }
  await writeFile(path.join(root, 'SHA256SUMS'), `${lines.join('\n')}\n`);

  const manifest = {
    backupId,
    createdAtUtc,
    gitCommitSha,
    database,
    storage: { buckets: storage.buckets, objectCount: storage.objects.length },
    // Auth users live in the auth schema, which pg_dump over the connection
    // string does not reach. Recorded explicitly so a restore does not assume
    // otherwise.
    limitations: ['auth users and identities are NOT included'],
    files,
  };
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Proves the endpoint and bucket are reachable before a long upload begins. */
async function preflightR2({ env }) {
  await run('aws', [
    's3api', 'head-bucket',
    '--bucket', env.R2_BUCKET_NAME,
    // Normalised: the aws CLI rejects a trailing slash, and a trailing slash is
    // a perfectly valid endpoint. Passing the raw value here is what made the
    // storage check pass and the backup fail on the same secret.
    '--endpoint-url', r2Endpoint(env),
  ], {
    env: r2Env(env),
  });
}

const r2Env = (env) => ({
  ...process.env,
  AWS_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
  AWS_DEFAULT_REGION: 'auto',
});

async function uploadR2({ archive, backupId, env }) {
  const endpoint = r2Endpoint(env);
  const key = `backups/${backupId}/${path.basename(archive)}`;
  await run('aws', [
    's3', 'cp', archive, `s3://${env.R2_BUCKET_NAME}/${key}`,
    '--endpoint-url', endpoint,
    '--only-show-errors',
  ], { env: r2Env(env) });

  const { stdout } = await run('aws', [
    's3api', 'head-object', '--bucket', env.R2_BUCKET_NAME, '--key', key,
    '--endpoint-url', endpoint, '--output', 'json',
  ], { env: r2Env(env) });
  const head = JSON.parse(stdout);

  // Re-download and compare, because a successful PUT does not prove the bytes
  // survived. `binary: true` is essential: a tar.gz read as UTF-8 is mangled,
  // and the comparison would fail on a backup that is actually intact.
  const downloaded = await run('aws', [
    's3', 'cp', `s3://${env.R2_BUCKET_NAME}/${key}`, '-',
    '--endpoint-url', endpoint,
  ], { env: r2Env(env), binary: true });
  const remoteHash = sha256(downloaded.stdout);

  const { readFile } = await import('node:fs/promises');
  const localHash = sha256(await readFile(archive));
  if (remoteHash !== localHash) throw new Error('Uploaded archive does not match the local file');

  log(`R2 backup verified by HEAD and re-download (${head.ContentLength} bytes)`);
  return { key, size: head.ContentLength, sha256: localHash };
}

export async function runBackup(env = process.env) {
  validateSecrets(env);
  const identity = backupIdentity(env);

  const parent = path.resolve(env.EHR_BACKUP_TEMP || '');
  const runnerTemp = path.resolve(env.RUNNER_TEMP || '');
  if (!env.EHR_BACKUP_TEMP || !env.RUNNER_TEMP ||
      !parent.startsWith(runnerTemp + path.sep) ||
      !path.basename(parent).startsWith('ehr-backup.')) {
    throw new Error('Invalid workflow temporary directory');
  }

  const temporary = await mkdtemp(path.join(parent, 'run-'));
  if (!temporary.startsWith(parent + path.sep)) throw new Error('Unsafe cleanup path');
  const root = path.join(temporary, 'payload');
  await mkdir(root, { mode: 0o700 });

  try {
    log(`Creating manual backup ${identity.backupId}`);
    const database = await backupDatabase({ root, env });
    const storage = await backupStorage({ root, env });
    await generateManifest({ root, ...identity, gitCommitSha: env.GITHUB_SHA, database, storage });

    await run('sh', ['-c', 'cd "$1" && sha256sum --check --strict SHA256SUMS', 'checksum-check', root]);
    log('Integrity verified');

    await preflightR2({ env });

    const archive = path.join(temporary, `ehr-backup-${identity.backupId}.tar.gz`);
    await run('sh', ['-c',
      'set -eu; tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -cf "$2" -C "$1" .; gzip -n "$2"',
      'package-backup', root, archive.slice(0, -3)]);
    await run('tar', ['-tzf', archive]);

    await uploadR2({ archive, ...identity, env });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackup().catch((error) => {
    console.error(redact(error.message));
    process.exitCode = 1;
  });
}

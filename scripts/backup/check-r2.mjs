/**
 * R2 reachability and permission probe.
 *
 * Run before a real backup, because a backup takes minutes and a misconfigured
 * bucket only fails at the end. This answers the whole question in seconds:
 *
 *   1. Are all the secrets present?
 *   2. Is the endpoint reachable and the bucket there?
 *   3. Can we WRITE? — head-bucket alone does not prove this, and write is what
 *      the backup needs.
 *   4. Can we READ BACK what we wrote? — an upload that reports success without
 *      storing the bytes is the failure the real runner guards against, so the
 *      probe guards against it too.
 *   5. Clean up after itself, including when it fails.
 *
 * The probe object goes under `_checks/`, so it can never collide with a real
 * backup archive.
 */
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateSecrets, redact, run, log } from './common.mjs';

const PROBE_PREFIX = '_checks';

/**
 * Checks the endpoint's SHAPE before handing it to the aws CLI.
 *
 * The CLI answers a malformed endpoint with `Invalid endpoint: <value>`, and
 * GitHub then redacts the value, so the log says nothing useful. Worse, a
 * trailing slash or a stray newline is invisible in a secret field. This says
 * what is actually wrong without ever printing the value.
 */
export function inspectEndpoint(raw) {
  const value = String(raw ?? '');
  const problems = [];

  if (value !== value.trim()) {
    problems.push('it has leading or trailing whitespace (a newline pasted with it is the usual cause)');
  }
  const trimmed = value.trim();

  if (!/^https:\/\//.test(trimmed)) {
    problems.push('it does not start with https://');
  }
  if (trimmed.endsWith('/')) {
    problems.push('it ends with a trailing slash — the endpoint should be the host only');
  }
  if (/^https:\/\/https:\/\//.test(trimmed)) {
    problems.push('it has https:// twice');
  }
  if (/["']/.test(trimmed)) {
    problems.push('it contains quote characters — paste the value without them');
  }
  if (/\.r2\.dev/.test(trimmed)) {
    problems.push('it is an r2.dev public bucket URL, not the S3 API endpoint — the S3 endpoint is https://<ACCOUNT_ID>.r2.cloudflarestorage.com');
  }
  if (/cloudflare\.com\/?$/.test(trimmed) && !/r2\.cloudflarestorage\.com/.test(trimmed)) {
    problems.push('it looks like a dashboard URL rather than the S3 API endpoint');
  }
  if (!/\.r2\.cloudflarestorage\.com$/.test(trimmed) && !/\.r2\.cloudflarestorage\.com/.test(trimmed)) {
    problems.push('it does not end with .r2.cloudflarestorage.com');
  }

  return { ok: problems.length === 0, problems };
}

export async function checkR2(env = process.env) {
  validateSecrets(env);

  const { R2_BUCKET_NAME } = env;
  // Trimmed, so a pasted newline cannot reach the CLI. aws rejects a value with
  // one and the error is unreadable.
  const R2_ENDPOINT = String(env.R2_ENDPOINT).trim();

  const shape = inspectEndpoint(env.R2_ENDPOINT);
  if (!shape.ok) {
    // Report every problem at once, so this does not take one run each.
    throw new Error(
      `R2_ENDPOINT looks wrong:\n  - ${shape.problems.join('\n  - ')}\n` +
      `It should be exactly: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
    );
  }
  const r2Env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    AWS_DEFAULT_REGION: 'auto',
  };

  const work = await mkdtemp(path.join(tmpdir(), 'ehr-r2-check-'));
  const probe = path.join(work, 'probe.txt');
  const runId = env.GITHUB_RUN_ID || String(Date.now());
  const key = `${PROBE_PREFIX}/reachability-${runId}.txt`;
  const payload = `ehr backup probe ${runId}\n`;

  let uploaded = false;
  try {
    // 1. Endpoint and bucket. A 403 here means credentials or bucket scope;
    //    404 usually means the bucket name or account id.
    log(`Checking ${R2_ENDPOINT} …`);
    await run('aws', [
      's3api', 'head-bucket', '--bucket', R2_BUCKET_NAME, '--endpoint-url', R2_ENDPOINT,
    ], { env: r2Env });
    log(`Bucket "${R2_BUCKET_NAME}" is reachable`);

    // 2. Write. This is the one head-bucket cannot prove — a read-only token
    //    passes step 1 and fails here.
    await writeFile(probe, payload);
    await run('aws', [
      's3', 'cp', probe, `s3://${R2_BUCKET_NAME}/${key}`,
      '--endpoint-url', R2_ENDPOINT, '--only-show-errors',
    ], { env: r2Env });
    uploaded = true;
    log('Write succeeded — the token can upload');

    // 3. Read back, and compare. A successful PUT does not prove the bytes
    //    survived; the backup runner verifies the same way for the same reason.
    const { stdout } = await run('aws', [
      's3', 'cp', `s3://${R2_BUCKET_NAME}/${key}`, '-', '--endpoint-url', R2_ENDPOINT,
    ], { env: r2Env });
    if (stdout !== payload) {
      throw new Error('The object read back does not match what was written');
    }
    log('Read back and verified — the bytes survived the round trip');

    // 4. Confirm it is listed, which also proves ListBucket on this prefix.
    const listed = await run('aws', [
      's3api', 'list-objects-v2', '--bucket', R2_BUCKET_NAME, '--prefix', key,
      '--endpoint-url', R2_ENDPOINT, '--output', 'json',
    ], { env: r2Env });
    if (!listed.stdout.includes(key)) {
      throw new Error('The uploaded object is not visible in a listing');
    }
    log('Listing succeeded');

    return { ok: true, key };
  } finally {
    if (uploaded) {
      try {
        await run('aws', [
          's3', 'rm', `s3://${R2_BUCKET_NAME}/${key}`,
          '--endpoint-url', R2_ENDPOINT, '--only-show-errors',
        ], { env: r2Env });
        log('Probe object removed');
      } catch {
        // Reported, never swallowed: a leftover probe object is harmless but
        // silently leaving one is not something to hide.
        console.warn(`Could not remove the probe object. Delete s3://${R2_BUCKET_NAME}/${key} by hand.`);
      }
    }
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-r2.mjs')) {
  checkR2()
    .then(() => log('\nR2 is reachable and writable. A backup should succeed.'))
    .catch((error) => {
      console.error(redact(error.message));
      process.exitCode = 1;
    });
}

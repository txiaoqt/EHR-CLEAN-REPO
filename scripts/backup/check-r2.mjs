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

export async function checkR2(env = process.env) {
  validateSecrets(env);

  const { R2_BUCKET_NAME, R2_ENDPOINT } = env;
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

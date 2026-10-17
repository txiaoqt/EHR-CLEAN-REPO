/**
 * Tests for the backup runner's pure logic.
 *
 * The workflow runs this before the backup starts, so a broken runner fails in
 * seconds rather than after a long dump. It covers the guards that protect
 * credentials and the filesystem — the parts where a mistake is expensive.
 *
 * Run: node --test scripts/backup/backup.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSecrets, redact, REQUIRED_SECRETS } from './common.mjs';
import { backupIdentity } from './run-backup.mjs';

const completeEnv = () => ({
  SUPABASE_DB_URL: 'postgresql://user:pw@db.example.com:5432/postgres',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_example',
  R2_ACCESS_KEY_ID: 'key-id',
  R2_SECRET_ACCESS_KEY: 'key-secret',
  R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  R2_BUCKET_NAME: 'ehr-backups',
});

const dispatchEnv = () => ({
  GITHUB_RUN_ID: '1234567890',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_EVENT_NAME: 'workflow_dispatch',
});

test('a complete set of secrets passes', () => {
  assert.doesNotThrow(() => validateSecrets(completeEnv()));
});

test('every required secret is actually enforced', () => {
  for (const key of REQUIRED_SECRETS) {
    const env = completeEnv();
    delete env[key];
    assert.throws(() => validateSecrets(env), new RegExp(key), `${key} must be required`);
  }
});

test('a blank secret counts as missing, not as present', () => {
  const env = { ...completeEnv(), R2_BUCKET_NAME: '   ' };
  assert.throws(() => validateSecrets(env), /R2_BUCKET_NAME/);
});

test('non-https endpoints are rejected', () => {
  assert.throws(() => validateSecrets({ ...completeEnv(), SUPABASE_URL: 'http://project.supabase.co' }), /https/);
  assert.throws(() => validateSecrets({ ...completeEnv(), R2_ENDPOINT: 'http://r2.example.com' }), /https/);
});

test('the failure message names secrets but never prints values', () => {
  const env = completeEnv();
  delete env.R2_BUCKET_NAME;
  try {
    validateSecrets(env);
    assert.fail('should have thrown');
  } catch (error) {
    assert.match(error.message, /R2_BUCKET_NAME/);
    assert.doesNotMatch(error.message, /key-secret/);
    assert.doesNotMatch(error.message, /postgresql:\/\//);
  }
});

test('redact removes a postgres URL with its password', () => {
  const out = redact('connect failed: postgresql://user:sup3rs3cret@db.example.com:5432/postgres');
  assert.doesNotMatch(out, /sup3rs3cret/);
  assert.match(out, /\[redacted\]/);
});

test('redact removes key/value pairs and JWTs', () => {
  assert.doesNotMatch(redact('SUPABASE_SECRET_KEY=sb_secret_abc123'), /sb_secret_abc123/);
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signaturepart';
  assert.doesNotMatch(redact(`token ${jwt}`), /signaturepart/);
});

test('redact leaves ordinary text alone', () => {
  const text = 'Database dump written (1048576 bytes)';
  assert.equal(redact(text), text);
});

test('a backup identity is derived from the run, not the clock alone', () => {
  const { backupId } = backupIdentity(dispatchEnv(), new Date('2026-10-18T02:34:56.789Z'));
  assert.match(backupId, /^2026-10-18T023456Z-1234567890-1$/);
});

test('two runs of the same commit get different identities', () => {
  const first = backupIdentity({ ...dispatchEnv(), GITHUB_RUN_ID: '1' });
  const second = backupIdentity({ ...dispatchEnv(), GITHUB_RUN_ID: '2' });
  assert.notEqual(first.backupId, second.backupId);
});

test('a scheduled or accidental trigger is refused', () => {
  // A backup nobody asked for is worse than no backup: it consumes the bucket
  // and gives a false sense that someone is watching.
  for (const event of ['push', 'schedule', 'pull_request']) {
    assert.throws(
      () => backupIdentity({ ...dispatchEnv(), GITHUB_EVENT_NAME: event }),
      /manual GitHub Actions dispatch/,
      `${event} must be refused`
    );
  }
});

test('a missing or malformed run identity is refused', () => {
  for (const patch of [
    { GITHUB_RUN_ID: '' },
    { GITHUB_RUN_ATTEMPT: 'x' },
    { GITHUB_SHA: 'short' },
  ]) {
    assert.throws(() => backupIdentity({ ...dispatchEnv(), ...patch }));
  }
});

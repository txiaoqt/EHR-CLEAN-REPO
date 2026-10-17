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
import { validateSecrets, redact, REQUIRED_SECRETS, inspectDatabaseUrl } from './common.mjs';
import { backupIdentity } from './run-backup.mjs';
import { inspectEndpoint, inspectBucketName } from './check-r2.mjs';

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

// --- R2 endpoint shape -------------------------------------------------------
// A malformed endpoint makes the aws CLI print `Invalid endpoint: <value>`, and
// GitHub redacts the value, so the log says nothing. These cover the ways it
// actually gets pasted wrong.

const GOOD = 'https://a1b2c3d4e5f60718293a4b5c6d7e8f90.r2.cloudflarestorage.com';

test('a well-formed endpoint passes', () => {
  const { ok, problems, normalized } = inspectEndpoint(GOOD);
  assert.equal(ok, true);
  assert.deepEqual(problems, []);
  assert.equal(normalized, GOOD);
});

test('a jurisdiction endpoint passes', () => {
  assert.equal(inspectEndpoint('https://a1b2c3d4e5f60718293a4b5c6d7e8f90.eu.r2.cloudflarestorage.com').ok, true);
});

// A trailing slash and a pasted newline are NORMALISED, not rejected: the
// reference implementation accepts both, and the aws CLI does not, so refusing
// them here would reject a value that works everywhere else.
test('a trailing slash is accepted and normalised away', () => {
  const result = inspectEndpoint(`${GOOD}/`);
  assert.equal(result.ok, true);
  assert.equal(result.normalized, GOOD, 'the CLI must receive the origin without the slash');
});

test('a pasted newline is accepted and trimmed', () => {
  const result = inspectEndpoint(`${GOOD}\n`);
  assert.equal(result.ok, true);
  assert.equal(result.normalized, GOOD);
});

test('the r2.dev public URL is named for what it is', () => {
  const { ok, problems } = inspectEndpoint('https://pub-abc123.r2.dev');
  assert.equal(ok, false);
  assert.match(problems.join(' '), /public bucket URL/);
});

test('doubled scheme, quotes, credentials, query and path are all caught', () => {
  assert.match(inspectEndpoint(`https://${GOOD}`).problems.join(' '), /twice/);
  assert.match(inspectEndpoint(`"${GOOD}"`).problems.join(' '), /quote/);
  assert.match(inspectEndpoint('https://user:pw@acct.r2.cloudflarestorage.com').problems.join(' '), /credentials/);
  assert.match(inspectEndpoint(`${GOOD}?x=1`).problems.join(' '), /query/);
  assert.match(inspectEndpoint(`${GOOD}/some/path`).problems.join(' '), /path/);
});

test('a wrong host is reported', () => {
  assert.match(inspectEndpoint('https://example.com').problems.join(' '), /r2\.cloudflarestorage\.com/);
});

test('an empty endpoint reports a problem rather than passing', () => {
  assert.equal(inspectEndpoint('').ok, false);
  assert.equal(inspectEndpoint(undefined).ok, false);
});

// --- database connection string ---------------------------------------------
// The transaction pooler cannot serve a dump: it does not hold a session, so the
// failure lands partway through rather than at the start, and nothing about it
// points back to the port.

test('a direct connection passes', () => {
  assert.doesNotThrow(() => inspectDatabaseUrl('postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres'));
  assert.doesNotThrow(() => inspectDatabaseUrl('postgresql://postgres.abcdefgh:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'));
});

test('the transaction pooler on 6543 is refused, and named', () => {
  assert.throws(
    () => inspectDatabaseUrl('postgresql://postgres.abcdefgh:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'),
    /transaction pooler/
  );
});

test('a connection string without a password is refused', () => {
  assert.throws(() => inspectDatabaseUrl('postgresql://postgres@db.abcdefgh.supabase.co:5432/postgres'), /password/);
  assert.throws(() => inspectDatabaseUrl('not-a-url'), /valid connection string/);
  assert.throws(() => inspectDatabaseUrl('mysql://u:p@h/db'), /PostgreSQL/);
});

test('validateSecrets applies the database check too', () => {
  const env = { ...completeEnv(), SUPABASE_DB_URL: 'postgresql://postgres.abcdefgh:pw@aws-0-ap.pooler.supabase.com:6543/postgres' };
  assert.throws(() => validateSecrets(env), /transaction pooler/);
});

// --- bucket name -------------------------------------------------------------
// Cloudflare follows S3 naming. An underscore is the usual mistake and the error
// it produces is far from obvious.

test('a valid bucket name passes', () => {
  assert.equal(inspectBucketName('ehr-backups').ok, true);
  assert.equal(inspectBucketName('ehr.backups.2026').ok, true);
});

test('an underscore or capital is reported', () => {
  assert.match(inspectBucketName('ehr_backups').problems.join(' '), /S3 does not allow/);
  assert.match(inspectBucketName('EHR-Backups').problems.join(' '), /S3 does not allow/);
});

test('a bad length or bad ends are reported', () => {
  assert.match(inspectBucketName('ab').problems.join(' '), /3 to 63/);
  assert.match(inspectBucketName('-backups').problems.join(' '), /start and end/);
  assert.match(inspectBucketName('backups-').problems.join(' '), /start and end/);
  assert.equal(inspectBucketName('').ok, false);
});

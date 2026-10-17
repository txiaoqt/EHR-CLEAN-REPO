/**
 * Shared helpers for the backup runner.
 *
 * Adapted from the reference implementation (lydorg), keeping the properties
 * that matter: secrets are validated before anything runs, nothing sensitive is
 * ever printed, and every failure is surfaced rather than swallowed.
 */
import { spawn } from 'node:child_process';

/** Every secret the runner needs. Missing any one is a hard stop, not a warning. */
export const REQUIRED_SECRETS = [
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET_NAME',
];

/**
 * Checks the endpoint's SHAPE and returns the form the aws CLI accepts.
 *
 * Modelled on the reference implementation's validateR2Config, which parses the
 * endpoint with `new URL()` and requires an https origin with no credentials,
 * path, query or fragment — `pathname === '/'`, so a trailing slash is fine.
 *
 * A trailing slash is NORMALISED rather than rejected. The reference tolerates
 * it (its uploader uses the AWS SDK), and the aws CLI does not, so rejecting it
 * would refuse a value that works everywhere else.
 *
 * This lives here rather than in the check because BOTH the check and the runner
 * need it. It was first written into check-r2.mjs only, which meant the check
 * passed on an endpoint the runner then failed on — the check normalised the
 * slash away and the runner handed the CLI the raw value.
 */
export function inspectEndpoint(raw) {
  const value = String(raw ?? '');
  if (!value.trim()) return { ok: false, problems: ['it is empty'], normalized: null };

  // Trim first: a newline pasted with the value is invisible in a secret field
  // and is not a reason to fail.
  const trimmed = value.trim();
  const problems = [];

  if (/^https:\/\/https:\/\//.test(trimmed)) problems.push('it has https:// twice');
  if (/["']/.test(trimmed)) problems.push('it contains quote characters — paste the value without them');
  if (/\.r2\.dev/.test(trimmed)) {
    problems.push('it is an r2.dev public bucket URL, not the S3 API endpoint — the S3 endpoint is https://<ACCOUNT_ID>.r2.cloudflarestorage.com');
  }

  let url = null;
  try {
    url = new URL(trimmed);
  } catch {
    problems.push('it is not a valid URL');
  }

  if (url) {
    if (url.protocol !== 'https:') problems.push('it is not https');
    if (url.username || url.password) problems.push('it contains credentials');
    if (url.search) problems.push('it has a query string — the endpoint is the origin only');
    if (url.hash) problems.push('it has a fragment');
    // pathname is '/' for both "host" and "host/", so a trailing slash passes.
    if (url.pathname !== '/') problems.push('it has a path — the endpoint is the origin only');
    if (!/\.r2\.cloudflarestorage\.com$/.test(url.hostname)) {
      problems.push('its host does not end with .r2.cloudflarestorage.com');
    }
  }

  if (problems.length > 0) return { ok: false, problems, normalized: null };
  return { ok: true, problems: [], normalized: url.origin };
}

/** The endpoint in the one shape the aws CLI accepts, or a clear refusal. */
export function r2Endpoint(env = process.env) {
  const shape = inspectEndpoint(env.R2_ENDPOINT);
  if (!shape.ok) {
    throw new Error(
      `R2_ENDPOINT looks wrong:\n  - ${shape.problems.join('\n  - ')}\n` +
      'It should be exactly: https://<ACCOUNT_ID>.r2.cloudflarestorage.com'
    );
  }
  return shape.normalized;
}

/**
 * Cloudflare follows S3 bucket naming: 3–63 characters, lowercase letters,
 * digits, dots and hyphens. An underscore is the usual mistake, and the failure
 * it produces is far from obvious.
 */
export function inspectBucketName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return { ok: false, problems: ['it is empty'] };
  const problems = [];
  if (!/^[a-z0-9.-]+$/.test(name)) problems.push('it contains characters S3 does not allow (underscores and capitals are the usual ones)');
  if (name.length < 3 || name.length > 63) problems.push('it must be 3 to 63 characters');
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) problems.push('it must start and end with a letter or digit');
  return { ok: problems.length === 0, problems };
}

export function validateSecrets(env = process.env) {
  const missing = REQUIRED_SECRETS.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length > 0) {
    // Names only — never values.
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
  if (!/^https:\/\//.test(env.SUPABASE_URL)) {
    throw new Error('SUPABASE_URL must be an https URL');
  }
  // Validates the endpoint and the bucket up front, so a typo fails before the
  // database dump rather than after it.
  r2Endpoint(env);
  const bucket = inspectBucketName(env.R2_BUCKET_NAME);
  if (!bucket.ok) {
    throw new Error(`R2_BUCKET_NAME looks wrong:\n  - ${bucket.problems.join('\n  - ')}`);
  }
  inspectDatabaseUrl(env.SUPABASE_DB_URL);
}

/**
 * Checks the database connection string can actually serve a dump.
 *
 * The transaction pooler listens on 6543 and cannot run pg_dump — it does not
 * hold a session, so the dump fails partway through rather than at the start.
 * The port is easy to copy from the wrong line of the Supabase dashboard, and
 * nothing about the failure points back to it.
 */
export function inspectDatabaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error('SUPABASE_DB_URL is not a valid connection string');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection string');
  }
  if (!url.hostname || !url.username || !url.password) {
    throw new Error('SUPABASE_DB_URL must include the host, user and password');
  }
  if (url.port === '6543') {
    throw new Error(
      'SUPABASE_DB_URL uses port 6543, the transaction pooler, which cannot run pg_dump. ' +
      'Use the direct connection (port 5432) or the session pooler.'
    );
  }
  return url;
}

/**
 * Removes anything credential-shaped from a message before it is logged. A
 * postgres URL carries its password inline, and an error that echoes the
 * connection string would put it in the Actions log.
 */
export function redact(text = '') {
  return String(text)
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, 'postgres://[redacted]')
    // Any URL, not just a credential-bearing one. Taken from the reference
    // implementation: this runner attaches tool stderr to its errors, and an
    // endpoint or a signed link can appear there without looking like a secret.
    .replace(/(?:https?):\/\/[^\s"',)]+/gi, '[URL redacted]')
    // Any NAME=value where the name looks like a credential. The first version
    // of this listed specific names and missed SUPABASE_SECRET_KEY — the very
    // secret this runner uses — so it matches on the shape instead.
    .replace(
      /([A-Za-z0-9_]*(?:access[_-]?key|secret[_-]?key|api[_-]?key|password|token|credential)[A-Za-z0-9_]*)\s*[=:]\s*[^\s"',&]+/gi,
      '$1=[redacted]'
    )
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]');
}

/** Runs a command with output captured, throwing a redacted error on failure. */
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(new Error(redact(`${command} failed to start: ${err.message}`))));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(redact(`${command} exited ${code}: ${stderr || stdout}`)));
    });
  });
}

/** Same, but streams nothing back — for commands whose output is large or noisy. */
export const runQuiet = (command, args, options = {}) => run(command, args, options);

export function log(message) {
  console.log(redact(message));
}

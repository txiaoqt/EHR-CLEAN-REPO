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

export function validateSecrets(env = process.env) {
  const missing = REQUIRED_SECRETS.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length > 0) {
    // Names only — never values.
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
  if (!/^https:\/\//.test(env.SUPABASE_URL)) {
    throw new Error('SUPABASE_URL must be an https URL');
  }
  if (!/^https:\/\//.test(env.R2_ENDPOINT)) {
    throw new Error('R2_ENDPOINT must be an https URL');
  }
}

/**
 * Removes anything credential-shaped from a message before it is logged. A
 * postgres URL carries its password inline, and an error that echoes the
 * connection string would put it in the Actions log.
 */
export function redact(text = '') {
  return String(text)
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, 'postgres://[redacted]')
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

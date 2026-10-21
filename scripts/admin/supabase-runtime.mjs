import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Server-side tooling only. Keys are obtained through the supported Supabase
// CLI command, held in memory, and never printed or written into the repo.
export function runtime() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
      const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
    }));
  const url = env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL is missing.');
  const ref = new URL(url).hostname.split('.')[0];
  const cli = fileURLToPath(new URL('../../node_modules/supabase/dist/supabase.js', import.meta.url));
  const keys = JSON.parse(execFileSync(process.execPath, [cli, 'projects', 'api-keys', '--project-ref', ref, '--output', 'json'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }));
  const secret = keys.find(row => row.name === 'service_role')?.api_key;
  if (!secret) throw new Error('No service role key returned by the Supabase CLI.');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const service = createClient(url, secret, options);
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  return { url, service, anonKey, client: () => createClient(url, anonKey, options) };
}

export async function edgeAction(runtime, action, payload = {}, accessToken) {
  const result = await fetch(`${runtime.url}/functions/v1/system-admin`, {
    method: 'POST', headers: { apikey: runtime.anonKey, Authorization: `Bearer ${accessToken || runtime.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  return { status: result.status, body: await result.json() };
}

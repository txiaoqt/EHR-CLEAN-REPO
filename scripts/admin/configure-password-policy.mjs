import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { AUTH_PASSWORD_CONFIG } from '../../supabase/functions/_shared/passwordPolicy.mjs';

// Changes only these two Auth settings; no templates, redirects or SMTP values
// are sent back to the Management API. Secret config values stay in memory.
if (process.argv.includes('--show')) {
  console.log(JSON.stringify(AUTH_PASSWORD_CONFIG, null, 2));
} else {
  let token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    try {
      token = readFileSync(new URL('../../.env.supabase.local', import.meta.url), 'utf8')
        .match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)\s*$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    } catch { /* The ignored token file is optional when the environment is set. */ }
  }
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN in the environment or ignored .env.supabase.local. Never paste the token in chat.');
  const endpoint = 'https://api.supabase.com/v1/projects/bvvzrrcyulbezzexlmav/config/auth';
  const request = async (method = 'GET') => {
    const response = await fetch(endpoint, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify(AUTH_PASSWORD_CONFIG) } : {}),
    });
    if (!response.ok) throw new Error(`Auth settings request failed (HTTP ${response.status}). No secret values were logged.`);
    return response.json();
  };
  const before = await request();
  const fields = Object.keys(AUTH_PASSWORD_CONFIG);
  const matches = config => fields.every(key => config[key] === AUTH_PASSWORD_CONFIG[key]);
  if (process.argv.includes('--apply') && !matches(before)) await request('PATCH');
  const after = await request();
  if (!matches(after)) throw new Error('The requested Auth password policy has not been applied. Run this command with --apply.');
  const otherChanges = Object.keys(before).filter(key => !fields.includes(key) && !isDeepStrictEqual(before[key], after[key]));
  if (otherChanges.length) throw new Error(`Other Auth fields changed during verification: ${otherChanges.join(', ')}. They were not included in this update.`);
  console.log(JSON.stringify({ verified: true, password_min_length: after.password_min_length, required: ['uppercase', 'number', 'special character'], unrelatedSettingsUnchanged: true }));
}

import { runtime, edgeAction } from './supabase-runtime.mjs';
const rt = runtime();
const login = await edgeAction(rt, 'login', { username: 'ehradmin', password: process.env.EHR_ADMIN_INITIAL_PASSWORD });
if (login.status !== 200) throw new Error('Administrator sign-in failed.');
const admin = rt.client();
await admin.auth.setSession(login.body.session);
const { data: settings, error } = await admin.rpc('admin_portal_data', { p_section: 'settings' });
if (error) throw new Error('Could not load portal settings.');
const email = `admin-smoke-redirect-${Date.now().toString(36)}@test.invalid`;
const { data, error: createError } = await rt.service.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: 'staff_invited' } });
if (createError) throw new Error('Could not create a disposable redirect fixture.');
try {
  for (const [name, expected] of [
    ['staff setup', `${settings.staff_portal_url}/staff/setup`],
    ['staff recovery', `${settings.staff_portal_url}/auth/callback?type=recovery`],
    ['patient recovery', `${settings.user_portal_url}/auth/callback?type=recovery`],
  ]) {
    const { data: link, error: linkError } = await rt.service.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: expected } });
    if (linkError) throw new Error('Could not inspect a recovery redirect.');
    const actual = new URL(link.properties.action_link).searchParams.get('redirect_to');
    console.log(JSON.stringify({ name, allowed: actual === expected, expected, actual }));
  }
} finally {
  await rt.service.auth.admin.deleteUser(data.user.id);
  await admin.auth.signOut({ scope: 'local' });
}

import { runtime, edgeAction } from './supabase-runtime.mjs';
const rt = runtime();
const email = process.env.EHR_INVITATION_TEST_EMAIL;
if (!email) throw new Error('Set EHR_INVITATION_TEST_EMAIL to the authorized test recipient.');
const login = await edgeAction(rt, 'login', { username: 'ehradmin', password: process.env.EHR_ADMIN_INITIAL_PASSWORD });
if (login.status !== 200) throw new Error(login.body.error || 'Administrator sign-in failed.');
const result = await edgeAction(rt, 'invite_staff', {
  name: 'Clinic Staff Invitation Test', email, role: 'nurse', department: 'University Clinic',
}, login.body.session.access_token);
if (result.status !== 200) throw new Error(result.body.error || 'Invitation failed.');
const invitation = result.body.invitation;
console.log(JSON.stringify({ email: invitation.email, status: invitation.status,
  expires_at: invitation.expires_at, id: invitation.id, message: result.body.message }, null, 2));
const client = rt.client();
await client.auth.setSession(login.body.session);
await client.auth.signOut({ scope: 'local' });

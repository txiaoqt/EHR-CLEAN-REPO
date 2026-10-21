import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runtime, edgeAction } from './supabase-runtime.mjs';

// Integration tests use only disposable accounts at a reserved test domain.
// Passwords/tokens/keys remain in memory and never enter logs or reports.
const rt = runtime();
const stamp = Date.now().toString(36);
const fixtures = [];
const password = () => `Test-${randomBytes(22).toString('base64url')}1`;
const report = { fixtures: [], checks: [], backup: null };
const pass = name => { report.checks.push(name); console.log(`PASS: ${name}`); };
function must(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`); return result.data; }
const login = await edgeAction(rt, 'login', { username: 'ehradmin', password: process.env.EHR_ADMIN_INITIAL_PASSWORD });
if (login.status !== 200) throw new Error(`Admin sign-in failed: ${login.body.error || login.status}`);
const adminToken = login.body.session.access_token;
const actor = login.body.profile.auth_user_id;
const admin = rt.client();
must(await admin.auth.setSession(login.body.session), 'Set admin session');
pass('Real username/password admin sign-in');
const action = (type, data) => edgeAction(rt, type, data, adminToken);
async function rpc(name, args) { return must(await rt.service.rpc(name, args), name); }
async function fixture(label, role = 'staff_invited', staffRole = null) {
  const email = `admin-smoke-${stamp}-${label}@test.invalid`;
  const secret = password();
  const policy = must(await rt.service.rpc('get_active_app_policy'), 'Read active policy');
  const data = must(await rt.service.auth.admin.createUser({ email, password: secret, email_confirm: true,
    app_metadata: { policy_signup_exempt: true, ...(staffRole ? { staff_role: staffRole } : {}) },
    user_metadata: { name: `Integration Test ${label}`, role,
      policy_agreement: { version: policy.version, accepted_terms: true, accepted_privacy: true } },
  }), 'Create test identity');
  const item = { id: data.user.id, email, password: secret };
  fixtures.push(item); report.fixtures.push({ id: item.id, email });
  return item;
}
async function signIn(item) {
  const client = rt.client();
  const result = must(await client.auth.signInWithPassword({ email: item.email, password: item.password }), 'Fixture sign-in');
  return { client, token: result.session.access_token };
}
try {
  for (const section of ['overview','staff','users','invitations','settings']) {
    must(await admin.rpc('admin_portal_data', { p_section: section }), `${section} RPC`);
  }
  pass('All admin directory/settings RPCs load');
  const clinical = must(await admin.from('encounters').select('id').limit(1), 'Admin clinical isolation');
  assert.equal(clinical.length, 0);
  const files = must(await admin.storage.from('enrollee-documents').list(), 'Admin storage isolation');
  assert.equal(files.length, 0);
  pass('System admin is isolated from clinical records/files');
  assert.equal((await edgeAction(rt, 'save_profile', { name: 'Untrusted' })).status, 401);
  const anon = rt.client();
  assert.ok((await anon.rpc('admin_portal_data', { p_section: 'overview' })).error);
  assert.ok((await admin.rpc('system_admin_action', { p_actor: actor, p_action: 'settings', p_payload: {} })).error);
  pass('Anonymous and direct privileged RPC requests are denied');

  const email = `admin-smoke-${stamp}-staff@test.invalid`;
  const invitation = await rpc('system_admin_action', { p_actor: actor, p_action: 'invite_reserve', p_payload: { name: 'Integration Test Clinician', email, role: 'nurse' } });
  const staff = await fixture('staff');
  await rpc('system_admin_action', { p_actor: actor, p_action: 'invite_sent', p_payload: { id: invitation.id, auth_user_id: staff.id } });
  const pending = await signIn(staff);
  const pendingProfile = must(await pending.client.rpc('get_my_portal_identity'), 'Pending identity');
  assert.equal(pendingProfile.staff_setup_required, true);
  assert.equal(must(await pending.client.rpc('current_app_role'), 'Pending role'), null);
  assert.equal((await action('resend_invitation', { id: invitation.id })).status, 400, 'Resend cooldown must prevent duplicate emails');
  assert.equal((await edgeAction(rt, 'save_profile', { name: 'Untrusted' }, pending.token)).status, 403);
  pass('Pending invitation grants setup access only');
  staff.password = password();
  const accepted = await edgeAction(rt, 'complete_invitation', { password: staff.password }, pending.token);
  assert.equal(accepted.status, 200, accepted.body.error);
  assert.ok([401,403].includes((await edgeAction(rt, 'complete_invitation', { password: password() }, pending.token)).status));
  let liveStaff = await signIn(staff);
  assert.equal(must(await liveStaff.client.rpc('current_app_role'), 'Accepted role'), 'nurse');
  pass('Staff chooses password; setup is one-time and requires fresh sign-in');
  assert.equal((await action('invite_staff', { name: 'Duplicate', email: staff.email, role: 'nurse' })).status, 400);
  assert.equal((await edgeAction(rt, 'save_settings', {}, liveStaff.token)).status, 403);
  const escalation = await liveStaff.client.from('admins').update({ role: 'admin' }).eq('auth_user_id', staff.id);
  assert.ok(escalation.error);
  must(await liveStaff.client.auth.updateUser({ data: { role: 'admin' } }), 'Metadata escalation attempt');
  assert.equal(must(await liveStaff.client.rpc('current_app_role'), 'Role after metadata edit'), 'nurse');
  pass('Duplicate invitations, cross-role administration, and metadata escalation are denied');
  const clinicalStaff = await liveStaff.client.from('encounters').select('id').limit(1);
  assert.equal(clinicalStaff.error, null);
  pass('Accepted clinical staff retains existing encounter-query access');

  const suspend = await action('suspend_account', { id: staff.id, reason: 'Automated integration test suspension' });
  assert.equal(suspend.status, 200, suspend.body.error);
  assert.equal(must(await liveStaff.client.rpc('account_can_access'), 'Suspended access'), false);
  assert.equal(must(await liveStaff.client.from('encounters').select('id').limit(1), 'Suspended clinical read').length, 0);
  const suspendedSignIn = await signIn(staff);
  assert.equal(must(await suspendedSignIn.client.rpc('get_my_portal_identity'), 'Suspended identity').active, false);
  assert.equal((await edgeAction(rt, 'save_profile', {}, suspendedSignIn.token)).status, 403);
  pass('Suspension invalidates existing JWT access and blocks a new portal session');
  assert.equal((await action('reactivate_account', { id: staff.id, reason: 'Automated integration test restoration' })).status, 200);
  liveStaff = await signIn(staff);
  assert.equal(must(await liveStaff.client.rpc('account_can_access'), 'Restored access'), true);
  assert.equal((await action('change_staff_role', { id: staff.id, role: 'physician' })).status, 200);
  assert.equal(must(await liveStaff.client.rpc('account_can_access'), 'Old role session'), false);
  liveStaff = await signIn(staff);
  assert.equal(must(await liveStaff.client.rpc('current_app_role'), 'Updated staff role'), 'physician');
  pass('Reactivation and staff role changes require fresh sessions');

  const wrongRole = await fixture('enrollee', 'enrollee');
  const patientSession = await signIn(wrongRole);
  assert.equal((await edgeAction(rt, 'save_settings', {}, patientSession.token)).status, 403);
  assert.ok((await patientSession.client.rpc('admin_portal_data', { p_section: 'users' })).error);
  assert.equal((await action('suspend_account', { id: wrongRole.id, reason: 'Automated applicant access test' })).status, 200);
  assert.equal(must(await patientSession.client.rpc('account_can_access'), 'Applicant suspension'), false);
  pass('Enrollee admin access is denied and suspension applies before registration completes');

  const patient = await fixture('patient', 'patient');
  const patientAccount = await signIn(patient);
  assert.equal(must(await patientAccount.client.rpc('get_my_portal_identity'), 'Patient identity').role, 'patient');
  const directory = must(await patientAccount.client.from('staff_directory').select('role'), 'Existing patient staff directory');
  assert.ok(directory.every(row => ['physician','nurse'].includes(row.role)));
  must(await patientAccount.client.rpc('get_my_app_policy_status'), 'Existing policy status helper');
  assert.equal((await action('suspend_account', { id: patient.id, reason: 'Automated patient account test' })).status, 200);
  assert.equal(must(await patientAccount.client.from('users').select('id'), 'Suspended own-profile query').length, 0);
  assert.equal((await action('reactivate_account', { id: patient.id, reason: 'Automated patient account restoration' })).status, 200);
  pass('Patient signup/profile, policy helper, directory, and account controls work');

  const forged = await fixture('forged-role', 'admin');
  const forgedSession = await signIn(forged);
  assert.equal(must(await forgedSession.client.rpc('get_my_portal_identity'), 'Forged staff identity'), null);
  assert.equal((await edgeAction(rt, 'save_profile', {}, forgedSession.token)).status, 403);
  pass('A new account cannot self-assign an administrator role through signup metadata');

  assert.equal((await action('suspend_account', { id: actor, reason: 'Self suspension attempt' })).status, 400);
  assert.equal((await action('change_staff_role', { id: staff.id, role: 'admin' })).status, 400);
  assert.equal((await action('save_settings', { clinic_name: 'Clinic', staff_portal_url: 'https://user:password@evil.invalid', admin_portal_url: 'https://example.invalid', user_portal_url: 'https://example.invalid', invitation_expiry_minutes: 5 })).status, 400);
  pass('Self suspension, administrator escalation, and credential-bearing redirect URLs are denied');

  const extraAdmin = await fixture('secondary-admin', 'admin', 'admin');
  const extraSession = await signIn(extraAdmin);
  const nextPassword = password();
  const changed = await edgeAction(rt, 'change_password', { current_password: extraAdmin.password, password: nextPassword }, extraSession.token);
  assert.equal(changed.status, 200, changed.body.error);
  const oldLogin = await rt.client().auth.signInWithPassword({ email: extraAdmin.email, password: extraAdmin.password });
  assert.ok(oldLogin.error);
  extraAdmin.password = nextPassword; await signIn(extraAdmin);
  pass('Administrator password change verifies current password and revokes sessions');

  const backup = await admin.functions.invoke('backup-control', { body: { action: 'list_runs' } });
  report.backup = backup.error ? { available: false, status: backup.error.context?.status || null } : { available: true, runs: backup.data?.runs?.length || 0 };
  if (backup.error) console.log(`NOTE: backup service status ${report.backup.status}; review configuration.`);
  else pass('Existing backup service accepts the dedicated system administrator');
} finally {
  // Only accounts created by this run are removed. Existing staff/patients and
  // the user's actual invitation address are never modified by these tests.
  for (const item of fixtures.reverse()) {
    await rt.service.from('admins').delete().eq('auth_user_id', item.id);
    await rt.service.from('users').delete().eq('auth_user_id', item.id);
    await rt.service.auth.admin.deleteUser(item.id);
  }
  await admin.auth.signOut({ scope: 'local' });
  mkdirSync('scratch', { recursive: true });
  writeFileSync('scratch/admin-live-test-report.json', JSON.stringify(report, null, 2));
  console.log(`Integration run ${stamp}: ${report.checks.length} checks passed. Disposable Auth accounts cleaned up.`);
}

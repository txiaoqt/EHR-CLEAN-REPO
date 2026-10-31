import { createClient } from 'npm:@supabase/supabase-js@2.86.0';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE } from '../_shared/passwordPolicy.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const portalUrl = (value: unknown) => {
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new RequestError('Enter a valid portal URL.'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new RequestError('Portal URLs must contain an origin only.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new RequestError('Use HTTPS for a deployed portal URL.');
  return url.origin;
};
class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// The gateway accepts the public username sign-in action. Every other action
// authenticates its JWT here and checks a live DB session and authoritative role.
// No role, actor ID, or email supplied by a browser is an authorization decision.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST for this request.' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 16000) throw new RequestError('Request is too large.', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new RequestError('Send a valid JSON request.'); }
    const action = String(body.action || '');
    const payload = (body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {}) as Record<string, unknown>;
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
    const operation = async (actor: string | null, name: string, data: Record<string, unknown> = {}) => {
      const { data: result, error } = await service.rpc('system_admin_action', { p_actor: actor, p_action: name, p_payload: data });
      if (error) throw new RequestError(error.message.replace('Use My Account.', 'Use the account menu.'), error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400);
      return result;
    };

    if (action === 'login') {
      const username = String(payload.username || '').trim().toLowerCase();
      const password = String(payload.password || '');
      if (!username || username.length > 120 || !password || password.length > 128) throw new RequestError('Enter your administrator username and password.');
      const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|' + username));
      const rate_key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const target = await operation(null, 'login_target', { username, rate_key });
      if (target.blocked) throw new RequestError('Too many sign-in attempts. Try again in 15 minutes.', 429);
      if (!target.email) {
        await operation(null, 'login_failed', { rate_key });
        throw new RequestError('The administrator credentials are incorrect.', 401);
      }
      const auth = createClient(url, anon, options);
      const { data, error } = await auth.auth.signInWithPassword({ email: target.email, password });
      if (error || !data.session) {
        await operation(null, 'login_failed', { rate_key });
        throw new RequestError('The administrator credentials are incorrect.', 401);
      }
      const { data: profile } = await auth.rpc('get_my_portal_identity');
      if (profile?.role !== 'admin' || !profile.active) {
        await auth.auth.signOut();
        throw new RequestError('Administrator access is unavailable.', 403);
      }
      await operation(data.user.id, 'login_succeeded', { rate_key });
      return json({ session: data.session, profile });
    }

    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!bearer) throw new RequestError('Sign in to continue.', 401);
    const { data: { user }, error: authError } = await service.auth.getUser(bearer);
    if (authError || !user) throw new RequestError('Your session has expired. Sign in again.', 401);
    const caller = createClient(url, anon, { ...options, global: { headers: { Authorization: `Bearer ${bearer}` } } });
    const { data: identity, error: identityError } = await caller.rpc('get_my_portal_identity');
    if (identityError || !identity || !identity.active) throw new RequestError('Account access is unavailable. Sign in again or contact the administrator.', 403);

    if (action === 'complete_invitation') {
      if (!identity.staff_setup_required || !['physician', 'nurse', 'dentist', 'admin'].includes(identity.role)) throw new RequestError('No active invitation is available.', 403);
      if (!isPasswordValid(payload.password)) throw new RequestError(PASSWORD_POLICY_MESSAGE);
      const administrator = identity.role === 'admin';
      const username = String(payload.username || '').trim().toLowerCase();
      if (administrator && !/^[a-z][a-z0-9_]{2,39}$/.test(username)) throw new RequestError('Use 3–40 lowercase letters, numbers or underscores, starting with a letter.');
      const metadata = { ...user.app_metadata, app_role: identity.role, ...(!administrator ? { staff_role: identity.role } : {}) };
      const { error } = await service.auth.admin.updateUserById(user.id, { password: String(payload.password), app_metadata: metadata });
      if (error) throw new RequestError('Could not set your password. Try again.');
      let result;
      if (administrator) {
        const { data, error: completeError } = await service.rpc('complete_administrator_invitation', { p_actor: user.id, p_username: username });
        if (completeError) throw new RequestError(completeError.message);
        result = data;
      } else {
        result = await operation(user.id, 'complete_invitation');
      }
      // The invitation session cannot be reused as a portal session. Sign in
      // with the newly chosen password after setup to create a fresh session.
      await service.auth.admin.signOut(bearer, 'global');
      return json(result);
    }
    if (identity.role !== 'admin' || identity.staff_setup_required) throw new RequestError('System administrator access required.', 403);
    if (['delete_invitation','delete_administrator','delete_user_account'].includes(action)) {
      if (!uuid(payload.id)) throw new RequestError('Choose an account or invitation to delete.');
      const parameters = { p_actor: user.id, p_kind: action === 'delete_invitation' ? 'invitation' : action === 'delete_user_account' ? 'user' : 'administrator',
        p_target: payload.id, p_confirmation_email: String(payload.confirmation_email || '').trim().toLowerCase() };
      const deletion = async (stage: string) => {
        const { data, error } = await service.rpc('admin_delete_account', { ...parameters, p_stage: stage });
        if (error) throw new RequestError(error.message, error.code === '42501' ? 403 : 400);
        return data;
      };
      const prepared = await deletion('prepare');
      if (prepared.completed) return json({ deleted: true });
      if (prepared.auth_user_id && !prepared.auth_deleted) {
        // Sessions and portal access have already been disabled transactionally.
        // Soft deletion preserves historical Auth foreign keys and frees the
        // email for a new invitation. Never cascade-delete clinical records.
        const { error } = await service.auth.admin.deleteUser(prepared.auth_user_id, true);
        if (error && error.code !== 'user_not_found') {
          throw new RequestError('Access has been disabled, but the sign-in could not be deleted. Retry delete to finish cleanup.', 503);
        }
      }
      try { await deletion('complete'); }
      catch (error) {
        if (error instanceof RequestError && error.status === 403) throw error;
        throw new RequestError('Access has been disabled, but cleanup is incomplete. Retry delete to finish.', 503);
      }
      return json({ deleted: true });
    }
    const { data: settings } = await caller.rpc('admin_portal_data', { p_section: 'settings' });
    if (!settings) throw new RequestError('Could not load system settings.', 503);
    const staffOrigin = portalUrl(settings.staff_portal_url);
    // Dentists use the Dental Portal, a separate deployment in the dental clinic.
    const clinicOrigin = (role: string) => role === 'dentist' ? portalUrl(settings.dental_portal_url || 'http://127.0.0.1:5176') : staffOrigin;

    if (action === 'invite_staff' || action === 'resend_invitation') {
      let invitation;
      if (action === 'invite_staff') {
        if (!['physician', 'nurse', 'dentist', 'admin'].includes(String(payload.role))) throw new RequestError('Choose Admin, Physician, Nurse or Dentist.');
        const name = String(payload.name || '').trim();
        if (name.length < 2 || name.length > 120) throw new RequestError('Enter the recipient’s full name.');
        invitation = await operation(user.id, 'invite_reserve', {
          name, email: String(payload.email || '').trim().toLowerCase(), role: payload.role,
          department: String(payload.department || 'University Clinic').trim(),
        });
      } else {
        if (!uuid(payload.id)) throw new RequestError('Choose an invitation.');
        invitation = await operation(user.id, 'invite_resend', { id: payload.id });
      }
      let invitedUserId: string | null = null;
      try {
        const administrator = invitation.role === 'admin';
        const setupOrigin = administrator ? portalUrl(settings.admin_portal_url) : clinicOrigin(invitation.role);
        const setupUrl = `${setupOrigin}/${administrator ? 'admin' : 'staff'}/setup`;
        const inviteData = { role: 'staff_invited', name: invitation.name, invitation_id: invitation.id,
          staff_role_label: administrator ? 'Administrator' : invitation.role === 'physician' ? 'Physician' : invitation.role === 'dentist' ? 'Dentist' : 'Nurse',
          portal_label: administrator ? 'System Admin Portal' : invitation.role === 'dentist' ? 'Dental Portal' : 'Staff Portal',
          staff_setup_url: setupUrl,
          invitation_minutes: Math.max(1, Math.round((Date.parse(invitation.expires_at) - Date.now()) / 60000)) };
        const { data: recoverableId, error: recoveryError } = await service.rpc('admin_invitation_auth_user', {
          p_actor: user.id, p_invitation: invitation.id,
        });
        if (recoveryError) throw new Error(recoveryError.message);
        invitedUserId = recoverableId;
        if (!invitedUserId) {
          const { data, error } = await service.auth.admin.inviteUserByEmail(invitation.email, {
            data: inviteData, redirectTo: setupUrl,
          });
          if (error || !data.user) throw new Error(error?.message || 'Invitation could not be sent.');
          invitedUserId = data.user.id;
        } else {
          // Supabase can resend an unaccepted invite with inviteUserByEmail. It
          // keeps the existing Auth identity and uses the configured invite email.
          const { data: existing } = await service.auth.admin.getUserById(invitedUserId);
          if (!existing?.user) throw new Error('The invited Auth account is unavailable.');
          const { error: metadataError } = await service.auth.admin.updateUserById(invitedUserId, {
            user_metadata: { ...existing.user.user_metadata, ...inviteData },
          });
          if (metadataError) throw new Error('Could not refresh the invitation details. Try again.');
          const { error } = existing?.user?.email_confirmed_at
            ? await service.auth.resetPasswordForEmail(invitation.email, { redirectTo: setupUrl })
            : await service.auth.admin.inviteUserByEmail(invitation.email, {
              data: inviteData, redirectTo: setupUrl,
            });
          if (error) throw new Error(error.message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invitation email could not be sent.';
        // Recording the failure must not replace the reason the admin needs to see.
        try { await operation(user.id, 'invite_failed', { id: invitation.id, message }); } catch (_) { /* Row stays 'sending'; Resend recovers it. */ }
        throw new RequestError(message);
      }
      // The email is out, so a failure here is not a failed send: marking it
      // failed would block the link the recipient already has. The row stays
      // 'sending', and Resend reuses the same Auth identity to finish it.
      try {
        const result = await operation(user.id, 'invite_sent', { id: invitation.id, auth_user_id: invitedUserId });
        return json({ invitation: result, message: 'Invitation email sent.' });
      } catch (_) {
        throw new RequestError('The invitation email was sent but could not be recorded. Wait one minute, then use Resend.', 503);
      }
    }
    if (action === 'revoke_invitation') {
      if (!uuid(payload.id)) throw new RequestError('Choose an invitation.');
      const result = await operation(user.id, 'invite_revoke', { id: payload.id });
      return json({ invitation: result });
    }
    if (['suspend_account','reactivate_account','unlock_account','change_staff_role'].includes(action)) {
      if (!uuid(payload.id)) throw new RequestError('Choose an account with a linked sign-in.');
      const name = ({ suspend_account: 'suspend', reactivate_account: 'reactivate', unlock_account: 'unlock', change_staff_role: 'change_role' } as Record<string, string>)[action];
      const result = await operation(user.id, name, { id: payload.id, reason: payload.reason, until: payload.until, role: payload.role });
      // Sessions are revoked in the DB transaction. Every Data API operation and
      // portal identity lookup checks that session, including existing JWTs.
      return json({ account: result, message: 'Account updated.' });
    }
    if (action === 'send_password_reset') {
      if (!uuid(payload.id)) throw new RequestError('Choose an account.');
      const { data: target, error: targetError } = await service.auth.admin.getUserById(String(payload.id));
      if (targetError || !target.user?.email) throw new RequestError('Account not found.');
      if (target.user.id === user.id) throw new RequestError('Use Change password in the account menu.');
      const { data: staff } = await service.from('admins').select('role').eq('auth_user_id', target.user.id).maybeSingle();
      if (staff?.role === 'admin') throw new RequestError('System administrator accounts are protected.');
      if (!staff || !['physician','nurse','dentist'].includes(staff.role)) throw new RequestError('User accounts reset their password through Forgot password on the patient portal.', 403);
      const origin = staff ? clinicOrigin(staff.role) : portalUrl(settings.user_portal_url);
      const { error } = await service.auth.resetPasswordForEmail(target.user.email, { redirectTo: `${origin}/auth/callback?type=recovery` });
      if (error) throw new RequestError('The password reset email could not be sent. Try again later.');
      await operation(user.id, 'password_reset', { id: target.user.id });
      return json({ message: 'Password reset email sent.' });
    }
    if (action === 'save_settings') {
      const minutes = Number(payload.invitation_expiry_minutes);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) throw new RequestError('Invitation expiry must be 5–60 minutes.');
      const clinic = String(payload.clinic_name || '').trim();
      if (clinic.length < 3 || clinic.length > 120) throw new RequestError('Enter the clinic name.');
      const result = await operation(user.id, 'settings', { clinic_name: clinic,
        staff_portal_url: portalUrl(payload.staff_portal_url), admin_portal_url: portalUrl(payload.admin_portal_url),
        user_portal_url: portalUrl(payload.user_portal_url),
        ...(payload.dental_portal_url ? { dental_portal_url: portalUrl(payload.dental_portal_url) } : {}), invitation_expiry_minutes: minutes });
      return json({ settings: result });
    }
    if (action === 'save_profile') {
      if (typeof payload.name !== 'string') throw new RequestError('Enter your full name.');
      const { data, error } = await service.rpc('update_administrator_name', { p_actor: user.id, p_name: payload.name });
      if (error) throw new RequestError(error.message, error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400);
      return json(data);
    }
    if (action === 'change_password') {
      if (!isPasswordValid(payload.password)) throw new RequestError(PASSWORD_POLICY_MESSAGE);
      const passwordClient = createClient(url, anon, options);
      const { data, error } = await passwordClient.auth.signInWithPassword({ email: user.email!, password: String(payload.current_password || '') });
      if (error || !data.user) throw new RequestError('Your current password is incorrect.', 401);
      const { error: updateError } = await service.auth.admin.updateUserById(user.id, { password: String(payload.password) });
      await passwordClient.auth.signOut();
      if (updateError) throw new RequestError('Could not change your password. Try again.');
      await operation(user.id, 'password_changed');
      await service.auth.admin.signOut(bearer, 'global');
      return json({ message: 'Password changed. Sign in again.' });
    }
    throw new RequestError('Unknown administration action.');
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    // Do not return stack traces, Auth tokens, SMTP credentials, or request bodies.
    console.error('system-admin request failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'The administration service could not complete this request. Try again.' }, 500);
  }
});

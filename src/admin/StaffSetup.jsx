import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import { adminAction, formatAdminDate } from './adminApi.js';
import logo from '../assets/images/tupehrlogo.jpg';
import './admin.css';

// StrictMode can mount an effect twice. Reuse a handoff rather than consume a
// one-time invitation code twice. The token stays in memory, never a log or URL.
const handoffs = new Map();
export default function StaffSetup() {
  const { logout, setIsPasswordRecoverySession } = useAuth();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        if (query.get('error') || hash.get('error')) throw new Error('This setup link is invalid or expired. Ask the administrator to resend your invitation.');
        const tokenHash = query.get('token_hash');
        const code = query.get('code');
        const handoffKey = tokenHash || code;
        if (handoffKey && !handoffs.has(handoffKey)) {
          handoffs.set(handoffKey, tokenHash
            ? supabase.auth.verifyOtp({ token_hash: tokenHash, type: query.get('type') === 'recovery' ? 'recovery' : 'invite' })
            : supabase.auth.exchangeCodeForSession(code));
        }
        if (handoffKey) {
          const result = await handoffs.get(handoffKey);
          if (result.error) throw new Error('This setup link has expired or was already used. Ask the administrator for a new invitation.');
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Open the staff invitation from your email to choose your password.');
        const { data, error: lookupError } = await supabase.rpc('get_my_portal_identity');
        if (lookupError || !data?.staff_setup_required || !data.active) throw new Error(data?.access_message || 'No pending invitation is available for this account. Sign in if you have already finished setup.');
        if (mounted) {
          setIdentity(data); setIsPasswordRecoverySession(false);
          window.history.replaceState(null, '', '/staff/setup');
        }
      } catch (err) { if (mounted) setError(err.message); }
      finally { if (mounted) setLoading(false); }
    };
    void load(); return () => { mounted = false; };
  }, [setIsPasswordRecoverySession]);
  const submit = async (event) => {
    event.preventDefault(); if (started.current) return;
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    started.current = true; setBusy(true); setError('');
    try {
      await adminAction('complete_invitation', { password });
      await logout({ scope: 'local' });
      navigate('/login', { replace: true, state: { sessionMessage: 'Your staff account is ready. Sign in with your email and new password.' } });
    } catch (err) { setError(err.message); } finally { setBusy(false); started.current = false; }
  };
  return <div className="system-admin-setup"><section className="card system-admin-setup-card">
    <img src={logo} alt="TUP Clinic" width="48" height="48" />
    <h1>Set up your staff account</h1><p className="system-admin-muted">Choose the password you’ll use to sign in to the Staff Portal.</p>
    {loading ? <p role="status">Checking your invitation…</p> : identity && <>
      <dl className="system-admin-setup-identity"><div><dt>Name</dt><dd>{identity.name}</dd></div><div><dt>Email</dt><dd>{identity.email}</dd></div><div><dt>Assigned role</dt><dd>{identity.role === 'physician' ? 'Physician' : 'Nurse'}</dd></div><div><dt>Invitation expires</dt><dd>{formatAdminDate(identity.invitation_expires_at)}</dd></div></dl>
      <form className="system-admin-form" onSubmit={submit}>
        <label>Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} aria-describedby="setup-password-help" /></label>
        <p id="setup-password-help" className="system-admin-muted">Use at least 12 characters, including a letter and a number.</p>
        <label>Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        <button className="btn" disabled={busy || password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || password !== confirmation}>{busy ? 'Setting up account…' : 'Create my staff login'}</button>
      </form>
    </>}
    {error && <p className="system-admin-error" role="alert">{error}</p>}
    <button type="button" className="btn secondary" disabled={busy} onClick={async () => { await logout({ scope: 'local' }); navigate('/login', { replace: true }); }}>Back to staff login</button>
  </section></div>;
}

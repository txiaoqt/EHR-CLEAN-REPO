import React, { useEffect, useRef, useState } from 'react';
import PasswordRequirements from '../components/PasswordRequirements.jsx';
import { CheckIcon, ChevronLeftIcon, EyeIcon, EyeOffIcon } from '../components/icons/Icons.jsx';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../utils/passwordPolicy.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import { adminAction, formatAdminDate } from './adminApi.js';
import logo from '../assets/images/tupehrlogo.jpg';
import './admin.css';

// StrictMode can mount an effect twice. Reuse a handoff rather than consume a
// one-time invitation code twice. The token stays in memory, never a log or URL.
const handoffs = new Map();
export default function StaffSetup({ administration = false }) {
  const { logout, setIsPasswordRecoverySession } = useAuth();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [username, setUsername] = useState('');
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
        if (!session) throw new Error('Open the invitation from your email to set up your account.');
        const { data, error: lookupError } = await supabase.rpc('get_my_portal_identity');
        if (lookupError || !data?.staff_setup_required || !data.active) throw new Error(data?.access_message || 'No pending invitation is available for this account. Sign in if you have already finished setup.');
        if ((data.role === 'admin') !== administration) throw new Error('This invitation belongs to a different portal. Open the original invitation email to reach the correct setup page.');
        if (mounted) {
          setIdentity(data); setIsPasswordRecoverySession(false);
          window.history.replaceState(null, '', administration ? '/admin/setup' : '/staff/setup');
        }
      } catch (err) { if (mounted) setError(err.message); }
      finally { if (mounted) setLoading(false); }
    };
    void load(); return () => { mounted = false; };
  }, [setIsPasswordRecoverySession, administration]);
  const submit = async (event) => {
    event.preventDefault(); if (started.current) return;
    if (!isPasswordValid(password)) { setError(PASSWORD_POLICY_MESSAGE); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    started.current = true; setBusy(true); setError('');
    try {
      await adminAction('complete_invitation', { password, ...(administration ? { username } : {}) });
      await logout({ scope: 'local' });
      const message = administration ? 'Your administrator account is ready. Sign in with your username and new password.' : 'Your staff account is ready. Sign in with your email and new password.';
      navigate('/login', { replace: true, state: administration ? { message } : { sessionMessage: message } });
    } catch (err) { setError(err.message); } finally { setBusy(false); started.current = false; }
  };
  const passwordsMatch = confirmation.length > 0 && password === confirmation;
  const confirmationInvalid = confirmationTouched && confirmation.length > 0 && !passwordsMatch;
  return <div className="system-admin-setup" role="main">
    <section className="card system-admin-setup-card" aria-labelledby="setup-title">
      <header className="system-admin-setup-header">
        <img src={logo} alt="TUP Clinic" width="48" height="48" />
        <div>
          <h1 id="setup-title">{administration ? 'Set Up Your Administrator Account' : 'Set Up Your Staff Account'}</h1>
          <p>{administration ? 'Choose your username and password for the System Admin Portal.' : 'Choose your password for the Staff Portal.'}</p>
        </div>
      </header>
      {loading ? <p className="system-admin-setup-status" role="status">Checking your invitation…</p> : identity && <>
        <dl className="system-admin-setup-identity">
          <div className="system-admin-setup-name"><dt className="sr-only">Name</dt><dd>{identity.name}</dd></div>
          <div className="system-admin-setup-role"><dt className="sr-only">Assigned Role</dt><dd>{identity.role === 'admin' ? 'Administrator' : identity.role === 'physician' ? 'Physician' : 'Nurse'}</dd></div>
          <div className="system-admin-setup-email"><dt className="sr-only">Email</dt><dd>{identity.email}</dd></div>
          <div className="system-admin-setup-expiry"><dt>Invitation Expires</dt><dd>{formatAdminDate(identity.invitation_expires_at)}</dd></div>
        </dl>
        <form className="system-admin-form system-admin-setup-form" onSubmit={submit} aria-busy={busy}>
          {administration && <label>Username<input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={busy} minLength={3} maxLength={40} pattern="[a-z][a-z0-9_]{2,39}" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} aria-describedby="setup-username-help" /><small id="setup-username-help">Use 3–40 lowercase letters, numbers or underscores, starting with a letter.</small></label>}
          <div className="system-admin-setup-credential">
            <div className="system-admin-setup-field">
              <label htmlFor="setup-password">Password</label>
              <div className="system-admin-setup-password">
                <input id="setup-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} aria-describedby="setup-password-help" />
                <button type="button" disabled={busy} aria-label={showPassword ? 'Hide Password' : 'Show Password'} aria-controls="setup-password" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
              </div>
            </div>
            <PasswordRequirements id="setup-password-help" password={password} />
          </div>
          <div className="system-admin-setup-field">
            <label htmlFor="setup-confirmation">Confirm Password</label>
            <div className="system-admin-setup-password">
              <input id="setup-confirmation" name="confirm-password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} onBlur={() => setConfirmationTouched(true)} aria-invalid={confirmationInvalid} aria-describedby="setup-confirmation-help" />
              <button type="button" disabled={busy} aria-label={showConfirmation ? 'Hide Confirm Password' : 'Show Confirm Password'} aria-controls="setup-confirmation" onClick={() => setShowConfirmation(value => !value)}>{showConfirmation ? <EyeOffIcon /> : <EyeIcon />}</button>
            </div>
            <p id="setup-confirmation-help" className={`system-admin-setup-match${passwordsMatch ? ' is-matched' : confirmationInvalid ? ' is-mismatched' : ''}`} role="status">{passwordsMatch ? <><CheckIcon size={14} />Passwords match.</> : confirmationInvalid ? 'Passwords do not match yet.' : 'Re-enter your password to confirm.'}</p>
          </div>
          {error && <p className="system-admin-error" role="alert">{error}</p>}
          <button type="submit" className="btn system-admin-setup-submit" disabled={busy || (administration && !/^[a-z][a-z0-9_]{2,39}$/.test(username)) || !isPasswordValid(password) || password !== confirmation}>{busy ? 'Creating Account…' : 'Create Account'}</button>
        </form>
      </>}
      {error && !identity && <p className="system-admin-error system-admin-setup-status" role="alert">{error}</p>}
      <footer className="system-admin-setup-footer">
        <button type="button" className="system-admin-setup-back" disabled={busy} onClick={async () => { await logout({ scope: 'local' }); navigate('/login', { replace: true }); }}><ChevronLeftIcon />{administration ? 'Back to Administrator Login' : 'Back to Staff Login'}</button>
      </footer>
    </section>
  </div>;
}

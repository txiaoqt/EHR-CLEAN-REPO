import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { adminAction } from './adminApi.js';
import PasswordRequirements from '../components/PasswordRequirements.jsx';
import { isPasswordValid } from '../utils/passwordPolicy.js';
import { composeFullName } from '../utils/nameFormat.js';
import PersonNameFields, { emptyPersonName, validPersonName } from './PersonNameFields.jsx';
import { CloseIcon, EyeIcon, EyeOffIcon } from '../components/icons/Icons.jsx';

function PasswordField({ id, label, value, onChange, autoComplete, autoFocus, hint, onBlur, disabled }) {
  const [visible, setVisible] = useState(false);
  return <label htmlFor={id}>{label}<span className="system-admin-account-password">
    <input id={id} type={visible ? 'text' : 'password'} required maxLength={128} value={value} disabled={disabled}
      autoComplete={autoComplete} autoFocus={autoFocus} aria-describedby={hint} onBlur={onBlur} onChange={e => onChange(e.target.value)} />
    <button type="button" disabled={disabled} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(v => !v)}>
      {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
    </button>
  </span></label>;
}

export default function AdminAccountDialog({ type, required = false, onClose, onSaved, onSignOut }) {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const dialog = useRef(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  const requiredRef = useRef(required);
  closeRef.current = onClose;
  requiredRef.current = required;
  const [name, setName] = useState(emptyPersonName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changingName = type === 'name';
  const normalizedName = composeFullName(name);
  const originalName = (user.name || '').replace(/\s+/g, ' ').trim();
  const validPassword = isPasswordValid(password);
  const mismatch = confirmationTouched && confirmation && confirmation !== password;
  const canSubmit = changingName ? validPersonName(name) && normalizedName !== originalName
    : currentPassword.length > 0 && validPassword && password === confirmation;

  useEffect(() => {
    alive.current = true;
    const node = dialog.current;
    node.showModal();
    const cancel = event => {
      event.preventDefault();
      if (!busyRef.current && !requiredRef.current) closeRef.current();
    };
    node.addEventListener('cancel', cancel);
    return () => { alive.current = false; node.removeEventListener('cancel', cancel); node.close(); };
  }, []);

  const submit = async event => {
    event.preventDefault();
    if (busyRef.current || !canSubmit) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      if (changingName) {
        const result = await adminAction('save_profile', { name: normalizedName });
        updateUser({ name: result.name });
        window.dispatchEvent(new CustomEvent('auditLogAdded'));
        if (alive.current) onSaved('Your name was updated.');
      } else {
        await adminAction('change_password', { current_password: currentPassword, password });
        await logout({ scope: 'local' });
        navigate('/login', { replace: true, state: { message: 'Password changed. Sign in with your new password.' } });
      }
    } catch (err) { if (alive.current) setError(err.message); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };

  return createPortal(<dialog ref={dialog} className="system-admin-dialog system-admin-account-dialog" aria-labelledby="admin-account-dialog-title" aria-describedby="admin-account-dialog-description" aria-modal="true">
    <form className="system-admin-form" onSubmit={submit} aria-busy={busy}>
      <header><h2 id="admin-account-dialog-title">{changingName ? 'Change Name' : 'Change Password'}</h2>
        {!required && <button type="button" className="system-admin-icon-btn" aria-label="Close dialog" disabled={busy} onClick={onClose}><CloseIcon /></button>}
      </header>
      <p id="admin-account-dialog-description" className="system-admin-muted">{changingName
        ? 'Update the name shown in your administrator account.'
        : required ? 'Change your initial password to continue. You will sign in again after saving.'
          : 'Verify your current password to choose a new one. All your administrator sessions will end after saving.'}</p>
      {changingName ? <>
        <div className="system-admin-dialog-identity"><span>Current Name</span><strong>{user.name}</strong></div>
        <PersonNameFields value={name} onChange={value => { setName(value); setError(''); }} disabled={busy} describedBy="admin-account-name-hint" />
        <p className="system-admin-muted" id="admin-account-name-hint">Administrator names must be unique, including differences in capitalization or extra spaces.</p>
      </> : <>
        <PasswordField id="admin-current-password" label="Current Password" value={currentPassword} onChange={value => { setCurrentPassword(value); setError(''); }} autoComplete="current-password" autoFocus disabled={busy} />
        <PasswordField id="admin-new-password" label="New Password" value={password} onChange={value => { setPassword(value); setError(''); }} autoComplete="new-password" hint="admin-password-hint" disabled={busy} />
        <PasswordRequirements id="admin-password-hint" password={password} />
        <PasswordField id="admin-confirm-password" label="Confirm New Password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" hint={mismatch ? 'admin-password-mismatch' : undefined} onBlur={() => setConfirmationTouched(true)} disabled={busy} />
        {mismatch && <p id="admin-password-mismatch" className="system-admin-account-field-error" role="status">The new passwords do not match.</p>}
      </>}
      {error && <p className="system-admin-error" role="alert">{error}</p>}
      <footer><button type="button" className="btn secondary" disabled={busy} onClick={required ? onSignOut : onClose}>{required ? 'Sign Out' : 'Cancel'}</button>
        <button type="submit" className="btn" disabled={busy || !canSubmit}>{busy ? 'Saving…' : changingName ? 'Save Name' : 'Change Password'}</button></footer>
    </form>
  </dialog>, document.body);
}

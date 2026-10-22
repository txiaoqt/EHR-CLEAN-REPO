import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../AuthContext.jsx';
import { adminAction, adminData, formatAdminDate } from './adminApi.js';
import TablePagination from '../components/table/TablePagination.jsx';
import { PlusIcon, SearchIcon, CloseIcon, UsersIcon, MailIcon, HistoryIcon, BackupIcon } from '../components/icons/Icons.jsx';

function useAdminData(section, search = '', status = 'all', page = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let current = true;
    setState(previous => ({ ...previous, loading: true, error: '' }));
    const timer = setTimeout(async () => {
      try {
        const data = await adminData(section, { search, status, page });
        if (current) setState({ data, loading: false, error: '' });
      } catch (err) { if (current) setState({ data: null, loading: false, error: err.message }); }
    }, search ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [section, search, status, page, revision]);
  useEffect(() => { window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [refresh]);
  return { ...state, refresh };
}

function Heading({ title, description, children }) {
  return <div className="page-header"><div className="page-header-title-block"><h1 className="page-header-title">{title}</h1><p className="page-header-subtitle">{description}</p></div><div className="page-header-actions">{children}</div></div>;
}
function LoadError({ error, retry }) {
  return error && <div className="system-admin-error" role="alert">{error} {retry && <button className="btn secondary" onClick={retry}>Try again</button>}</div>;
}
function Status({ value }) { return <span className={`system-admin-status status-${value}`}>{String(value || 'unavailable').replaceAll('_', ' ')}</span>; }
function Feedback({ message }) { return message && <div className="system-admin-notice" role="status">{message}</div>; }

export function AdminOverview() {
  const { data, loading, error, refresh } = useAdminData('overview');
  const metrics = [
    ['Active staff', 'active_staff', '/admin/staff'], ['Pending invitations', 'pending_invitations', '/admin/staff?tab=invitations'],
    ['Suspended accounts', 'suspended_accounts', '/admin/users?status=suspended'], ['User accounts', 'user_accounts', '/admin/users'],
  ];
  return <main className="main"><div className="page">
    <Heading title="Overview" description="Account access and system activity for the TUP Manila Clinic."><button className="btn secondary" onClick={refresh} disabled={loading}>Refresh</button><Link className="btn" to="/admin/staff?invite=1"><PlusIcon />Invite staff</Link></Heading>
    <LoadError error={error} retry={refresh} />
    <div className="system-admin-metrics" aria-busy={loading}>{metrics.map(([label, key, path]) => <Link className="card system-admin-metric" to={path} key={key}><span>{label}</span><strong>{loading || !data ? '—' : data[key] ?? 0}</strong><span>View details <span aria-hidden="true">→</span></span></Link>)}</div>
    <div className="system-admin-overview-columns">
      <section className="card"><div className="system-admin-section-head"><div><h2>Recent administration activity</h2><p className="system-admin-muted">Invitation and account changes recorded by the server.</p></div><Link to="/admin/audit-trail">View audit trail</Link></div>
        {loading ? <p role="status">Loading activity…</p> : data?.recent_activity?.length ? <ol className="system-admin-activity">{data.recent_activity.map(row => <li key={row.id}><HistoryIcon /><div><strong>{row.description}</strong><p>{row.user_name} · {formatAdminDate(row.created_at)}</p></div></li>)}</ol> : <div className="system-admin-empty"><HistoryIcon size={28} /><h3>No administration activity yet</h3><p>New invitations and account changes will appear here.</p></div>}
      </section>
      <div className="system-admin-stack"><section className="card"><h2>Access management</h2><p className="system-admin-muted">Invite clinic personnel and review their account status.</p><div className="system-admin-quick-links"><Link to="/admin/staff"><UsersIcon />Manage staff accounts</Link><Link to="/admin/staff?tab=invitations"><MailIcon />View invitations</Link><Link to="/admin/users"><UsersIcon />Manage patient and enrollee accounts</Link></div></section>
        <section className="card"><h2>System status</h2><dl className="system-admin-facts"><div><dt>Failed admin sign-ins today</dt><dd>{loading ? '—' : data?.failed_logins_today ?? 0}</dd></div><div><dt>Last recorded backup</dt><dd>{data?.last_backup ? String(typeof data.last_backup === 'string' ? data.last_backup : data.last_backup.completedAt || 'Recorded') : 'No backup recorded'}</dd></div></dl><Link className="btn secondary" to="/admin/backup-recovery"><BackupIcon />Backup & Recovery</Link></section></div>
    </div>
  </div></main>;
}

function ActionDialog({ action, onClose, onComplete }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [role, setRole] = useState(action.row?.role || 'nurse');
  const [invite, setInvite] = useState({ name: '', email: '', role: 'nurse', department: 'University Clinic' });
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const names = { invite_staff: 'Invite staff member', suspend_account: 'Suspend account', reactivate_account: 'Reactivate account', unlock_account: 'Unlock account', change_staff_role: 'Change staff role', send_password_reset: 'Send password reset', resend_invitation: 'Resend invitation', revoke_invitation: 'Revoke invitation' };
  const title = names[action.type];
  const requiresReason = ['suspend_account', 'reactivate_account'].includes(action.type);
  useEffect(() => {
    const node = dialog.current; node.showModal();
    const cancel = event => { event.preventDefault(); if (!busyRef.current) onClose(); };
    node.addEventListener('cancel', cancel);
    return () => { node.removeEventListener('cancel', cancel); node.close(); };
  }, [onClose]);
  const submit = async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const payload = action.type === 'invite_staff' ? invite : { id: action.row.id,
        reason: reason.trim(), until: until ? new Date(until).toISOString() : null, role };
      await adminAction(action.type, payload);
      onComplete(action.type === 'invite_staff' || action.type === 'resend_invitation'
        ? 'Invitation email sent. The staff member can now choose their password.'
        : action.type === 'send_password_reset' ? 'Password reset email sent.' : 'The account access change was saved.');
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="system-admin-dialog" aria-labelledby="admin-action-title">
    <form onSubmit={submit} className="system-admin-form">
      <header><h2 id="admin-action-title">{title}</h2><button type="button" className="system-admin-icon-btn" aria-label="Close dialog" disabled={busy} onClick={onClose}><CloseIcon /></button></header>
      {action.row && <div className="system-admin-dialog-identity"><strong>{action.row.name}</strong><span>{action.row.email}</span></div>}
      {action.type === 'invite_staff' && <>
        <p className="system-admin-muted">The invitation uses the clinic’s Supabase Auth email. Staff create their own password; access starts after setup.</p>
        <label>Full name<input autoFocus required maxLength={120} minLength={2} value={invite.name} onChange={e => setInvite({ ...invite, name: e.target.value })} autoComplete="name" /></label>
        <label>Staff email<input type="email" required maxLength={254} value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} autoComplete="email" /></label>
        <div className="system-admin-form-row"><label>Assigned role<select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}><option value="nurse">Nurse</option><option value="physician">Physician</option></select></label><label>Department<input required maxLength={120} value={invite.department} onChange={e => setInvite({ ...invite, department: e.target.value })} /></label></div>
      </>}
      {action.type === 'suspend_account' && <p>Existing sessions will be revoked. This account cannot access the portal while suspended. Clinical records are retained.</p>}
      {action.type === 'reactivate_account' && <p>Restore this account’s portal access. The account holder will need to sign in again.</p>}
      {requiresReason && <label>Reason<textarea required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} autoFocus placeholder="Explain this access change for the audit trail…" /></label>}
      {action.type === 'suspend_account' && <label>Suspended until <span className="system-admin-muted">(optional)</span><input type="datetime-local" value={until} min={new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setUntil(e.target.value)} /><small>Leave blank to keep the account suspended until you reactivate it.</small></label>}
      {action.type === 'change_staff_role' && <><label>Assigned role<select value={role} onChange={e => setRole(e.target.value)}><option value="nurse">Nurse</option><option value="physician">Physician</option></select></label><p className="system-admin-muted">Their sessions will end and the new role applies on their next sign-in.</p></>}
      {action.type === 'revoke_invitation' && <p>This setup link will stop working. The staff member will not gain access. You can resend an invitation later.</p>}
      {action.type === 'resend_invitation' && <p>Send a fresh setup link to this email address. Previous sessions will be revoked.</p>}
      {action.type === 'send_password_reset' && <p>Send a password reset email through Supabase Auth to the account holder.</p>}
      {action.type === 'unlock_account' && <p>Clear failed login attempts and the temporary login lockout.</p>}
      <LoadError error={error} />
      <footer><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn" disabled={busy || (requiresReason && reason.trim().length < 5)}>{busy ? 'Saving…' : title}</button></footer>
    </form>
  </dialog>, document.body);
}

export function AdminAccounts({ kind }) {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const accountSearchRef = useRef(null);
  const [tab, setTab] = useState(kind === 'staff' && query.get('tab') === 'invitations' ? 'invitations' : kind);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(query.get('status') || 'all');
  const [page, setPage] = useState(0);
  const [action, setAction] = useState(kind === 'staff' && query.get('invite') === '1' ? { type: 'invite_staff' } : null);
  const [message, setMessage] = useState('');
  const section = kind === 'users' ? 'users' : tab;
  const { data, loading, error, refresh } = useAdminData(section, search, status, page);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setTab(kind === 'staff' && params.get('tab') === 'invitations' ? 'invitations' : kind);
    setSearch(''); setStatus(params.get('status') || 'all'); setPage(0);
    setAction(kind === 'staff' && params.get('invite') === '1' ? { type: 'invite_staff' } : null);
  }, [kind, location.search]);
  const closeDialog = useCallback(() => setAction(null), []);
  const changeTab = value => { setTab(value); setSearch(''); setStatus('all'); setPage(0); navigate(`/admin/staff${value === 'invitations' ? '?tab=invitations' : ''}`, { replace: true }); };
  const open = (type, row) => setAction({ type, row });
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  useEffect(() => {
    if (!loading && !error && page >= totalPages) setPage(totalPages - 1);
  }, [loading, error, page, totalPages]);
  const invitations = section === 'invitations';
  const directoryTitle = invitations ? 'Staff invitations' : kind === 'staff' ? 'Staff directory' : 'User directory';
  const statuses = invitations ? ['pending', 'accepted', 'expired', 'revoked', 'failed', 'sending'] : ['active', 'suspended', 'locked', 'inactive', ...(kind === 'staff' ? ['invited'] : ['retired'])];
  return <main className="main"><div className="page">
    <Heading title={kind === 'staff' ? 'Staff Accounts' : 'User Accounts'} description={kind === 'staff' ? 'Invite clinic personnel and manage their sign-in access.' : 'Manage patient and enrollee account access and suspension status.'}>
      <button className="btn secondary" onClick={refresh} disabled={loading}>Refresh</button>{kind === 'staff' && <button className="btn" onClick={() => open('invite_staff')}><PlusIcon />Invite staff</button>}
    </Heading>
    <Feedback message={message} />
    {kind === 'staff' && <div className="system-admin-tabs" role="tablist" aria-label="Staff account views"><button role="tab" aria-selected={tab === 'staff'} onClick={() => changeTab('staff')}>Staff directory</button><button role="tab" aria-selected={tab === 'invitations'} onClick={() => changeTab('invitations')}>Invitations</button></div>}
    <section className="card table-section-card system-admin-table-card" aria-label={directoryTitle} aria-busy={loading}>
      <div className="table-section-header">
        <div><h2>{directoryTitle}</h2><span className="card-subtitle">{invitations ? 'Track invitation delivery and account setup.' : kind === 'staff' ? 'Clinic staff accounts and sign-in access.' : 'Patient and enrollee accounts and sign-in access.'}</span></div>
        <span className="badge badge-neutral" role="status">{loading ? 'Loading…' : `${total.toLocaleString()} ${invitations ? total === 1 ? 'invitation' : 'invitations' : total === 1 ? 'account' : 'accounts'}`}</span>
      </div>
      <div className="table-section-toolbar system-admin-table-toolbar">
        <div className="system-admin-filter-search">
          <SearchIcon size={16} />
          <input ref={accountSearchRef} type="search" aria-label={invitations ? 'Search invitations' : 'Search accounts'} placeholder="Search name, email, or ID…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setPage(0); } }} />
          {search && <button type="button" className="system-admin-clear-search" aria-label="Clear account search" onClick={() => { setSearch(''); setPage(0); accountSearchRef.current?.focus(); }}><CloseIcon size={14} /></button>}
        </div>
        <select aria-label="Filter by account status" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All statuses</option>{statuses.map(s => <option value={s} key={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
      </div>
      {error && <div className="table-section-feedback"><LoadError error={error} retry={refresh} /></div>}
      <div className="table-responsive" tabIndex={0} role="region" aria-label={`${directoryTitle} records`}><table className="table system-admin-table">
        <caption className="sr-only">{directoryTitle}</caption>
        <colgroup><col className="system-admin-col-account" /><col className="system-admin-col-role" /><col className="system-admin-col-status" /><col className="system-admin-col-date" /><col className="system-admin-col-actions" /></colgroup>
        <thead><tr><th scope="col">{invitations ? 'Invited staff' : 'Account holder'}</th><th scope="col">Role / ID</th><th scope="col">Status</th><th scope="col">{invitations ? 'Sent / expires' : 'Last sign-in'}</th><th scope="col" className="system-admin-actions-heading">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={5} className="system-admin-table-empty" role="status">Loading {invitations ? 'invitations' : 'accounts'}…</td></tr> : error ? <tr className="table-empty-row"><td colSpan={5} className="system-admin-table-empty">{invitations ? 'Invitations could not be loaded.' : 'Accounts could not be loaded.'} Use Try again to reload.</td></tr> : !rows.length ? <tr className="table-empty-row"><td colSpan={5} className="system-admin-table-empty"><strong>{search || status !== 'all' ? invitations ? 'No matching invitations' : 'No matching accounts' : invitations ? 'No invitations yet' : 'No accounts found'}</strong><p>{invitations && !search && status === 'all' ? 'Invite a staff member to get started.' : 'Try another search or status filter.'}</p></td></tr> : rows.map(row => <tr key={row.id || row.profile_id}>
          <td><strong>{row.name}</strong><span className="system-admin-cell-sub">{row.email}</span>{row.department && <span className="system-admin-cell-sub">{row.department}</span>}</td>
          <td><span className="system-admin-capitalize">{row.role}</span>{row.identifier && <span className="system-admin-cell-sub">{row.identifier}</span>}</td>
          <td><Status value={invitations ? row.display_status : row.status} />{row.suspension_reason && row.status === 'suspended' && <span className="system-admin-cell-sub">{row.suspension_reason}</span>}{row.suspended_until && row.status === 'suspended' && <span className="system-admin-cell-sub">Until {formatAdminDate(row.suspended_until)}</span>}{row.last_error && <span className="system-admin-cell-error">{row.last_error}</span>}</td>
          <td className="system-admin-date-cell">{formatAdminDate(invitations ? row.last_sent_at : row.last_sign_in_at)}{invitations && <span className="system-admin-cell-sub">Expires {formatAdminDate(row.expires_at)}</span>}</td>
          <td><div className="system-admin-row-actions">{invitations ? row.status !== 'accepted' && <><button className="btn secondary small" onClick={() => open('resend_invitation', row)}>Resend</button>{row.status !== 'revoked' && <button className="btn secondary small" onClick={() => open('revoke_invitation', row)}>Revoke</button>}</> : row.id && !['retired', 'invited'].includes(row.status) ? <>
            <button className="btn secondary small" onClick={() => open(row.status === 'suspended' || row.status === 'inactive' ? 'reactivate_account' : 'suspend_account', row)}>{row.status === 'suspended' || row.status === 'inactive' ? 'Reactivate' : 'Suspend'}</button>
            {row.status === 'locked' && <button className="btn secondary small" onClick={() => open('unlock_account', row)}>Unlock</button>}
            {row.status === 'active' && <button className="btn secondary small" onClick={() => open('send_password_reset', row)}>Reset password</button>}
            {kind === 'staff' && <button className="btn secondary small" onClick={() => open('change_staff_role', row)}>Change role</button>}
            <Link className="btn secondary small" to={`/admin/audit-trail?account=${row.id}&name=${encodeURIComponent(row.name)}`}>History</Link>
          </> : <span className="system-admin-muted">{row.status === 'retired' ? 'Elevated account' : row.status === 'invited' ? 'Setup pending' : 'No linked sign-in'}</span>}</div></td>
        </tr>)}</tbody></table></div>
      {!loading && !error && <TablePagination page={page} totalPages={totalPages} startIndex={total ? page * 20 + 1 : 0} endIndex={Math.min((page + 1) * 20, total)} total={total} onPageChange={setPage} showWhenEmpty itemLabel={invitations ? 'invitations' : 'accounts'} />}
    </section>
    {kind === 'users' && <p className="system-admin-muted system-admin-directory-note">This directory shows account information. Clinical records remain in the Staff Portal.</p>}
    {action && <ActionDialog action={action} onClose={closeDialog} onComplete={text => { setAction(null); setMessage(text); if (action.type === 'invite_staff') changeTab('invitations'); refresh(); }} />}
  </div></main>;
}

export function AdminSettings() {
  const { data, loading, error, refresh } = useAdminData('settings');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (data) setForm(data); }, [data]);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setSaveError(''); setMessage('');
    try { const result = await adminAction('save_settings', form); setForm(result.settings); setMessage('System settings saved.'); }
    catch (err) { setSaveError(err.message); } finally { setBusy(false); }
  };
  const field = (name, label, type = 'text') => <label>{label}<input type={type} required maxLength={254} value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} /></label>;
  return <main className="main"><div className="page"><Heading title="System Settings" description="Configure clinic identity and the destinations used in account emails." /><LoadError error={error} retry={refresh} /><Feedback message={message} />
    {loading ? <div className="card" role="status">Loading settings…</div> : form && <form className="system-admin-settings-form" onSubmit={submit}><section className="card system-admin-form"><h2>Clinic and portals</h2><p className="system-admin-muted">Use HTTPS for deployed portals. Local development may use localhost or 127.0.0.1.</p>
      {field('clinic_name', 'Clinic name')}{field('admin_portal_url', 'Admin portal URL', 'url')}{field('staff_portal_url', 'Staff portal URL', 'url')}{field('user_portal_url', 'Patient / enrollee portal URL', 'url')}
      <label>Invitation validity<select value={form.invitation_expiry_minutes} onChange={e => setForm({ ...form, invitation_expiry_minutes: Number(e.target.value) })}>{[5, 10, 15, 30, 60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
      <p className="system-admin-muted">Supabase Auth also enforces its email-link expiration. Use a validity window no longer than the Auth email OTP expiry. Password reset redirect URLs must be allowed in Supabase Auth URL Configuration.</p>
      <LoadError error={saveError} /><footer><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></footer>
    </section><section className="card"><h2>Email delivery</h2><p>Invitations and password resets use your existing Supabase Authentication email sender and templates.</p><p className="system-admin-muted">Email credentials are managed in Supabase and are never sent to this browser.</p><a className="btn secondary" href="https://supabase.com/dashboard/project/bvvzrrcyulbezzexlmav/auth/templates" target="_blank" rel="noreferrer">Open Supabase email settings</a></section></form>}
  </div></main>;
}

export function AdminMyAccount() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const save = async (event, type) => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(type);
    try {
      if (type === 'profile') { await adminAction('save_profile', { name }); updateUser({ name: name.trim() }); setMessage('Your profile was saved.'); }
      else {
        if (password !== confirmation) throw new Error('The new passwords do not match.');
        await adminAction('change_password', { current_password: currentPassword, password });
        await logout({ scope: 'local' }); navigate('/login', { replace: true, state: { message: 'Password changed. Sign in with your new password.' } });
      }
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  return <main className="main"><div className="page"><Heading title="My Account" description="Your administrator profile and sign-in security." />
    {user.must_change_password && <div className="system-admin-notice">Change the initial administrator password before continuing.</div>}
    <LoadError error={error} /><Feedback message={message} />
    <div className="system-admin-account-columns"><section className="card"><h2>Profile</h2><form className="system-admin-form" onSubmit={e => save(e, 'profile')}><label>Full name<input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label><label>Role<input value="System Administrator" readOnly /></label><button className="btn" disabled={Boolean(busy)}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button></form></section>
    <section className="card"><h2>Change password</h2><p className="system-admin-muted">Use at least 12 characters, including a letter and a number. All administrator sessions will end after the change.</p><form className="system-admin-form" onSubmit={e => save(e, 'password')}><label>Current password<input type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirm new password<input type="password" required autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><button className="btn" disabled={Boolean(busy) || password !== confirmation || password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)}>{busy === 'password' ? 'Changing password…' : 'Change password'}</button></form></section></div>
  </div></main>;
}

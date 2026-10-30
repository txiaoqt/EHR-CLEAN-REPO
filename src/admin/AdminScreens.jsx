import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../AuthContext.jsx';
import { adminAction, adminData, adminPageAccess, saveAdminPageAccess, formatAdminDate } from './adminApi.js';
import { STAFF_PAGE_OPTIONS } from '../staffPageAccess.mjs';
import TablePagination from '../components/table/TablePagination.jsx';
import useVisibleRefresh from '../hooks/useVisibleRefresh.js';
import { fetchBackupRuns, isBackupActive } from '../utils/backupControl.js';
import { latestVerifiedBackup } from '../utils/backupSummary.mjs';
import { composeFullName } from '../utils/nameFormat.js';
import PersonNameFields, { emptyPersonName, validPersonName } from './PersonNameFields.jsx';
import { PlusIcon, SearchIcon, CloseIcon, UsersIcon, MailIcon, HistoryIcon, BackupIcon } from '../components/icons/Icons.jsx';

function useAdminData(section, search = '', status = 'all', page = 0) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: '', key: '' });
  const [revision, setRevision] = useState(0);
  const inFlight = useRef(false);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let current = true;
    const key = JSON.stringify([section, search, status, page]);
    const controller = new AbortController();
    inFlight.current = true;
    setState(previous => ({ ...previous, loading: !previous.data || previous.key !== key, refreshing: true, error: '' }));
    const timer = setTimeout(async () => {
      try {
        const data = await adminData(section, { search, status, page, signal: controller.signal });
        if (current) setState({ data, loading: false, refreshing: false, error: '', key });
      } catch (err) { if (current) setState({ data: null, loading: false, refreshing: false, error: err.message, key }); }
      finally { if (current) inFlight.current = false; }
    }, search ? 250 : 0);
    return () => { current = false; clearTimeout(timer); controller.abort(); inFlight.current = false; };
  }, [section, search, status, page, revision]);
  useVisibleRefresh(() => { if (!inFlight.current) refresh(); }, section === 'users');
  useEffect(() => { if (section === 'users') return undefined; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [refresh, section]);
  useEffect(() => {
    if (!['overview', 'administrators'].includes(section)) return undefined;
    window.addEventListener('auditLogAdded', refresh);
    return () => window.removeEventListener('auditLogAdded', refresh);
  }, [section, refresh]);
  return { ...state, refresh };
}

function Heading({ title, description, children }) {
  return <div className="page-header"><div className="page-header-title-block"><h1 className="page-header-title">{title}</h1><p className="page-header-subtitle">{description}</p></div><div className="page-header-actions">{children}</div></div>;
}
function LoadError({ error, retry }) {
  return error && <div className="system-admin-error" role="alert">{error} {retry && <button className="btn secondary" onClick={retry}>Try Again</button>}</div>;
}
function Status({ value }) { return <span className={`system-admin-status status-${value}`}>{String(value || 'unavailable').replaceAll('_', ' ')}</span>; }
function Feedback({ message, onDismiss }) {
  return message && <div className="system-admin-notice system-admin-feedback" role="status">
    <span>{message}</span>
    <button type="button" className="system-admin-icon-btn" aria-label="Dismiss notification" onClick={onDismiss}><CloseIcon size={16} /></button>
  </div>;
}

export function AdminOverview() {
  const { data, loading, error, refresh } = useAdminData('overview');
  const [backups, setBackups] = useState({ checking: true, runs: [], error: null });
  useEffect(() => {
    if (!data) return undefined;
    let current = true;
    let timer;
    const controller = new AbortController();
    const load = async () => {
      setBackups(previous => ({ ...previous, checking: true, error: null }));
      try {
        const result = await fetchBackupRuns({ signal: controller.signal });
        if (!current) return;
        setBackups({ checking: false, runs: result.runs, error: null });
        if (result.activeBackup || result.runs.some(isBackupActive)) timer = setTimeout(load, 12000);
      } catch (err) {
        if (current) setBackups(previous => ({ ...previous, checking: false, error: err }));
      }
    };
    load();
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [data]);
  const lastBackup = latestVerifiedBackup(backups.runs, data?.last_backup);
  const backupLabel = lastBackup ? formatAdminDate(lastBackup.at)
    : error || backups.error ? 'Backup Status Unavailable'
      : loading || backups.checking ? 'Checking…' : 'No Verified Backup Yet';
  const metrics = [
    ['Active Staff', 'active_staff', '/admin/staff'], ['Pending Staff Invitations', 'pending_invitations', '/admin/staff?tab=invitations'],
    ['Suspended Accounts', 'suspended_accounts', '/admin/users?status=suspended'], ['User Accounts', 'user_accounts', '/admin/users'],
  ];
  return <main className="main"><div className="page">
    <Heading title="Overview" description="Account access and system activity for the TUP Manila Clinic."><button className="btn secondary" onClick={refresh} disabled={loading}>Refresh</button><Link className="btn" to="/admin/staff?invite=1"><PlusIcon />Invite Staff</Link></Heading>
    <LoadError error={error} retry={refresh} />
    <div className="system-admin-metrics" aria-busy={loading}>{metrics.map(([label, key, path]) => <Link className="card system-admin-metric" to={path} key={key}><span>{label}</span><strong>{loading || !data ? '—' : data[key] ?? 0}</strong><span>View Details <span aria-hidden="true">→</span></span></Link>)}</div>
    <div className="system-admin-overview-columns">
      <section className="card"><div className="system-admin-section-head"><div><h2>Recent Administration Activity</h2><p className="system-admin-muted">Invitation and account changes recorded by the server.</p></div><Link to="/admin/audit-trail">View Audit Trail</Link></div>
        {loading ? <p role="status">Loading activity…</p> : data?.recent_activity?.length ? <ol className="system-admin-activity">{data.recent_activity.map(row => <li key={row.id}><HistoryIcon /><div><strong>{row.description}</strong><p>{row.user_name} · {formatAdminDate(row.created_at)}</p></div></li>)}</ol> : <div className="system-admin-empty"><HistoryIcon size={28} /><h3>No Administration Activity Yet</h3><p>New invitations and account changes will appear here.</p></div>}
      </section>
      <div className="system-admin-stack"><section className="card"><h2>Access Management</h2><p className="system-admin-muted">Invite clinic personnel and review their account status.</p><div className="system-admin-quick-links"><Link to="/admin/administrators"><UsersIcon />Manage Administrators</Link><Link to="/admin/staff"><UsersIcon />Manage Staff Accounts</Link><Link to="/admin/staff?tab=invitations"><MailIcon />View Staff Invitations</Link><Link to="/admin/users"><UsersIcon />Manage Patient And Enrollee Accounts</Link></div></section>
        <section className="card"><h2>System Status</h2><dl className="system-admin-facts"><div><dt>Failed Admin Sign-Ins Today</dt><dd>{loading ? '—' : data?.failed_logins_today ?? 0}</dd></div><div><dt>Last Verified Backup</dt><dd aria-busy={backups.checking}>{backupLabel}{lastBackup && backups.error && <span className="system-admin-cell-sub">Last Known Status · Could Not Refresh</span>}</dd></div></dl><Link className="btn secondary" to="/admin/backup-recovery"><BackupIcon />Backup & Recovery</Link></section></div>
    </div>
  </div></main>;
}

const PAGE_ACCESS_ROLES = [['physician', 'Physician'], ['nurse', 'Nurse']];
const pageOptionsFor = role => STAFF_PAGE_OPTIONS.filter(option => !option.roles || option.roles.includes(role));
const pageLabels = pages => pageOptionsFor('physician').filter(option => pages.includes(option.page)).map(option => option.label);

export function AdminPageAccess() {
  const [state, setState] = useState({ saved: null, loading: true, error: '' });
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState('');
  const [saveError, setSaveError] = useState({});
  const [feedback, setFeedback] = useState('');
  const load = useCallback(async () => {
    setState(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await adminPageAccess();
      const saved = Object.fromEntries(PAGE_ACCESS_ROLES.map(([role]) => [role, data?.[role]?.pages || []]));
      setState({ saved, loading: false, error: '' }); setDrafts(saved);
    } catch (err) { setState({ saved: null, loading: false, error: err.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = (role, page) => setDrafts(previous => ({ ...previous, [role]: previous[role].includes(page) ? previous[role].filter(p => p !== page) : [...previous[role], page] }));
  const save = async (role, label) => {
    setSaving(role); setSaveError(previous => ({ ...previous, [role]: '' })); setFeedback('');
    try {
      const result = await saveAdminPageAccess(role, drafts[role]);
      setState(previous => ({ ...previous, saved: { ...previous.saved, [role]: result.pages } }));
      setDrafts(previous => ({ ...previous, [role]: result.pages }));
      setFeedback(`${label} page access saved. It applies to every ${label.toLowerCase()} account, including new invitations, the next time their portal refreshes.`);
    } catch (err) { setSaveError(previous => ({ ...previous, [role]: err.message })); } finally { setSaving(''); }
  };
  return <main className="main"><div className="page">
    <Heading title="Staff Page Access" description="Choose which Staff Portal pages physicians and nurses can open. Set this before inviting; every account with the role follows it.">
      <button className="btn secondary" onClick={load} disabled={state.loading || Boolean(saving)}>Refresh</button>
    </Heading>
    <Feedback message={feedback} onDismiss={() => setFeedback('')} />
    <LoadError error={state.error} retry={load} />
    {state.loading && <p role="status">Loading page access…</p>}
    {state.saved && <div className="system-admin-page-access">
      {PAGE_ACCESS_ROLES.map(([role, label]) => {
        const draft = drafts[role] || [];
        const dirty = [...draft].sort().join() !== [...state.saved[role]].sort().join();
        const options = pageOptionsFor(role);
        return <section className="card" key={role} aria-labelledby={`page-access-${role}`}>
          <div className="system-admin-section-head"><div><h2 id={`page-access-${role}`}>{label}</h2><p className="system-admin-muted">{draft.length} of {options.length} pages enabled</p></div></div>
          {[...new Set(options.map(option => option.group))].map(group => <fieldset key={group} className="system-admin-page-group" disabled={Boolean(saving)}>
            <legend>{group}</legend>
            {options.filter(option => option.group === group).map(option => <label key={option.page} className="system-admin-check">
              <input type="checkbox" checked={draft.includes(option.page)} onChange={() => toggle(role, option.page)} />
              <span>{option.label}{option.note && <small className="system-admin-muted">{option.note}</small>}</span>
            </label>)}
          </fieldset>)}
          <LoadError error={saveError[role]} />
          <footer className="system-admin-page-access-actions">
            <button type="button" className="btn secondary" disabled={!dirty || Boolean(saving)} onClick={() => setDrafts(previous => ({ ...previous, [role]: state.saved[role] }))}>Discard Changes</button>
            <button type="button" className="btn" disabled={!dirty || Boolean(saving)} onClick={() => save(role, label)}>{saving === role ? 'Saving…' : `Save ${label} Access`}</button>
          </footer>
        </section>;
      })}
    </div>}
    <p className="system-admin-muted system-admin-directory-note">Dashboard, Help, Settings and My Profile are always available.</p>
  </div></main>;
}

function InvitePageAccess({ role }) {
  const [access, setAccess] = useState(null);
  useEffect(() => {
    let current = true;
    adminPageAccess().then(data => { if (current) setAccess(data); }).catch(() => { if (current) setAccess({}); });
    return () => { current = false; };
  }, []);
  const pages = access?.[role]?.pages;
  return <p className="system-admin-muted">
    {!access ? 'Loading page access…' : !pages ? 'Page access could not be loaded.' : pages.length ? `Pages this role can open: ${pageLabels(pages).join(', ')}, plus Dashboard, Help, Settings and My Profile.` : 'This role can open only Dashboard, Help, Settings and My Profile.'}
    {' '}<Link to="/admin/page-access">Change Page Access</Link>
  </p>;
}

function ActionDialog({ action, onClose, onComplete, onFailed }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [role, setRole] = useState(action.row?.role || 'nurse');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [invite, setInvite] = useState({ ...emptyPersonName(), email: '', role: action.inviteRole || 'nurse', department: 'University Clinic' });
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const names = { invite_staff: 'Invite Staff Member', suspend_account: 'Suspend Account', reactivate_account: 'Reactivate Account', unlock_account: 'Unlock Account', change_staff_role: 'Change Staff Role', send_password_reset: 'Send Password Reset', resend_invitation: 'Resend Invitation', revoke_invitation: 'Revoke Invitation', delete_invitation: 'Delete Invitation', delete_administrator: 'Delete Administrator', delete_user_account: 'Delete Account' };
  const title = action.type === 'invite_staff' && invite.role === 'admin' ? 'Invite Administrator' : names[action.type];
  const deleting = ['delete_invitation', 'delete_administrator', 'delete_user_account'].includes(action.type);
  const deletionConfirmed = confirmationEmail.trim().toLowerCase() === action.row?.email?.trim().toLowerCase();
  const requiresReason = ['suspend_account', 'reactivate_account'].includes(action.type);
  useEffect(() => {
    const node = dialog.current; node.showModal();
    const cancel = event => { event.preventDefault(); if (!busyRef.current) onClose(); };
    node.addEventListener('cancel', cancel);
    return () => { node.removeEventListener('cancel', cancel); node.close(); };
  }, [onClose]);
  const submit = async (event) => {
    event.preventDefault(); if (busyRef.current || (deleting && !deletionConfirmed) || (action.type === 'invite_staff' && !validPersonName(invite))) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const payload = action.type === 'invite_staff' ? { name: composeFullName(invite), email: invite.email, role: invite.role, department: invite.department } : { id: action.row.id,
        reason: reason.trim(), until: until ? new Date(until).toISOString() : null, role, confirmation_email: confirmationEmail.trim() };
      const result = await adminAction(action.type, payload);
      onComplete(action.type === 'invite_staff' || action.type === 'resend_invitation'
        ? 'Invitation email sent. The recipient can now set up their account.'
        : action.type === 'delete_invitation' ? 'Invitation and pending sign-in deleted. You can invite this email again.'
        : action.type === 'delete_administrator' ? 'Administrator account deleted. Audit history has been retained.'
        : action.type === 'delete_user_account' ? 'Account sign-in deleted. Clinic records, submitted documents and audit history have been retained.'
        : action.type === 'send_password_reset' ? 'Password reset email sent.' : 'The account access change was saved.', result);
    } catch (err) { setError(err.message); busyRef.current = false; setBusy(false); if (deleting) onFailed?.(); }
  };
  return createPortal(<dialog ref={dialog} className="system-admin-dialog" aria-labelledby="admin-action-title">
    <form onSubmit={submit} className="system-admin-form">
      <header><h2 id="admin-action-title">{title}</h2><button type="button" className="system-admin-icon-btn" aria-label="Close dialog" disabled={busy} onClick={onClose}><CloseIcon /></button></header>
      {action.row && <div className="system-admin-dialog-identity"><strong>{action.row.name}</strong><span>{action.row.email}</span></div>}
      {action.type === 'invite_staff' && <>
        <p className="system-admin-muted">Send an email invitation so the recipient can create their own sign-in credentials. Their assigned role determines which portal they can access.</p>
        <PersonNameFields value={invite} onChange={setInvite} disabled={busy} />
        <label>Email Address<input type="email" required maxLength={254} value={invite.email} disabled={busy} onChange={e => setInvite({ ...invite, email: e.target.value })} autoComplete="email" /></label>
        <div className="system-admin-form-row"><label>Assigned Role<select value={invite.role} disabled={busy} onChange={e => setInvite({ ...invite, role: e.target.value })}><option value="nurse">Nurse</option><option value="physician">Physician</option><option value="admin">Admin</option></select></label><label>Department<input required maxLength={120} value={invite.department} disabled={busy} onChange={e => setInvite({ ...invite, department: e.target.value })} /></label></div>
        {invite.role !== 'admin' && <InvitePageAccess role={invite.role} />}
        {invite.role === 'admin' && <p className="system-admin-muted">Administrators can invite accounts, manage portal access, and view system activity. They choose a username and password for the System Admin Portal.</p>}
      </>}
      {action.type === 'suspend_account' && <p>Existing sessions will be revoked. This account cannot access the portal while suspended. Clinical records are retained.</p>}
      {action.type === 'reactivate_account' && <p>Restore this account’s portal access. The account holder will need to sign in again.</p>}
      {requiresReason && <label>Reason<textarea required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} autoFocus placeholder="Explain this access change for the audit trail…" /></label>}
      {action.type === 'suspend_account' && <label>Suspended Until <span className="system-admin-muted">(optional)</span><input type="datetime-local" value={until} min={new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setUntil(e.target.value)} /><small>Leave blank to keep the account suspended until you reactivate it.</small></label>}
      {action.type === 'change_staff_role' && <><label>Assigned Role<select value={role} onChange={e => setRole(e.target.value)}><option value="nurse">Nurse</option><option value="physician">Physician</option></select></label><p className="system-admin-muted">Their sessions will end and the new role applies on their next sign-in.</p></>}
      {action.type === 'revoke_invitation' && <p>This setup link will stop working. The recipient will not gain access. You can resend an invitation later.</p>}
      {action.type === 'delete_invitation' && <p>This permanently removes the unaccepted invitation and its pending sign-in. The setup link will stop working. You can invite this email again. The deletion remains in the audit trail.</p>}
      {action.type === 'delete_administrator' && <p>This permanently removes this administrator’s sign-in and profile. Their sessions will end immediately. Audit history and clinic records are retained. This cannot be undone.</p>}
      {action.type === 'delete_user_account' && <p>This permanently deletes this account’s sign-in and ends its sessions. Clinic records, submitted documents and audit history are retained. This cannot be undone.</p>}
      {deleting && <label>Type The Email Address To Confirm<input type="email" required autoFocus autoComplete="off" spellCheck={false} maxLength={254} value={confirmationEmail} onChange={e => setConfirmationEmail(e.target.value)} aria-describedby="admin-delete-hint" /><small id="admin-delete-hint">Enter the email shown above to enable {title.toLowerCase()}.</small></label>}
      {action.type === 'resend_invitation' && <p>Send a fresh setup link to this email address. Previous sessions will be revoked.</p>}
      {action.type === 'send_password_reset' && <p>Send a password reset email through Supabase Auth to the account holder.</p>}
      {action.type === 'unlock_account' && <p>Clear failed login attempts and the temporary login lockout.</p>}
      <LoadError error={error} />
      <footer><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button><button className={deleting ? 'btn danger' : 'btn'} disabled={busy || (action.type === 'invite_staff' && !validPersonName(invite)) || (requiresReason && reason.trim().length < 5) || (deleting && !deletionConfirmed)}>{busy ? deleting ? 'Deleting…' : 'Saving…' : title}</button></footer>
    </form>
  </dialog>, document.body);
}

export function AdminAccounts({ kind }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const administration = kind === 'administrators';
  const hasInvitations = kind !== 'users';
  const directoryPath = administration ? '/admin/administrators' : '/admin/staff';
  const query = new URLSearchParams(location.search);
  const accountSearchRef = useRef(null);
  const [tab, setTab] = useState(hasInvitations && query.get('tab') === 'invitations' ? 'invitations' : kind);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(query.get('status') || 'all');
  const [page, setPage] = useState(0);
  const [action, setAction] = useState(hasInvitations && query.get('invite') === '1' ? { type: 'invite_staff', inviteRole: administration ? 'admin' : 'nurse' } : null);
  const [feedback, setFeedback] = useState(null);
  const section = hasInvitations && tab === 'invitations' ? administration ? 'administrator_invitations' : 'invitations' : kind;
  const { data, loading, refreshing, error, refresh } = useAdminData(section, search, status, page);
  useEffect(() => { setFeedback(previous => previous?.kind === kind ? previous : null); }, [kind]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setTab(hasInvitations && params.get('tab') === 'invitations' ? 'invitations' : kind);
    setSearch(''); setStatus(params.get('status') || 'all'); setPage(0);
    setAction(hasInvitations && params.get('invite') === '1' ? { type: 'invite_staff', inviteRole: administration ? 'admin' : 'nurse' } : null);
  }, [kind, location.search]);
  const closeDialog = useCallback(() => setAction(null), []);
  const changeTab = value => { setTab(value); setSearch(''); setStatus('all'); setPage(0); navigate(`${directoryPath}${value === 'invitations' ? '?tab=invitations' : ''}`, { replace: true }); };
  const handleTabKeyDown = event => {
    let nextTab;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') nextTab = tab === kind ? 'invitations' : kind;
    else if (event.key === 'Home') nextTab = kind;
    else if (event.key === 'End') nextTab = 'invitations';
    else return;
    event.preventDefault();
    if (nextTab !== tab) changeTab(nextTab);
    event.currentTarget.querySelector(`[data-view="${nextTab}"]`)?.focus();
  };
  const open = (type, row) => setAction({ type, row, inviteRole: administration ? 'admin' : 'nurse' });
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  useEffect(() => {
    if (!loading && !error && page >= totalPages) setPage(totalPages - 1);
  }, [loading, error, page, totalPages]);
  const invitations = tab === 'invitations' && hasInvitations;
  const directoryTitle = invitations ? administration ? 'Administrator Invitations' : 'Staff Invitations' : administration ? 'Administrators' : kind === 'staff' ? 'Staff Directory' : 'User Directory';
  const hasFilters = Boolean(search.trim()) || status !== 'all';
  const emptyTitle = invitations ? 'No Invitations Found' : administration ? 'No Administrators Found' : kind === 'staff' ? 'No Staff Accounts Found' : 'No User Accounts Found';
  const emptyDescription = hasFilters ? 'Try adjusting your search or filters.' : invitations ? `Invite ${administration ? 'an administrator' : 'a staff member'} to get started.` : 'Accounts will appear here after they are added.';
  const statuses = invitations ? ['pending', 'accepted', 'expired', 'revoked', 'failed', 'sending', 'deletion_pending'] : ['active', 'suspended', 'locked', 'inactive', ...(hasInvitations ? ['invited', 'expired', 'revoked', 'failed', 'sending', 'deletion_pending'] : ['retired', 'incomplete', 'deletion_pending'])];
  const renderActions = row => {
    const deleteButton = (type, target) => <button className="btn danger small" onClick={() => open(type, target)}>{row.deletion_pending ? 'Retry Delete' : type === 'delete_invitation' ? 'Delete Invitation' : 'Delete Administrator'}</button>;
    const history = row.id && <Link className="btn secondary small" to={`/admin/audit-trail?account=${row.id}&name=${encodeURIComponent(row.name)}`}>History</Link>;
    if (kind === 'users') return <>
      {!row.deletion_pending && row.status !== 'retired' && <button className="btn secondary small" onClick={() => open(row.status === 'suspended' || row.status === 'inactive' ? 'reactivate_account' : 'suspend_account', row)}>{row.status === 'suspended' || row.status === 'inactive' ? 'Reactivate' : 'Suspend'}</button>}
      <button className="btn danger small" onClick={() => open('delete_user_account', row)}>{row.deletion_pending ? 'Retry Delete' : 'Delete Account'}</button>
      {history}
    </>;
    if (invitations) {
      if (row.status === 'accepted') return <span className="system-admin-muted">Setup completed</span>;
      if (row.deletion_pending) return deleteButton('delete_invitation', row);
      if (row.status === 'sending') return <span className="system-admin-muted">Sending invitation…</span>;
      return <><button className="btn secondary small" onClick={() => open('resend_invitation', row)}>Resend</button>{row.status !== 'revoked' && <button className="btn secondary small" onClick={() => open('revoke_invitation', row)}>Revoke</button>}{deleteButton('delete_invitation', row)}</>;
    }
    if (hasInvitations && row.invitation_id && !row.active && row.invitation_status !== 'accepted') {
      return <><Link className="btn secondary small" to={`${directoryPath}?tab=invitations`}>View Invitation</Link>{row.invitation_status !== 'sending' && deleteButton('delete_invitation', { ...row, id: row.invitation_id })}</>;
    }
    if (row.role === 'admin') return <>{history}{row.id !== user?.auth_user_id && row.profile_id && deleteButton('delete_administrator', { ...row, id: row.profile_id })}</>;
    if (!row.id || row.status === 'retired') return <span className="system-admin-muted">{row.status === 'retired' ? 'Elevated account' : 'No linked sign-in'}</span>;
    return <>
      <button className="btn secondary small" onClick={() => open(row.status === 'suspended' || row.status === 'inactive' ? 'reactivate_account' : 'suspend_account', row)}>{row.status === 'suspended' || row.status === 'inactive' ? 'Reactivate' : 'Suspend'}</button>
      {row.status === 'locked' && <button className="btn secondary small" onClick={() => open('unlock_account', row)}>Unlock</button>}
      {row.status === 'active' && <button className="btn secondary small" onClick={() => open('send_password_reset', row)}>Reset Password</button>}
      {kind === 'staff' && <button className="btn secondary small" onClick={() => open('change_staff_role', row)}>Change Role</button>}
      {history}
    </>;
  };
  return <main className="main"><div className="page">
    <Heading title={administration ? 'Administrators' : kind === 'staff' ? 'Staff Accounts' : 'User Accounts'} description={administration ? 'Invite administrators and review system administration accounts.' : kind === 'staff' ? 'Invite clinic personnel and manage their sign-in access.' : 'Suspend, restore or delete patient and enrollee sign-in access.'}>
      <button className="btn secondary" onClick={refresh} disabled={loading || refreshing}>Refresh</button>{hasInvitations && <button className="btn" onClick={() => open('invite_staff')}><PlusIcon />{administration ? 'Invite Administrator' : 'Invite Staff'}</button>}
    </Heading>
    <Feedback message={feedback?.kind === kind ? feedback.message : ''} onDismiss={() => setFeedback(null)} />
    {hasInvitations && <div className="system-admin-tabs" role="tablist" aria-label={administration ? 'Administrator account views' : 'Staff account views'} aria-orientation="horizontal" onKeyDown={handleTabKeyDown}>
      <button type="button" id={`system-admin-${kind}-tab`} data-view={kind} role="tab" aria-selected={tab === kind} aria-controls="system-admin-accounts-panel" tabIndex={tab === kind ? 0 : -1} onClick={() => changeTab(kind)}>
        <span className="system-admin-tab-icon" aria-hidden="true"><UsersIcon size={16} /></span><span>{administration ? 'Administrators' : 'Staff Directory'}</span>
      </button>
      <button type="button" id="system-admin-invitations-tab" data-view="invitations" role="tab" aria-selected={tab === 'invitations'} aria-controls="system-admin-accounts-panel" tabIndex={tab === 'invitations' ? 0 : -1} onClick={() => changeTab('invitations')}>
        <span className="system-admin-tab-icon" aria-hidden="true"><MailIcon size={16} /></span><span>Invitations</span>
      </button>
    </div>}
    <section id="system-admin-accounts-panel" className="card table-section-card system-admin-table-card" role={hasInvitations ? 'tabpanel' : undefined} aria-labelledby={hasInvitations ? `system-admin-${tab}-tab` : undefined} aria-label={!hasInvitations ? directoryTitle : undefined} aria-busy={loading || refreshing}>
      <div className="table-section-header">
        <div><h2>{directoryTitle}</h2><span className="card-subtitle">{invitations ? 'Track invitation delivery and account setup.' : administration ? 'System administration accounts and sign-in details.' : kind === 'staff' ? 'Clinic staff accounts and sign-in access.' : 'Patient and enrollee accounts and sign-in access.'}</span></div>
        <span className="badge badge-neutral" role="status">{loading ? 'Loading…' : `${total.toLocaleString()} ${invitations ? total === 1 ? 'invitation' : 'invitations' : total === 1 ? 'account' : 'accounts'}`}</span>
      </div>
      <div className="table-section-toolbar system-admin-table-toolbar">
        <div className="system-admin-filter-search">
          <SearchIcon size={16} />
          <input ref={accountSearchRef} type="search" aria-label={invitations ? 'Search invitations' : administration ? 'Search administrators' : 'Search accounts'} placeholder={administration ? 'Search name, email, or username…' : 'Search name, email, or ID…'} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setPage(0); } }} />
          {search && <button type="button" className="system-admin-clear-search" aria-label="Clear account search" onClick={() => { setSearch(''); setPage(0); accountSearchRef.current?.focus(); }}><CloseIcon size={14} /></button>}
        </div>
        <select aria-label="Filter by account status" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All Statuses</option>{statuses.map(s => <option value={s} key={s}>{s.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}</option>)}</select>
      </div>
      {error && <div className="table-section-feedback"><LoadError error={error} retry={refresh} /></div>}
      <div className="table-responsive" tabIndex={0} role="region" aria-label={`${directoryTitle} records`}><table className="table system-admin-table">
        <caption className="sr-only">{directoryTitle}</caption>
        <colgroup><col className="system-admin-col-account" /><col className="system-admin-col-role" /><col className="system-admin-col-status" /><col className="system-admin-col-date" /><col className="system-admin-col-actions" /></colgroup>
        <thead><tr><th scope="col">{invitations ? 'Invited Account' : 'Account Holder'}</th><th scope="col">{administration ? 'Role / Username' : 'Role / ID'}</th><th scope="col">Status</th><th scope="col">{invitations ? 'Sent / Expires' : 'Last Sign-In'}</th><th scope="col" className="system-admin-actions-heading">Actions</th></tr></thead>
        <tbody>{!loading && !error && rows.map(row => <tr key={row.id || row.profile_id}>
          <td><strong>{row.name}</strong>{!invitations && row.id === user?.auth_user_id && <span className="system-admin-self-label">You</span>}<span className="system-admin-cell-sub">{row.email}</span>{row.department && <span className="system-admin-cell-sub">{row.department}</span>}</td>
          <td><span className="system-admin-capitalize">{row.role}</span>{row.identifier && <span className="system-admin-cell-sub">{row.identifier}</span>}</td>
          <td><Status value={invitations ? row.display_status : row.status} />{row.deletion_pending && <span className="system-admin-cell-sub">Access disabled. Retry delete to finish.</span>}{row.suspension_reason && row.status === 'suspended' && <span className="system-admin-cell-sub">{row.suspension_reason}</span>}{row.suspended_until && row.status === 'suspended' && <span className="system-admin-cell-sub">Until {formatAdminDate(row.suspended_until)}</span>}{row.last_error && <span className="system-admin-cell-error">{row.last_error}</span>}</td>
          <td className="system-admin-date-cell">{formatAdminDate(invitations ? row.last_sent_at : row.last_sign_in_at)}{invitations && <span className="system-admin-cell-sub">Expires {formatAdminDate(row.expires_at)}</span>}</td>
          <td><div className="system-admin-row-actions">{renderActions(row)}</div></td>
        </tr>)}</tbody></table></div>
      {loading && <div className="system-admin-table-state" role="status"><p className="system-admin-table-state-title">Loading {invitations ? 'invitations' : 'accounts'}…</p></div>}
      {!loading && error && <div className="system-admin-table-state"><p className="system-admin-table-state-title">Records Unavailable</p><p className="system-admin-table-state-description">Use Try Again to reload this table.</p></div>}
      {!loading && !error && !rows.length && <div className="system-admin-table-state" role="status"><p className="system-admin-table-state-title">{emptyTitle}</p><p className="system-admin-table-state-description">{emptyDescription}</p></div>}
      {!loading && !error && <TablePagination page={page} totalPages={totalPages} startIndex={total ? page * 20 + 1 : 0} endIndex={Math.min((page + 1) * 20, total)} total={total} onPageChange={setPage} showWhenEmpty itemLabel={invitations ? 'invitations' : 'accounts'} />}
    </section>
    {kind === 'users' && <p className="system-admin-muted system-admin-directory-note">This directory shows account information. Clinical records remain in the Staff Portal.</p>}
    {action && <ActionDialog action={action} onClose={closeDialog} onFailed={refresh} onComplete={(text, result) => {
      const destination = action.type === 'invite_staff' ? result?.invitation?.role === 'admin' ? 'administrators' : 'staff' : kind;
      setAction(null); setFeedback({ message: text, kind: destination });
      if (action.type === 'invite_staff') { setTab('invitations'); setSearch(''); setStatus('all'); setPage(0); navigate(`/admin/${destination}?tab=invitations`, { replace: true }); }
      refresh();
    }} />}
  </div></main>;
}

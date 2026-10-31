import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import { useSidebar } from '../useSidebar.js';
import { adminAction } from './adminApi.js';
import { AdminOverview, AdminAccounts, AdminPageAccess } from './AdminScreens.jsx';
import AdminAccountDialog from './AdminAccountDialog.jsx';
import AuditTrail from '../pages/AuditTrail.jsx';
import BackupRecovery from '../pages/BackupRecovery.jsx';
import AuthCallback from '../pages/AuthCallback.jsx';
import ResetPassword from '../pages/ResetPassword.jsx';
import LegalPolicy from '../pages/LegalPolicy.jsx';
import StaffSetup from './StaffSetup.jsx';
import StaffTopBar from '../components/header/StaffTopBar.jsx';
import logo from '../assets/images/tupehrlogo.jpg';
import { DashboardIcon, UsersIcon, UserIcon, HistoryIcon, BackupIcon, MailIcon,
  ChevronLeftIcon, ChevronRightIcon, LogoutIcon, EyeIcon, EyeOffIcon, CloseIcon, LockIcon } from '../components/icons/Icons.jsx';
import './admin.css';

const NAV = [
  { path: '/admin/overview', label: 'Overview', Icon: DashboardIcon, group: 'MAIN', keywords: 'dashboard summary activity' },
  { path: '/admin/administrators', label: 'Administrators', Icon: UsersIcon, keywords: 'admins administration directory access' },
  { path: '/admin/staff', label: 'Staff Accounts', Icon: UsersIcon, keywords: 'directory clinic physician nurse dentist clinician' },
  { path: '/admin/users', label: 'User Accounts', Icon: UserIcon, keywords: 'patients students enrollees suspension access' },
  { path: '/admin/page-access', label: 'Staff Page Access', Icon: LockIcon, keywords: 'permissions roles pages physician nurse dentist dental sidebar configuration' },
  { path: '/admin/audit-trail', label: 'Audit Trail', Icon: HistoryIcon, group: 'SYSTEM', keywords: 'logs history actions activity' },
  { path: '/admin/backup-recovery', label: 'Backup & Recovery', Icon: BackupIcon, keywords: 'restore database history' },
];

// The admin palette uses the same navigation list as the sidebar. Clinical
// destinations from the staff palette are never included on this surface.
const ADMIN_SEARCH_PAGES = NAV.reduce((pages, item) => {
  const group = item.group || pages[pages.length - 1]?.group || 'MAIN';
  pages.push({ page: item.path.slice(1), label: item.label, icon: item.Icon, group, keywords: item.keywords });
  if (item.path === '/admin/staff' || item.path === '/admin/administrators') {
    pages.push({ page: `${item.path.slice(1)}?tab=invitations`, label: item.path === '/admin/administrators' ? 'Administrator Invitations' : 'Staff Invitations', icon: MailIcon, group, keywords: 'invite email pending setup' });
  }
  return pages;
}, []);

function AdminAuditTrail() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const requested = params.get('account') || '';
  const accountId = /^[0-9a-f-]{36}$/i.test(requested) ? requested : null;
  return <AuditTrail administration accountId={accountId} accountLabel={params.get('name') || ''}
    onClearAccount={() => navigate('/admin/audit-trail', { replace: true })} />;
}

function AdminLogin() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await adminAction('login', { username, password });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token, refresh_token: result.session.refresh_token,
      });
      if (sessionError) throw new Error('Could not establish your session. Sign in again.');
      login(result.profile);
      navigate('/admin/overview', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="system-admin-login">
    <div className="system-admin-login-layout">
      <section className="system-admin-login-intro" aria-label="TUP Clinic system administration">
        <div className="system-admin-login-brand"><img src={logo} alt="TUP Clinic" /><h1>TUP Manila Clinic</h1></div>
        <h2>System Admin Portal</h2>
        <p>Manage staff access, invitations, account security, and system activity for the clinic.</p>
        <p className="system-admin-muted">For authorized system administrators.</p>
      </section>
      <section className="system-admin-login-card" aria-labelledby="system-admin-login-title">
        <div className="system-admin-login-mobile-brand">
          <img src={logo} alt="TUP Clinic" />
          <strong>TUP Manila Clinic</strong>
          <span>System Admin Portal</span>
        </div>
        <h2 id="system-admin-login-title">Administrator Log In</h2>
        <form onSubmit={submit}>
          <label>Username<input name="username" type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={120} autoFocus /></label>
          <label>Password<span className="system-admin-password"><input name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} />
            <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}</button></span></label>
          {error && <div className="system-admin-login-error" role="alert">{error}</div>}
          {location.state?.message && <p role="status">{location.state.message}</p>}
          <button className="system-admin-login-submit" disabled={busy || !username.trim() || !password}>{busy ? 'Signing in…' : 'Log In'}</button>
        </form>
        <p className="system-admin-login-footer">© Technological University of the Philippines</p>
      </section>
    </div>
  </div>;
}

export default function AdminPortal() {
  const { user, loading, initializing, isAuthenticated, isPasswordRecoverySession, logout } = useAuth();
  const { collapsed, toggle } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountDialog, setAccountDialog] = useState(null);
  const [accountMessage, setAccountMessage] = useState('');
  const [mobile, setMobile] = useState(() => window.innerWidth < 1024);
  const railCollapsed = collapsed && !mobile;
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 1024);
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { document.title = 'TUP Clinic · System Admin'; document.documentElement.setAttribute('data-density', 'normal'); }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);
  useEffect(() => { setAccountMessage(''); }, [location.pathname]);
  useEffect(() => {
    if (!accountMessage) return undefined;
    const timer = setTimeout(() => setAccountMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [accountMessage]);
  useEffect(() => { if (!isAuthenticated) { setAccountDialog(null); setAccountMessage(''); } }, [isAuthenticated]);
  useEffect(() => {
    const key = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  if (location.pathname === '/admin/setup') return <StaffSetup administration />;
  if (location.pathname === '/auth/callback') return <AuthCallback />;
  if (location.pathname === '/reset-password') return <ResetPassword />;
  if (location.pathname === '/privacy' || location.pathname === '/terms') return <LegalPolicy type={location.pathname === '/privacy' ? 'privacy' : 'terms'} />;
  if (loading || initializing) return <div className="system-admin-loading" role="status">Loading your administrator session…</div>;
  if (isPasswordRecoverySession) return <Navigate to="/reset-password" replace />;
  if (!isAuthenticated || user?.role !== 'admin' || user.active === false) return <AdminLogin />;
  if (user.staff_setup_required) return <Navigate to="/admin/setup" replace />;
  const signOut = async () => { await logout(); navigate('/login', { replace: true }); };
  return <div id="app-root" className={`system-admin has-staff-topbar ${railCollapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'system-admin-mobile-open' : ''}`}>
    <a className="system-admin-skip" href="#system-admin-content">Skip to content</a>
    <div id="sidebar-container" className={`sidebar-container ${railCollapsed ? 'collapsed' : ''}`}>
      <aside className={`sidebar ${railCollapsed ? 'collapsed' : ''}`} aria-label="System administrator navigation">
        <div className="sidebar-header">
          <Link className="brand" to="/admin/overview"><img className="logo-img" src={logo} alt="TUP Clinic" /><div className="brand-text"><h1 className="brand-title">TUP CLINIC</h1><div className="brand-sub">System Admin Portal</div></div></Link>
          <button type="button" className="sidebar-collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}</button>
        </div>
        <div className="sidebar-user-widget"><span className="system-admin-avatar">{(user.name || 'A')[0]}</span><div className="sidebar-user-info"><div className="sidebar-user-name">{user.name}</div><div className="sidebar-user-role">System Administrator</div></div></div>
        <nav className="menu">
          {NAV.map(({ path, label, Icon, group }) => <React.Fragment key={path}>
            {group && <div className="nav-group-label">{group}</div>}
            <NavLink className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`} to={path} title={label}><span className="nav-icon"><Icon /></span><span className="nav-label">{label}</span></NavLink>
          </React.Fragment>)}
        </nav>
        <div className="sidebar-footer"><div className="sidebar-profile-card"><div className="system-admin-muted">Logged in as</div><strong>{user.name}</strong><div className="system-admin-muted">System Administrator</div></div><button className="btn secondary system-admin-signout" onClick={signOut}><LogoutIcon /><span className="nav-label">Sign Out</span></button></div>
      </aside>
    </div>
    {mobileOpen && <button className="system-admin-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <StaffTopBar pages={ADMIN_SEARCH_PAGES} searchLabel="Search admin pages" onSignOut={signOut}
      interactionBlocked={Boolean(user.must_change_password || accountDialog)}
      accountActions={[{ id: 'change-name', label: 'Change Name', Icon: UserIcon, onSelect: () => setAccountDialog('name') },
        { id: 'change-password', label: 'Change Password', Icon: LockIcon, onSelect: () => setAccountDialog('password') }]}
      navigationControl={<button type="button" className="btn secondary system-admin-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls="sidebar-container">{mobileOpen ? <CloseIcon /> : <ChevronRightIcon />}</button>} />
    <div id="system-admin-content" className="system-admin-content" tabIndex={-1}>
      {!user.must_change_password && <Routes>
        <Route path="/admin/overview" element={<AdminOverview />} />
        <Route path="/admin/administrators" element={<AdminAccounts kind="administrators" />} />
        <Route path="/admin/staff" element={<AdminAccounts kind="staff" />} />
        <Route path="/admin/users" element={<AdminAccounts kind="users" />} />
        <Route path="/admin/page-access" element={<AdminPageAccess />} />
        <Route path="/admin/audit-trail" element={<AdminAuditTrail />} />
        <Route path="/admin/backup-recovery" element={<BackupRecovery />} />
        <Route path="/admin/account" element={<Navigate to="/admin/overview" replace />} />
        <Route path="*" element={<Navigate to="/admin/overview" replace />} />
      </Routes>}
    </div>
    {(user.must_change_password || accountDialog) && <AdminAccountDialog key={user.must_change_password ? 'required-password' : accountDialog}
      type={user.must_change_password ? 'password' : accountDialog} required={Boolean(user.must_change_password)} onClose={() => setAccountDialog(null)}
      onSaved={message => { setAccountDialog(null); setAccountMessage(message); }} onSignOut={signOut} />}
    {accountMessage && <div className="system-admin-notice system-admin-account-notice" role="status"><span>{accountMessage}</span><button type="button" className="system-admin-icon-btn" aria-label="Dismiss message" onClick={() => setAccountMessage('')}><CloseIcon size={16} /></button></div>}
  </div>;
}

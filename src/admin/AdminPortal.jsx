import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { supabase } from '../supabaseClient.js';
import { useSidebar } from '../useSidebar.js';
import { adminAction } from './adminApi.js';
import { AdminOverview, AdminAccounts, AdminSettings, AdminMyAccount } from './AdminScreens.jsx';
import AuditTrail from '../pages/AuditTrail.jsx';
import BackupRecovery from '../pages/BackupRecovery.jsx';
import AuthCallback from '../pages/AuthCallback.jsx';
import ResetPassword from '../pages/ResetPassword.jsx';
import LegalPolicy from '../pages/LegalPolicy.jsx';
import logo from '../assets/images/tupehrlogo.jpg';
import { DashboardIcon, UsersIcon, UserIcon, HistoryIcon, SettingsIcon, BackupIcon,
  ChevronLeftIcon, ChevronRightIcon, LogoutIcon, EyeIcon, EyeOffIcon, SearchIcon, CloseIcon } from '../components/icons/Icons.jsx';
import './admin.css';

const NAV = [
  { path: '/admin/overview', label: 'Overview', Icon: DashboardIcon, group: 'MAIN' },
  { path: '/admin/staff', label: 'Staff Accounts', Icon: UsersIcon },
  { path: '/admin/users', label: 'User Accounts', Icon: UserIcon },
  { path: '/admin/audit-trail', label: 'Audit Trail', Icon: HistoryIcon, group: 'SYSTEM' },
  { path: '/admin/backup-recovery', label: 'Backup & Recovery', Icon: BackupIcon },
  { path: '/admin/settings', label: 'System Settings', Icon: SettingsIcon },
  { path: '/admin/account', label: 'My Account', Icon: UserIcon },
];

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
      navigate(result.profile.must_change_password ? '/admin/account' : '/admin/overview', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="system-admin-login">
    <section className="system-admin-login-intro" aria-label="TUP Clinic system administration">
      <div className="system-admin-login-brand"><img src={logo} alt="TUP Clinic" /><h1>TUP Manila Clinic</h1></div>
      <h2>System Admin Portal</h2>
      <p>Manage staff access, invitations, account security, and system activity for the clinic.</p>
      <p className="system-admin-muted">For authorized system administrators.</p>
    </section>
    <section className="system-admin-login-card">
      <h2>Administrator Log In</h2>
      <form onSubmit={submit}>
        <label>Username<input name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={120} autoFocus /></label>
        <label>Password<span className="system-admin-password"><input name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} />
          <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOffIcon /> : <EyeIcon />}</button></span></label>
        {error && <div className="system-admin-login-error" role="alert">{error}</div>}
        {location.state?.message && <p role="status">{location.state.message}</p>}
        <button className="btn" disabled={busy || !username.trim() || !password}>{busy ? 'Signing in…' : 'Log In'}</button>
      </form>
      <p className="system-admin-login-footer">© Technological University of the Philippines</p>
    </section>
  </div>;
}

export default function AdminPortal() {
  const { user, loading, initializing, isAuthenticated, isPasswordRecoverySession, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { collapsed, toggle } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth < 1024);
  const railCollapsed = collapsed && !mobile;
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 1024);
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { document.title = 'TUP Clinic · System Admin'; document.documentElement.setAttribute('data-density', 'normal'); }, []);
  useEffect(() => { setMobileOpen(false); setSearch(''); }, [location.pathname]);
  useEffect(() => {
    const key = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') { setSearch(''); setMobileOpen(false); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  if (location.pathname === '/auth/callback') return <AuthCallback />;
  if (location.pathname === '/reset-password') return <ResetPassword />;
  if (location.pathname === '/privacy' || location.pathname === '/terms') return <LegalPolicy type={location.pathname === '/privacy' ? 'privacy' : 'terms'} />;
  if (loading || initializing) return <div className="system-admin-loading" role="status">Loading your administrator session…</div>;
  if (isPasswordRecoverySession) return <Navigate to="/reset-password" replace />;
  if (!isAuthenticated || user?.role !== 'admin' || user.active === false) return <AdminLogin />;
  if (user.must_change_password && location.pathname !== '/admin/account') return <Navigate to="/admin/account" replace />;
  const signOut = async () => { await logout(); navigate('/login', { replace: true }); };
  return <div id="app-root" className={`system-admin has-staff-topbar ${railCollapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'system-admin-mobile-open' : ''}`}>
    <a className="system-admin-skip" href="#system-admin-content">Skip to content</a>
    <div id="sidebar-container" className={`sidebar-container ${railCollapsed ? 'collapsed' : ''}`}>
      <aside className={`sidebar ${railCollapsed ? 'collapsed' : ''}`} aria-label="System administrator navigation">
        <div className="sidebar-header">
          <Link className="brand" to="/admin/overview"><img className="logo-img" src={logo} alt="TUP Clinic" /><div className="brand-text"><h1 className="brand-title">TUP CLINIC</h1><div className="brand-sub">System Admin Portal</div></div></Link>
          <button type="button" className="sidebar-collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}</button>
        </div>
        <Link className="sidebar-user-widget" to="/admin/account" title="My Account"><span className="system-admin-avatar">{(user.name || 'A')[0]}</span><div className="sidebar-user-info"><div className="sidebar-user-name">{user.name}</div><div className="sidebar-user-role">System Administrator</div></div></Link>
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
    <header className="staff-topbar">
      <button className="btn secondary system-admin-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">{mobileOpen ? <CloseIcon /> : <ChevronRightIcon />}</button>
      <div className="system-admin-search"><SearchIcon /><input ref={searchRef} placeholder="Search admin pages…" aria-label="Search administrator pages" value={search} onChange={e => setSearch(e.target.value)} /><kbd>Ctrl+K</kbd>
        {search.trim() && <div className="system-admin-search-results">{NAV.filter(item => item.label.toLowerCase().includes(search.toLowerCase())).map(item => <Link key={item.path} to={item.path}>{item.label}</Link>)}{!NAV.some(item => item.label.toLowerCase().includes(search.toLowerCase())) && <p>No matching pages.</p>}</div>}
      </div>
      <div className="system-admin-topbar-actions"><select aria-label="Appearance" value={theme} onChange={e => setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Auto</option></select><Link to="/admin/account"><span className="topbar-avatar" aria-hidden="true">{(user.name || 'A')[0]}</span><span>{user.name}</span></Link></div>
    </header>
    <div id="system-admin-content" className="system-admin-content" tabIndex={-1}>
      <Routes>
        <Route path="/admin/overview" element={<AdminOverview />} />
        <Route path="/admin/staff" element={<AdminAccounts kind="staff" />} />
        <Route path="/admin/users" element={<AdminAccounts kind="users" />} />
        <Route path="/admin/audit-trail" element={<AdminAuditTrail />} />
        <Route path="/admin/backup-recovery" element={<BackupRecovery />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/account" element={<AdminMyAccount />} />
        <Route path="*" element={<Navigate to="/admin/overview" replace />} />
      </Routes>
    </div>
  </div>;
}

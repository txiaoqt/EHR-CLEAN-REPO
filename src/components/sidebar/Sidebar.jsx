// src/components/sidebar/Sidebar.jsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { translate } from '../../utils';
import { useAuth } from '../../AuthContext.jsx';
import { useStaffPresence } from '../../StaffPresenceContext.jsx';
import StaffAvailability from '../StaffAvailability.jsx';
import { supabase } from '../../supabaseClient.js';
import { isPhysician } from '../../accessControl.js';
import tupehrlogo from '../../assets/images/tupehrlogo.jpg';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';

import {
  DashboardIcon,
  CalendarIcon,
  UsersIcon,
  UserIcon,
  InventoryIcon,
  ReportsIcon,
  MessagesIcon,
  HelpIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  MedicalLogIcon,
  BackupIcon,
  ArchiveIcon,
  LogoutIcon
} from '../icons/Icons.jsx';

// Exported so the command palette searches the same list the sidebar renders —
// a page reachable in one must be reachable in the other.
export const NAV_GROUPS = [
  {
    label: 'MAIN',
    items: [
      { page: 'dashboard', label: 'dashboard', icon: DashboardIcon },
      { page: 'appointments', label: 'appointments', icon: CalendarIcon },
      { page: 'patients', label: 'patients', icon: UsersIcon },
      { page: 'enrollees', label: 'Enrollees', icon: UserIcon, roles: ['admin', 'physician', 'nurse'] },
      { page: 'archive-files', label: 'Archive Files', icon: ArchiveIcon, roles: ['admin', 'physician', 'nurse'] },
    ]
  },
  {
    label: 'CLINICAL',
    items: [
      { page: 'medical-log', label: 'Medicine Log', icon: MedicalLogIcon },
      { page: 'inventory', label: 'inventory', icon: InventoryIcon },
      { page: 'reports', label: 'reports', icon: ReportsIcon },
    ]
  },
  {
    label: 'COMMUNICATION',
    items: [
      { page: 'events', label: 'Events', icon: CalendarIcon },
      { page: 'patient-messages', label: 'Patient Messages', icon: MessagesIcon },
    ]
  },
  {
    label: 'SUPPORT',
    items: [
      { page: 'help', label: 'help', icon: HelpIcon },
    ]
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { page: 'audit-trail', label: 'Audit Trail', icon: HistoryIcon, roles: ['admin', 'physician'] },
      { page: 'backup-recovery', label: 'Backup & Recovery', icon: BackupIcon, roles: ['admin', 'physician'], paletteOnly: true },
      { page: 'settings', label: 'Settings', icon: SettingsIcon },
    ]
  }
];

const Sidebar = ({ collapsed = false, toggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { selfStatus } = useStaffPresence();
  const [languageChange, setLanguageChange] = useState(0);

  // Confirmation popup state
  const [showConfirm, setShowConfirm] = useState(false);

  // show last backup timestamp
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('last_backup') || '--');

  useEffect(() => {
    // re-render trigger for settings changes
    const handleSettingsChange = () => setLanguageChange(prev => prev + 1);
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  // Compute display name
  let displayName = user?.name || '';
  const emailPrefix = (user?.email || '').split('.')[0].toLowerCase();
  if (emailPrefix === 'dr' && displayName && !displayName.startsWith('Dr.')) {
    displayName = `Dr. ${displayName}`;
  } else if (emailPrefix === 'nurse' && displayName && !displayName.startsWith('Nr.')) {
    displayName = `Nr. ${displayName.replace(/^(Nurse\s+)?/, '')}`;
  } else if (emailPrefix === 'admin' && displayName) {
    displayName = `Admin ${displayName}`;
  }
  const formattedRole = (user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Staff');

  // Fetch last_backup from Supabase on mount (fallback to localStorage), and listen to backupCompleted events
  useEffect(() => {
    let mounted = true;

    const fetchLastBackup = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'last_backup')
          .maybeSingle();

        if (!error && data && data.value) {
          if (mounted) {
            setLastBackup(data.value);
            localStorage.setItem('last_backup', data.value);
          }
        } else {
          const local = localStorage.getItem('last_backup');
          if (mounted && local) setLastBackup(local);
        }
      } catch (err) {
        const local = localStorage.getItem('last_backup');
        if (mounted && local) setLastBackup(local);
      }
    };

    fetchLastBackup();

    const onBackupCompleted = (ev) => {
      const ts = ev?.detail || localStorage.getItem('last_backup') || '--';
      setLastBackup(ts);
      if (ts && ts !== '--') localStorage.setItem('last_backup', ts);
    };

    window.addEventListener('backupCompleted', onBackupCompleted);

    return () => {
      mounted = false;
      window.removeEventListener('backupCompleted', onBackupCompleted);
    };
  }, []);

  const handleNavigation = (page) => {
    navigate('/' + page);
  };

  const handleSignOut = async () => {
    setShowConfirm(false);
    try {
      await logout();
    } catch (err) {
      console.warn('Logout error:', err);
    }
    navigate('/login', { replace: true });
  };

  const handleSignOutClick = () => {
    setShowConfirm(true);
  };

  const openBackupSettings = () => navigate('/backup-recovery');

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Primary navigation">
        {/* Top Header: Logo + Brand + Collapse/Expand Toggle */}
        <div className="sidebar-header">
          <div className="brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }} title="TUP Clinic Staff Portal">
            <img src={tupehrlogo} alt="TUP EHR logo" className="logo-img" />
            <div className="brand-text">
              <h1 className="brand-title">TUP CLINIC</h1>
              <div className="brand-sub">Staff Portal</div>
            </div>
          </div>

          <button
            type="button"
            id={collapsed ? "sidebarExpandBtn" : "sidebarCollapseBtn"}
            className="sidebar-collapse-btn"
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
          </button>
        </div>

        {/* User Identity Widget (Clickable to My Profile in both expanded and collapsed/compressed states) */}
        <div
          className="sidebar-user-widget"
          onClick={() => navigate('/my-profile')}
          title={collapsed ? `Profile: ${displayName || 'User'}` : "View My Profile"}
          role="button"
          tabIndex={0}
          aria-label={`View My Profile for ${displayName || 'User'}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/my-profile');
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <img src={user?.avatar || avatarPlaceholder} alt={displayName || 'User'} className="sidebar-user-avatar" />
          <div className="sidebar-user-info" style={{ minWidth: 0, flex: 1 }}>
            <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName || 'Staff Member'}
            </div>
            <div className="sidebar-user-role">
              <span>{formattedRole}</span>
              <StaffAvailability status={selfStatus} live />
            </div>
          </div>
        </div>

        {/* Grouped Navigation */}
        <div className="menu" role="navigation" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV_GROUPS.map((group, gIdx) => (
            <div key={gIdx} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {group.items.filter((item) =>
                (!item.roles || item.roles.includes((user?.role || '').toString().trim().toLowerCase())) &&
                // Some destinations are reachable from Search pages but kept out
                // of the sidebar, which otherwise grows past the viewport.
                !item.paletteOnly
              ).map(({ page, label, icon: IconComponent }) => {
                const isActive = location.pathname === `/${page}`
                  || location.pathname.startsWith(`/${page}/`)
                  || (page === 'dashboard' && location.pathname === '/');
                const navTitle = translate(label) || label;
                return (
                  <div
                    key={page + label}
                    className={`menu-item ${isActive ? 'active' : ''}`}
                    data-page={page}
                    onClick={() => handleNavigation(page)}
                    title={collapsed ? navTitle : undefined}
                    aria-label={navTitle}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigation(page); }}
                  >
                    <span className="nav-icon" aria-hidden="true">{IconComponent ? <IconComponent /> : null}</span>
                    <span className="nav-label">{navTitle}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom Profile / Footer Card */}
        <div className="sidebar-footer">
          {/* Expanded Profile Card */}
          <div
            className="sidebar-profile-card"
            onClick={() => navigate('/my-profile')}
            style={{ cursor: 'pointer' }}
            title="Click to view and edit profile"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('/my-profile'); }}
          >
            <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-light)', fontWeight: 'var(--font-weight-semibold)' }}>Logged in as</div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginTop: 2 }}>
              {displayName || 'User'}
            </div>
            <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>
              {formattedRole}
            </div>

            {isPhysician(user) && (
              <div
                style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)', marginTop: 6, cursor: 'pointer', borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}
                onClick={(e) => { e.stopPropagation(); openBackupSettings(); }}
                title="Open backup settings"
              >
                Last backup: <strong>{lastBackup}</strong>
              </div>
            )}
          </div>

          {/* Collapsed Compact Profile Avatar Button */}
          <button
            type="button"
            className="sidebar-collapsed-profile-btn"
            onClick={() => navigate('/my-profile')}
            title={`Profile: ${displayName || 'User'}`}
            aria-label={`View Profile for ${displayName || 'User'}`}
          >
            <img
              src={user?.avatar || avatarPlaceholder}
              alt={displayName || 'User'}
              style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
            />
          </button>

          {/* Sign Out Button (Seamless transition between expanded text button and collapsed icon button) */}
          <button
            id={collapsed ? "sidebarSignoutCollapsed" : "sidebarSignout"}
            className="sidebar-signout-btn"
            onClick={handleSignOutClick}
            title={collapsed ? "Sign Out" : undefined}
            aria-label="Sign Out"
          >
            <LogoutIcon size={18} className="sidebar-signout-icon" />
            <span className="sidebar-signout-text">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Inline Confirm Popup for Sign Out */}
      {showConfirm && createPortal((
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              padding: '22px',
              width: '360px',
              borderRadius: '12px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
              textAlign: 'center'
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-heading"
          >
            <h3 id="confirm-heading" style={{ margin: '0 0 8px' }}>Sign Out?</h3>
            <p style={{ margin: '0 0 18px', color: 'var(--muted)' }}>
              Are you sure you want to sign out?
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button className="btn secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                className="btn"
                onClick={handleSignOut}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
};

export default Sidebar;

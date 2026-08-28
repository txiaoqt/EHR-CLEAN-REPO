import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { translate } from '../../utils';
import { useAuth } from '../../AuthContext.jsx';
import { supabase } from '../../supabaseClient.js';
import { isPhysician } from '../../accessControl.js';
import tupehrlogo from '../../assets/images/tupehrlogo.jpg';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';

const NAV_ITEMS = [
  { page: 'dashboard', label: 'dashboard', icon: '🏠' },
  { page: 'appointments', label: 'appointments', icon: '📅' },
  { page: 'patients', label: 'patients', icon: '🧑‍🤝‍🧑' },
  { page: 'encounters', label: 'encounters', icon: '🩺' },
  { page: 'reports', label: 'reports', icon: '📈' },
  { page: 'inventory', label: 'inventory', icon: '🧾' },
  { page: 'help', label: 'help', icon: '❓' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  useEffect(() => {
    // update display name + avatar from user object (if available)
    if (user) {
      const avatar = document.querySelector('.avatar');
      const footer = document.querySelector('.sidebar-footer');

      let displayName = user.name || '';
      const emailPrefix = (user.email || '').split('.')[0].toLowerCase();
      if (emailPrefix === 'dr' && displayName && !displayName.startsWith('Dr.')) {
        displayName = `Dr. ${displayName}`;
      } else if (emailPrefix === 'nurse' && displayName && !displayName.startsWith('Nr.')) {
        displayName = `Nr. ${displayName.replace(/^(Nurse\s+)?/, '')}`;
      } else if (emailPrefix === 'admin' && displayName) {
        displayName = `Admin ${displayName}`;
      }

      if (footer) {
        const userDiv = footer.querySelector('div');
        if (userDiv) userDiv.innerHTML = `Logged in as <strong>${displayName || 'User'}</strong>`;
      }
      if (avatar && user.avatar) avatar.src = user.avatar;
    }

    // close profile menu when clicking outside
    const handleClickOutside = (ev) => {
      if (!document.getElementById('sidebar-container')?.contains(ev.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [user]);

  // Fetch last_backup from Supabase on mount (fallback to localStorage), and listen to backupCompleted events
  useEffect(() => {
    let mounted = true;
    console.log('[SHELL-DEBUG] Sidebar mounted');

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

  const toggleProfileMenu = () => setProfileMenuOpen(prev => !prev);

  // When clicking Last backup, navigate to settings and focus the backup card
  const openBackupSettings = () => navigate('/settings', { state: { focus: 'backup' } });

  return (
    <>
      <aside className="sidebar" aria-label="Primary navigation">
        {/* Header */}
        <div className="sidebar-header">
          <div className="brand">
            <div className="logo">
              <img src={tupehrlogo} alt="TUP EHR logo" className="logo-img" />
            </div>
            <div>
              <h1 className="brand-title">TUP Clinic</h1>
              <div className="brand-sub">Staff Dashboard</div>
            </div>
          </div>

          <button
            id="profileBtn"
            className="profile-btn"
            aria-haspopup="true"
            aria-expanded={profileMenuOpen}
            onClick={toggleProfileMenu}
          >
            <img src={avatarPlaceholder} alt="Profile" className="avatar" />
          </button>

          <div id="profileMenu" className={`profile-menu ${profileMenuOpen ? '' : 'hidden'}`}>
            <div
              className="profile-menu-item"
              id="profileView"
              onClick={() => { setProfileMenuOpen(false); navigate('/my-profile'); }}
            >
              View Profile
            </div>
            <div
              className="profile-menu-item"
              id="profileSettings"
              onClick={() => { setProfileMenuOpen(false); navigate('/settings'); }}
            >
              Settings
            </div>
            <div
              className="profile-menu-item danger"
              id="signOut"
              onClick={handleSignOutClick}
            >
              Sign Out
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="menu" role="navigation">
          {NAV_ITEMS.map(({ page, label, icon }) => {
            const isActive = location.pathname === `/${page}` || (page === 'dashboard' && location.pathname === '/');
            return (
              <div
                key={page}
                className={`menu-item ${isActive ? 'active' : ''}`}
                data-page={page}
                onClick={() => handleNavigation(page)}
              >
                {icon} {translate(label)}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div>Logged in as <strong>{user?.name || 'Staff'}</strong></div>

          {isPhysician(user) && (
            <div
              className="muted"
              style={{ cursor: 'pointer' }}
              onClick={openBackupSettings}
              title="Open backup settings"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openBackupSettings(); }}
            >
              Last backup: <strong>{lastBackup}</strong>
            </div>
          )}

          <div className="footer-actions">
            <button id="sidebarSettings" className="btn small" onClick={() => navigate('/settings')}>Settings</button>
            <button id="sidebarSignout" className="btn secondary small" onClick={handleSignOutClick}>Sign Out</button>
          </div>
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

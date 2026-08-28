import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import tupehrlogo from '../../assets/images/tupehrlogo.jpg';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';

const PATIENT_NAV = [
  { path: '/patient/dashboard', label: 'Home' },
  { path: '/patient/schedule', label: 'Schedule' },
  { path: '/patient/messages', label: 'Messages' },
  { path: '/patient/records', label: 'Records' },
  { path: '/patient/profile', label: 'Profile' },
];

const PatientSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    const close = (ev) => {
      if (!document.getElementById('sidebar-container')?.contains(ev.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const go = (path) => navigate(path);

  const confirmLogout = async () => {
    setShowConfirm(false);
    try {
      await logout();
    } catch (err) {
      console.warn('Logout error:', err);
    }
    navigate('/login', { replace: true });
  };

  return (
    <>
      <aside className="sidebar patient-sidebar" aria-label="Patient navigation">
        <div className="sidebar-header">
          <div className="brand">
            <div className="logo">
              <img src={tupehrlogo} alt="TUP EHR logo" className="logo-img" />
            </div>
            <div>
              <h1 className="brand-title">TUP Clinic</h1>
              <div className="brand-sub">Patient Portal</div>
            </div>
          </div>

          <button
            className="profile-btn"
            aria-haspopup="true"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((s) => !s)}
          >
            <img src={user?.avatar || avatarPlaceholder} alt="Profile" className="avatar" />
          </button>

          <div className={`profile-menu ${profileMenuOpen ? '' : 'hidden'}`}>
            <div className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); go('/patient/profile'); }}>
              View Profile
            </div>
            <div className="profile-menu-item danger" onClick={() => { setProfileMenuOpen(false); setShowConfirm(true); }}>
              Sign Out
            </div>
          </div>
        </div>

        <nav className="menu" role="navigation">
          {PATIENT_NAV.map((item) => (
            <div
              key={item.path}
              className={`menu-item patient-menu-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => go(item.path)}
            >
              {item.label}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer patient-sidebar-footer">
          <div>Logged in as <strong>{user?.name || 'Test Patient'}</strong></div>
          <div className="footer-actions">
            <button className="btn secondary small" onClick={() => setShowConfirm(true)}>Sign Out</button>
          </div>
        </div>
      </aside>

      {showConfirm && createPortal((
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
        }}>
          <div style={{
            background: 'var(--panel)',
            padding: 22,
            width: 360,
            borderRadius: 12,
            boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}>
            <h3 style={{ margin: '0 0 8px' }}>Sign Out?</h3>
            <p style={{ margin: '0 0 18px', color: 'var(--muted)' }}>Are you sure you want to sign out?</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button className="btn secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn" onClick={confirmLogout}>Confirm</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
};

export default PatientSidebar;

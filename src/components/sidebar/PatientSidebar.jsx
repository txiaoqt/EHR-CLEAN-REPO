import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import tupehrlogo from '../../assets/images/tupehrlogo.jpg';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';
import {
  DashboardIcon,
  CalendarIcon,
  ClockIcon,
  MessagesIcon,
  EncountersIcon,
  UserIcon,
  LogoutIcon,
  CloseIcon,
} from '../icons/Icons.jsx';

const PATIENT_NAV = [
  { path: '/patient/dashboard', label: 'Home', icon: DashboardIcon },
  { path: '/patient/events', label: 'Events', icon: CalendarIcon },
  { path: '/patient/schedule', label: 'Schedule', icon: ClockIcon },
  { path: '/patient/messages', label: 'Messages', icon: MessagesIcon },
  { path: '/patient/records', label: 'Records', icon: EncountersIcon },
];

const PatientSidebar = ({ onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);

  const displayName = user?.name || 'Angel Keith Carbon';
  const displayRole = 'Student / Patient';

  const handleNavigation = (path) => {
    if (onClose) onClose();
    navigate(path);
  };

  const confirmLogout = async () => {
    setShowConfirm(false);
    if (onClose) onClose();
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
        {/* Brand Header */}
        <div className="sidebar-header">
          <div
            className="brand"
            onClick={() => handleNavigation('/patient/dashboard')}
            style={{ cursor: 'pointer' }}
            title="TUP Manila Clinic Patient Portal"
          >
            <img src={tupehrlogo} alt="TUP EHR logo" className="logo-img" />
            <div className="brand-text">
              <h1 className="brand-title">TUP CLINIC</h1>
              <div className="brand-sub">Patient Portal</div>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={onClose}
              aria-label="Close navigation"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
              }}
            >
              <CloseIcon size={18} />
            </button>
          )}
        </div>

        {/* Authenticated Patient Identity Block (Clickable to Profile) */}
        <div
          className="sidebar-user-widget"
          onClick={() => handleNavigation('/patient/profile')}
          style={{ cursor: 'pointer' }}
          title="View My Profile"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleNavigation('/patient/profile');
          }}
        >
          <img
            src={user?.avatar || avatarPlaceholder}
            alt={displayName}
            className="sidebar-user-avatar"
          />
          <div className="sidebar-user-info" style={{ minWidth: 0, flex: 1 }}>
            <div
              className="sidebar-user-name"
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={displayName}
            >
              {displayName}
            </div>
            <div className="sidebar-user-role">
              <span>{displayRole}</span>
              <span className="status-dot"></span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
            </div>
          </div>
        </div>

        {/* Flat Simplified Navigation List */}
        <nav className="menu" role="navigation" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="nav-group">
            {PATIENT_NAV.map(({ path, label, icon: IconComponent }) => {
              const isActive = location.pathname === path;
              return (
                <div
                  key={path}
                  className={`menu-item patient-menu-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavigation(path)}
                  title={label}
                  aria-label={label}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleNavigation(path);
                  }}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {IconComponent ? <IconComponent size={18} /> : null}
                  </span>
                  <span className="nav-label">{label}</span>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer with Sign Out Button */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-signout-btn"
            onClick={() => setShowConfirm(true)}
            aria-label="Sign out from portal"
          >
            <span className="sidebar-signout-icon">
              <LogoutIcon size={18} />
            </span>
            <span className="sidebar-signout-text">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showConfirm &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3000,
              padding: 16,
            }}
            onClick={() => setShowConfirm(false)}
          >
            <div
              style={{
                background: 'var(--panel, #ffffff)',
                borderRadius: 12,
                width: 'min(92vw, 380px)',
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                Sign Out?
              </h3>
              <p style={{ margin: '0 0 20px 0', color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
                Are you sure you want to log out of the Patient Portal?
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={confirmLogout}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default PatientSidebar;

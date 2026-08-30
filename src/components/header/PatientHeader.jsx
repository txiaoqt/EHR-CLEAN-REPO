// src/components/header/PatientHeader.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { useTheme } from '../../ThemeContext.jsx';
import tupehrlogo from '../../assets/images/tupehrlogo.jpg';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';
import { UserIcon, LogoutIcon, SunIcon, MoonIcon } from '../icons/Icons.jsx';

const PatientHeader = ({ onToggleNav }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const menuRef = useRef(null);

  const displayName = user?.name || 'Angel Keith Carbon';
  const displayRole = 'Student / Patient';
  const studentId = user?.patient_id || 'TUPM-23-5030';
  const avatarSrc = user?.avatar || avatarPlaceholder;

  // Close dropdown menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const handleProfileClick = () => {
    setMenuOpen(false);
    navigate('/patient/profile');
  };

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    setMenuOpen(false);
    try {
      await logout();
    } catch (err) {
      console.warn('Logout error:', err);
    }
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="patient-app-header">
        {/* Left: Menu Drawer Toggle + Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button
            type="button"
            className="patient-header-menu-btn"
            onClick={onToggleNav}
            aria-label="Toggle navigation menu"
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
          </button>

          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}
            onClick={() => navigate('/patient/dashboard')}
            title="TUP Manila Clinic Patient Portal"
          >
            <img
              src={tupehrlogo}
              alt="TUP Logo"
              style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
                TUP CLINIC
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                Patient Portal
              </div>
            </div>
          </div>
        </div>

        {/* Right: Theme Toggle & Authenticated User Avatar Dropdown Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Theme Toggle Button */}
          <button
            type="button"
            className="patient-theme-toggle-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md, 8px)',
              color: 'var(--text)',
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
          >
            {isDark ? (
              <SunIcon size={18} style={{ color: '#fbbf24' }} />
            ) : (
              <MoonIcon size={17} style={{ color: 'var(--text)' }} />
            )}
          </button>

          {/* User Profile Avatar Dropdown Trigger */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="User profile menu"
              aria-expanded={menuOpen}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '50%',
              }}
            >
              <img
                src={avatarSrc}
                alt={displayName}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--border-subtle, #ffffff)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                }}
              />
            </button>

            {/* Profile Dropdown Menu */}
            {menuOpen && (
              <div
                className="patient-profile-dropdown"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 230,
                  background: 'var(--panel, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                  zIndex: 2000,
                  padding: '8px 0',
                  animation: 'dropdownFadeIn 0.15s ease-out',
                }}
              >
                {/* User Identity Preview */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {displayRole}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--primary, #8b0000)', fontWeight: 600, marginTop: 2 }}>
                    {studentId}
                  </div>
                </div>

                {/* Menu Actions */}
                <div style={{ padding: '4px 0' }}>
                  <button
                    type="button"
                    onClick={handleProfileClick}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg, #f1f5f9)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <UserIcon size={16} />
                    <span>Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setShowLogoutConfirm(true); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--danger, #dc2626)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogoutIcon size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Dialog Modal */}
      {showLogoutConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3500,
            padding: 16,
          }}
          onClick={() => setShowLogoutConfirm(false)}
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
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={handleConfirmLogout}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PatientHeader;

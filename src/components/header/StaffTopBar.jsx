import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { useTheme } from '../../ThemeContext.jsx';
import {
  SearchIcon,
  ChevronDownIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
} from '../icons/Icons.jsx';
import CommandPalette from '../CommandPalette.jsx';

/**
 * The staff portal's top bar: page search and the account menu.
 *
 * Modelled on the reference admin. The menu is deliberately short — name, email,
 * appearance, sign out — because Settings and the Audit Trail already have their
 * own sidebar entries, so repeating them here would be two routes to one place.
 *
 * Appearance is a segmented Light / Dark / Auto control rather than a single
 * toggle: "Auto" is a real mode that follows the OS and keeps following it, not
 * a one-off resolution of whatever the OS happened to be at click time.
 */
const StaffTopBar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef(null);

  const displayName = user?.name || 'Staff';
  const email = user?.email || '';
  const initial = (displayName.trim().split(/\s+/).pop() || '?').charAt(0).toUpperCase();

  useEffect(() => {
    const onOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    if (menuOpen) {
      document.addEventListener('mousedown', onOutside);
      document.addEventListener('touchstart', onOutside);
    }
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const appearances = [
    { id: 'light', label: 'Light', Icon: SunIcon },
    { id: 'dark', label: 'Dark', Icon: MoonIcon },
    { id: 'system', label: 'Auto', Icon: DesktopIcon },
  ];

  return (
    <>
      <header className="staff-topbar">
        <button
          type="button"
          className="topbar-search"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search pages"
        >
          <SearchIcon size={16} />
          <span className="topbar-search-label">Search pages...</span>
          <span className="palette-kbd">Ctrl+K</span>
        </button>

        <div className="topbar-account" ref={menuRef}>
          <button
            type="button"
            className="topbar-account-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="topbar-avatar" aria-hidden="true">{initial}</span>
            <span className="topbar-account-name">{displayName}</span>
            <ChevronDownIcon size={15} />
          </button>

          {menuOpen && (
            <div className="topbar-menu" role="menu">
              <div className="topbar-menu-identity">
                <span className="topbar-menu-name">{displayName}</span>
                {email && <span className="topbar-menu-email">{email}</span>}
              </div>

              <div className="topbar-menu-divider" />

              <div className="topbar-menu-section">
                <span className="topbar-menu-heading">Appearance</span>
                <div className="topbar-appearance" role="radiogroup" aria-label="Appearance">
                  {appearances.map(({ id, label, Icon }) => {
                    const selected = theme === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`topbar-appearance-option${selected ? ' is-selected' : ''}`}
                        onClick={() => setTheme(id)}
                        title={`${label} appearance`}
                      >
                        <Icon size={13} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="topbar-menu-divider" />

              <button
                type="button"
                role="menuitem"
                className="topbar-menu-item is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  navigate('/login');
                }}
              >
                <LogoutIcon size={15} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
};

export default StaffTopBar;

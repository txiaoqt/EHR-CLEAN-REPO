import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';
import { loadSettings, saveSettings as saveSettingsUtil } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import PasswordRequirements from '../components/PasswordRequirements.jsx';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../utils/passwordPolicy.js';
import { SunIcon, MoonIcon, DesktopIcon } from '../components/icons/Icons.jsx';
import { IS_DENTAL_SURFACE } from '../deploySurface.js';

/**
 * Staff settings.
 *
 * Cards, not a section list: each area of configuration is its own card, so the
 * whole page can be scanned at once rather than navigated one section at a time.
 *
 * Two things deliberately are NOT here:
 *
 *  - Audit categories. Everything clinical and administrative is logged, always.
 *    Making that configurable invites turning the record off, and a log with
 *    holes in it is worse than no log.
 *  - Backup. It has its own page, because a verified backup is an operational
 *    task rather than a preference.
 */

const ROLE_LABELS = { physician: 'Physician', nurse: 'Nurse', dentist: 'Dentist', admin: 'Administrator' };

const Settings = () => {
  const { user: authUser } = useAuth();
  const { theme: globalTheme, setTheme: setGlobalTheme } = useTheme();

  const [settings, setSettings] = useState(() => loadSettings());
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setSettings((prev) => (prev.theme !== globalTheme ? { ...prev, theme: globalTheme } : prev));
  }, [globalTheme]);

  const flash = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

  // Changes apply and persist immediately. A Save button would imply the change
  // is not live yet, which for a theme or a toggle is simply untrue.
  const persist = (next) => {
    setSettings(next);
    saveSettingsUtil(next);
    window.dispatchEvent(new CustomEvent('settingsChanged'));
    supabase
      .from('settings')
      .upsert(Object.entries(next).map(([key, value]) => ({ key, value })), { onConflict: 'key' })
      .then(() => {}, () => {});
  };

  const changeTheme = (mode) => {
    setGlobalTheme(mode);
    persist({ ...settings, theme: mode });
  };

  const changePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      flash('The two passwords do not match.', 'error');
      return;
    }
    if (!isPasswordValid(newPassword)) {
      flash(PASSWORD_POLICY_MESSAGE, 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      flash('Password updated.');
    } catch (err) {
      flash(err?.message || 'Could not update the password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const switchRow = (key, label, note, last = false) => (
    <label className={`settings-row has-control${last ? ' is-last' : ''}`} style={last ? { borderBottom: 'none', paddingBottom: 0 } : undefined}>
      <div>
        <div className="settings-row-label">{label}</div>
        <div className="settings-row-note">{note}</div>
      </div>
      {/* No "ON/OFF" caption: the switch position already says it, and a second
          indicator beside the first was visual noise. */}
      <div className="settings-switch">
        <input
          type="checkbox"
          checked={settings[key] !== false}
          onChange={(e) => persist({ ...settings, [key]: e.target.checked })}
          aria-label={label}
        />
        <span className="settings-switch-slider" />
      </div>
    </label>
  );

  const appearances = [
    { id: 'light', label: 'Light', Icon: SunIcon, note: 'Always light, high contrast' },
    { id: 'dark', label: 'Dark', Icon: MoonIcon, note: 'Always dark, easier at night' },
    { id: 'system', label: 'System default', Icon: DesktopIcon, note: 'Follows your operating system' },
  ];

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Settings</h1>
            <div className="page-header-subtitle">
              Your password, the notices you get, and how the portal looks.
            </div>
          </div>
        </div>

        {message && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              background: messageType === 'error' ? 'var(--color-rose-bg)' : 'var(--color-emerald-bg)',
              color: messageType === 'error' ? 'var(--color-rose-text)' : 'var(--color-emerald-text)',
            }}
          >
            {message}
          </div>
        )}

        {/* Account on the left; the two short cards stack on the right so neither
            column ends in blank space. */}
        <div className="settings-main-grid">
          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>Account &amp; Security</h2>
              <p>Your sign-in details and password.</p>
            </header>

            <div className="settings-identity">
              <div className="settings-identity-label">Signed in as</div>
              <div className="settings-identity-body">
                <div>
                  <div className="settings-identity-name">{authUser?.name || 'Staff'}</div>
                  <div className="settings-identity-meta">
                    {ROLE_LABELS[authUser?.role] || 'Staff'} · {authUser?.email}
                  </div>
                </div>
                <span className="settings-identity-status">
                  <span className="status-dot" style={{ width: 7, height: 7 }} /> Active session
                </span>
              </div>
            </div>

            <div className="settings-subhead">
              <div className="settings-subhead-title">Change password</div>
              <div className="settings-subhead-note">
                Your email and role are managed by clinic administration.
              </div>
            </div>

            <div className="settings-password-grid">
              <div className="settings-field" style={{ marginBottom: 0 }}>
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  aria-describedby="staff-password-requirements"
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="settings-field" style={{ marginBottom: 0 }}>
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <PasswordRequirements id="staff-password-requirements" password={newPassword} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={changePassword}
                disabled={savingPassword || !isPasswordValid(newPassword) || newPassword !== confirmPassword}
              >
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>

          <div className="settings-stack">
          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>Notifications</h2>
              <p>Alerts in the portal and emails to patients.</p>
            </header>

            {switchRow('notifications_stock', 'Low stock warning banners',
              'Show the reorder alert at the top of the dashboard when stock falls below its threshold.')}
            {switchRow('notifications_email', 'Email notifications',
              'Appointment confirmations, reschedule notices and clinic announcements.', IS_DENTAL_SURFACE)}
            {/* Announcements to every patient are sent from the medical Staff Portal only. */}
            {!IS_DENTAL_SURFACE && switchRow('notifications_email_blast', 'Allow email blasts',
              'Permits sending an announcement to every registered patient at once.', true)}

            <div className="settings-callout">
              Emails go out only when the clinic&rsquo;s mail service is set up. If an email fails,
              the change is still saved.
            </div>
          </div>

          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>Interface Appearance</h2>
              <p>
                Saved to this browser. System default follows your computer&rsquo;s light or dark setting.
              </p>
            </header>

            <div className="settings-choices" role="radiogroup" aria-label="Appearance">
              {appearances.map(({ id, label, Icon, note }) => {
                const selected = globalTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`settings-choice${selected ? ' is-selected' : ''}`}
                    onClick={() => changeTheme(id)}
                  >
                    <Icon size={18} />
                    <span className="settings-choice-label">{label}</span>
                    <span className="settings-choice-note">{note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          </div>
        </div>

      </div>
    </main>
  );
};

export default Settings;

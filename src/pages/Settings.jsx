import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';
import { loadSettings, saveSettings as saveSettingsUtil } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { SunIcon, MoonIcon, DesktopIcon } from '../components/icons/Icons.jsx';

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

const CLINIC_FIELDS = [
  ['clinic_name', 'Clinic name'],
  ['clinic_email', 'Official email'],
  ['clinic_phone', 'Contact number'],
  ['clinic_address', 'Address'],
];

const Settings = () => {
  const { user: authUser } = useAuth();
  const { theme: globalTheme, setTheme: setGlobalTheme } = useTheme();

  const [settings, setSettings] = useState(() => loadSettings());
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [clinic, setClinic] = useState(() => {
    const s = loadSettings();
    return {
      clinic_name: s.clinic_name || 'TUP Clinic',
      clinic_email: s.clinic_email || 'clinic@tup.edu.ph',
      clinic_phone: s.clinic_phone || '(02) 301-3001 loc. 605',
      clinic_address: s.clinic_address || 'Ayala Blvd., Ermita, Manila, 1000, Philippines',
    };
  });

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
    if (newPassword.length < 8) {
      flash('Use at least 8 characters.', 'error');
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
            <h1 className="page-header-title">System &amp; Staff Settings</h1>
            <div className="page-header-subtitle">
              Account credentials, notification preferences, appearance, audit records and backup.
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

        {/* Row 1 — account and notifications */}
        <div className="settings-main-grid">
          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>Account &amp; Security</h2>
              <p>Authenticated staff identity and credential management.</p>
            </header>

            <div className="settings-identity">
              <div className="settings-identity-label">Active account user</div>
              <div className="settings-identity-body">
                <div>
                  <div className="settings-identity-name">{authUser?.name || 'Staff'}</div>
                  <div className="settings-identity-meta">
                    {authUser?.role || 'physician'} · {authUser?.email}
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
                Minimum 8 characters. Your email and role are managed by clinic administration.
              </div>
            </div>

            <div className="settings-password-grid">
              <div className="settings-field" style={{ marginBottom: 0 }}>
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={changePassword}
                disabled={savingPassword || !newPassword || !confirmPassword}
              >
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>

          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>Notifications</h2>
              <p>What the system tells you, and by which route.</p>
            </header>

            {switchRow('notifications_stock', 'Low stock warning banners',
              'Show the reorder alert at the top of the dashboard when stock falls below its threshold.')}
            {switchRow('notifications_email', 'Email notifications',
              'Appointment confirmations, reschedule notices and clinic announcements.')}
            {switchRow('notifications_email_blast', 'Allow email blasts',
              'Permits sending an announcement to every registered patient at once.', true)}

            <div className="settings-callout">
              Email delivery depends on the deployed <code>send-patient-notification</code> and{' '}
              <code>send-event-announcement</code> functions and on the mail provider being configured.
              If sending fails, the portal still records the action.
            </div>
          </div>
        </div>

        {/* Row 2 — appearance and clinic identity */}
        <div className="settings-main-grid">
          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>Interface Appearance</h2>
              <p>
                Saved to this browser. System default follows your operating system and keeps following
                it when the system changes.
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

          <div className="card settings-card">
            <header className="settings-card-head">
              <h2>System Information</h2>
              <p>Shown on exported reports and the letters the clinic issues.</p>
            </header>
            {CLINIC_FIELDS.map(([key, label]) => (
              <div className="settings-field" key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  className="input"
                  value={clinic[key]}
                  onChange={(e) => setClinic((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={(e) => persist({ ...settings, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
};

export default Settings;

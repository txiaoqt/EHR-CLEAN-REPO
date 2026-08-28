import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';             // supabase client
import {
  loadSettings,
  saveSettings as saveSettingsUtil,
  translate,
  formatDate,
  formatTime
} from '../utils.js';                                        // utilities
import { useAuth } from '../AuthContext.jsx';                // auth context
import { isPhysician } from '../accessControl.js';          // access control

const normalizeTheme = (value) => (typeof value === 'string' && value.trim().toLowerCase() === 'dark' ? 'dark' : 'light');

const Settings = () => {
  const location = useLocation();
  const { user: authUser } = useAuth();

  const [settings, setSettings] = useState(() => loadSettings());
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('last_backup') || 'Never');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showBackupPasswordModal, setShowBackupPasswordModal] = useState(false);
  const [backupPasswordInput, setBackupPasswordInput] = useState('');

  const backupCardRef = useRef(null);

  useEffect(() => {
    // Initialize loading and ensure theme value exists in settings
    setLoading(false);
    const theme = normalizeTheme(settings.theme);
    if (!settings.theme) {
      const saved = loadSettings().theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      setSettings(prev => ({ ...prev, theme: normalizeTheme(saved) }));
      // apply initial theme
      window.applyTheme && window.applyTheme(saved);
    } else {
      if (theme !== settings.theme) {
        setSettings(prev => ({ ...prev, theme }));
      }
      window.applyTheme && window.applyTheme(theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (location?.state?.focus === 'backup' && backupCardRef.current) {
      setTimeout(() => {
        try {
          backupCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) { /* ignore */ }
      }, 150);
    }
  }, [location]);

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const revertSettings = () => {
    const saved = loadSettings();
    setSettings({ ...saved, theme: normalizeTheme(saved.theme) });
    if (saved.theme) window.applyTheme && window.applyTheme(normalizeTheme(saved.theme));
    setMessage('Reverted to saved settings.');
    setMessageType('info');
    setTimeout(() => setMessage(''), 2500);
  };

  const saveSettings = async () => {
    saveSettingsUtil(settings);
    setMessage(translate('settings_saved'));
    setMessageType('success');
    setTimeout(() => setMessage(''), 3000);

    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
      }
    } catch (err) {
      console.warn('Failed to sync settings to Supabase:', err);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setMessage('Password changed successfully!');
      setMessageType('success');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error changing password:', err);
      setMessage(`Error changing password: ${err.message || 'Unknown error'}`);
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleBackupSubmit = async (e) => {
    e.preventDefault();
    if (!backupPasswordInput) return;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authUser?.email,
        password: backupPasswordInput
      });

      if (error) {
        setMessage('Incorrect password.');
        setMessageType('error');
        setTimeout(() => setMessage(''), 3000);
        return;
      }

      setShowBackupPasswordModal(false);
      setBackupPasswordInput('');
      backupAll();
    } catch (err) {
      console.error(err);
      setMessage('Verification failed.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const backupAll = async () => {
    if (!isPhysician(authUser)) {
      setMessage('Access denied.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    setBackingUp(true);
    setMessage('Preparing backup...');
    setMessageType('info');

    try {
      const tables = [
        'patients',
        'encounters',
        'appointments',
        'inventory',
        'users',
        'settings',
        'audit_logs'
      ];

      const results = {};

      for (const t of tables) {
        try {
          const { data, error } = await supabase.from(t).select('*');
          if (error) results[t] = { error: error.message };
          else results[t] = data || [];
        } catch (err) {
          results[t] = { error: err.message };
        }
      }

      const payload = {
        exported_at: new Date().toISOString(),
        exported_by: authUser?.email || 'unknown',
        data: results
      };

      const filename = `tup_ehr_backup_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.json`;

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      const ts = new Date().toLocaleString();
      localStorage.setItem('last_backup', ts);
      setLastBackup(ts);

      try {
        await supabase.from('settings').upsert(
          [{ key: 'last_backup', value: ts }],
          { onConflict: 'key' }
        );
      } catch (e) {
        console.warn('Failed to upsert last_backup:', e);
      }

      try {
        window.dispatchEvent(new CustomEvent('backupCompleted', { detail: ts }));
      } catch (e) {
        try {
          const ev = new Event('backupCompleted');
          window.dispatchEvent(ev);
        } catch (_) { /* ignore */ }
      }

      setMessage('Backup complete! File downloaded.');
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Backup failed:', err);
      setMessage('Backup failed.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setBackingUp(false);
    }
  };

  if (loading) return <main className="main"><div className="card">Loading…</div></main>;

  return (
    <main className="main">
      {/* Backup Password Modal */}
      {showBackupPasswordModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <form onSubmit={handleBackupSubmit} className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>Verify Identity</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              Enter your password to proceed with the full data backup.
            </p>
            <input
              type="password"
              className="input"
              autoFocus
              placeholder="Your password"
              value={backupPasswordInput}
              onChange={e => setBackupPasswordInput(e.target.value)}
              style={{ width: '100%', marginBottom: 15 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShowBackupPasswordModal(false);
                  setBackupPasswordInput('');
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn">
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {message && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 20px',
          color: 'white',
          fontWeight: 600,
          borderRadius: 8,
          background: messageType === 'error'
            ? '#d9534f'
            : messageType === 'success'
            ? '#28a745'
            : '#0d6efd',
          zIndex: 2000
        }}>
          {message}
        </div>
      )}

      <section className="page">
        <div className="card">
          <h2>Settings</h2>

          {/* BACKUP CARD — TOP */}
          {isPhysician(authUser) && (
            <div
              className="card"
              ref={backupCardRef}
              style={{ marginTop: 20 }}
            >
              <h3 style={{ marginTop: 0 }}>Backup & Export</h3>
              <p style={{ color: 'var(--muted)' }}>
                Create a full export of system tables for offline backup or migration.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Last backup</div>
                  <div style={{ fontWeight: 600 }}>{lastBackup}</div>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <button className="btn" disabled={backingUp} onClick={() => setShowBackupPasswordModal(true)}>
                    {backingUp ? 'Backing up…' : 'Backup all data'}
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setMessage(lastBackup === 'Never'
                        ? 'No backup found.'
                        : `Last backup: ${lastBackup}`);
                      setMessageType('info');
                      setTimeout(() => setMessage(''), 3000);
                    }}
                  >
                    Info
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                Included: patients, encounters, appointments, inventory, users, settings, audit_logs.
              </div>
            </div>
          )}

          {/* MAIN GRID */}
          <div style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 420px',
            gap: 20
          }}>
            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Account</h3>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Signed in as</div>
                  <div style={{ fontWeight: 600 }}>
                    {authUser?.name || authUser?.email || '—'}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{authUser?.role}</div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <input
                    type="password"
                    placeholder="New password"
                    className="input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    className="input"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button className="btn" onClick={changePassword}>Change</button>
                </div>
              </div>

              {/* APPEARANCE CARD (updated: active uses .btn, inactive uses .btn secondary) */}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Appearance</h3>
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* LIGHT BUTTON */}
                  <button
                    className={`btn ${settings.theme !== 'light' ? 'secondary' : ''}`}
                    onClick={() => {
                      const next = { ...settings, theme: 'light' };
                      handleSettingChange('theme', 'light');
                      saveSettingsUtil(next);
                      window.applyTheme && window.applyTheme('light');
                    }}
                  >
                    Light
                  </button>

                  {/* DARK BUTTON */}
                  <button
                    className={`btn ${settings.theme !== 'dark' ? 'secondary' : ''}`}
                    onClick={() => {
                      const next = { ...settings, theme: 'dark' };
                      handleSettingChange('theme', 'dark');
                      saveSettingsUtil(next);
                      window.applyTheme && window.applyTheme('dark');
                    }}
                  >
                    Dark
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Application Settings</h3>

                <div style={{ marginBottom: 10 }}>
                  <label className="label-muted">Auto-save</label>
                  <input
                    type="checkbox"
                    checked={!!settings.auto_save}
                    onChange={e => handleSettingChange('auto_save', e.target.checked)}
                    style={{ marginLeft: 8 }}
                  />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label className="label-muted">Email Notifications</label>
                  <input
                    type="checkbox"
                    checked={!!settings.notifications_email}
                    onChange={e => handleSettingChange('notifications_email', e.target.checked)}
                    style={{ marginLeft: 8 }}
                  />
                </div>
              </div>

              {/* ACTIONS CARD (Revert / Save) */}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Actions</h3>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn secondary"
                    onClick={revertSettings}
                  >
                    Revert
                  </button>
                  <button
                    className="btn"
                    onClick={saveSettings}
                  >
                    Save
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                  Revert restores settings from local saved values. Save persists settings locally and attempts to sync to the server.
                </div>
              </div>
            </div>
          </div>

          {/* PREVIEW AT BOTTOM */}
          <div className="card" style={{ marginTop: 25, background: 'rgba(0,0,0,0.03)' }}>
            <h3 style={{ marginTop: 0 }}>Preview</h3>

            <div style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 18
            }}>
              <div>
                <strong>Date / Time</strong>
                <div style={{ marginTop: 6, fontFamily: 'monospace' }}>
                  {formatDate(new Date())} {formatTime(new Date())}
                </div>
              </div>

              <div>
                <strong>Sample Weight</strong>
                <div style={{ marginTop: 6, fontFamily: 'monospace' }}>
                  {settings.clinical_units === 'metric' ? '65.5 kg' : '144.6 lbs'}
                </div>
              </div>

              <div>
                <strong>Sample Height</strong>
                <div style={{ marginTop: 6, fontFamily: 'monospace' }}>
                  {settings.clinical_units === 'metric' ? '170 cm' : `5'7"`}
                </div>
              </div>
            </div>

            {settings.language === 'fil' && (
              <div style={{ marginTop: 12, padding: 8, background: '#e3f2fd', borderRadius: 6 }}>
                Preview: Filipino language is active.
              </div>
            )}

          </div>

        </div>
      </section>
    </main>
  );
};

export default Settings;

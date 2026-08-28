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
import { CloseIcon } from '../components/icons/Icons.jsx';

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
      {showBackupPasswordModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <form onSubmit={handleBackupSubmit} style={{ background: '#ffffff', width: 440, padding: 24, borderRadius: 16, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Authorize Database Backup</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowBackupPasswordModal(false);
                  setBackupPasswordInput('');
                }}
                aria-label="Close modal"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
              Enter your staff password to proceed with downloading the complete system backup archive.
            </p>
            <input
              type="password"
              className="input"
              autoFocus
              placeholder="Enter your account password"
              value={backupPasswordInput}
              onChange={e => setBackupPasswordInput(e.target.value)}
              style={{ width: '100%', marginBottom: 18, marginTop: 8 }}
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
                Confirm & Backup
              </button>
            </div>
          </form>
        </div>
      )}

      {message && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 20px',
          color: 'white',
          fontWeight: 700,
          borderRadius: 12,
          background: messageType === 'error'
            ? '#dc2626'
            : messageType === 'success'
            ? '#059669'
            : '#2563eb',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>{messageType === 'error' ? '⚠️' : '✓'}</span>
          <span>{message}</span>
        </div>
      )}

      <div className="page">
        {/* 1. Page Header: Page identity and configuration save actions */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">System & Staff Settings</h1>
            <div className="page-header-subtitle">
              Manage account credentials, interface preferences, clinic backup archives, and sync options.
            </div>
          </div>

          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={revertSettings}>
              Reset to Saved
            </button>
            <button type="button" className="btn" onClick={saveSettings}>
              Save Changes
            </button>
          </div>
        </div>

        {/* 2. Configuration Grid: Account & Security + Preferences & Appearance */}
        <div className="settings-main-grid" style={{ marginBottom: 20 }}>
          {/* Left Column: Account & Security */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Account & Security</h3>
                <span className="card-subtitle">Authenticated staff identity and credential management</span>
              </div>
              <span className="badge badge-info">{authUser?.role || 'Staff'}</span>
            </div>

            {/* Active Account Identity Block */}
            <div style={{ padding: '14px 16px', background: 'var(--grey-100)', borderRadius: 10, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Active Account User</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', marginTop: 2 }}>
                {authUser?.name || authUser?.email || 'Logged In Staff'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
                Role: <strong style={{ color: 'var(--text)' }}>{authUser?.role}</strong> • Email: <strong style={{ color: 'var(--text)' }}>{authUser?.email || 'N/A'}</strong>
              </div>
            </div>

            {/* Password Update Section */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Change Password</h4>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Update your staff portal security credentials</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <input
                  type="password"
                  placeholder="New password"
                  className="input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  aria-label="New password"
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  className="input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  aria-label="Confirm password"
                />
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={changePassword}
                disabled={!newPassword || !confirmPassword}
              >
                Update Password
              </button>
            </div>
          </div>

          {/* Right Column: Preferences & Interface Appearance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Preferences & Auto-Sync Card */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="card-header" style={{ marginBottom: 14 }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: 16 }}>Preferences & Auto-Sync</h3>
                  <span className="card-subtitle">Automated workflows and notification parameters</span>
                </div>
                <span className="badge badge-neutral">Configuration</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Auto-Save Drafts */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--grey-100)', borderRadius: 10, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>Auto-Save Drafts</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Automatically preserve encounter SOAP drafts</div>
                  </div>
                  <div className="settings-switch">
                    <input
                      type="checkbox"
                      checked={!!settings.auto_save}
                      onChange={e => handleSettingChange('auto_save', e.target.checked)}
                      aria-label="Auto-Save Drafts"
                    />
                    <span className="settings-switch-slider" />
                    <span className="settings-switch-text">{settings.auto_save ? 'ON' : 'OFF'}</span>
                  </div>
                </label>

                {/* Email Notifications */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--grey-100)', borderRadius: 10, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>Email Notifications</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Receive emergency triage and appointment alerts</div>
                  </div>
                  <div className="settings-switch">
                    <input
                      type="checkbox"
                      checked={!!settings.notifications_email}
                      onChange={e => handleSettingChange('notifications_email', e.target.checked)}
                      aria-label="Email Notifications"
                    />
                    <span className="settings-switch-slider" />
                    <span className="settings-switch-text">{settings.notifications_email ? 'ON' : 'OFF'}</span>
                  </div>
                </label>

                {/* Low Stock Warning Banners */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--grey-100)', borderRadius: 10, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>Low Stock Warning Banners</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Show inventory reorder alerts in dashboard header</div>
                  </div>
                  <div className="settings-switch">
                    <input
                      type="checkbox"
                      checked={!!settings.notifications_stock}
                      onChange={e => handleSettingChange('notifications_stock', e.target.checked)}
                      aria-label="Low Stock Warning Banners"
                    />
                    <span className="settings-switch-slider" />
                    <span className="settings-switch-text">{settings.notifications_stock ? 'ON' : 'OFF'}</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Interface Appearance Card */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: 16 }}>Interface Appearance</h3>
                  <span className="card-subtitle">Select daylight or contrast display mode</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className={settings.theme === 'light' ? 'btn' : 'btn secondary'}
                  style={{ flex: 1 }}
                  onClick={() => {
                    const next = { ...settings, theme: 'light' };
                    handleSettingChange('theme', 'light');
                    saveSettingsUtil(next);
                    window.applyTheme && window.applyTheme('light');
                  }}
                >
                  Light Mode
                </button>

                <button
                  type="button"
                  className={settings.theme === 'dark' ? 'btn' : 'btn secondary'}
                  style={{ flex: 1 }}
                  onClick={() => {
                    const next = { ...settings, theme: 'dark' };
                    handleSettingChange('theme', 'dark');
                    saveSettingsUtil(next);
                    window.applyTheme && window.applyTheme('dark');
                  }}
                >
                  Dark Mode
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Administration: Database Backup & Comprehensive Archive */}
        {isPhysician(authUser) && (
          <div
            className="card"
            ref={backupCardRef}
            style={{ padding: '20px 22px', borderLeft: '4px solid var(--color-primary)' }}
          >
            <div className="card-header" style={{ marginBottom: 8 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Database Backup & Comprehensive Archive</h3>
                <span className="card-subtitle">Generate an offline JSON backup of all clinical tables, patient profiles, encounters, and audit records</span>
              </div>
              <span className="badge badge-neutral">Offline Snapshot</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Last Backup Performed:</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginTop: 2 }}>{lastBackup}</div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={backingUp}
                  onClick={() => setShowBackupPasswordModal(true)}
                >
                  {backingUp ? 'Backing up…' : 'Export Full System Backup'}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setMessage(lastBackup === 'Never'
                      ? 'No previous backup record found in this session.'
                      : `Last system backup completed: ${lastBackup}`);
                    setMessageType('info');
                    setTimeout(() => setMessage(''), 3500);
                  }}
                >
                  Backup History
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Settings;

// src/pages/patient/PatientSettings.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { useTheme, getSystemTheme } from '../../ThemeContext.jsx';
import {
  SunIcon,
  MoonIcon,
  DesktopIcon,
  CheckIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  SettingsIcon,
  AlertIcon,
  ClockIcon,
  MailIcon,
  UsersIcon,
} from '../../components/icons/Icons.jsx';

// Tactile Toggle Switch Component (Emil Kowalski / Impeccable Standards)
const ToggleSwitch = ({ checked, onChange, disabled = false, ariaLabel }) => {
  const [active, setActive] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      onMouseLeave={() => setActive(false)}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 9999,
        background: checked ? 'var(--color-emerald, #10b981)' : 'var(--border, #cbd5e1)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 2,
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        transition: 'background 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 150ms ease',
        outline: 'none',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      <span
        style={{
          display: 'block',
          width: active ? 22 : 20,
          height: 20,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.22)',
          transform: checked
            ? (active ? 'translateX(18px)' : 'translateX(20px)')
            : 'translateX(0px)',
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), width 150ms ease',
        }}
      />
    </button>
  );
};

export const DENSITY_STORAGE_KEY = 'tup-clinic-density';

// Only the patient surface carries a density control, but this refuses to touch
// the document anywhere else — defence in depth alongside the surface gate in
// App.jsx, so a stray import can never restyle the staff portal.
const DENSITY_SURFACE = (import.meta.env.VITE_DEPLOY_SURFACE || 'admin').toLowerCase();
const IS_DENSITY_SURFACE = DENSITY_SURFACE === 'user';

export const applyDensityToDOM = (density) => {
  if (typeof document === 'undefined') return;
  if (!IS_DENSITY_SURFACE) return;
  const normalized = density === 'compact' || density === 'comfortable' ? density : 'normal';
  document.documentElement.setAttribute('data-density', normalized);
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, normalized);
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tupDensityChanged', { detail: { density: normalized } }));
  }
};

const DEFAULT_SETTINGS = {
  theme: 'light',
  font_scale: 'normal',
  email_notifications: true,
  appointment_reminders: true,
  clinic_announcements: true,
  message_alerts: true,
  date_format: 'MM/DD/YYYY',
  time_format: '12h',
  language: 'en',
  show_id_on_dashboard: true,
};

const PatientSettings = () => {
  const { user } = useAuth();
  const { theme: currentTheme, setTheme } = useTheme();

  const patientId = user?.patient_id || user?.id || '';
  const storageKey = `patient_settings_${patientId || 'default'}`;

  // Initial state initialized from localStorage if available
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.font_scale) applyDensityToDOM(parsed.font_scale);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
      const savedDensity = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (savedDensity) {
        applyDensityToDOM(savedDensity);
        return { ...DEFAULT_SETTINGS, font_scale: savedDensity, theme: currentTheme || 'light' };
      }
    } catch (_) {}
    return { ...DEFAULT_SETTINGS, theme: currentTheme || 'light' };
  });

  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const saveTimeoutRef = useRef(null);

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });

  // 1. Fetch & Initialize Settings from Supabase on Mount
  useEffect(() => {
    let mounted = true;

    const fetchSettings = async () => {
      if (!patientId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Try calling atomic RPC get_or_create_patient_settings
        const { data, error } = await supabase.rpc('get_or_create_patient_settings', {
          p_patient_id: patientId,
        });

        if (!error && data?.success && data?.settings && mounted) {
          const loaded = data.settings;
          setSettings((prev) => {
            const merged = {
              ...prev,
              theme: loaded.theme || prev.theme,
              font_scale: loaded.font_scale || prev.font_scale,
              email_notifications: loaded.email_notifications ?? prev.email_notifications,
              appointment_reminders: loaded.appointment_reminders ?? prev.appointment_reminders,
              clinic_announcements: loaded.clinic_announcements ?? prev.clinic_announcements,
              message_alerts: loaded.message_alerts ?? prev.message_alerts,
              date_format: loaded.date_format || prev.date_format,
              time_format: loaded.time_format || prev.time_format,
              language: loaded.language || prev.language,
              show_id_on_dashboard: loaded.show_id_on_dashboard ?? prev.show_id_on_dashboard,
            };
            try {
              localStorage.setItem(storageKey, JSON.stringify(merged));
            } catch (_) {}
            return merged;
          });
          if (loaded.font_scale) {
            applyDensityToDOM(loaded.font_scale);
          }
        } else {
          // Direct fallback query if RPC is not immediately available
          const { data: directData } = await supabase
            .from('patient_settings')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle();

          if (directData && mounted) {
            if (directData.font_scale) {
              applyDensityToDOM(directData.font_scale);
            }
            setSettings((prev) => ({ ...prev, ...directData }));
            try {
              localStorage.setItem(storageKey, JSON.stringify({ ...settings, ...directData }));
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('Failed to load patient settings from Supabase:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSettings();
    return () => {
      mounted = false;
    };
  }, [patientId, storageKey]);

  // 2. Persist Setting Change (Optimistic UI + Debounced Supabase Sync)
  const updateSetting = useCallback(async (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    // Special handling for theme changes
    if (key === 'theme') {
      if (value === 'system') {
        const sys = getSystemTheme();
        setTheme(sys);
      } else {
        setTheme(value);
      }
    }

    // Special handling for font_scale changes (Live Text Density Engine)
    if (key === 'font_scale') {
      applyDensityToDOM(value);
    }

    // Indicate saving
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    try {
      if (!patientId) {
        setSaveStatus('saved');
        saveTimeoutRef.current = setTimeout(() => setSaveStatus(null), 2000);
        return;
      }

      const { error } = await supabase
        .from('patient_settings')
        .upsert(
          {
            patient_id: patientId,
            user_id: user?.auth_user_id || user?.id,
            [key]: value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'patient_id' }
        );

      if (error) {
        console.warn(`Error persisting setting [${key}]:`, error);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    } catch (err) {
      console.warn(`Exception persisting setting [${key}]:`, err);
      setSaveStatus('error');
    } finally {
      saveTimeoutRef.current = setTimeout(() => setSaveStatus(null), 2200);
    }
  }, [patientId, storageKey, user, setTheme]);

  // 3. Handle Password Change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMsg({ text: '', type: '' });

    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg({ text: 'Password must be at least 6 characters long.', type: 'danger' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match.', type: 'danger' });
      return;
    }

    setPasswordUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordMsg({ text: error.message || 'Unable to update password.', type: 'danger' });
      } else {
        setPasswordMsg({ text: 'Password updated successfully!', type: 'success' });
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordMsg({ text: '', type: '' });
        }, 1500);
      }
    } catch (err) {
      setPasswordMsg({ text: 'An unexpected error occurred.', type: 'danger' });
    } finally {
      setPasswordUpdating(false);
    }
  };

  return (
    <main className="main">
      <section
        className="page patient-settings-page"
        style={{
          width: '100%',
          maxWidth: '1440px',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Page Header (Standardized across all patient views) */}
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>
                Settings
              </h2>
              <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
                Manage your portal preferences, notifications, and display options.
              </div>
            </div>

            {/* Subtle Saved Indicator Pill */}
            {saveStatus && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 9999,
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                  transition: 'all 180ms ease',
                  background:
                    saveStatus === 'saved'
                      ? 'rgba(16, 185, 129, 0.12)'
                      : saveStatus === 'saving'
                      ? 'rgba(59, 130, 246, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                  color:
                    saveStatus === 'saved'
                      ? '#10b981'
                      : saveStatus === 'saving'
                      ? '#3b82f6'
                      : '#ef4444',
                  border:
                    saveStatus === 'saved'
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : saveStatus === 'saving'
                      ? '1px solid rgba(59, 130, 246, 0.3)'
                      : '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {saveStatus === 'saving' && <span>Saving...</span>}
                {saveStatus === 'saved' && (
                  <>
                    <CheckIcon size={14} />
                    <span>Preferences saved</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertIcon size={14} />
                    <span>Failed to save</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Settings Grid / Cards Layout */}
        <div className="patient-settings-list" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* SECTION 1: Appearance & Display */}
          <div className="card patient-settings-card" style={{ padding: 22, border: '1px solid var(--border)', borderRadius: 12 }}>
            <div className="card-header-block" style={{ marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Appearance & Display
              </h3>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
                Customize how the patient portal looks and feels on your devices
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Theme Mode Segmented Pill */}
              <div className="patient-setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>Color Theme</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2 }}>
                    Switch between light, dark, or system-matching contrast
                  </div>
                </div>

                <div
                  className="patient-settings-segmented"
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg, #f1f5f9)',
                    padding: 3,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    gap: 3,
                  }}
                  role="radiogroup"
                  aria-label="Color Theme"
                >
                  {[
                    { id: 'light', label: 'Light', icon: SunIcon },
                    { id: 'dark', label: 'Dark', icon: MoonIcon },
                    { id: 'system', label: 'System', icon: DesktopIcon },
                  ].map((t) => {
                    const isSelected = settings.theme === t.id;
                    const IconComp = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => updateSetting('theme', t.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: isSelected ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
                          cursor: 'pointer',
                          transition: 'all 180ms ease',
                          background: isSelected ? 'var(--panel, #ffffff)' : 'transparent',
                          color: isSelected ? 'var(--text)' : 'var(--muted)',
                          boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        <IconComp size={15} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Scale Selection */}
              <div className="patient-setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '1px solid var(--border-subtle, var(--border))', paddingTop: 16 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>Text Density</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2 }}>
                    Adjust UI sizing and spacing for comfortable reading
                  </div>
                </div>

                <div
                  className="patient-settings-segmented"
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg, #f1f5f9)',
                    padding: 3,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    gap: 3,
                  }}
                  role="radiogroup"
                  aria-label="Text Density"
                >
                  {[
                    { id: 'compact', label: 'Compact' },
                    { id: 'normal', label: 'Default' },
                    { id: 'comfortable', label: 'Comfortable' },
                  ].map((s) => {
                    const isSelected = settings.font_scale === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => updateSetting('font_scale', s.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: isSelected ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
                          cursor: 'pointer',
                          transition: 'all 180ms ease',
                          background: isSelected ? 'var(--panel, #ffffff)' : 'transparent',
                          color: isSelected ? 'var(--text)' : 'var(--muted)',
                          boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Notifications & Alerts */}
          <div className="card patient-settings-card" style={{ padding: 22, border: '1px solid var(--border)', borderRadius: 12 }}>
            <div className="card-header-block" style={{ marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Notifications & Communication
              </h3>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
                Control how and when university clinic personnel contact you
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Appointment Reminders */}
              <div className="patient-setting-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                    Appointment Reminders
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2, maxWidth: 520, lineHeight: 1.4 }}>
                    Receive schedule confirmation and 24-hour reminders prior to your clinical consultations.
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.appointment_reminders}
                  onChange={(val) => updateSetting('appointment_reminders', val)}
                  ariaLabel="Toggle Appointment Reminders"
                />
              </div>

              {/* Direct Inquiry Alerts */}
              <div className="patient-setting-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderTop: '1px solid var(--border-subtle, var(--border))', paddingTop: 16 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                    Direct Inquiry & Message Alerts
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2, maxWidth: 520, lineHeight: 1.4 }}>
                    Alert me immediately when clinic physicians or triage nurses reply to an ongoing inquiry.
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.message_alerts}
                  onChange={(val) => updateSetting('message_alerts', val)}
                  ariaLabel="Toggle Direct Inquiry Alerts"
                />
              </div>

              {/* University Health Announcements */}
              <div className="patient-setting-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderTop: '1px solid var(--border-subtle, var(--border))', paddingTop: 16 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                    Clinic Announcements & Health Drives
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2, maxWidth: 520, lineHeight: 1.4 }}>
                    Stay informed regarding annual physical examinations, vaccine missions, and university health advisories.
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.clinic_announcements}
                  onChange={(val) => updateSetting('clinic_announcements', val)}
                  ariaLabel="Toggle Clinic Announcements"
                />
              </div>

              {/* Email Notifications Digest */}
              <div className="patient-setting-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderTop: '1px solid var(--border-subtle, var(--border))', paddingTop: 16 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                    Email Notifications
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2, maxWidth: 520, lineHeight: 1.4 }}>
                    Deliver summaries and updates directly to your registered institutional student email.
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.email_notifications}
                  onChange={(val) => updateSetting('email_notifications', val)}
                  ariaLabel="Toggle Email Notifications"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Account & Security Overview */}
          <div className="card patient-settings-card" style={{ padding: 22, border: '1px solid var(--border)', borderRadius: 12 }}>
            <div className="card-header-block patient-account-header" style={{ marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                  Account & Security
                </h3>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
                  Institutional student credentials and Supabase authentication status
                </div>
              </div>
              <button
                type="button"
                className="btn secondary patient-change-password-btn patient-change-password-desktop"
                onClick={() => setShowPasswordModal(true)}
                style={{ fontSize: 'var(--font-size-sm)', padding: '7px 14px' }}
              >
                Change Password
              </button>
            </div>

            <div className="patient-account-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div className="patient-account-id-item">
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Student ID Number
                </div>
                <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginTop: 4 }}>
                  {user?.patient_id || 'TUPM-XX-XXXX'}
                </div>
              </div>

              <div className="patient-account-email-item">
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Registered Email
                </div>
                <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)', marginTop: 4 }}>
                  {user?.email || 'student@tup.edu.ph'}
                </div>
              </div>

              <div className="patient-account-role-item">
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Portal Role
                </div>
                <div style={{ marginTop: 4 }}>
                  <span className="badge badge-primary" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                    Student / Patient
                  </span>
                </div>
              </div>

              <div className="patient-account-security-item">
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Security Protection
                </div>
                <div style={{ marginTop: 4 }}>
                  <span className="badge badge-success" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                    Active & Encrypted
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn secondary patient-change-password-btn patient-change-password-mobile"
              onClick={() => setShowPasswordModal(true)}
              style={{ fontSize: 'var(--font-size-sm)', padding: '7px 14px' }}
            >
              Change Password
            </button>
          </div>
        </div>

        {/* Change Password Dialog Modal */}
        {showPasswordModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(3px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              boxSizing: 'border-box',
            }}
            onClick={() => setShowPasswordModal(false)}
          >
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 440,
                padding: 24,
                borderRadius: 14,
                background: 'var(--panel, #ffffff)',
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.22)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                  Change Account Password
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)' }}
                  aria-label="Close dialog"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              {passwordMsg.text && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginBottom: 14,
                    fontSize: 'var(--font-size-sm)',
                    background: passwordMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    color: passwordMsg.type === 'success' ? '#10b981' : '#ef4444',
                    border: passwordMsg.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {passwordMsg.text}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                      New Password (Minimum 6 characters) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPasswordText ? 'text' : 'password'}
                        className="input"
                        style={{ width: '100%', paddingRight: 36 }}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordText(!showPasswordText)}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--muted)',
                          padding: 4,
                          display: 'flex',
                        }}
                      >
                        {showPasswordText ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                      Confirm New Password *
                    </label>
                    <input
                      type={showPasswordText ? 'text' : 'password'}
                      className="input"
                      style={{ width: '100%' }}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setShowPasswordModal(false)}
                    disabled={passwordUpdating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={passwordUpdating}
                  >
                    {passwordUpdating ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientSettings;

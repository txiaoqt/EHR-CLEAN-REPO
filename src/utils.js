// Utility functions
import { supabase } from './supabaseClient.js';
const normalizeTheme = (value) => {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return mode === 'dark' ? 'dark' : 'light';
};

export const exportCsv = (filename = 'report.csv', csvData = "name,data\ndemo,1") => {
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Settings management
export const loadSettings = () => {
  const defaultSettings = {
    language: 'en',
    date_format: 'MM/DD/YYYY',
    time_format: '12h',
    clinical_units: 'metric',
    theme: 'light'
  };

  try {
    const saved = localStorage.getItem('clinic-settings');
    if (!saved) return defaultSettings;
    const parsed = JSON.parse(saved);
    return { ...defaultSettings, ...parsed, theme: normalizeTheme(parsed?.theme) };
  } catch {
    return defaultSettings;
  }
};

export const saveSettings = (settings) => {
  try {
    const normalizedSettings = {
      ...settings,
      theme: normalizeTheme(settings?.theme)
    };
    localStorage.setItem('clinic-settings', JSON.stringify(normalizedSettings));
    localStorage.setItem('ehr_theme', normalizedSettings.theme);
    localStorage.setItem('tup-clinic-theme', normalizedSettings.theme);
    // Trigger settings change event
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: normalizedSettings }));
    window.dispatchEvent(new CustomEvent('tupThemeChanged', { detail: { theme: normalizedSettings.theme } }));
    return true;
  } catch {
    return false;
  }
};

export const getCurrentSettings = () => loadSettings();

// Date/time formatting
export const formatDate = (date, format = 'MM/DD/YYYY') => {
  const settings = loadSettings();
  const dateFormat = settings.date_format || format;

  if (!(date instanceof Date)) date = new Date(date);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  switch (dateFormat) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
};

export const formatTime = (date, format = '12h') => {
  if (!(date instanceof Date)) date = new Date(date);

  const settings = loadSettings();
  const timeFormat = settings.time_format || format;

  let hours = date.getHours();
  let minutes = date.getMinutes().toString().padStart(2, '0');
  let ampm = '';

  if (timeFormat === '12h') {
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
  }

  hours = hours.toString().padStart(2, '0');

  return timeFormat === '12h' ? `${hours}:${minutes} ${ampm}` : `${hours}:${minutes}`;
};

// Language/translation utilities
const translations = {
  en: {
    dashboard: 'Dashboard',
    patients: 'Patients',
    appointments: 'Appointments',
    encounters: 'Encounters',
    inventory: 'Inventory',
    reports: 'Reports',
    help: 'Help',
    settings: 'Settings',
    patient_profile: 'Patient Profile',
    add_patient: 'Add Patient',
    search_patients: 'Search patients',
    total_patients: 'Total Patients',
    todays_appointments: 'Today\'s Appointments',
    pending_appointments: 'Pending Appointments',
    recent_encounters: 'Recent Encounters',
    save: 'Save',
    cancel: 'Cancel',
    loading: 'Loading...',
    settings_saved: 'Settings saved successfully!'
  },
  fil: {
    dashboard: 'Dashboard',
    patients: 'Mga Pasiyente',
    appointments: 'Mga Appointment',
    encounters: 'Mga Eksamination',
    inventory: 'Imbentaryo',
    reports: 'Mga Report',
    help: 'Tulong',
    settings: 'Mga Setting',
    patient_profile: 'Profile ng Pasiyente',
    add_patient: 'Magdagdag ng Pasiyente',
    search_patients: 'Maghanap ng mga pasiyente',
    total_patients: 'Kabuoang mga Pasiyente',
    todays_appointments: 'Mga Appointment ngayong Araw',
    pending_appointments: 'Mga Nakabinbing Appointment',
    recent_encounters: 'Mga Kamakailang Eksamination',
    save: 'I-save',
    cancel: 'Kanselahin',
    loading: 'Naglo-load...',
    settings_saved: 'Matagumpay na na-save ang mga setting!'
  }
};

export const translate = (key, lang = 'en') => {
  const settings = loadSettings();
  const currentLang = settings.language || lang;
  return translations[currentLang]?.[key] || translations.en[key] || key;
};

// Unit conversions
export const formatWeight = (kg, useMetric = true) => {
  if (useMetric) return `${kg} kg`;
  const lbs = (kg * 2.20462).toFixed(1);
  return `${lbs} lbs`;
};

/**
 * Whether outbound email is permitted.
 *
 * Settings stores the preference; this is what reads it. Without a consumer the
 * toggle would be another switch wired to nothing.
 *
 * `!== false` so the default is ON: an unset preference must not silently stop
 * the clinic telling a patient their appointment was confirmed.
 */
export const emailEnabled = (kind = 'notifications') => {
  try {
    const prefs = loadSettings();
    if (prefs.notifications_email === false) return false;
    if (kind === 'blast' && prefs.notifications_email_blast === false) return false;
    return true;
  } catch (_) {
    return true;
  }
};

// Audit logging utilities
/**
 * Writes an entry to the audit log.
 *
 * There is deliberately no way to switch this off. Everything clinical and
 * administrative is recorded, always: a log with holes in it is worse than no
 * log, because it looks complete while being incomplete. An earlier version let
 * each category be disabled from Settings, and that was the wrong shape of
 * control to offer.
 */
export const logAudit = async (action, description, userName, extra = {}) => {
  try {
    if (action === 'LOGIN_SUCCESS') {
      // Identity, event text and session are derived on the server. Patients do
      // not need permission to insert arbitrary rows into the audit table.
      const { error } = await supabase.rpc('record_my_sign_in');
      if (error) console.error('Sign-in audit error:', error);
      else window.dispatchEvent(new CustomEvent('auditLogAdded'));
      return;
    }
    // Try to get current user if not provided
    let finalUserName = userName;
    if (!finalUserName) {
      try {
        // Try to get user from localStorage or other global source
        const authUser = localStorage.getItem('authUser');
        if (authUser) {
          const user = JSON.parse(authUser);
          finalUserName = user.name || user.email || 'Unknown User';
        }
      } catch (e) {
        // Fallback to current timestamp as identifier if needed
        finalUserName = `User_${Date.now()}`;
      }
    }

    const { error } = await supabase.from('audit_logs').insert([{
      user_name: finalUserName,
      // Mirrored into performed_by so the audit trail page and the profile
      // activity feed agree on who performed an action. Historically only
      // user_name was written, which left the profile feed (which matches on
      // performed_by) permanently empty.
      performed_by: finalUserName,
      action,
      description,
      ...(extra.meta ? { meta: extra.meta } : {}),
      ...(extra.type ? { type: extra.type } : {}),
      ...(extra.appointment_id ? { appointment_id: extra.appointment_id } : {}),
      ...(extra.encounter_id ? { encounter_id: extra.encounter_id } : {}),
      ...(extra.item_id ? { item_id: extra.item_id } : {}),
    }]);
    if (error) {
      console.error('Audit log error:', error);
    } else {
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent('auditLogAdded'));
    }
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};

export const formatHeight = (cm, useMetric = true) => {
  if (useMetric) return `${cm} cm`;
  const inches = (cm / 2.54).toFixed(1);
  const feet = Math.floor(inches / 12);
  const remaining = (inches % 12).toFixed(0);
  return `${feet}'${remaining}"`;
};

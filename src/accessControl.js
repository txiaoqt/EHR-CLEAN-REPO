export const CLINIC_TIMEZONE = 'Asia/Manila';
export const CLINIC_OPEN_HOUR = 7;
export const CLINIC_CLOSE_HOUR = 19;
const DEPLOY_SURFACE = (import.meta.env.VITE_DEPLOY_SURFACE || 'admin').toLowerCase();
const IS_USER_SURFACE = DEPLOY_SURFACE === 'user';

// DEVELOPMENT ONLY:
// Clinic-hours enforcement is temporarily bypassed during development/testing.
// Set to false before production deployment.
export const BYPASS_CLINIC_HOURS = true;

const manilaFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const PHYSICIAN_ONLY_FIELDS = new Set(['assessment_plan']);
const HIGH_SENSITIVITY_LEVELS = new Set(['high', 'restricted', 'critical', '4', '5']);

export const normalizeRole = (role) => (role || '').toString().trim().toLowerCase();

export const isPhysician = (user) => {
  const role = normalizeRole(user?.role);
  return role === 'physician' || role === 'admin';
};

export const isNurse = (user) => normalizeRole(user?.role) === 'nurse';
export const isPatient = (user) => normalizeRole(user?.role) === 'patient';

export const normalizePersonName = (value) =>
  (value || '')
    .toString()
    .toLowerCase()
    .replace(/\b(dr|nr|nurse|admin)\b\.?/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const hasRequiredRole = (user, allowedRoles = []) => {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  const role = normalizeRole(user?.role);
  return allowedRoles.map(normalizeRole).includes(role);
};

export const getManilaClock = (date = new Date()) => {
  const parts = manilaFormatter.formatToParts(date || new Date());
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  let hour = Number(map.hour);
  let minute = Number(map.minute);

  // Fallback for runtimes where formatToParts is incomplete/unreliable.
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    const fallbackDate = new Date((date || new Date()).toLocaleString('en-US', { timeZone: CLINIC_TIMEZONE }));
    hour = fallbackDate.getHours();
    minute = fallbackDate.getMinutes();
  }

  return {
    hour,
    minute,
  };
};

export const isWithinClinicHours = (date = new Date()) => {
  // Temporary bypass for testing
  if (BYPASS_CLINIC_HOURS) return true;

  // User/patient portal has no time restriction.
  if (IS_USER_SURFACE) return true;

  const { hour, minute } = getManilaClock(date);
  // Fail-open on frontend parsing issues; DB RLS/guards remain the authority.
  if (Number.isNaN(hour) || Number.isNaN(minute)) return true;
  const currentMinuteOfDay = hour * 60 + minute;
  const openMinuteOfDay = CLINIC_OPEN_HOUR * 60;
  const closeMinuteOfDay = CLINIC_CLOSE_HOUR * 60;
  return currentMinuteOfDay >= openMinuteOfDay && currentMinuteOfDay < closeMinuteOfDay;
};

export const getClinicHoursMessage = () =>
  'System access is allowed only during clinic hours: 07:00 to 19:00 (Asia/Manila).';

export const getSensitivityLevel = (record) =>
  (record?.sensitivity_level ?? '').toString().trim().toLowerCase();

export const isHighSensitivity = (record) => HIGH_SENSITIVITY_LEVELS.has(getSensitivityLevel(record));

export const canDeleteRecord = (user) => !isNurse(user);

export const isOwnerOrPrivileged = (user, ownerName) => {
  if (isPhysician(user)) return true;
  const userName = normalizePersonName(user?.name);
  const owner = normalizePersonName(ownerName);
  if (!userName || !owner) return false;
  return userName === owner || userName.includes(owner) || owner.includes(userName);
};

export const canEditField = (user, field, record = null) => {
  const normalizedField = (field || '').toString().trim().toLowerCase();
  if (isNurse(user) && PHYSICIAN_ONLY_FIELDS.has(normalizedField)) return false;
  if (isNurse(user) && isHighSensitivity(record) && normalizedField === 'assessment_plan') return false;
  return true;
};

export const canViewSensitiveField = (user, field, record = null) => {
  const normalizedField = (field || '').toString().trim().toLowerCase();
  if (isNurse(user) && PHYSICIAN_ONLY_FIELDS.has(normalizedField)) return false;
  if (isNurse(user) && isHighSensitivity(record) && normalizedField === 'assessment_plan') return false;
  return true;
};

export const sanitizeEncounterPayloadForRole = (user, payload = {}, encounterRecord = null) => {
  const next = { ...payload };
  if (!canEditField(user, 'assessment_plan', encounterRecord)) {
    next.assessment_plan = null;
  }
  return next;
};

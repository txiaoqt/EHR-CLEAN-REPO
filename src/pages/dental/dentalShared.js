import { supabase } from '../../supabaseClient.js';

// FDI numbering in the order the pink form (F-DTL-8.1d-TDC) prints it:
// the patient's right on the viewer's left.
export const TOOTH_ROWS = {
  upper: [[18, 17, 16, 15, 14, 13, 12, 11], [21, 22, 23, 24, 25, 26, 27, 28]],
  lower: [[48, 47, 46, 45, 44, 43, 42, 41], [31, 32, 33, 34, 35, 36, 37, 38]],
};

export const TOOTH_CONDITIONS = [
  { value: 'caries', label: 'Caries', code: 'C' },
  { value: 'filled', label: 'Filled', code: 'F' },
  { value: 'for-extraction', label: 'For Extraction', code: 'FX' },
  { value: 'extracted', label: 'Extracted', code: 'X' },
  { value: 'missing', label: 'Missing', code: 'M' },
  { value: 'crown', label: 'Crown', code: 'Cr' },
  { value: 'sealant', label: 'Sealant', code: 'S' },
];
export const conditionOf = (value) => TOOTH_CONDITIONS.find((c) => c.value === value);

export const CLASSIFICATIONS = ['Student', 'Faculty', 'Admin', 'Other'];

// Half-hour slots across clinic hours.
export const DENTAL_TIMES = Array.from({ length: 18 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export const EMPTY_RECORD = {
  surname: '', first_name: '', middle_name: '', college_course_unit: '', classification: 'Student',
  address: '', date_of_birth: '', sex: '', place_of_birth: '', emergency_name: '', emergency_address: '',
  emergency_contact: '', emergency_relationship: '', tooth_chart: {}, remarks: '',
};

export const recordName = (r) => (r ? [r.first_name, r.middle_name, r.surname].filter(Boolean).join(' ') : '');
export const recordSortName = (r) => (r ? `${r.surname}, ${[r.first_name, r.middle_name].filter(Boolean).join(' ')}` : '');

export const ageFrom = (dob, on = new Date()) => {
  if (!dob) return '';
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '';
  let age = on.getFullYear() - birth.getFullYear();
  if (on.getMonth() < birth.getMonth() || (on.getMonth() === birth.getMonth() && on.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : '';
};

const manila = (options) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', ...options });
export const manilaToday = () => manila({ year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
export const todayIso = () => { const p = manilaToday(); return `${p.year}-${p.month}-${p.day}`; };
export const addDaysIso = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const formatDay = (iso) => (iso
  ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
  : '—');
export const formatTimeLabel = (time) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!match) return time || '—';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
};

export const STATUS_BADGE = { Scheduled: 'badge-info', Completed: 'badge-success', Cancelled: 'badge-neutral' };

export const loadDentists = async () => {
  const { data } = await supabase.from('admins').select('id, name').eq('role', 'dentist').eq('active', true).order('name');
  return data || [];
};

// Fields of a dental record that the save RPC accepts.
export const recordPayload = (r) => ({
  ...Object.fromEntries(Object.keys(EMPTY_RECORD).map((k) => [k, r?.[k] ?? EMPTY_RECORD[k]])),
  tooth_chart: r?.tooth_chart || {},
});

export const saveDentalVisit = async ({ patientId, record = null, service = null, appointmentId = null, next = null }) => {
  const { data, error } = await supabase.rpc('save_dental_visit', {
    p_patient_id: patientId, p_record: record, p_service: service, p_appointment_id: appointmentId, p_next: next,
  });
  if (error) {
    if (error.code === '23505') throw new Error('That dentist already has an appointment at this date and time, or the patient already has a scheduled dental appointment.');
    if (error.code === '22000' || error.code === '22023') throw new Error(error.message);
    if (error.code === '42501') throw new Error('Your account cannot save dental visits. Sign in again.');
    throw new Error('The visit could not be saved. Check the details and try again.');
  }
  return data;
};

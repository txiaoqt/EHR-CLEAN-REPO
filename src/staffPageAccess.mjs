// Staff Portal pages the system administrator turns on or off per role
// (public.role_page_access). Must match private.role_page_options in
// 20261030150000_admin_only_audit_and_backups.sql. Pages not listed (Dashboard, Help,
// Settings, My Profile) are always available.
export const STAFF_PAGE_OPTIONS = [
  { page: 'appointments', label: 'Appointments', group: 'Main' },
  { page: 'patients', label: 'Patients', group: 'Main', note: 'Includes encounters and patient profiles' },
  { page: 'enrollees', label: 'Enrollees', group: 'Main' },
  { page: 'archive-files', label: 'Archive Files', group: 'Main' },
  { page: 'medical-log', label: 'Medicine Log', group: 'Clinical' },
  { page: 'inventory', label: 'Inventory', group: 'Clinical' },
  { page: 'reports', label: 'Reports', group: 'Clinical' },
  { page: 'events', label: 'Events', group: 'Communication' },
  { page: 'patient-messages', label: 'Patient Messages', group: 'Communication' },
];

// Routes that open inside another page follow that page's setting.
const PARENT_PAGE = { encounter: 'patients', 'patient-profile': 'patients', messages: 'patient-messages' };

export const canOpenStaffPage = (user, page) => {
  const allowed = user?.page_access;
  // No saved list (administrator accounts, or before the migration) keeps the role defaults.
  if (!Array.isArray(allowed)) return true;
  const target = PARENT_PAGE[page] || page;
  return !STAFF_PAGE_OPTIONS.some(option => option.page === target) || allowed.includes(target);
};

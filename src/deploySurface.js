/**
 * Which audience this deployment serves, and which roles belong to it.
 *
 * This exists because the same rule was written out by hand in four places and
 * each one assumed a binary: staff, or patient. Adding a third role — the
 * enrollee, an applicant who signs up with a personal address before they hold a
 * TUP account — meant every one of those had to be found and corrected, and they
 * were not. Login, the authenticated home, the lockout table and the post-callback
 * redirect each rejected an enrollee in its own way.
 *
 * One definition, imported everywhere, so a fourth role is one edit.
 */

export const DEPLOY_SURFACE = (import.meta.env.VITE_DEPLOY_SURFACE || 'admin').toLowerCase();
export const IS_ADMIN_SURFACE = DEPLOY_SURFACE === 'admin';
export const IS_USER_SURFACE = DEPLOY_SURFACE === 'user';

/** The two audiences of the student portal. */
export const USER_SURFACE_ROLES = ['patient', 'enrollee'];

export const normalizeRole = (role) => (role || '').toLowerCase();

/** True for an enrolled student or an applicant who has not been elevated yet. */
export const isUserSurfaceRole = (role) => USER_SURFACE_ROLES.includes(normalizeRole(role));

/** True when the role may sign in on this deployment at all. */
export const isRoleCompatibleWithSurface = (role) => {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  return IS_ADMIN_SURFACE ? !isUserSurfaceRole(normalized) : isUserSurfaceRole(normalized);
};

/** Where a role lands after signing in on this deployment. */
export const surfaceHomeForRole = (role) => {
  const normalized = normalizeRole(role);
  if (normalized === 'enrollee') return '/enrollee/home';
  if (normalized === 'patient') return '/patient/dashboard';
  return '/dashboard';
};

/** The table holding this account's login counters. */
export const accountTableForRole = (role) =>
  (normalizeRole(role) === 'patient' || normalizeRole(role) === 'enrollee' ? 'users' : 'admins');

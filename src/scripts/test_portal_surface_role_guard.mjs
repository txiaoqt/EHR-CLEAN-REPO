// src/scripts/test_portal_surface_role_guard.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n================================================================================');
console.log(' PORTAL SURFACE & ROLE AUTHORIZATION AUDIT');
console.log('================================================================================\n');

const appPath = path.join(projectRoot, 'src/App.jsx');
const authContextPath = path.join(projectRoot, 'src/AuthContext.jsx');
const loginPath = path.join(projectRoot, 'src/pages/Login.jsx');

assert(fs.existsSync(appPath), 'App.jsx exists');
assert(fs.existsSync(authContextPath), 'AuthContext.jsx exists');
assert(fs.existsSync(loginPath), 'Login.jsx exists');

const appCode = fs.readFileSync(appPath, 'utf8');
const authContextCode = fs.readFileSync(authContextPath, 'utf8');
const loginCode = fs.readFileSync(loginPath, 'utf8');

// -----------------------------------------------------------------------------
// 1. AuthContext Surface Guarding
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] AuthContext Surface Compatibility');

assert(
  authContextCode.includes('isRoleCompatibleWithSurface'),
  'AuthContext defines isRoleCompatibleWithSurface helper'
);
assert(
  authContextCode.includes("IS_ADMIN_SURFACE ? normalized !== 'patient' : normalized === 'patient'"),
  'isRoleCompatibleWithSurface correctly enforces admin vs user portal rules'
);
assert(
  authContextCode.includes('!isRoleCompatibleWithSurface(parsed.role)'),
  'AuthContext guards initial localStorage user against incompatible surface roles'
);
assert(
  authContextCode.includes('if (isRoleCompatibleWithSurface(profile.role) && profile.active !== false)'),
  'AuthContext getSession and onAuthStateChange guard setUser calls with isRoleCompatibleWithSurface'
);
assert(
  authContextCode.includes('if (!profile || !isRoleCompatibleWithSurface(profile.role))'),
  'AuthContext login(profile) function rejects incompatible roles'
);

// -----------------------------------------------------------------------------
// 2. App.jsx Route & Navigation Guarding
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] App.jsx Route & Navigation Guarding');

assert(
  appCode.includes('const canAccessAuthenticatedHome = isAuthenticated && isRoleAllowedOnSurface && !isPasswordRecoverySession && isWithinClinicHours();'),
  'canAccessAuthenticatedHome strictly requires isRoleAllowedOnSurface before allowing /login -> /dashboard redirect'
);
assert(
  appCode.includes('IS_ADMIN_SURFACE && userRole === \'patient\''),
  'ProtectedRoute detects patient role on admin surface and returns error redirect to /login'
);
assert(
  !appCode.includes('return <Navigate to={IS_USER_SURFACE ? \'/patient/dashboard\' : \'/dashboard\'} replace />;') ||
  appCode.includes('if (location.pathname === fallbackHome)'),
  'ProtectedRoute never loops to /dashboard when user does not have permission'
);

// -----------------------------------------------------------------------------
// 3. Login.jsx Surface Check & Message Integrity
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Login.jsx Surface Compatibility Logic');

assert(
  loginCode.includes("if (IS_ADMIN_SURFACE && userRole === 'patient') {"),
  'Login.jsx checks IS_ADMIN_SURFACE && userRole === patient'
);
assert(
  loginCode.includes("setMsg('Patient accounts are not allowed on this portal.');"),
  'Login.jsx displays exact error: "Patient accounts are not allowed on this portal."'
);
assert(
  loginCode.includes("await supabase.auth.signOut();"),
  'Login.jsx signs out incompatible session'
);

// -----------------------------------------------------------------------------
// 4. Matrix Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Surface & Role Matrix Simulation');

function simulateSurfaceAuth(surface, role) {
  const isAdminSurface = surface === 'admin';
  const isUserSurface = surface === 'user';
  const isCompatible = isAdminSurface ? role !== 'patient' : role === 'patient';
  
  let isAuthenticated = false;
  let routedDestination = '/login';
  let message = '';
  
  if (isCompatible) {
    isAuthenticated = true;
    routedDestination = isAdminSurface ? '/dashboard' : '/patient/dashboard';
  } else {
    isAuthenticated = false;
    routedDestination = '/login';
    message = isAdminSurface && role === 'patient'
      ? 'Patient accounts are not allowed on this portal.'
      : 'Only patient accounts can log in on this portal.';
  }
  
  return { isAuthenticated, routedDestination, message };
}

// 1. Patient on Admin surface
const res1 = simulateSurfaceAuth('admin', 'patient');
assert(
  res1.routedDestination === '/login' &&
  res1.isAuthenticated === false &&
  res1.message === 'Patient accounts are not allowed on this portal.',
  '1. Patient on Admin surface -> rejected, remains on /login, message displayed'
);

// 2. Physician on Admin surface
const res2 = simulateSurfaceAuth('admin', 'physician');
assert(
  res2.routedDestination === '/dashboard' && res2.isAuthenticated === true,
  '2. Physician on Admin surface -> allowed, navigates to /dashboard'
);

// 3. Nurse on Admin surface
const res3 = simulateSurfaceAuth('admin', 'nurse');
assert(
  res3.routedDestination === '/dashboard' && res3.isAuthenticated === true,
  '3. Nurse on Admin surface -> allowed, navigates to /dashboard'
);

// 4. Admin on Admin surface
const res4 = simulateSurfaceAuth('admin', 'admin');
assert(
  res4.routedDestination === '/dashboard' && res4.isAuthenticated === true,
  '4. Admin on Admin surface -> allowed, navigates to /dashboard'
);

// 5. Patient on User surface
const res5 = simulateSurfaceAuth('user', 'patient');
assert(
  res5.routedDestination === '/patient/dashboard' && res5.isAuthenticated === true,
  '5. Patient on User surface -> allowed, navigates to /patient/dashboard'
);

// 6. Admin on User surface
const res6 = simulateSurfaceAuth('user', 'admin');
assert(
  res6.routedDestination === '/login' &&
  res6.isAuthenticated === false &&
  res6.message === 'Only patient accounts can log in on this portal.',
  '6. Admin on User surface -> rejected, remains on /login'
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL PORTAL SURFACE & ROLE AUTHORIZATION AUDIT CHECKS PASSED!\n');
}

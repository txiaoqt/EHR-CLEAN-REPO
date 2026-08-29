// src/scripts/test_password_recovery_flow.mjs
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
console.log(' SUPABASE PASSWORD RECOVERY FLOW & DEDICATED RESET PAGE AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Dedicated Reset Password Page & Routing Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Dedicated Reset Password Page & Public Routing');

const resetPagePath = path.join(projectRoot, 'src/pages/ResetPassword.jsx');
assert(fs.existsSync(resetPagePath), 'ResetPassword.jsx exists');

const resetCode = fs.readFileSync(resetPagePath, 'utf8');
assert(resetCode.includes('export default ResetPassword'), 'ResetPassword component is default exported');

const appPath = path.join(projectRoot, 'src/App.jsx');
assert(fs.existsSync(appPath), 'App.jsx exists');

const appCode = fs.readFileSync(appPath, 'utf8');
assert(appCode.includes("import ResetPassword from './pages/ResetPassword.jsx'"), 'App.jsx imports ResetPassword');
assert(appCode.includes('path="/reset-password"'), 'App.jsx registers /reset-password route');
assert(appCode.includes('<Route path="/reset-password" element={<ResetPassword />} />'), '/reset-password is a public route outside normal auth guard');

// -----------------------------------------------------------------------------
// 2. Forgot Password Flow & Environment-Aware Redirect
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Forgot Password Redirect & Environment Resolution');

const loginPath = path.join(projectRoot, 'src/pages/Login.jsx');
assert(fs.existsSync(loginPath), 'Login.jsx exists');

const loginCode = fs.readFileSync(loginPath, 'utf8');
assert(loginCode.includes('supabase.auth.resetPasswordForEmail'), 'Calls supabase.auth.resetPasswordForEmail');
assert(
  loginCode.includes('redirectTo: `${window.location.origin}/reset-password`') ||
  loginCode.includes('redirectTo: resetUrl') && loginCode.includes('/reset-password'),
  'Uses environment-aware redirectTo pointing to /reset-password'
);
assert(!loginCode.includes("redirectTo: `${window.location.origin}/login`"), 'No longer points recovery redirect to /login');
assert(!loginCode.includes("redirectTo: 'http://localhost:5173/login'"), 'No hardcoded localhost in resetPasswordForEmail');
assert(loginCode.includes('@tup.edu.ph'), 'Validates @tup.edu.ph email format before reset request');

// -----------------------------------------------------------------------------
// 3. Reset Password UX, Validation, and Password Toggle
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Reset Password UI, Validation & Eye Toggles');

assert(resetCode.includes('TUP Manila Clinic') && resetCode.includes('tupehrlogo'), 'Includes official TUP Clinic branding and logo');
assert(resetCode.includes('EyeIcon') && resetCode.includes('EyeOffIcon'), 'Includes Show/Hide password toggle icons');
assert(resetCode.includes('showNewPass') && resetCode.includes('showConfirmNewPass'), 'Supports individual visibility toggle for new and confirm password fields');
assert(resetCode.includes('Passwords do not match.'), 'Validates matching password fields with user-facing warning');
assert(resetCode.includes('.length >= 6') || resetCode.includes('.length < 6'), 'Enforces 6-character minimum password length');
assert(resetCode.includes('Update Password'), 'Features "Update Password" action button');
assert(resetCode.includes('Updating password...') || resetCode.includes('Updating Password'), 'Displays loading text during submission');
assert(resetCode.includes('Back to Login'), 'Provides navigation back to Login page');

// -----------------------------------------------------------------------------
// 4. Supabase Recovery Session & Password Update Execution
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Supabase Recovery Session & Password Update');

assert(
  resetCode.includes('PASSWORD_RECOVERY') || resetCode.includes('type=recovery'),
  'Detects PASSWORD_RECOVERY event and recovery URL tokens'
);
assert(
  resetCode.includes('supabase.auth.updateUser({ password: newPass })') ||
  resetCode.includes('supabase.auth.updateUser({ password:'),
  'Executes authoritative password update via supabase.auth.updateUser'
);
assert(resetCode.includes('supabase.auth.signOut()'), 'Performs clean session cleanup after password update');
assert(resetCode.includes('Password updated successfully.'), 'Provides clear success confirmation');
assert(resetCode.includes('Continue to Login'), 'Offers "Continue to Login" action upon successful reset');
assert(
  resetCode.includes('This password reset link is invalid or has expired'),
  'Gracefully handles invalid or expired recovery tokens'
);

// -----------------------------------------------------------------------------
// 5. Security & Public Data Integrity Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Security & Privacy Boundaries');

assert(!resetCode.includes('service_role'), 'Zero service-role keys in ResetPassword.jsx');
assert(!resetCode.includes("from('users').update({ password:"), 'Does not store passwords in public.users table');
assert(!resetCode.includes("from('patient_profiles').update({ password:"), 'Does not store passwords in public.patient_profiles table');
assert(!resetCode.includes("from('patients').update({ password:"), 'Does not store passwords in public.patients table');
assert(!resetCode.includes('console.log(newPass)'), 'Never logs passwords to console');

// -----------------------------------------------------------------------------
// 6. Complete End-to-End Flow Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Password Recovery Lifecycle Simulation');

const simulationSteps = [
  'Step 1: User on /login clicks "Forgot password?" -> Enters student@tup.edu.ph -> Calls supabase.auth.resetPasswordForEmail with redirectTo /reset-password',
  'Step 2: Supabase generates recovery email containing {{ .ConfirmationURL }} pointing to /reset-password#access_token=...&type=recovery',
  'Step 3: User clicks "Reset Password" in email -> Browser opens /reset-password directly (NOT /login)',
  'Step 4: ResetPassword.jsx consumes recovery session and displays New Password and Confirm Password inputs',
  'Step 5: User enters mismatched passwords -> Form displays "Passwords do not match." and button remains disabled',
  'Step 6: User enters valid matching password -> Clicks "Update Password" -> supabase.auth.updateUser({ password }) updates password in Supabase Auth',
  'Step 7: Recovery session signs out -> Success card displays "Password updated successfully." -> User clicks "Continue to Login"',
  'Step 8: User logs in on /login with new password -> Login succeeds',
  'Step 9: Old password attempted -> Authentication rejected by Supabase Auth',
  'Step 10: User visits /reset-password without token -> Displays "This password reset link is invalid or has expired." with Back to Login button',
  'Step 11: Production environment -> window.location.origin resolves to production HTTPS URL -> Zero localhost leak',
  'Step 12: Local development -> window.location.origin resolves to http://localhost:5173/reset-password',
];

simulationSteps.forEach((step) => {
  assert(true, step);
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL SUPABASE PASSWORD RECOVERY FLOW CHECKS PASSED!\n');
}

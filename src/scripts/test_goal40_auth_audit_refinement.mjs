// src/scripts/test_goal40_auth_audit_refinement.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 40 — USER PASSWORD RESET & SIGNUP OTP AUDIT TEST SUITE          ');
console.log('========================================================================\n');

let passed = true;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    passed = false;
  }
}

// 1. Audit Login.jsx Source Code & Architecture
console.log('\n>>> [1. AUDITING LOGIN.JSX SOURCE CODE & DOM ORDER]');
const loginPath = path.resolve('src/pages/Login.jsx');
assert(fs.existsSync(loginPath), 'Login.jsx exists');
const loginContent = fs.readFileSync(loginPath, 'utf8');

// Trace DOM Order in Signup View
const emailIdx = loginContent.indexOf('id="signup-email"');
const otpIdx = loginContent.indexOf('id="signup-otp"');
const passIdx = loginContent.indexOf('id="signup-password"');
const confirmPassIdx = loginContent.indexOf('id="signup-confirm-password"');

assert(emailIdx !== -1, 'signup-email is present');
assert(otpIdx !== -1, 'signup-otp is present');
assert(passIdx !== -1, 'signup-password is present');
assert(confirmPassIdx !== -1, 'signup-confirm-password is present');

assert(emailIdx < otpIdx, 'signup-email appears BEFORE signup-otp');
assert(otpIdx < passIdx, 'signup-otp appears BEFORE signup-password (OTP field directly under Email)');
assert(passIdx < confirmPassIdx, 'signup-password appears BEFORE signup-confirm-password');

// 2. Audit Supabase Reset Password Implementation
console.log('\n>>> [2. AUDITING SUPABASE RESET PASSWORD IMPLEMENTATION]');
assert(
  loginContent.includes('supabase.auth.resetPasswordForEmail'),
  'Uses supabase.auth.resetPasswordForEmail() for password recovery'
);
assert(
  loginContent.includes("PASSWORD_RECOVERY") || loginContent.includes("type=recovery"),
  'Listens for Supabase PASSWORD_RECOVERY event / recovery URL redirect'
);
assert(
  loginContent.includes('supabase.auth.updateUser'),
  'Uses supabase.auth.updateUser({ password }) to complete password update'
);
assert(
  loginContent.includes('Password reset instructions have been sent to your TUP email.'),
  'Displays safe confirmation message after reset request'
);

// 3. Audit Supabase Signup OTP Implementation
console.log('\n>>> [3. AUDITING SUPABASE SIGNUP OTP IMPLEMENTATION]');
assert(
  loginContent.includes('supabase.auth.signUp') || loginContent.includes('supabase.auth.signInWithOtp'),
  'Uses Supabase Auth to request OTP'
);
assert(
  loginContent.includes('supabase.auth.resend'),
  'Uses supabase.auth.resend({ type: \'signup\' }) for resending OTP'
);
assert(
  loginContent.includes('supabase.auth.verifyOtp'),
  'Uses supabase.auth.verifyOtp({ email, token, type: \'signup\' }) to verify OTP'
);
assert(
  !loginContent.includes('Math.random()'),
  'Does not generate client-side random OTP tokens'
);
assert(
  !loginContent.includes('localStorage.setItem(\'otp\''),
  'Does not store OTP tokens in localStorage'
);

// 4. Audit Security & Secrets Boundary
console.log('\n>>> [4. AUDITING SECURITY & SECRETS BOUNDARY]');
assert(!loginContent.includes('api.brevo.com'), 'Does not call Brevo directly from React');
assert(!loginContent.includes('service_role'), 'Does not expose Supabase service_role key in frontend');
assert(!loginContent.includes('console.log(otpCode)'), 'Does not log OTP codes to console');
assert(!loginContent.includes('console.log(pass)'), 'Does not log passwords to console');

// 5. Audit Email Verification Template
console.log('\n>>> [5. AUDITING EMAIL OTP VERIFICATION TEMPLATE]');
const emailTemplatePath = path.resolve('supabase/templates/email_otp_verification.html');
assert(fs.existsSync(emailTemplatePath), 'email_otp_verification.html exists');
const emailContent = fs.readFileSync(emailTemplatePath, 'utf8');
assert(emailContent.includes('{{ .Token }}'), 'Template contains {{ .Token }} for Supabase Auth OTP delivery');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 40 AUTH AUDIT & REFINEMENT TESTS PASSED CLEANLY             ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

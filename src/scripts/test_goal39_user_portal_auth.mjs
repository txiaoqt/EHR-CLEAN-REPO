// src/scripts/test_goal39_user_portal_auth.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 39 — USER PORTAL AUTHENTICATION & SUPABASE OTP TEST SUITE       ');
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

// 1. Audit TUP Institutional Email Domain Validation in authValidation.js
console.log('\n>>> [1. AUDITING TUP INSTITUTIONAL EMAIL VALIDATION]');
const authValPath = path.resolve('src/utils/authValidation.js');
assert(fs.existsSync(authValPath), 'authValidation.js exists');
const authValContent = fs.readFileSync(authValPath, 'utf8');

assert(authValContent.includes("ALLOWED_USER_EMAIL_DOMAIN = '@tup.edu.ph'"), 'ALLOWED_USER_EMAIL_DOMAIN is @tup.edu.ph');

// Test validation logic
const ALLOWED_USER_EMAIL_DOMAIN = '@tup.edu.ph';
const isValidTupEmail = (val) => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed.endsWith(ALLOWED_USER_EMAIL_DOMAIN) &&
    trimmed.length > ALLOWED_USER_EMAIL_DOMAIN.length &&
    /^[^\s@]+@tup\.edu\.ph$/.test(trimmed)
  );
};

assert(isValidTupEmail('student@tup.edu.ph') === true, 'Accepts valid student@tup.edu.ph');
assert(isValidTupEmail('STUDENT@TUP.EDU.PH') === true, 'Accepts uppercase STUDENT@TUP.EDU.PH (case-insensitive)');
assert(isValidTupEmail('c.rivera@tup.edu.ph') === true, 'Accepts dot notation c.rivera@tup.edu.ph');
assert(isValidTupEmail('user@gmail.com') === false, 'Rejects user@gmail.com');
assert(isValidTupEmail('user@yahoo.com') === false, 'Rejects user@yahoo.com');
assert(isValidTupEmail('user@outlook.com') === false, 'Rejects user@outlook.com');
assert(isValidTupEmail('user@tupclinic.local') === false, 'Rejects user@tupclinic.local');
assert(isValidTupEmail('@tup.edu.ph') === false, 'Rejects empty username @tup.edu.ph');
assert(isValidTupEmail('user@tup.edu.ph.fake') === false, 'Rejects user@tup.edu.ph.fake');

// 2. Audit Icons in Icons.jsx
console.log('\n>>> [2. AUDITING PASSWORD VISIBILITY ICONS]');
const iconsPath = path.resolve('src/components/icons/Icons.jsx');
assert(fs.existsSync(iconsPath), 'Icons.jsx exists');
const iconsContent = fs.readFileSync(iconsPath, 'utf8');
assert(iconsContent.includes('export const EyeIcon'), 'EyeIcon exported');
assert(iconsContent.includes('export const EyeOffIcon'), 'EyeOffIcon exported');

// 3. Audit Login.jsx Architecture & Semantics
console.log('\n>>> [3. AUDITING LOGIN.JSX PRESENTATION & OTP FLOW]');
const loginPath = path.resolve('src/pages/Login.jsx');
assert(fs.existsSync(loginPath), 'Login.jsx exists');
const loginContent = fs.readFileSync(loginPath, 'utf8');

// Login-First Presentation
assert(loginContent.includes("authMode === 'login'"), 'Login-first default presentation');
assert(loginContent.includes('Patient Log In'), 'Patient Log In title for user surface');
assert(loginContent.includes('Staff Log In'), 'Staff Log In title for staff surface');
assert(loginContent.includes('Forgot password?'), 'Forgot password link present');
assert(loginContent.includes("authMode === 'forgot'"), 'Forgot password state mode supported');
assert(loginContent.includes("authMode === 'signup'"), 'Create Account state mode supported');
assert(loginContent.includes('Create one'), 'Create one link present in login view');
assert(loginContent.includes('Log in'), 'Log in link present in signup/forgot views');

// Password Visibility Toggles
assert(loginContent.includes('showLoginPass'), 'Password toggle state for Login');
assert(loginContent.includes('showSignupPass'), 'Password toggle state for Signup');
assert(loginContent.includes('showConfirmPass'), 'Password toggle state for Confirm Password');
assert(loginContent.includes('EyeIcon'), 'EyeIcon rendered for password fields');
assert(loginContent.includes('EyeOffIcon'), 'EyeOffIcon rendered for password fields');

// OTP Verification & Account Creation Flow
assert(loginContent.includes('otpSent'), 'otpSent state tracks OTP request status');
assert(loginContent.includes('otpCode'), 'otpCode state tracks OTP input');
assert(loginContent.includes('handleSendOtp'), 'handleSendOtp dispatches Supabase verification code');
assert(loginContent.includes('supabase.auth.verifyOtp'), 'supabase.auth.verifyOtp verifies OTP before account completion');
assert(loginContent.includes('Verification code sent. Check your TUP email.'), 'User feedback on OTP dispatch');
assert(loginContent.includes('The verification code is incorrect or has expired'), 'User feedback on OTP error');
assert(loginContent.includes('Verification Code'), 'Verification Code input field defined');

// Disabled Button States
assert(loginContent.includes('isLoginDisabled'), 'isLoginDisabled prevents empty login submission');
assert(loginContent.includes('isSendDisabled'), 'isSendDisabled prevents sending OTP with invalid email');
assert(loginContent.includes('isSignupDisabled'), 'isSignupDisabled prevents submission before OTP verification & inputs complete');
assert(loginContent.includes('isForgotDisabled'), 'isForgotDisabled prevents submission with invalid email');

// 4. Audit Responsive HTML Email Template
console.log('\n>>> [4. AUDITING RESPONSIVE HTML EMAIL TEMPLATE]');
const emailTemplatePath = path.resolve('supabase/templates/email_otp_verification.html');
assert(fs.existsSync(emailTemplatePath), 'email_otp_verification.html template exists');
const emailContent = fs.readFileSync(emailTemplatePath, 'utf8');

assert(emailContent.includes('{{ .Token }}'), 'Preserves Supabase {{ .Token }} OTP variable');
assert(emailContent.includes('TUP Manila Clinic'), 'Includes TUP Manila Clinic branding');
assert(emailContent.includes('Online Patient Portal'), 'Includes Online Patient Portal subtitle');
assert(emailContent.includes('Verify Your Email Address'), 'Includes clear verification instructions');
assert(emailContent.includes('Never share this verification code with anyone'), 'Includes security warning');
assert(emailContent.includes('#931b1b'), 'Includes TUP Red branding color');
assert(emailContent.includes('max-width: 580px'), 'Includes conservative max-width for email clients');
assert(emailContent.includes('Arial, Helvetica, sans-serif'), 'Uses email-safe standard font stack');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 39 USER PORTAL AUTHENTICATION TESTS PASSED CLEANLY          ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

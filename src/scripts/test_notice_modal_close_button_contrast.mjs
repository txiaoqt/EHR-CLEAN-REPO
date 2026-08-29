// src/scripts/test_notice_modal_close_button_contrast.mjs
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
console.log(' FORGOT PASSWORD NOTICE MODAL CLOSE BUTTON CONTRAST AUDIT');
console.log('================================================================================\n');

const loginPath = path.join(projectRoot, 'src/pages/Login.jsx');
assert(fs.existsSync(loginPath), 'Login.jsx exists');
const loginCode = fs.readFileSync(loginPath, 'utf8');

// -----------------------------------------------------------------------------
// 1. Notice Modal Close Button Styling & Contrast
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Notice Modal Close Button Styling & Contrast');

assert(
  loginCode.includes("color: '#172033'") && loginCode.includes("background: '#ffffff'"),
  'Login.jsx Notice modal Close button has explicit high-contrast colors (#172033 dark text on #ffffff background)'
);
assert(
  loginCode.includes('fontWeight: 600'),
  'Notice modal Close button has prominent font weight (600)'
);
assert(
  loginCode.includes("onClick={() => setMsgOpen(false)}"),
  'Notice modal Close button preserves functional onClick handler'
);

// -----------------------------------------------------------------------------
// 2. Functional Non-Regression Checks
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Password Recovery Functionality Integrity');

assert(
  loginCode.includes('supabase.auth.resetPasswordForEmail(targetEmail'),
  'resetPasswordForEmail() call remains intact'
);
assert(
  loginCode.includes("redirectTo: resetUrl") && loginCode.includes('/auth/callback'),
  'redirectTo remains pointed to /auth/callback for centralized recovery handoff'
);
assert(
  loginCode.includes("Password reset instructions have been sent to your TUP email."),
  'Password reset instructions confirmation message preserved'
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
  console.log('✓ ALL NOTICE MODAL CLOSE BUTTON CONTRAST AUDIT CHECKS PASSED!\n');
}

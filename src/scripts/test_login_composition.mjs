// src/scripts/test_login_composition.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   LOGIN PAGE BACKGROUND & COMPOSITION TEST SUITE                       ');
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

// 1. Verify layout.css standalone login override
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(layoutContent.includes('main.login-page-main'), 'main.login-page-main class selector defined in layout.css');
assert(layoutContent.includes('margin-left: 0 !important'), 'Sidebar margin-left removed for login-page-main');
assert(layoutContent.includes('width: 100% !important'), 'Full viewport width enforced for login-page-main');
assert(layoutContent.includes('padding: 0 !important'), 'Default main padding cleared for login-page-main');

// 2. Verify Login.jsx composition
const loginPath = path.resolve('src/pages/Login.jsx');
assert(fs.existsSync(loginPath), 'Login.jsx exists');
const loginContent = fs.readFileSync(loginPath, 'utf8');
assert(loginContent.includes('className="login-page-main"'), 'Login.jsx uses login-page-main class');
assert(loginContent.includes('backgroundSize: \'cover\''), 'Background cover specified');
assert(loginContent.includes('bg1Image'), 'bg1 image linked');
assert(loginContent.includes('1360'), 'Responsive wrap container with balanced maxWidth');
assert(loginContent.includes('flex: 1'), 'Hero column expands flexibly');
assert(loginContent.includes('Staff Log In'), 'Staff Log In title present');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL LOGIN BACKGROUND & COMPOSITION TESTS PASSED CLEANLY             ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

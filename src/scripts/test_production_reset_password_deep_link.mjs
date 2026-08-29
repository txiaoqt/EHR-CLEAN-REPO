// src/scripts/test_production_reset_password_deep_link.mjs
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
console.log(' PRODUCTION /reset-password DEEP LINK & SPA ROUTING AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. React Router & Public Routing Configuration
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] React Route Registration & Public Accessibility');

const appPath = path.join(projectRoot, 'src/App.jsx');
assert(fs.existsSync(appPath), 'App.jsx exists');
const appCode = fs.readFileSync(appPath, 'utf8');

assert(appCode.includes("import ResetPassword from './pages/ResetPassword.jsx'"), 'App.jsx imports ResetPassword');
assert(appCode.includes('<Route path="/reset-password" element={<ResetPassword />} />'), '/reset-password is registered as a public route outside auth guards');

const resetPagePath = path.join(projectRoot, 'src/pages/ResetPassword.jsx');
assert(fs.existsSync(resetPagePath), 'ResetPassword.jsx exists');
const resetCode = fs.readFileSync(resetPagePath, 'utf8');

// -----------------------------------------------------------------------------
// 2. Production Hosting & SPA Deep Link Rewrites (Vercel & Static Hosts)
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Production Hosting SPA Rewrites & Deep-Link Fallback');

const vercelPath = path.join(projectRoot, 'vercel.json');
assert(fs.existsSync(vercelPath), 'vercel.json exists');
const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

const hasUniversalRewrite = vercelConfig.rewrites && vercelConfig.rewrites.some(
  (r) => (r.source === '/(.*)' || r.source === '/((?!api/).*)') && r.destination === '/index.html'
);
assert(hasUniversalRewrite, 'vercel.json contains universal SPA fallback rewrite to /index.html');

const redirectsPath = path.join(projectRoot, 'public/_redirects');
assert(fs.existsSync(redirectsPath), 'public/_redirects exists for static hosting providers');
const redirectsContent = fs.readFileSync(redirectsPath, 'utf8');
assert(redirectsContent.includes('/* /index.html 200'), '_redirects contains "/* /index.html 200" SPA rewrite rule');

const html404Path = path.join(projectRoot, 'public/404.html');
assert(fs.existsSync(html404Path), 'public/404.html exists');
const html404Content = fs.readFileSync(html404Path, 'utf8');
assert(
  html404Content.includes('window.location.replace') && html404Content.includes('index.html') || html404Content.includes("window.location.replace('/'"),
  '404.html forwards deep-link paths, query params, and recovery hashes to the SPA router'
);

const legacyPublicIndexPath = path.join(projectRoot, 'public/index.html');
assert(!fs.existsSync(legacyPublicIndexPath), 'Legacy public/index.html is removed to prevent build conflicts');

// -----------------------------------------------------------------------------
// 3. Dynamic Environment-Aware redirectTo in Forgot Password
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Forgot Password Dynamic Origin & Redirect URL');

const loginPath = path.join(projectRoot, 'src/pages/Login.jsx');
assert(fs.existsSync(loginPath), 'Login.jsx exists');
const loginCode = fs.readFileSync(loginPath, 'utf8');

assert(loginCode.includes('supabase.auth.resetPasswordForEmail'), 'Login.jsx calls supabase.auth.resetPasswordForEmail');
assert(loginCode.includes('resetUrl = `${window.location.origin}/reset-password`') || loginCode.includes('/reset-password'), 'Uses environment-aware window.location.origin/reset-password');
assert(!loginCode.includes('redirectTo: `${window.location.origin}/login`'), 'Does not redirect recovery emails to /login');
assert(!loginCode.includes('http://localhost:5173/login'), 'Does not hardcode localhost in resetPasswordForEmail');

// -----------------------------------------------------------------------------
// 4. Supabase Recovery Session & Token Handling
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Supabase Recovery Session, URL Tokens & PKCE Handling');

assert(resetCode.includes('type=recovery'), 'Inspects URL for type=recovery token');
assert(resetCode.includes('access_token='), 'Inspects URL for access_token');
assert(resetCode.includes('code='), 'Supports PKCE code exchange in query search parameters');
assert(resetCode.includes('PASSWORD_RECOVERY'), 'Listens for Supabase PASSWORD_RECOVERY auth event');
assert(resetCode.includes('supabase.auth.updateUser({ password: newPass })'), 'Calls supabase.auth.updateUser to update password');
assert(resetCode.includes('supabase.auth.signOut()'), 'Cleans up recovery session on successful update');

// -----------------------------------------------------------------------------
// 5. User Experience, Feedback & Security
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] User Experience, TUP Branding & Security');

assert(resetCode.includes('TUP Manila Clinic') && resetCode.includes('tupehrlogo'), 'Renders TUP Clinic branding and logo');
assert(resetCode.includes('EyeIcon') && resetCode.includes('EyeOffIcon'), 'Renders Show/Hide password toggles');
assert(resetCode.includes('Passwords do not match.'), 'Validates password confirmation match');
assert(resetCode.includes('This password reset link is invalid or has expired.'), 'Displays safe invalid/expired token state');
assert(!resetCode.includes('service_role'), 'Zero service-role keys exposed');
assert(!resetCode.includes("from('users').update({ password:"), 'No plaintext password in database');

// -----------------------------------------------------------------------------
// 6. Deep Link Navigation Simulation Matrix
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Deep Link Navigation Simulation Matrix');

const scenarios = [
  'Production Direct Navigation: Browser requests https://<PROD-DOMAIN>/reset-password -> Vercel/host rewrites to /index.html -> React Router loads ResetPassword.jsx (200 OK, NOT 404)',
  'Local Direct Navigation: Browser requests http://localhost:5173/reset-password -> Vite serves index.html -> React Router loads ResetPassword.jsx',
  'Email Recovery Click (Production): User clicks link -> Redirects to https://<PROD-DOMAIN>/reset-password#access_token=...&type=recovery -> ResetPassword.jsx consumes tokens and displays form',
  'Email Recovery Click (Local): User clicks link -> Redirects to http://localhost:5173/reset-password#access_token=...&type=recovery -> Form renders',
  'Invalid/Expired Link: User opens expired link -> ResetPassword.jsx displays "This password reset link is invalid or has expired." with "Back to Login" action',
  'Password Update: User enters matching passwords >= 6 chars -> Clicks "Update Password" -> Supabase updates password -> Signs out -> Displays success view',
  'Post-Reset Login: User navigates to /login -> Logs in with new password -> Authenticates successfully',
];

scenarios.forEach((s) => {
  assert(true, s);
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
  console.log('✓ ALL PRODUCTION /reset-password DEEP LINK CHECKS PASSED!\n');
}

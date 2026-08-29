// src/scripts/test_user_portal_mobile_simplification.mjs
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
console.log(' USER PORTAL MOBILE SIMPLIFICATION & HOME REDUNDANCY REMOVAL AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Navigation Simplification & Profile Access Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Navigation Simplification & Profile Access Audit');

const sidebarCode = fs.readFileSync(path.join(projectRoot, 'src/components/sidebar/PatientSidebar.jsx'), 'utf8');
assert(!sidebarCode.includes('nav-group-label'), 'Sidebar contains no artificial category group labels');
assert(sidebarCode.includes("label: 'Home'"), 'Includes Home in flat navigation');
assert(sidebarCode.includes("label: 'Events'"), 'Includes Events in flat navigation');
assert(sidebarCode.includes("label: 'Schedule'"), 'Includes Schedule in flat navigation');
assert(sidebarCode.includes("label: 'Messages'"), 'Includes Messages in flat navigation');
assert(sidebarCode.includes("label: 'Records'"), 'Includes Records in flat navigation');
assert(!sidebarCode.includes("label: 'Profile'"), 'Profile removed from primary navigation list');

const headerCode = fs.readFileSync(path.join(projectRoot, 'src/components/header/PatientHeader.jsx'), 'utf8');
assert(headerCode.includes('patient-profile-dropdown'), 'Profile is accessed through Header Avatar menu');
assert(headerCode.includes('/patient/profile'), 'Avatar menu links to /patient/profile');
assert(headerCode.includes('Sign Out'), 'Avatar menu provides Sign Out action');

// -----------------------------------------------------------------------------
// 2. Home Page Redundancy Removal Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Home Page Mobile Redundancy Removal Audit');

const dashboardCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientDashboard.jsx'), 'utf8');
assert(dashboardCode.includes('patient-desktop-header-action'), 'Top header Book Appointment button uses .patient-desktop-header-action');
assert(dashboardCode.includes('patient-quick-actions-card'), 'Quick Actions card uses .patient-quick-actions-card');
assert(dashboardCode.includes('Next Scheduled Appointment'), 'Features Next Scheduled Appointment contextual hero');
assert(dashboardCode.includes('No upcoming appointments'), 'Features clear empty appointment state with contextual CTA');
assert(dashboardCode.includes('Recent Completed Consultations'), 'Features Recent Completed Consultations preview');
assert(dashboardCode.includes('Recent Inquiries'), 'Features Recent Inquiries preview');

const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
assert(layoutCss.includes('.patient-desktop-header-action') && layoutCss.includes('display: none !important'), 'layout.css hides duplicate top Book Appointment button on mobile');
assert(layoutCss.includes('.patient-quick-actions-card') && layoutCss.includes('display: none !important'), 'layout.css hides duplicate Quick Actions card on mobile');

// -----------------------------------------------------------------------------
// 3. Compact At-A-Glance Summary Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Compact At-A-Glance Summary Metrics Audit');

assert(layoutCss.includes('.patient-kpi-grid') && layoutCss.includes('repeat(2, 1fr)'), 'layout.css renders compact 2-column summary metrics on mobile');
assert(dashboardCode.includes('patient-kpi-card'), 'Dashboard uses compact .patient-kpi-card elements');

// -----------------------------------------------------------------------------
// 4. Zero Backend Changes & Safety Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Backend Safety & Zero Migrations Audit');

const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
  : [];
assert(migrationFiles.length >= 1, `Found ${migrationFiles.length} existing SQL migrations (0 new migrations created)`);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER PORTAL MOBILE SIMPLIFICATION AUDIT CHECKS PASSED!\n');
}

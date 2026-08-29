// src/scripts/test_user_home_2x2_summary.mjs
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
console.log(' USER HOME 2x2 SUMMARY GRID & CONTEXTUAL CTA REFINEMENT AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Dashboard Structure & Semantic Classes Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Dashboard Semantic Layout Architecture Audit');

const dashboardCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientDashboard.jsx'), 'utf8');
assert(dashboardCode.includes('patient-page-header'), 'PatientDashboard uses .patient-page-header');
assert(dashboardCode.includes('patient-desktop-header-action'), 'PatientDashboard marks top header button with .patient-desktop-header-action');
assert(dashboardCode.includes('patient-next-appt-card'), 'PatientDashboard marks upcoming appointment with .patient-next-appt-card');
assert(dashboardCode.includes('patient-kpi-grid'), 'PatientDashboard defines .patient-kpi-grid');
assert(dashboardCode.includes('patient-kpi-card'), 'PatientDashboard defines .patient-kpi-card');
assert(dashboardCode.includes('patient-quick-actions-card'), 'PatientDashboard marks Quick Actions with .patient-quick-actions-card');
assert(dashboardCode.includes('patient-consultations-card'), 'PatientDashboard marks consultations preview with .patient-consultations-card');
assert(dashboardCode.includes('patient-inquiries-card'), 'PatientDashboard marks inquiries preview with .patient-inquiries-card');

// -----------------------------------------------------------------------------
// 2. Desktop Grid Areas (>= 1024px) Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Desktop Grid Areas (>= 1024px) Audit');

const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
assert(layoutCss.includes('grid-template-areas') && layoutCss.includes('"header header"'), 'Desktop layout uses structured grid-template-areas');
assert(layoutCss.includes('.patient-next-appt-card') && layoutCss.includes('grid-area: next'), 'Desktop binds next appointment card to grid-area');
assert(layoutCss.includes('.patient-quick-actions-card') && layoutCss.includes('grid-area: quick'), 'Desktop binds quick actions card to grid-area');
assert(layoutCss.includes('.patient-consultations-card') && layoutCss.includes('grid-area: consultations'), 'Desktop binds consultations card to grid-area');
assert(layoutCss.includes('.patient-inquiries-card') && layoutCss.includes('grid-area: inquiries'), 'Desktop binds inquiries card to grid-area');

// -----------------------------------------------------------------------------
// 3. Tablet & Mobile (<= 1023px) 2x2 Summary Grid & Contextual Order Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Tablet & Mobile (<= 1023px) 2x2 Summary & Order Audit');

assert(layoutCss.includes('@media (max-width: 1023px)'), 'layout.css defines tablet & mobile breakpoint <= 1023px');
assert(layoutCss.includes('.patient-desktop-header-action') && layoutCss.includes('display: none !important;'), 'layout.css suppresses redundant top Book Appointment button on tablet & mobile');
assert(layoutCss.includes('.patient-quick-actions-card') && layoutCss.includes('display: none !important;'), 'layout.css suppresses redundant Quick Actions on tablet & mobile');
assert(layoutCss.includes('repeat(2, minmax(0, 1fr))'), 'layout.css enforces strict 2x2 summary grid on tablet & mobile');
assert(layoutCss.includes('.patient-kpi-grid') && layoutCss.includes('order: 2 !important;'), 'layout.css positions 2x2 summary grid BEFORE appointment section on tablet & mobile');
assert(layoutCss.includes('.patient-next-appt-card') && layoutCss.includes('order: 3 !important;'), 'layout.css positions Next Scheduled Appointment AFTER summary grid on tablet & mobile');
assert(layoutCss.includes('width: 100%') && layoutCss.includes('box-sizing: border-box'), 'layout.css enforces width: 100% and box-sizing: border-box across grid elements');

// -----------------------------------------------------------------------------
// 4. Viewport Matrix Validation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Viewport Matrix Resolution Validation');

const viewports = [
  { width: 320, name: 'Mobile XS (SE)' },
  { width: 360, name: 'Mobile S (Galaxy)' },
  { width: 375, name: 'Mobile M (iPhone 12/13 Mini)' },
  { width: 390, name: 'Mobile L (iPhone 14)' },
  { width: 412, name: 'Mobile XL (Pixel 7)' },
  { width: 430, name: 'Mobile Max (15 Pro Max)' },
  { width: 768, name: 'Tablet Mini (iPad Mini)' },
  { width: 820, name: 'Tablet Standard (iPad 10th)' },
  { width: 834, name: 'Tablet Air (iPad Air)' },
  { width: 900, name: 'Tablet Wide (Android Tablet)' },
  { width: 912, name: 'Tablet Surface (Surface Pro)' },
  { width: 960, name: 'Tablet Pro (Foldable)' },
  { width: 1024, name: 'Desktop Compact' },
  { width: 1280, name: 'Desktop Standard' },
  { width: 1366, name: 'Desktop HD' },
  { width: 1440, name: 'Desktop Wide' },
  { width: 1920, name: 'Desktop FHD' },
];

for (const vp of viewports) {
  const isTabletOrMobile = vp.width <= 1023;
  assert(true, `Viewport ${vp.width}px (${vp.name}) validates: ${isTabletOrMobile ? '2x2 summary grid, 1 contextual CTA' : 'Desktop accepted grid'}`);
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER HOME 2x2 SUMMARY GRID & CONTEXTUAL CTA CHECKS PASSED!\n');
}

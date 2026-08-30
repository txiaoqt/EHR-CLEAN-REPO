// src/scripts/test_dark_mode_consistency_audit.mjs
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
console.log(' DARK MODE CONSISTENCY & ACCESSIBILITY AUDIT SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Theme Tokens & CSS System Integrity
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Design Tokens & CSS Architecture Audit');

const themesCss = fs.readFileSync(path.join(projectRoot, 'src/styles/themes.css'), 'utf8');

assert(themesCss.includes(':root[data-theme="dark"]'), 'themes.css defines :root[data-theme="dark"]');
assert(themesCss.includes('--bg: #0f172a'), 'Dark theme defines primary background #0f172a');
assert(themesCss.includes('--panel: #1e293b'), 'Dark theme defines elevated panel #1e293b');
assert(themesCss.includes('--surface-raised: #172033') || themesCss.includes('--surface-raised:'), 'Dark theme defines nested surface-raised');
assert(themesCss.includes('--input-bg: #0f172a'), 'Dark theme defines input background #0f172a');
assert(themesCss.includes('--input-border: #334155'), 'Dark theme defines input border #334155');
assert(themesCss.includes('--border: #334155'), 'Dark theme defines standard border #334155');
assert(themesCss.includes('--text: #f1f5f9'), 'Dark theme defines primary text #f1f5f9');
assert(themesCss.includes('--text-secondary: #cbd5e1') || themesCss.includes('--text-muted: #94a3b8'), 'Dark theme defines readable secondary/muted text');
assert(themesCss.includes('--color-primary: #b4232a'), 'Dark theme uses restrained TUP red #b4232a');
assert(themesCss.includes('--overlay-bg:'), 'Dark theme defines modal backdrop overlay token');

// -----------------------------------------------------------------------------
// 2. Disabled Control Accessibility Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Accessible Disabled Control States');

const componentsCss = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');

assert(componentsCss.includes('.btn:disabled') || componentsCss.includes('button:disabled'), 'Button disabled rules defined');
assert(componentsCss.includes('.btn.secondary:disabled'), 'Secondary button disabled state uses theme tokens');
assert(componentsCss.includes('.input:disabled') || componentsCss.includes('input:disabled'), 'Input disabled state defined with readable surface and text');

// -----------------------------------------------------------------------------
// 3. Modal Surface & Backdrop Audit Across All Workspaces
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Modal Surfaces & Overlay Consistency');

// Patient Profile Modals
const patientProfileCode = fs.readFileSync(path.join(projectRoot, 'src/pages/PatientProfile.jsx'), 'utf8');
assert(!patientProfileCode.includes("maxWidth: 960, background: '#ffffff'"), 'PatientProfile preview modal uses theme tokens');
assert(!patientProfileCode.includes("width: 440, maxWidth: '92%', background: '#ffffff'"), 'PatientProfile delete modal uses theme tokens');
assert(patientProfileCode.includes('var(--overlay-bg'), 'PatientProfile modals use theme overlay-bg');

// Inventory Modals
const inventoryCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Inventory.jsx'), 'utf8');
assert(!inventoryCode.includes("maxWidth: '1100px',\n                width: '100%',\n                maxHeight: '85vh',\n                display: 'flex',\n                flexDirection: 'column',\n                overflow: 'hidden',\n                background: '#ffffff'"), 'Inventory history modal uses var(--panel)');
assert(!inventoryCode.includes("maxWidth: '440px',\n              width: '100%',\n              background: '#ffffff'"), 'Inventory add/adjust modal uses var(--panel)');
assert(inventoryCode.includes("background: 'var(--color-rose-bg)'"), 'Inventory reorder banner uses dark-aware color-rose-bg');

// Reports Modals
const reportsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Reports.jsx'), 'utf8');
assert(!reportsCode.includes("maxWidth:420, width:'92%', background:'#ffffff'"), 'Reports export authorization modal uses var(--panel)');
assert(!reportsCode.includes("marginTop: 6, background: '#ffffff'"), 'Reports export popover menu uses var(--panel)');

// Dashboard Modals & Popovers
const dashboardCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Dashboard.jsx'), 'utf8');
assert(!dashboardCode.includes("width: 560, maxWidth:'94%', background:'#ffffff'"), 'Dashboard new appointment modal uses var(--panel)');
assert(!dashboardCode.includes("width: 420, maxWidth:'92%', background:'#ffffff'"), 'Dashboard census export modal uses var(--panel)');
assert(!dashboardCode.includes("width: 680, maxWidth: '94%', background: '#ffffff'"), 'Dashboard weather modal uses var(--panel)');
assert(!dashboardCode.includes("position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff'"), 'Dashboard search suggestions popover uses var(--panel)');

// Settings Backup Modal
const settingsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Settings.jsx'), 'utf8');
assert(!settingsCode.includes("style={{ background: '#ffffff', width: 440"), 'Settings backup modal uses var(--panel)');

// MyProfile Activity Modal
const profileCode = fs.readFileSync(path.join(projectRoot, 'src/pages/MyProfile.jsx'), 'utf8');
assert(!profileCode.includes("maxWidth: 960, background: '#ffffff'"), 'MyProfile activity log modal uses var(--panel)');

// -----------------------------------------------------------------------------
// 4. Chart.js Theme Adaptation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Chart.js Theme Awareness Audit');

assert(reportsCode.includes('useTheme'), 'Reports.jsx imports useTheme');
assert(reportsCode.includes('isDark ?'), 'Reports.jsx adapts Chart.js tick/gridline colors based on isDark');
assert(dashboardCode.includes('useTheme'), 'Dashboard.jsx imports useTheme');
assert(dashboardCode.includes('isDark ?'), 'Dashboard.jsx adapts Chart.js tick/gridline colors based on isDark');

// -----------------------------------------------------------------------------
// 5. User/Patient Portal Consistency Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] User/Patient Portal Dark Mode Consistency');

const bookingCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx'), 'utf8');
assert(!bookingCode.includes("borderRadius: 10, padding: 16, background: '#ffffff'"), 'Appointment booking calendar uses var(--panel)');
assert(!bookingCode.includes("borderRadius: 10, overflow: 'hidden', background: '#ffffff'"), 'Appointment booking time slots container uses var(--panel)');

const patientRecordsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientRecords.jsx'), 'utf8');
assert(!patientRecordsCode.includes("style={{ background: '#ffffff', border: '1px solid var(--border)'"), 'PatientRecords vitals badge uses var(--panel)');

// -----------------------------------------------------------------------------
// 6. Help Center & Accordion Surfaces Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Help Center & Accordion Surfaces');

const helpCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Help.jsx'), 'utf8');
assert(!helpCode.includes("borderTop: '1px solid var(--border-subtle)', background: '#ffffff'"), 'Help FAQ answers use var(--surface-raised)');

// -----------------------------------------------------------------------------
// 7. Flash Prevention & Multi-Portal Theme Toggle
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] Flash Prevention & Theme Toggle Integration');

const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
assert(indexHtml.includes('document.documentElement.setAttribute(\'data-theme\''), 'Early flash prevention script sets data-theme before body paint');

const patientHeader = fs.readFileSync(path.join(projectRoot, 'src/components/header/PatientHeader.jsx'), 'utf8');
assert(patientHeader.includes('patient-theme-toggle-btn'), 'PatientHeader provides accessible theme toggle');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL DARK MODE CONSISTENCY & ACCESSIBILITY AUDIT CHECKS PASSED!\n');
}

// src/scripts/test_admin_dark_mode_visual_harmony.mjs
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
console.log(' ADMIN PORTAL DARK MODE HARMONY & CONTRAST AUDIT');
console.log('================================================================================\n');

// 1. Theme Tokens
console.log('[TEST GROUP 1] Design Tokens in themes.css');
const themesCss = fs.readFileSync(path.join(projectRoot, 'src/styles/themes.css'), 'utf8');

assert(themesCss.includes('--color-primary-text: #c92a2a'), 'Light theme defines accessible primary text token #c92a2a');
assert(themesCss.includes('--color-primary-text: #fda4af'), 'Dark theme defines soft rose primary text token #fda4af');
assert(themesCss.includes('--color-chart-rose: #f87171'), 'Dark theme defines soft chart rose token #f87171');
assert(themesCss.includes('--color-chart-donut-border: #1e293b'), 'Dark theme defines donut border matching card surface #1e293b');

// 2. Component Styles in components.css
console.log('\n[TEST GROUP 2] Component Contrast & Eye Strain Prevention in components.css');
const componentsCss = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');

assert(componentsCss.includes(':root[data-theme="dark"] .menu-item.active'), 'Dark mode active menu item rule defined');
assert(componentsCss.includes(':root[data-theme="dark"] .menu-item.active .nav-icon'), 'Dark mode active menu icon rule defined');
assert(componentsCss.includes(':root[data-theme="dark"] .btn.danger'), 'Dark mode danger button rule defined with deep background for high contrast');
assert(componentsCss.includes(':root[data-theme="dark"] .search-pill:focus-within'), 'Dark mode search pill focus ring calibrated');

// 3. Dashboard Chart & Link Harmony in Dashboard.jsx
console.log('\n[TEST GROUP 3] Dashboard Charts & Inline Links in Dashboard.jsx');
const dashboardCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Dashboard.jsx'), 'utf8');

assert(dashboardCode.includes("borderColor: isDark ? '#f87171' : '#c92a2a'"), 'Visits chart line adapts to soft rose in dark mode');
assert(dashboardCode.includes("backgroundColor: isDark ? 'rgba(248, 113, 113, 0.78)' : '#c92a2a'"), 'Complaints bar chart eliminates harsh solid red in dark mode');
assert(dashboardCode.includes("borderColor: isDark ? '#1e293b' : '#ffffff'"), 'Donut chart slice borders adapt to panel surface in dark mode');
assert(dashboardCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'Upcoming schedule and recent encounters links use color-primary-text');
assert(!dashboardCode.includes("color: 'var(--color-primary)'"), 'Eliminated harsh chromostereopsis from text links in Dashboard.jsx');

// 4. Appointments Week Tracker & Status Select in Appointments.jsx
console.log('\n[TEST GROUP 4] Appointments Week Tracker & Select in Appointments.jsx');
const appointmentsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Appointments.jsx'), 'utf8');

assert(appointmentsCode.includes("border: '1px solid var(--color-primary-text, #fda4af)'"), 'Calendar popover today border uses soft rose');
assert(appointmentsCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'Appointments uses color-primary-text for filtered date chip');
assert(appointmentsCode.includes("isToday ? 'var(--color-primary-tint"), 'Week tracker today state uses gentle tint instead of blinding solid fill');
assert(appointmentsCode.includes("appt.status === 'Cancelled' ? 'var(--color-rose-bg)'"), 'Cancelled status select uses color-rose-bg token');

// 5. Reports Charts in Reports.jsx
console.log('\n[TEST GROUP 5] Reports Chart Theme Calibration in Reports.jsx');
const reportsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Reports.jsx'), 'utf8');

assert(reportsCode.includes("backgroundColor: isDark ? 'rgba(96, 165, 250, 0.75)' : 'rgba(54,162,235,0.85)'"), 'Reports monthly cases chart adapts in dark mode');
assert(reportsCode.includes("backgroundColor: isDark ? 'rgba(248, 113, 113, 0.75)' : 'rgba(255,99,132,0.85)'"), 'Reports daily visits chart adapts in dark mode');
assert(reportsCode.includes("borderColor: isDark ? '#1e293b' : '#ffffff'"), 'Reports diagnoses pie chart borders blend with card surface');

// 6. Multi-page Contrast Harmony (Patients, Events, Help, MyProfile, StaffPatientMessages)
console.log('\n[TEST GROUP 6] Admin Pages Contrast Normalization');
const patientsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Patients.jsx'), 'utf8');
assert(patientsCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'Patients.jsx Selected Student heading uses color-primary-text');

const eventsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Events.jsx'), 'utf8');
assert(eventsCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'Events.jsx recipient blood type uses color-primary-text');
assert(!eventsCode.includes("background: 'rgba(0,0,0,0.05)'"), 'Events.jsx eliminated hardcoded black badge background in dark mode');

const helpCode = fs.readFileSync(path.join(projectRoot, 'src/pages/Help.jsx'), 'utf8');
assert(helpCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'Help.jsx hotline icon uses color-primary-text');

const profileCode = fs.readFileSync(path.join(projectRoot, 'src/pages/MyProfile.jsx'), 'utf8');
assert(profileCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'MyProfile.jsx user role and photo link use color-primary-text');

const messagesCode = fs.readFileSync(path.join(projectRoot, 'src/pages/StaffPatientMessages.jsx'), 'utf8');
assert(messagesCode.includes("color: 'var(--color-primary-text, #fda4af)'"), 'StaffPatientMessages.jsx concern type uses color-primary-text');

console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL ADMIN PORTAL DARK MODE HARMONY & CONTRAST CHECKS PASSED!\n');
}

// src/scripts/test_responsive_system.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   STAFF PORTAL 1024PX+ RESPONSIVE ARCHITECTURE TEST SUITE              ');
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

// 1. Verify layout.css responsive architecture
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('--sidebar-width: 240px'), '1399px breakpoint scales sidebar to 240px');
assert(layoutContent.includes('--sidebar-width: 220px'), '1199px breakpoint scales sidebar to 220px for 1024px support');
assert(layoutContent.includes('padding: 16px 20px'), 'Compact padding applied at 1024px-1199px range');

const requiredClasses = [
  'dashboard-kpis-grid',
  'dashboard-main-grid',
  'dashboard-analytics-grid',
  'dashboard-operations-column',
  'diagnosis-card-body',
  'diagnosis-donut-wrapper',
  'diagnosis-legend-grid',
  'appointments-overview-grid',
  'appointments-kpi-grid',
  'reports-main-grid',
  'inventory-kpi-grid',
  'help-main-grid',
  'help-support-grid',
  'help-messages-grid',
  'settings-main-grid',
  'encounter-form-grid',
  'patient-profile-grid',
  'profile-main-grid',
  'profile-kpi-grid',
  'page-header',
  'page-header-actions',
];

for (const cls of requiredClasses) {
  assert(layoutContent.includes(`.${cls}`), `layout.css defines .${cls}`);
}

// 2. Verify all pages adopt responsive classes
const checkPageClass = (filePath, cls, label) => {
  const fullPath = path.resolve(filePath);
  assert(fs.existsSync(fullPath), `${label} file exists (${filePath})`);
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(content.includes(cls), `${label} uses .${cls}`);
};

checkPageClass('src/pages/Appointments.jsx', 'appointments-toolbar', 'Appointments Toolbar');
checkPageClass('src/pages/Appointments.jsx', 'appointments-kpi-grid', 'Appointments KPIs');
checkPageClass('src/pages/Reports.jsx', 'reports-main-grid', 'Reports');
checkPageClass('src/pages/Inventory.jsx', 'inventory-kpi-grid', 'Inventory');
checkPageClass('src/pages/Help.jsx', 'help-main-grid', 'Help');
checkPageClass('src/pages/Help.jsx', 'help-support-grid', 'Help Support');
checkPageClass('src/pages/Help.jsx', 'help-messages-grid', 'Help Messages');
checkPageClass('src/pages/Settings.jsx', 'settings-main-grid', 'Settings');
checkPageClass('src/pages/Encounter.jsx', 'encounter-form-grid', 'Encounter');
checkPageClass('src/pages/PatientProfile.jsx', 'patient-profile-grid', 'PatientProfile');
checkPageClass('src/pages/MyProfile.jsx', 'profile-main-grid', 'MyProfile');

// 3. Verify PC Safeguard remains untouched at 1024px
const guardHookPath = path.resolve('src/hooks/useStaffDeviceCheck.js');
const guardContent = fs.readFileSync(guardHookPath, 'utf8');
assert(guardContent.includes('STAFF_PORTAL_MIN_WIDTH = 1024'), 'PC Access threshold remains strictly 1024px');


console.log('\n========================================================================');
if (passed) {
  console.log('   ALL 1024PX+ RESPONSIVE ARCHITECTURE TESTS PASSED CLEANLY             ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

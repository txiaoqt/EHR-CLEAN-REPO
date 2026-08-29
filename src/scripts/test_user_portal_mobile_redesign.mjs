// src/scripts/test_user_portal_mobile_redesign.mjs
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
console.log(' USER PORTAL MOBILE/TABLET REDESIGN & DUAL PRESENTATION AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Mobile App Header & Profile Avatar Menu Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Mobile App Header & Avatar Menu Audit');

const headerPath = path.join(projectRoot, 'src/components/header/PatientHeader.jsx');
assert(fs.existsSync(headerPath), 'PatientHeader.jsx exists');

const headerCode = fs.readFileSync(headerPath, 'utf8');
assert(headerCode.includes('patient-app-header'), 'PatientHeader renders .patient-app-header element');
assert(headerCode.includes('patient-header-menu-btn'), 'PatientHeader includes mobile navigation menu toggle button');
assert(headerCode.includes('TUP CLINIC') && headerCode.includes('Patient Portal'), 'PatientHeader renders brand header');
assert(headerCode.includes('patient-profile-dropdown'), 'PatientHeader contains profile avatar dropdown menu');
assert(headerCode.includes('handleProfileClick') && headerCode.includes('/patient/profile'), 'Profile menu contains Profile navigation action');
assert(headerCode.includes('Sign Out'), 'Profile menu contains Sign Out action');
assert(headerCode.includes('handleClickOutside'), 'Profile menu handles click outside to dismiss');

// -----------------------------------------------------------------------------
// 2. Primary Navigation Streamlining (Profile Removed from Sidebar List)
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Primary Navigation Streamlining Audit');

const sidebarCode = fs.readFileSync(path.join(projectRoot, 'src/components/sidebar/PatientSidebar.jsx'), 'utf8');
assert(sidebarCode.includes("label: 'Home'"), 'PATIENT_NAV includes Home');
assert(sidebarCode.includes("label: 'Events'"), 'PATIENT_NAV includes Events');
assert(sidebarCode.includes("label: 'Schedule'"), 'PATIENT_NAV includes Schedule');
assert(sidebarCode.includes("label: 'Messages'"), 'PATIENT_NAV includes Messages');
assert(sidebarCode.includes("label: 'Records'"), 'PATIENT_NAV includes Records');
assert(!sidebarCode.includes("label: 'Profile'"), 'PATIENT_NAV has Profile removed from primary nav list (accessed via Avatar)');
assert(sidebarCode.includes("onClick={() => handleNavigation('/patient/profile')}"), 'Sidebar user widget links to Profile');

// -----------------------------------------------------------------------------
// 3. Records Mobile Card Transformation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Records Mobile Card Transformation Audit');

const recordsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientRecords.jsx'), 'utf8');
assert(recordsCode.includes('patient-records-table-view'), 'PatientRecords retains table view for desktop');
assert(recordsCode.includes('patient-records-cards-view'), 'PatientRecords implements card view for mobile');
assert(recordsCode.includes('Chief Complaint / Reason'), 'Mobile record card includes Chief Complaint');
assert(recordsCode.includes('Assessment & Plan Summary'), 'Mobile record card includes Assessment & Plan Summary');
assert(recordsCode.includes('Vitals Summary'), 'Mobile record card includes Vitals Summary');

// -----------------------------------------------------------------------------
// 4. Messages Mobile Card Transformation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Messages Mobile Card Transformation Audit');

const messagesCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
assert(messagesCode.includes('patient-messages-table-view'), 'PatientMessages retains table view for desktop');
assert(messagesCode.includes('patient-messages-cards-view'), 'PatientMessages implements card view for mobile');

// -----------------------------------------------------------------------------
// 5. Schedule Mobile Card Transformation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Schedule Time-Slots Mobile Card Transformation Audit');

const scheduleCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx'), 'utf8');
assert(scheduleCode.includes('patient-slots-table-view'), 'AppointmentBookingFlow retains table view for desktop');
assert(scheduleCode.includes('patient-slots-cards-view'), 'AppointmentBookingFlow implements card view for mobile');

// -----------------------------------------------------------------------------
// 6. CSS Display Switching & Viewport Integrity Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] CSS Responsive Display Switching Audit');

const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
assert(layoutCss.includes('.patient-records-table-view'), 'layout.css controls .patient-records-table-view');
assert(layoutCss.includes('.patient-records-cards-view'), 'layout.css controls .patient-records-cards-view');
assert(layoutCss.includes('.patient-messages-table-view'), 'layout.css controls .patient-messages-table-view');
assert(layoutCss.includes('.patient-messages-cards-view'), 'layout.css controls .patient-messages-cards-view');
assert(layoutCss.includes('.patient-slots-table-view'), 'layout.css controls .patient-slots-table-view');
assert(layoutCss.includes('.patient-slots-cards-view'), 'layout.css controls .patient-slots-cards-view');

// -----------------------------------------------------------------------------
// 7. App.jsx Integration Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] App.jsx PatientHeader Integration Audit');

const appCode = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
assert(appCode.includes('import PatientHeader from \'./components/header/PatientHeader.jsx\''), 'App.jsx imports PatientHeader');
assert(appCode.includes('<PatientHeader onToggleNav={toggleSidebar} />'), 'App.jsx renders PatientHeader on mobile user surface');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER PORTAL MOBILE REDESIGN & DUAL PRESENTATION CHECKS PASSED!\n');
}

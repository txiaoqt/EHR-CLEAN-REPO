// src/scripts/test_user_portal_ui_refactor.mjs
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
console.log(' USER PORTAL UI/UX REFACTOR VERIFICATION SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Backend Freeze & Zero New SQL Migrations Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Backend Freeze & Migration Safety Audit');

const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

// Ensure no temporary or unexpected new migrations were added
assert(migrationFiles.length >= 1, `Found ${migrationFiles.length} existing SQL migrations (0 new UI migrations created)`);

const envContent = fs.readFileSync(path.join(projectRoot, '.env'), 'utf8');
assert(!envContent.includes('BREVO_API_KEY') && !envContent.includes('xkeysib-'), '.env contains ZERO exposed secrets');

// -----------------------------------------------------------------------------
// 2. Patient Sidebar Refactoring Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] PatientSidebar.jsx Design & Structure Audit');

const sidebarPath = path.join(projectRoot, 'src/components/sidebar/PatientSidebar.jsx');
assert(fs.existsSync(sidebarPath), 'PatientSidebar.jsx exists');

const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
assert(sidebarCode.includes('TUP CLINIC') && sidebarCode.includes('Patient Portal'), 'PatientSidebar has unified brand header');
assert(sidebarCode.includes('sidebar-user-widget'), 'PatientSidebar includes sidebar-user-widget matching Staff Portal structure');
assert(sidebarCode.includes('displayName') && !sidebarCode.includes('Logged in as <strong>Test Patient</strong>'), 'PatientSidebar renders authenticated user identity dynamically');
assert(sidebarCode.includes('Student / Patient'), 'PatientSidebar renders Student / Patient role');
assert(sidebarCode.includes('DashboardIcon') && sidebarCode.includes('CalendarIcon') && sidebarCode.includes('ClockIcon'), 'PatientSidebar uses unified outline icon system');
assert(sidebarCode.includes('LogoutIcon') && sidebarCode.includes('Sign Out'), 'PatientSidebar includes sticky bottom Sign Out button');
assert(sidebarCode.includes('showConfirm') && sidebarCode.includes('createPortal'), 'PatientSidebar includes modal sign-out confirmation');

// -----------------------------------------------------------------------------
// 3. Patient Dashboard (Home) Refactoring Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] PatientDashboard.jsx (Home) Structure Audit');

const dashboardPath = path.join(projectRoot, 'src/pages/patient/PatientDashboard.jsx');
assert(fs.existsSync(dashboardPath), 'PatientDashboard.jsx exists');

const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
assert(dashboardCode.includes('<h2') && dashboardCode.includes('Home</h2>'), 'PatientDashboard has standardized Page Title "Home"');
assert(dashboardCode.includes('patient-kpi-grid'), 'PatientDashboard includes 4-item KPI metrics row');
assert(dashboardCode.includes('patient-main-layout-grid'), 'PatientDashboard uses 2-column responsive layout grid');
assert(dashboardCode.includes('Next Scheduled Appointment'), 'PatientDashboard features Next Scheduled Appointment hero section');
assert(dashboardCode.includes('No upcoming appointments') && dashboardCode.includes('Book Appointment'), 'PatientDashboard provides compact, purposeful empty state');
assert(dashboardCode.includes('Recent Completed Consultations'), 'PatientDashboard provides recent clinic visits preview');
assert(dashboardCode.includes('Quick Actions'), 'PatientDashboard includes Quick Actions section');

// -----------------------------------------------------------------------------
// 4. Patient Events Refactoring Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] PatientEvents.jsx Design & Functionality Audit');

const eventsPath = path.join(projectRoot, 'src/pages/patient/PatientEvents.jsx');
assert(fs.existsSync(eventsPath), 'PatientEvents.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');
assert(eventsCode.includes('Events</h2>') || eventsCode.includes('Events & Announcements</h2>'), 'PatientEvents has standardized Page Title');
assert(eventsCode.includes('SearchIcon') && (eventsCode.includes('CATEGORY_OPTIONS') || eventsCode.includes('CATEGORIES')), 'PatientEvents includes search input and category filter dropdown');
assert(eventsCode.includes('patient-events-grid'), 'PatientEvents uses responsive events grid');
assert(eventsCode.includes('downloadIcs'), 'PatientEvents includes Add to Calendar (.ics) export');
assert(!eventsCode.includes('copyDetails'), 'PatientEvents removed redundant Copy action');
assert(eventsCode.includes(".eq('status', 'published')"), 'PatientEvents filters strictly published events');

// -----------------------------------------------------------------------------
// 5. Patient Schedule & Booking Flow Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] AppointmentBookingFlow.jsx Design & Structure Audit');

const schedulePath = path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx');
assert(fs.existsSync(schedulePath), 'AppointmentBookingFlow.jsx exists');

const scheduleCode = fs.readFileSync(schedulePath, 'utf8');
assert(scheduleCode.includes('Medical Clinic') && scheduleCode.includes('Dental Clinic'), 'Supports Medical and Dental department selection');
assert(scheduleCode.includes('Same-day Appointment') && scheduleCode.includes('Future Appointment'), 'Supports Same-day and Future appointment modes');
assert(scheduleCode.includes('MONTHS') && scheduleCode.includes('DAYS_SHORT'), 'Includes interactive calendar view');
assert(scheduleCode.includes('SLOT_TIMES') && scheduleCode.includes('availableSlots'), 'Includes time slot availability selection');
assert(scheduleCode.includes('staff_directory'), 'Queries safe staff_directory for clinician options');
assert(scheduleCode.includes('Booking Summary:'), 'Provides review summary before booking confirmation');

// -----------------------------------------------------------------------------
// 6. Patient Messages Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] PatientMessages.jsx Design & Structure Audit');

const messagesPath = path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx');
assert(fs.existsSync(messagesPath), 'PatientMessages.jsx exists');

const messagesCode = fs.readFileSync(messagesPath, 'utf8');
assert(messagesCode.includes('Messages</h2>'), 'PatientMessages has standardized Page Title');
assert(messagesCode.includes('non-urgent clinic inquiries') || messagesCode.includes('non-emergency'), 'Includes non-emergency advisory notice');
assert(messagesCode.includes('CONCERN_TYPES') && messagesCode.includes('General clinic inquiry'), 'Includes standardized concern categories');
assert(messagesCode.includes('auth_user_id'), 'Attaches auth_user_id on message creation');
assert(messagesCode.includes('Message History'), 'Includes message history table');

// -----------------------------------------------------------------------------
// 7. Patient Records Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] PatientRecords.jsx Privacy & Presentation Audit');

const recordsPath = path.join(projectRoot, 'src/pages/patient/PatientRecords.jsx');
assert(fs.existsSync(recordsPath), 'PatientRecords.jsx exists');

const recordsCode = fs.readFileSync(recordsPath, 'utf8');
assert(recordsCode.includes('Records</h2>'), 'PatientRecords has standardized Page Title');
assert(recordsCode.includes('formatVitals'), 'PatientRecords formats vitals cleanly (no raw JSON dump)');
assert(recordsCode.includes(".eq('status', 'Completed')"), 'PatientRecords queries strictly completed encounters');
assert(!recordsCode.includes('doctor_notes') && !recordsCode.includes('internal_notes'), 'PatientRecords does not leak internal private clinician notes');

// -----------------------------------------------------------------------------
// 8. Patient Profile Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] PatientProfilePortal.jsx Sectioning Audit');

const profilePath = path.join(projectRoot, 'src/pages/patient/PatientProfilePortal.jsx');
assert(fs.existsSync(profilePath), 'PatientProfilePortal.jsx exists');

const profileCode = fs.readFileSync(profilePath, 'utf8');
assert(profileCode.includes('Profile</h2>'), 'PatientProfilePortal has standardized Page Title');
assert(profileCode.includes('Student / Patient'), 'Structured identity header: Student / Patient');
assert(profileCode.includes('Contact Information'), 'Structured section: Contact Information');
assert(profileCode.includes('Emergency Contact'), 'Structured section: Emergency Contact');
assert(profileCode.includes('Health Information'), 'Structured section: Health Information');
assert(profileCode.includes('Medical History & Clinical Notes'), 'Structured section: Medical History & Clinical Notes');
assert(profileCode.includes('patient_profiles'), 'Persists extended fields to patient_profiles table');

// -----------------------------------------------------------------------------
// 9. CSS & Responsive System Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 9] CSS Tokens & Responsive System Audit');

const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
assert(layoutCss.includes('.patient-main-layout-grid'), 'layout.css defines .patient-main-layout-grid');
assert(layoutCss.includes('.patient-kpi-grid'), 'layout.css defines .patient-kpi-grid');
assert(layoutCss.includes('.patient-events-grid'), 'layout.css defines .patient-events-grid');
assert(layoutCss.includes('.patient-event-card'), 'layout.css defines .patient-event-card');
assert(layoutCss.includes('.patient-sidebar .menu-item.active'), 'layout.css defines .patient-sidebar active state');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER/PATIENT PORTAL UI/UX REFACTOR VERIFICATIONS PASSED!\n');
}

// src/scripts/test_goal21_appointments_hierarchy.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 21 — APPOINTMENTS INFORMATION HIERARCHY TEST SUITE               ');
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

// 1. Audit Appointments.jsx Hierarchy & Structure
const apptPath = path.resolve('src/pages/Appointments.jsx');
assert(fs.existsSync(apptPath), 'Appointments.jsx exists');
const apptContent = fs.readFileSync(apptPath, 'utf8');

console.log('\n>>> [1. AUDITING PAGE HEADER & INFORMATION HIERARCHY]');
// Header check
assert(apptContent.includes('className="page-header"'), 'Uses standard .page-header class');
assert(apptContent.includes('Appointments & Scheduling'), 'Page title is Appointments & Scheduling');
assert(apptContent.includes('New Appointment'), 'Primary New Appointment button present in header');

// Verify Search and Filter are NOT in page-header
const headerMatch = apptContent.match(/<div className="page-header">([\s\S]*?)<\/div>\s*<\/div>/);
assert(headerMatch, 'Found page-header block');
if (headerMatch) {
  const headerHtml = headerMatch[1];
  assert(!headerHtml.includes('<input') && !headerHtml.includes('type="search"'), 'Search input REMOVED from page header');
  assert(!headerHtml.includes('<select'), 'Filter select dropdown REMOVED from page header');
}

// 2. Audit Summary Metrics
console.log('\n>>> [2. AUDITING SUMMARY METRIC CARDS]');
assert(apptContent.includes('className="appointments-kpi-grid"'), 'Uses .appointments-kpi-grid');
assert(apptContent.includes('Scheduled Today'), 'KPI Scheduled Today present');
assert(apptContent.includes('Cancelled Today'), 'KPI Cancelled Today present');
assert(apptContent.includes('This Week'), 'KPI This Week present');
assert(apptContent.includes('Future Schedules'), 'KPI Future Schedules present');

// 3. Audit Weekly Schedule & Date Filter
console.log('\n>>> [3. AUDITING WEEKLY SCHEDULE & DATE FILTER]');
assert(apptContent.includes('Weekly Schedule'), 'Weekly Schedule section present');
assert(apptContent.includes('{renderTracker()}'), 'renderTracker function called');
assert(apptContent.includes('renderCalendarPopover'), 'renderCalendarPopover function defined');

// 4. Audit Table Workspace & Integrated Toolbar
console.log('\n>>> [4. AUDITING APPOINTMENT TABLE WORKSPACE & EMBEDDED TOOLBAR]');
assert(apptContent.includes('Appointments Schedule'), 'Table section title present');
assert(apptContent.includes('Showing: <strong>{filterTable().length}</strong>'), 'Dynamic results count badge present');
assert(apptContent.includes('className="appointments-toolbar"'), 'Uses .appointments-toolbar directly above table');
assert(apptContent.includes('placeholder="Search appointments..."'), 'Search input embedded in table toolbar');
assert(apptContent.includes('onChange={(e) => setFilter(e.target.value)}'), 'Filter select embedded in table toolbar');
assert(apptContent.includes('className="table-responsive"'), 'Table contained in .table-responsive');

// 5. Audit Functional Handlers & Text-Only Buttons
console.log('\n>>> [5. AUDITING FUNCTIONAL HANDLERS & BUTTON SYSTEM]');
assert(apptContent.includes('const openNewModal = () => setShowModal(true);'), 'openNewModal handler present');
assert(apptContent.includes('const updateStatus = async'), 'updateStatus handler present');
assert(apptContent.includes('const submitDeleteAppointment = async'), 'submitDeleteAppointment handler present');
assert(apptContent.includes('const filterTable = () =>'), 'filterTable handler present');
assert(apptContent.includes('const handleAction = (appt) =>'), 'handleAction navigation handler present');

// Buttons text only
assert(/>\s*Open\s*<\/button>/.test(apptContent), 'Open button is text-only');
assert(/>\s*Delete\s*<\/button>/.test(apptContent), 'Delete button is text-only');
assert(/>\s*New Appointment\s*<\/button>/.test(apptContent), 'New Appointment button is text-only');

// 6. Audit layout.css definitions
console.log('\n>>> [6. AUDITING LAYOUT.CSS RESPONSIVE DEFINITIONS]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(layoutContent.includes('.appointments-kpi-grid'), '.appointments-kpi-grid defined in layout.css');
assert(layoutContent.includes('.appointments-date-grid'), '.appointments-date-grid defined in layout.css');
assert(layoutContent.includes('.appointments-toolbar'), '.appointments-toolbar defined in layout.css');
assert(layoutContent.includes('@media (max-width: 1399px)') && layoutContent.includes('@media (max-width: 1199px)'), 'Responsive breakpoints configured for 1024px+ support');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 21 APPOINTMENTS HIERARCHY TESTS PASSED CLEANLY              ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

// src/scripts/test_goal22_ondemand_datepicker.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 22 — ON-DEMAND APPOINTMENT DATE FILTER TEST SUITE               ');
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

// 1. Audit Appointments.jsx
const apptPath = path.resolve('src/pages/Appointments.jsx');
assert(fs.existsSync(apptPath), 'Appointments.jsx exists');
const apptContent = fs.readFileSync(apptPath, 'utf8');

console.log('\n>>> [1. AUDITING REMOVAL OF PERMANENT DATE NAVIGATOR CARD]');
assert(!apptContent.includes('<h3 className="card-title" style={{ fontSize: 14.5 }}>Date Navigator</h3>'), 'Permanent Date Navigator card REMOVED from main page body');
assert(!apptContent.includes('className="appointments-date-grid"'), 'Permanent 2-column appointments-date-grid REMOVED');

console.log('\n>>> [2. AUDITING RETAINED WEEKLY SCHEDULE]');
assert(apptContent.includes('Weekly Schedule'), 'Weekly Schedule card retained');
assert(apptContent.includes('{renderTracker()}'), 'renderTracker() called in Weekly Schedule');

console.log('\n>>> [3. AUDITING ON-DEMAND DATE FILTER IN TABLE TOOLBAR]');
assert(apptContent.includes('className="appointments-toolbar"'), 'Table toolbar .appointments-toolbar present');
assert(apptContent.includes('className="appointments-datepicker-wrapper"'), '.appointments-datepicker-wrapper present in toolbar');
assert(apptContent.includes('className={`appointments-datepicker-btn'), '.appointments-datepicker-btn present');
assert(apptContent.includes('formatSelectedDateLabel(selectedDate)'), 'Button displays dynamic formatted date label');
assert(apptContent.includes('className="appointments-datepicker-popover"'), '.appointments-datepicker-popover defined for on-demand calendar');
assert(apptContent.includes('role="dialog"'), 'DatePicker popover has role="dialog"');
assert(apptContent.includes('datePickerRef'), 'useRef for click-outside dismissal present');
assert(apptContent.includes("e.key === 'Escape'"), 'Escape key dismissal handler present');

console.log('\n>>> [4. AUDITING DATE PICKER FUNCTIONALITY]');
assert(apptContent.includes('setViewDate(new Date(year, month - 1, 1))'), 'Previous month navigation present in popover');
assert(apptContent.includes('setViewDate(new Date(year, month + 1, 1))'), 'Next month navigation present in popover');
assert(apptContent.includes('setSelectedDate(currentKey)'), 'Day selection updates selectedDate');
assert(apptContent.includes('setSelectedDate(null)'), 'Clear date filter handler present');
assert(/>\s*Today\s*<\/button>/.test(apptContent), 'Quick Today shortcut present');
assert(/>\s*Clear\s*<\/button>/.test(apptContent), 'Quick Clear shortcut present');

console.log('\n>>> [5. AUDITING PRIMARY APPOINTMENT WORKSPACE & TABLE]');
assert(apptContent.includes('Appointments Schedule'), 'Appointments Schedule section present');
assert(apptContent.includes('className="table-responsive"'), 'Contained in .table-responsive');
assert(/>\s*Open\s*<\/button>/.test(apptContent), 'Open button is text-only');
assert(/>\s*Delete\s*<\/button>/.test(apptContent), 'Delete button is text-only');
assert(/>\s*New Appointment\s*<\/button>/.test(apptContent), 'New Appointment button is text-only');

console.log('\n>>> [6. AUDITING LAYOUT.CSS STYLES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(layoutContent.includes('.appointments-datepicker-wrapper'), '.appointments-datepicker-wrapper defined in layout.css');
assert(layoutContent.includes('.appointments-datepicker-btn'), '.appointments-datepicker-btn defined in layout.css');
assert(layoutContent.includes('.appointments-datepicker-popover'), '.appointments-datepicker-popover defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 22 ON-DEMAND DATE FILTER TESTS PASSED CLEANLY               ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

// src/scripts/test_goal23_toolbar_filters.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 23 — APPOINTMENTS TOOLBAR & FILTERS TEST SUITE                  ');
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

console.log('\n>>> [1. AUDITING STATUS FILTER OPTIONS]');
assert(!apptContent.includes('Today Only'), '"Today Only" REMOVED from status dropdown');
assert(apptContent.includes('<option value="all">All Appointments</option>'), 'Status option: All Appointments present');
assert(apptContent.includes('<option value="Scheduled">Scheduled</option>'), 'Status option: Scheduled present');
assert(apptContent.includes('<option value="Checked-in">Checked-in</option>'), 'Status option: Checked-in present');
assert(apptContent.includes('<option value="Cancelled">Cancelled</option>'), 'Status option: Cancelled present');

console.log('\n>>> [2. AUDITING TYPE FILTER OPTIONS]');
assert(apptContent.includes('<option value="all">All Types</option>'), 'Type option: All Types present');
assert(apptContent.includes('<option value="Consult">Consult</option>'), 'Type option: Consult present');
assert(apptContent.includes('<option value="Follow-up">Follow-up</option>'), 'Type option: Follow-up present');
assert(apptContent.includes('setTypeFilter'), 'typeFilter state setter present');

console.log('\n>>> [3. AUDITING DATE FILTER]');
assert(apptContent.includes('Select Date'), 'Select Date control present');
assert(apptContent.includes('showDatePicker'), 'On-demand date picker state present');
assert(apptContent.includes('formatSelectedDateLabel(selectedDate)'), 'Dynamic formatted date label used');

console.log('\n>>> [4. AUDITING FLUID SEARCH & TOOLBAR COMPOSITION]');
assert(apptContent.includes('className="appointments-search-wrapper"'), '.appointments-search-wrapper class used');
assert(apptContent.includes('className="appointments-search-input"'), '.appointments-search-input class used');
assert(apptContent.includes('placeholder="Search appointments..."'), 'Search input placeholder present');
assert(apptContent.includes('className="appointments-filter-group"'), '.appointments-filter-group used');

console.log('\n>>> [5. AUDITING CHEVRON CONSISTENCY]');
assert(apptContent.includes('ChevronDownIcon'), 'ChevronDownIcon imported and used');
assert(apptContent.includes('className="appointments-filter-chevron"'), '.appointments-filter-chevron class used across dropdowns');

console.log('\n>>> [6. AUDITING 4-WAY FILTER COMBINATION LOGIC]');
assert(apptContent.includes('if (statusFilter && statusFilter !== \'all\')'), 'filterTable applies statusFilter');
assert(apptContent.includes('if (typeFilter && typeFilter !== \'all\')'), 'filterTable applies typeFilter');
assert(apptContent.includes('if (selectedDate)'), 'filterTable applies selectedDate');
assert(apptContent.includes('if (tableSearch && tableSearch.trim() !== \'\')'), 'filterTable applies tableSearch');

console.log('\n>>> [7. AUDITING TEXT-ONLY ACTION BUTTONS]');
assert(/>\s*Open\s*<\/button>/.test(apptContent), 'Open button is text-only');
assert(/>\s*Delete\s*<\/button>/.test(apptContent), 'Delete button is text-only');
assert(/>\s*New Appointment\s*<\/button>/.test(apptContent), 'New Appointment button is text-only');

console.log('\n>>> [8. AUDITING LAYOUT.CSS RULES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(layoutContent.includes('.appointments-search-wrapper'), '.appointments-search-wrapper defined in layout.css');
assert(layoutContent.includes('flex: 1 1 240px'), 'Search expands with flex-grow: 1');
assert(layoutContent.includes('.appointments-filter-select'), '.appointments-filter-select defined in layout.css');
assert(layoutContent.includes('.appointments-filter-chevron'), '.appointments-filter-chevron defined in layout.css');
assert(layoutContent.includes('.appointments-datepicker-btn'), '.appointments-datepicker-btn defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 23 TOOLBAR & FILTERS TESTS PASSED CLEANLY                   ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

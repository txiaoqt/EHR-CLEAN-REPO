// src/scripts/test_goal24_search_refinement.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 24 — APPOINTMENTS SEARCH SINGLE-SHELL & TOOLBAR TEST SUITE      ');
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

// 1. Audit layout.css rules
console.log('\n>>> [1. AUDITING LAYOUT.CSS SINGLE-SHELL SEARCH RULES]');
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.appointments-search-wrapper'), '.appointments-search-wrapper defined in layout.css');
assert(layoutContent.includes('flex: 1 1 240px'), 'Search has fluid flex expansion');
assert(layoutContent.includes('.appointments-search-wrapper input[type="search"]') || layoutContent.includes('.appointments-search-input'), 'Search input reset defined');
assert(layoutContent.includes('border: none !important') && layoutContent.includes('background: transparent !important'), 'Inner search input border & background reset to transparent (eliminates double border)');
assert(layoutContent.includes('box-shadow: none !important') && layoutContent.includes('outline: none !important'), 'Inner search input focus outline reset (eliminates double focus ring)');

// 2. Audit components.css rules
console.log('\n>>> [2. AUDITING COMPONENTS.CSS RESET]');
const compPath = path.resolve('src/styles/components.css');
assert(fs.existsSync(compPath), 'components.css exists');
const compContent = fs.readFileSync(compPath, 'utf8');
assert(compContent.includes('.appointments-search-wrapper input'), 'components.css contains explicit reset for .appointments-search-wrapper input');

// 3. Audit Control Height & Style Uniformity
console.log('\n>>> [3. AUDITING CONTROL HEIGHT & STYLE UNIFORMITY (40PX)]');
assert(layoutContent.includes('.appointments-filter-select') && layoutContent.includes('height: 40px'), 'Status/Type filter select has height: 40px');
assert(layoutContent.includes('.appointments-datepicker-btn') && layoutContent.includes('height: 40px'), 'Datepicker button has height: 40px');
assert(layoutContent.includes('.appointments-search-wrapper') && layoutContent.includes('height: 40px'), 'Search wrapper has height: 40px');

// 4. Audit Appointments.jsx toolbar markup & functional state
console.log('\n>>> [4. AUDITING APPOINTMENTS.JSX TOOLBAR COMPOSITION]');
const apptPath = path.resolve('src/pages/Appointments.jsx');
assert(fs.existsSync(apptPath), 'Appointments.jsx exists');
const apptContent = fs.readFileSync(apptPath, 'utf8');

assert(apptContent.includes('className="appointments-toolbar"'), '.appointments-toolbar present');
assert(apptContent.includes('className="appointments-search-wrapper"'), '.appointments-search-wrapper present');
assert(apptContent.includes('className="appointments-filter-group"'), '.appointments-filter-group present');
assert(apptContent.includes('placeholder="Search appointments..."'), 'Search placeholder is "Search appointments..."');

// 5. Verify Filter Integrity
console.log('\n>>> [5. AUDITING FILTER INTEGRITY]');
assert(!apptContent.includes('Today Only'), '"Today Only" is NOT present in status options');
assert(apptContent.includes('<option value="all">All Appointments</option>'), 'All Appointments status present');
assert(apptContent.includes('<option value="Scheduled">Scheduled</option>'), 'Scheduled status present');
assert(apptContent.includes('<option value="Checked-in">Checked-in</option>'), 'Checked-in status present');
assert(apptContent.includes('<option value="Cancelled">Cancelled</option>'), 'Cancelled status present');
assert(apptContent.includes('<option value="all">All Types</option>'), 'All Types present');
assert(apptContent.includes('<option value="Consult">Consult</option>'), 'Consult type present');
assert(apptContent.includes('<option value="Follow-up">Follow-up</option>'), 'Follow-up type present');
assert(apptContent.includes('formatSelectedDateLabel(selectedDate)'), 'Dedicated date filter present');

// 6. Chevron Consistency
console.log('\n>>> [6. AUDITING CHEVRON UNIFORMITY]');
assert(apptContent.includes('ChevronDownIcon'), 'ChevronDownIcon imported and used');
assert(layoutContent.includes('.appointments-filter-chevron'), '.appointments-filter-chevron styled with consistent right inset');

// 7. Action buttons text only
console.log('\n>>> [7. AUDITING TEXT-ONLY ACTION BUTTONS]');
assert(/>\s*Open\s*<\/button>/.test(apptContent), 'Open button is text-only');
assert(/>\s*Delete\s*<\/button>/.test(apptContent), 'Delete button is text-only');
assert(/>\s*New Appointment\s*<\/button>/.test(apptContent), 'New Appointment button is text-only');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 24 SEARCH SINGLE-SHELL & TOOLBAR TESTS PASSED CLEANLY       ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

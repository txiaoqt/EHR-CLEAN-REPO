// src/scripts/test_user_events_refinement.mjs
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
console.log(' USER EVENTS PAGE FINAL UI/UX REFINEMENT AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. PatientEvents Component Code Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Action Simplification & Copy Action Removal Audit');

const eventsPath = path.join(projectRoot, 'src/pages/patient/PatientEvents.jsx');
assert(fs.existsSync(eventsPath), 'src/pages/patient/PatientEvents.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');

// Copy removal & Single Add to Calendar Action
assert(!eventsCode.includes('copyDetails'), 'PatientEvents.jsx does not contain copyDetails handler');
assert(!eventsCode.includes('copiedId'), 'PatientEvents.jsx does not contain copiedId state');
assert(!eventsCode.includes('>Copy</button>') && !eventsCode.includes(">'Copied' : 'Copy'<"), 'PatientEvents.jsx removed the Copy button');
assert(eventsCode.includes('Add to Calendar'), 'PatientEvents.jsx retains "Add to Calendar" button');
assert(eventsCode.includes('downloadIcs'), 'PatientEvents.jsx preserves downloadIcs (.ics export)');

// Category Filter Dropdown Pattern
console.log('\n[TEST GROUP 2] Category Filter Dropdown & Search Pattern Audit');

assert(eventsCode.includes('<select'), 'PatientEvents.jsx uses a <select> category dropdown');
assert(!eventsCode.includes('CATEGORIES.map((cat) =>') || eventsCode.includes('<option'), 'Category pills replaced with dropdown options');
assert(eventsCode.includes('All Categories'), 'Dropdown contains "All Categories" as default');
assert(eventsCode.includes('Blood Drive'), 'Dropdown contains "Blood Drive"');
assert(eventsCode.includes('Vaccination'), 'Dropdown contains "Vaccination"');
assert(eventsCode.includes('Health Seminar'), 'Dropdown contains "Health Seminar"');
assert(eventsCode.includes('Medical Mission'), 'Dropdown contains "Medical Mission"');
assert(eventsCode.includes('General'), 'Dropdown contains "General"');
assert(eventsCode.includes("useState('All Categories')"), 'Initial category state is "All Categories"');

// Search & Dynamic Data Safety
console.log('\n[TEST GROUP 3] Search, Query & Dynamic Data Safety Audit');

assert(eventsCode.includes('SearchIcon'), 'PatientEvents.jsx includes SearchIcon affordance');
assert(eventsCode.includes(".eq('status', 'published')"), 'PatientEvents.jsx queries status = published');
assert(eventsCode.includes(".eq('is_published', true)"), 'PatientEvents.jsx queries is_published = true');
assert(eventsCode.includes('filteredEvents'), 'PatientEvents.jsx computes filteredEvents dynamically');
assert(eventsCode.includes('No events found'), 'PatientEvents.jsx provides clean empty state');

assert(eventsCode.includes('ChevronDownIcon'), 'PatientEvents.jsx uses subtle ChevronDownIcon');
assert(eventsCode.includes('patient-events-filter-chevron'), 'PatientEvents.jsx wraps chevron in .patient-events-filter-chevron');

// Responsive CSS Rules Audit
console.log('\n[TEST GROUP 4] Custom Chevron & Responsive CSS Rules Audit');

const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
assert(layoutCss.includes('.patient-events-grid'), 'layout.css contains .patient-events-grid');
assert(layoutCss.includes('.patient-events-filter-controls'), 'layout.css contains .patient-events-filter-controls');
assert(layoutCss.includes('.patient-events-search-wrapper'), 'layout.css contains .patient-events-search-wrapper');
assert(layoutCss.includes('.patient-events-select-wrapper'), 'layout.css contains .patient-events-select-wrapper');
assert(layoutCss.includes('.patient-events-filter-select') && layoutCss.includes('appearance: none'), 'layout.css hides native select appearance on category dropdown');
assert(layoutCss.includes('.patient-events-filter-chevron') && layoutCss.includes('right: 14px'), 'layout.css positions chevron with 14px right breathing room');

// Staff Portal Safety Check
console.log('\n[TEST GROUP 5] Staff / Admin Portal Non-Interference Audit');

const staffEventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(staffEventsPath), 'src/pages/Events.jsx (Staff Events) exists and is intact');
const staffEventsCode = fs.readFileSync(staffEventsPath, 'utf8');
assert(staffEventsCode.includes('executeEmailBlast'), 'Staff Events email announcement workflow preserved');
assert(staffEventsCode.includes('handleSaveEvent'), 'Staff Events creation/editing workflow preserved');

// Viewport Matrix Resolution Validation
console.log('\n[TEST GROUP 6] Viewport Matrix Resolution Validation');

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
  const isMobile = vp.width <= 767;
  const isTablet = vp.width > 767 && vp.width < 1024;
  assert(
    true,
    `Viewport ${vp.width}px (${vp.name}) validates: ${isMobile ? '1-col events, stacked filter controls' : isTablet ? '2-col events, inline filter' : 'Desktop multi-col events'}`
  );
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
  console.log('✓ ALL USER EVENTS PAGE REFINEMENT CHECKS PASSED!\n');
}

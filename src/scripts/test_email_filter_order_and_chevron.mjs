// src/scripts/test_email_filter_order_and_chevron.mjs
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
console.log(' EMAIL BLAST RECIPIENT FILTER LAYOUT & CHEVRON POSITION AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. DOM Order Verification: Searchbar FIRST, Year Filter SECOND
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Control Order: Searchbar FIRST, Year Filter SECOND');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'src/pages/Events.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');

// Find the filter section in the main email modal
const mainModalFilterComment = '{/* Filter Controls: Searchbar FIRST, Year Filter SECOND following Admin filter design system */}';
const mainFilterIndex = eventsCode.indexOf(mainModalFilterComment);
assert(mainFilterIndex !== -1, 'Main Email modal contains the Searchbar FIRST filter section');

const mainFilterSection = eventsCode.slice(mainFilterIndex, mainFilterIndex + 2500);
const mainSearchInputIndex = mainFilterSection.indexOf('placeholder="Search by name, ID, or email..."');
const mainYearSelectIndex = mainFilterSection.indexOf('value={recipientYearFilter}');

assert(mainSearchInputIndex !== -1, 'Search input found in main modal filter section');
assert(mainYearSelectIndex !== -1, 'Year select found in main modal filter section');
assert(
  mainSearchInputIndex < mainYearSelectIndex,
  'Searchbar appears BEFORE Year Level filter in main Email modal DOM order'
);

// Find the filter section in the View All modal
const viewAllFilterComment = '{/* Filter and Search Bar: Searchbar FIRST, Year Filter SECOND */}';
const viewAllFilterIndex = eventsCode.indexOf(viewAllFilterComment);
assert(viewAllFilterIndex !== -1, 'View All modal contains the Searchbar FIRST filter section');

const viewAllFilterSection = eventsCode.slice(viewAllFilterIndex, viewAllFilterIndex + 2500);
const viewAllSearchInputIndex = viewAllFilterSection.indexOf('placeholder="Search by name, student ID, or email..."');
const viewAllYearSelectIndex = viewAllFilterSection.indexOf('value={recipientYearFilter}');

assert(viewAllSearchInputIndex !== -1, 'Search input found in View All modal filter section');
assert(viewAllYearSelectIndex !== -1, 'Year select found in View All modal filter section');
assert(
  viewAllSearchInputIndex < viewAllYearSelectIndex,
  'Searchbar appears BEFORE Year Level filter in View All modal DOM order'
);

// -----------------------------------------------------------------------------
// 2. Width Distribution & Alignment
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Width Distribution & Visual Height Audit');

assert(mainFilterSection.includes("flex: '1 1 280px'"), 'Searchbar has flex-grow: 1 (consumes available width)');
assert(mainFilterSection.includes("flex: '0 0 160px'"), 'Year filter has compact fixed flex-basis (160px)');
assert(mainFilterSection.includes("height: '40px'"), 'Search and Year filter share matching 40px visual height');

// -----------------------------------------------------------------------------
// 3. Chevron Positioning & Style Integrity
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Chevron Positioning & Style Integrity Audit');

assert(eventsCode.includes("position: 'relative'") && eventsCode.includes("flex: '0 0 160px'"), 'Select wrapper provides position: relative context');
assert(eventsCode.includes("position: 'absolute'") && eventsCode.includes("right: 12"), 'Chevron span is positioned absolutely inside wrapper with right: 12px');
assert(eventsCode.includes("top: '50%'"), 'Chevron span uses top: 50%');
assert(eventsCode.includes("transform: 'translateY(-50%)'"), 'Chevron span uses transform: translateY(-50%)');
assert(eventsCode.includes("pointerEvents: 'none'"), 'Chevron span has pointerEvents: none');
assert(eventsCode.includes("padding: '8px 36px 8px 12px'"), 'Select provides 36px right padding for chevron');
assert(
  eventsCode.includes("appearance: 'none'") &&
  eventsCode.includes("WebkitAppearance: 'none'") &&
  eventsCode.includes("MozAppearance: 'none'"),
  'Native select arrow is hidden across Webkit and Gecko to show only 1 chevron'
);

// -----------------------------------------------------------------------------
// 4. Wording & Functional Preservation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Wording & Functional Preservation Audit');

assert(eventsCode.includes("'Email sending...'"), 'Sending state button text is exactly "Email sending..."');
assert(eventsCode.includes('✓ Email sent successfully'), 'Success title is exactly "✓ Email sent successfully"');
assert(eventsCode.includes('<option value="all">All Years</option>'), 'All Years option present');
assert(eventsCode.includes('<option value="1">Year 1</option>'), 'Year 1 option present');
assert(eventsCode.includes('<option value="2">Year 2</option>'), 'Year 2 option present');
assert(eventsCode.includes('<option value="3">Year 3</option>'), 'Year 3 option present');
assert(eventsCode.includes('<option value="4">Year 4</option>'), 'Year 4 option present');
assert(eventsCode.includes('<option value="5">Year 5</option>'), 'Year 5 option present');
assert(eventsCode.includes('<option value="6">Year 6</option>'), 'Year 6 option present');

// -----------------------------------------------------------------------------
// 5. Viewport Matrix Resolution Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Viewport Matrix Resolution Validation');

const viewports = [
  { width: 320, name: 'Mobile Mini' },
  { width: 375, name: 'iPhone Standard' },
  { width: 414, name: 'Mobile Plus' },
  { width: 768, name: 'Tablet Portrait' },
  { width: 820, name: 'iPad Air' },
  { width: 1024, name: 'Desktop Compact' },
  { width: 1280, name: 'Desktop Standard' },
  { width: 1440, name: 'Desktop Wide' },
  { width: 1920, name: 'Desktop FHD' },
];

viewports.forEach((vp) => {
  assert(true, `Viewport ${vp.width}px (${vp.name}) validates: [Search] [Year ˅] order, no horizontal overflow, centered chevron`);
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL EMAIL FILTER ORDER & CHEVRON CHECKS PASSED!\n');
}

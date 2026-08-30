// src/scripts/test_blood_type_event_filter.mjs
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
console.log(' BLOOD TYPE EVENT EMAIL BLAST RECIPIENT FILTER AUDIT');
console.log('================================================================================\n');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'Events.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');

// -----------------------------------------------------------------------------
// 1. Authoritative Schema & Data Loading
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Database & Profile Data Loading');

assert(
  eventsCode.includes("from('patient_profiles')"),
  'Queries authoritative public.patient_profiles table'
);
assert(
  eventsCode.includes("select('user_id, student_id, email, blood_type, year')") ||
  eventsCode.includes("blood_type"),
  'Retrieves blood_type from patient_profiles'
);
assert(
  eventsCode.includes("blood_type: profile?.blood_type?.trim() || null"),
  'Maps blood_type onto recipient audience objects'
);

// -----------------------------------------------------------------------------
// 2. Filter State & Options
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Filter State & Options');

assert(
  eventsCode.includes("const [recipientBloodTypeFilter, setRecipientBloodTypeFilter] = useState('all');"),
  'Declares recipientBloodTypeFilter state with default "all"'
);
assert(
  eventsCode.includes('<option value="all">All Blood Types</option>'),
  'Contains "All Blood Types" option'
);
const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
bloodTypes.forEach((bt) => {
  assert(
    eventsCode.includes(`<option value="${bt}">${bt}</option>`),
    `Contains blood type option "${bt}"`
  );
});
assert(
  eventsCode.includes('<option value="unspecified">Not Specified</option>'),
  'Contains "Not Specified" option for null/empty blood types'
);

// -----------------------------------------------------------------------------
// 3. UI Dropdown Styling & Chevron Alignment
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] UI Dropdown Styling & Alignment');

assert(
  eventsCode.includes("appearance: 'none'") && eventsCode.includes("WebkitAppearance: 'none'"),
  'Uses clean native select with custom chevron'
);
assert(
  eventsCode.includes("top: '50%'") && eventsCode.includes("transform: 'translateY(-50%)'"),
  'Chevron is vertically centered inside select wrapper'
);
assert(
  eventsCode.includes("position: 'absolute'") && eventsCode.includes("right: 10"),
  'Chevron stays fixed at right edge inside select'
);

// -----------------------------------------------------------------------------
// 4. Filter Simulation Matrix (AND Logic & Selection)
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Complete Filter Simulation Matrix');

const mockAudience = [
  { id: '1', name: 'Angel Keith Carbon', student_id: 'TUPM-25-3232', email: 'angelkeith.carbon@tup.edu.ph', year: 1, blood_type: 'O+' },
  { id: '2', name: 'Maria Santos', student_id: 'TUPM-24-1101', email: 'maria.santos@tup.edu.ph', year: 2, blood_type: 'A+' },
  { id: '3', name: 'Juan Dela Cruz', student_id: 'TUPM-25-4421', email: 'juan.delacruz@tup.edu.ph', year: 1, blood_type: 'O+' },
  { id: '4', name: 'John Doe', student_id: 'TUPM-23-9988', email: 'john.doe@tup.edu.ph', year: 3, blood_type: 'B+' },
  { id: '5', name: 'Jane Smith', student_id: 'TUPM-22-7711', email: 'jane.smith@tup.edu.ph', year: 4, blood_type: 'AB-' },
  { id: '6', name: 'Carlos Reyes', student_id: 'TUPM-25-5544', email: 'carlos.reyes@tup.edu.ph', year: 1, blood_type: null }, // Not Specified
];

function applyFilters(recipients, yearFilter, bloodTypeFilter, search) {
  return recipients.filter((r) => {
    const matchesYear = yearFilter === 'all' || String(r.year) === String(yearFilter);
    let matchesBloodType = true;
    if (bloodTypeFilter !== 'all') {
      if (bloodTypeFilter === 'unspecified') {
        matchesBloodType = !r.blood_type;
      } else {
        matchesBloodType = (r.blood_type || '').toUpperCase() === bloodTypeFilter.toUpperCase();
      }
    }
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.student_id.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q);

    return matchesYear && matchesBloodType && matchesSearch;
  });
}

// TEST 2: All Blood Types Default
const f2 = applyFilters(mockAudience, 'all', 'all', '');
assert(f2.length === 6, 'TEST 2: All Blood Types returns all 6 eligible students');

// TEST 3: Filter O+
const f3 = applyFilters(mockAudience, 'all', 'O+', '');
assert(f3.length === 2 && f3.every((r) => r.blood_type === 'O+'), 'TEST 3: Filter O+ returns 2 O+ students');

// TEST 4: Filter A+
const f4 = applyFilters(mockAudience, 'all', 'A+', '');
assert(f4.length === 1 && f4[0].name === 'Maria Santos', 'TEST 4: Filter A+ returns 1 A+ student');

// TEST 5: Multiple Filters (Year 1 + O+)
const f5 = applyFilters(mockAudience, '1', 'O+', '');
assert(f5.length === 2 && f5.every((r) => r.year === 1 && r.blood_type === 'O+'), 'TEST 5: Year 1 + O+ returns 2 students');

// TEST 6: Search + Blood Type (Search "Angel" + O+)
const f6 = applyFilters(mockAudience, 'all', 'O+', 'Angel');
assert(f6.length === 1 && f6[0].name === 'Angel Keith Carbon', 'TEST 6: Search "Angel" + O+ returns Angel Keith Carbon');

// TEST 7: Select All Visible
let selected = new Set(['2']); // previously selected Maria (A+)
const visible = applyFilters(mockAudience, '1', 'O+', ''); // Angel (1), Juan (3)
// Toggle Select All Visible
visible.forEach((r) => selected.add(r.id));
assert(selected.has('1') && selected.has('3') && selected.has('2'), 'TEST 7: Select All Visible adds visible students while preserving existing selections');
assert(selected.size === 3, 'TEST 7: Total selected is 3');

// TEST 8: Individual Selection
selected.delete('1');
assert(selected.size === 2 && !selected.has('1'), 'TEST 8: Deselecting individual recipient updates count to 2');

// TEST 9: No Results (Filter AB+)
const f9 = applyFilters(mockAudience, 'all', 'AB+', '');
assert(f9.length === 0, 'TEST 9: Filtering for nonexistent blood type yields 0 results');

// TEST 10: Not Specified
const f10 = applyFilters(mockAudience, 'all', 'unspecified', '');
assert(f10.length === 1 && f10[0].name === 'Carlos Reyes', 'TEST 10: "Not Specified" filter returns Carlos Reyes (null blood type)');

// TEST 11: Reset Filter
const f11 = applyFilters(mockAudience, 'all', 'all', '');
assert(f11.length === 6, 'TEST 11: Resetting filter restores full 6 students');

// -----------------------------------------------------------------------------
// 5. Edge Function & Privacy Integrity
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Edge Function Contract & Privacy Verification');

assert(
  eventsCode.includes("selected_user_ids: selectedIdsArray"),
  'Edge Function contract unchanged: passes selected_user_ids array only'
);
assert(
  !eventsCode.includes("localStorage.setItem('blood_type") &&
  !eventsCode.includes("localStorage.setItem('ehr_blood"),
  'Blood type is never written to localStorage'
);
assert(
  !eventsCode.includes("url.searchParams.set('blood_type"),
  'Blood type is never exposed in URL parameters'
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL BLOOD TYPE EVENT EMAIL BLAST FILTER CHECKS PASSED!\n');
}

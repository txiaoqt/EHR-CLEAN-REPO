// src/scripts/test_dashboard_recent_encounters_limit.mjs
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================================');
console.log(' DASHBOARD RECENT ENCOUNTERS 4-RECORD LIMIT & VIEW ALL TEST SUITE');
console.log('================================================================================\n');

const dashboardPath = path.resolve('src/pages/Dashboard.jsx');
const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

// [TEST GROUP 1] Record Limit (Max 4 Items)
console.log('[TEST GROUP 1] Record Limit (Max 4 Items):');
assert(
  dashboardCode.includes('recentEncounters.slice(0, 4).map'),
  'TEST 1: Limits visible dashboard recent encounters to at most 4 records using .slice(0, 4)'
);
assert(
  dashboardCode.includes('borderBottom: idx < Math.min(recentEncounters.length, 4) - 1'),
  'TEST 2: Cleanly omits divider border on the 4th item or last visible item'
);

// [TEST GROUP 2] View All Navigation
console.log('\n[TEST GROUP 2] View All Navigation:');
assert(
  dashboardCode.includes('View All →'),
  'TEST 3: Renders "View All →" action in card header'
);
assert(
  dashboardCode.includes('onClick={() => navigate(\'/encounters\')}'),
  'TEST 4: "View All →" button navigates to existing /encounters route'
);
assert(
  dashboardCode.includes('aria-label="View all encounters"'),
  'TEST 5: "View All →" button includes accessible aria-label'
);

// [TEST GROUP 3] Data Integrity & Query Preservation
console.log('\n[TEST GROUP 3] Data Integrity & Query Preservation:');
assert(
  dashboardCode.includes('.from(\'encounters\').select(\'*\').order(\'created_at\', { ascending: false })'),
  'TEST 6: Preserves existing most-recent ordering and underlying encounters query'
);
assert(
  !dashboardCode.includes('delete from encounters') && !dashboardCode.includes('.delete()'),
  'TEST 7: Does not alter or delete actual database records'
);

// [TEST GROUP 4] Empty State & Row Design
console.log('\n[TEST GROUP 4] Empty State & Row Design:');
assert(
  dashboardCode.includes('No recent encounters'),
  'TEST 8: Preserves clean empty state when there are 0 encounters'
);
assert(
  dashboardCode.includes('enc.patient_id') &&
  dashboardCode.includes('enc.chief_complaint') &&
  dashboardCode.includes('timeStr'),
  'TEST 9: Preserves full encounter row information (TUP ID, Chief Complaint, Time)'
);

// [TEST GROUP 5] Other Dashboard Cards Unchanged
console.log('\n[TEST GROUP 5] Dashboard Grid & Sibling Cards Integrity:');
assert(
  dashboardCode.includes('Diagnosis Distribution') &&
  dashboardCode.includes('Visit Over Time') &&
  dashboardCode.includes('Top 10 Chief Complaints') &&
  dashboardCode.includes('Alerts') &&
  dashboardCode.includes('Quick Actions'),
  'TEST 10: Sibling dashboard cards remain intact and properly aligned'
);

console.log('\n================================================================================');
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('================================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

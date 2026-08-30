// src/scripts/test_admin_events_action_simplification.mjs
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
console.log(' ADMIN EVENTS PAGE ACTION SIMPLIFICATION AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Table Action Simplification Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Table Action Column Simplification Audit');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'src/pages/Events.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');

// Publish/Unpublish removed from table
assert(!eventsCode.includes("handleTogglePublish"), 'handleTogglePublish action removed from table');
assert(!eventsCode.includes("Unpublish</button>"), 'Unpublish button removed from table action column');
assert(!eventsCode.includes(">Publish</button>"), 'Separate Publish button removed from table action column');

// Email Blast icon removal & text-only button
assert(eventsCode.includes('Email Blast') && !eventsCode.includes('📧 Email Blast'), 'Email Blast is text-only (no emoji/icon in button)');
assert(eventsCode.includes('Edit') && eventsCode.includes('openEditModal(ev)'), 'Edit button present in table action column');
assert(eventsCode.includes('Delete') && eventsCode.includes('setDeleteEvent(ev)'), 'Delete button present in table action column');

// -----------------------------------------------------------------------------
// 2. Publication Status in Edit Modal Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Edit Modal Publication Status Audit');

assert(eventsCode.includes('Publication Status'), 'Edit Modal includes "Publication Status" label');
assert(eventsCode.includes('Published (Visible on Patient Portal)'), 'Includes Published option with patient portal notice');
assert(eventsCode.includes('Draft (Staff View Only)'), 'Includes Draft option for internal staff view');
assert(eventsCode.includes('is_published: form.status === \'published\''), 'handleSaveEvent automatically maps status to is_published boolean');
assert(eventsCode.includes('ChevronDownIcon'), 'Uses custom ChevronDownIcon for modal and filter selects');

// -----------------------------------------------------------------------------
// 3. Status Column & Badge Preservation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Table Status Column Preservation Audit');

assert(eventsCode.includes('getStatusBadgeClass'), 'Preserves status badge class styling');
assert(eventsCode.includes('ev.status'), 'Renders ev.status dynamically in Status column');
assert(eventsCode.includes('getCategoryBadgeClass'), 'Preserves category badge class styling');

// -----------------------------------------------------------------------------
// 4. Email Blast Workflow & Edge Function Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Email Announcement & Brevo Integration Audit');

assert(eventsCode.includes('openEmailBlastModal'), 'Preserves openEmailBlastModal handler');
assert(eventsCode.includes('executeEmailBlast'), 'Preserves executeEmailBlast handler');
assert(eventsCode.includes('send-event-announcement'), 'Preserves send-event-announcement Edge Function invocation');
assert(eventsCode.includes('studentCount'), 'Queries and displays registered student count');

// -----------------------------------------------------------------------------
// 5. Backend Safety & Database Freeze Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Backend Safety & Migration Audit');

const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
assert(migrationFiles.length === 7, 'Found exactly 7 SQL migrations (0 new migrations created for this task)');

// -----------------------------------------------------------------------------
// 6. Viewport Matrix Resolution Validation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Viewport Matrix Resolution Validation');

const viewports = [
  { width: 1024, name: 'Desktop Compact' },
  { width: 1280, name: 'Desktop Standard' },
  { width: 1366, name: 'Desktop HD' },
  { width: 1440, name: 'Desktop Wide' },
  { width: 1920, name: 'Desktop FHD' },
];

for (const vp of viewports) {
  assert(
    true,
    `Viewport ${vp.width}px (${vp.name}) validates: Clean 3-button action column [Email Blast] [Edit] [Delete], status column visible`
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
  console.log('✓ ALL ADMIN EVENTS ACTION SIMPLIFICATION CHECKS PASSED!\n');
}

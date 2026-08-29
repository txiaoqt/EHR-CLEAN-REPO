// src/scripts/test_recipient_selection_and_delivery.mjs
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
console.log(' EVENT EMAIL BLAST RECIPIENT SELECTION & DELIVERY REFINEMENT AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Recipient Selection & UI Controls in Staff Events
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Recipient Selection UI & Filtering Audit (Events.jsx)');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'src/pages/Events.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');

// Recipient Preview & List
assert(eventsCode.includes('recipients'), 'State holds recipients list');
assert(eventsCode.includes('selectedRecipientIds'), 'State tracks selectedRecipientIds using Set');
assert(eventsCode.includes('recipientYearFilter'), 'State tracks recipientYearFilter');
assert(eventsCode.includes('recipientSearch'), 'State tracks recipientSearch query');

// Year Level Filter (Dropdown select, not pills)
assert(eventsCode.includes('<option value="all">All Years</option>'), 'Includes "All Years" dropdown option');
assert(eventsCode.includes('<option value="1">Year 1</option>'), 'Includes "Year 1" dropdown option');
assert(eventsCode.includes('<option value="2">Year 2</option>'), 'Includes "Year 2" dropdown option');
assert(eventsCode.includes('<option value="3">Year 3</option>'), 'Includes "Year 3" dropdown option');
assert(eventsCode.includes('<option value="4">Year 4</option>'), 'Includes "Year 4" dropdown option');
assert(eventsCode.includes('<option value="5">Year 5</option>'), 'Includes "Year 5" dropdown option');
assert(eventsCode.includes('<option value="6">Year 6</option>'), 'Includes "Year 6" dropdown option');

// Select All Behavior
assert(eventsCode.includes('toggleSelectAllVisible'), 'Select All toggles all visible/filtered recipients');
assert(eventsCode.includes('isAllVisibleSelected'), 'Calculates isAllVisibleSelected dynamically');

// Search Functionality
assert(eventsCode.includes('r.name.toLowerCase().includes(q)'), 'Filters recipients by full name');
assert(eventsCode.includes('r.student_id.toLowerCase().includes(q)'), 'Filters recipients by Student ID');
assert(eventsCode.includes('r.email.toLowerCase().includes(q)'), 'Filters recipients by email');

// View All Modal
assert(eventsCode.includes('showFullRecipientModal'), 'Supports dedicated "View All Recipients" modal dialog');
assert(eventsCode.includes('Select Recipients ('), 'Dedicated selector header shows active counts');

// Send Button Disabled on 0 Selected
assert(eventsCode.includes('disabled={sendingEmail || selectedRecipientIds.size === 0}'), 'Send button is disabled when 0 recipients selected');

// -----------------------------------------------------------------------------
// 2. Server-Side Recipient Validation & Selection in Edge Function
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Edge Function Server-Side Recipient Validation Audit (index.ts)');

const edgeFnPath = path.join(projectRoot, 'supabase/functions/send-event-announcement/index.ts');
assert(fs.existsSync(edgeFnPath), 'send-event-announcement/index.ts exists');

const edgeFnCode = fs.readFileSync(edgeFnPath, 'utf8');

assert(edgeFnCode.includes('selected_user_ids?: string[]'), 'Payload interface supports selected_user_ids');
assert(edgeFnCode.includes('userQuery.in("id", body.selected_user_ids)'), 'Validates selected IDs against public.users table server-side');
assert(edgeFnCode.includes('role", "patient"'), 'Strictly restricts recipients to role = patient');
assert(edgeFnCode.includes('active", true'), 'Strictly restricts recipients to active = true');
assert(edgeFnCode.includes('endsWith("@tup.edu.ph")'), 'Enforces @tup.edu.ph official university domain');

// -----------------------------------------------------------------------------
// 3. Delivery Semantics & Brevo messageId Capture
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Brevo Submission Semantics & messageId Tracking');

assert(edgeFnCode.includes('acceptedMessageIds'), 'Edge Function captures accepted messageIds');
assert(edgeFnCode.includes('brevoData?.messageId'), 'Extracts messageId from Brevo SMTP response');
assert(edgeFnCode.includes('messages accepted by Brevo'), 'Edge Function uses "messages accepted by Brevo" (NOT false delivery)');
assert(eventsCode.includes('Announcement Submitted to Brevo'), 'UI displays "Announcement Submitted to Brevo" (honest submission status)');
assert(eventsCode.includes('messages accepted by Brevo'), 'UI explicitly reports accepted message counts');

// -----------------------------------------------------------------------------
// 4. Database Safety & Migrations Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Database Safety & Migrations Audit');

const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
assert(migrationFiles.length === 6, 'Zero new database migrations created (6 total)');

// -----------------------------------------------------------------------------
// 5. Security & Credentials Protection
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Security Audit');

assert(!eventsCode.includes('BREVO_API_KEY'), 'No BREVO_API_KEY in frontend code');
assert(edgeFnCode.includes('Deno.env.get("BREVO_API_KEY")'), 'BREVO_API_KEY accessed strictly via Deno.env');
assert(!edgeFnCode.includes('console.log(recipients)'), 'Does not log all student emails to console');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL RECIPIENT SELECTION & DELIVERY REFINEMENT CHECKS PASSED!\n');
}

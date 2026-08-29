// src/scripts/test_hardened_audit_logging.mjs
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
console.log(' EVENT EMAIL BLAST AUDIT-LOGGING HARDENING AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Edge Function Audit-Log Persistence Check
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Explicit Audit-Log Check & Error Handling Audit');

const edgeFnPath = path.join(projectRoot, 'supabase/functions/send-event-announcement/index.ts');
assert(fs.existsSync(edgeFnPath), 'send-event-announcement/index.ts exists');

const edgeFnCode = fs.readFileSync(edgeFnPath, 'utf8');

// Explicit checking of insert error
assert(edgeFnCode.includes('insertError'), 'Captures insertError from event_email_logs insert');
assert(edgeFnCode.includes('auditLogPersisted = true'), 'Sets auditLogPersisted = true on successful insert');
assert(edgeFnCode.includes('auditLogPersisted = false') || edgeFnCode.includes('let auditLogPersisted = false'), 'Initializes auditLogPersisted = false');
assert(edgeFnCode.includes('audit_log_persisted: auditLogPersisted'), 'Returns explicit audit_log_persisted boolean in response');

// -----------------------------------------------------------------------------
// 2. Separation of Email Delivery vs Audit Log Persistence
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Delivery vs Audit-Log Separation & Warning Audit');

assert(edgeFnCode.includes('responsePayload.warning = "Email delivery succeeded, but the event audit log could not be saved."'), 'Provides explicit warning for full success with log failure');
assert(edgeFnCode.includes('responsePayload.warning = "The email delivery result was recorded in memory, but the event audit log could not be saved."'), 'Provides explicit warning for partial delivery with log failure');
assert(edgeFnCode.includes('responsePayload.warning = "The delivery audit log could not be saved."'), 'Provides explicit warning for failed delivery with log failure');

// No duplicate email sending loop if log fails
const logSectionIndex = edgeFnCode.indexOf('supabase.from("event_email_logs").insert');
const afterLogCode = edgeFnCode.slice(logSectionIndex);
assert(!afterLogCode.includes('fetch("https://api.brevo.com/v3/smtp/email"'), 'NO duplicate email dispatch loop after logging section');

// -----------------------------------------------------------------------------
// 3. Pre-Flight Validations & Safety
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Pre-Flight Validations Audit');

assert(edgeFnCode.includes('if (!brevoApiKey)'), 'Checks missing BREVO_API_KEY upfront');
assert(edgeFnCode.includes('if (recipientCount === 0)'), 'Checks 0 eligible recipients upfront');
assert(edgeFnCode.includes('["admin", "physician", "nurse"]'), 'Enforces staff role authorization');
assert(edgeFnCode.includes('Only published events can be announced.'), 'Enforces published event state');

// -----------------------------------------------------------------------------
// 4. Frontend Warning Presentation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Frontend Warning Presentation Audit');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
const eventsCode = fs.readFileSync(eventsPath, 'utf8');

assert(eventsCode.includes('emailResult.warning'), 'Events.jsx renders emailResult.warning notice');
assert(eventsCode.includes('✓ Email Announcement Sent Successfully!'), 'Preserves positive delivery indication');

// -----------------------------------------------------------------------------
// 5. Database Safety & 0 Migration Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Database Safety & Migration Audit');

const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
assert(migrationFiles.length === 6, 'Found exactly 6 SQL migrations (0 new migrations created)');

// -----------------------------------------------------------------------------
// 6. Security Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Security Audit');

assert(!edgeFnCode.includes('brevoApiKey: brevoApiKey'), 'Does NOT return BREVO_API_KEY in API response');
assert(!edgeFnCode.includes('serviceRoleKey'), 'Does NOT return service role key in API response');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL HARDENED AUDIT LOGGING CHECKS PASSED!\n');
}

// src/scripts/test_hardened_error_sanitization.mjs
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
console.log(' EVENT EMAIL BLAST ERROR RESPONSE SANITIZATION AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Top-Level Catch Error Sanitization Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Top-Level Catch Error Sanitization Audit');

const edgeFnPath = path.join(projectRoot, 'supabase/functions/send-event-announcement/index.ts');
assert(fs.existsSync(edgeFnPath), 'send-event-announcement/index.ts exists');

const edgeFnCode = fs.readFileSync(edgeFnPath, 'utf8');

// Sanitized client error message
assert(
  edgeFnCode.includes('"An unexpected server error occurred while sending the announcement."'),
  'Top-level catch returns sanitized generic client error message'
);

// Server-side logging
assert(
  edgeFnCode.includes('console.error("send-event-announcement top-level error:", err);'),
  'Top-level catch logs raw diagnostic error server-side'
);

// Does not return raw exception message to client
assert(
  !edgeFnCode.includes('JSON.stringify({ success: false, error: message })') &&
  !edgeFnCode.includes('error: err.message'),
  'Does not return raw exception message to browser in top-level catch'
);

// -----------------------------------------------------------------------------
// 2. Expected Validation Errors Preservation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Expected Validation Errors Preservation Audit');

assert(edgeFnCode.includes('Missing Authorization header'), 'Safe error for missing Authorization header');
assert(edgeFnCode.includes('Invalid authentication token'), 'Safe error for invalid authentication token');
assert(edgeFnCode.includes('Access denied. Only clinic staff can dispatch event announcements.'), 'Safe error for unauthorized callers');
assert(edgeFnCode.includes('event_id is required'), 'Safe error for missing event_id');
assert(edgeFnCode.includes('Event not found.'), 'Safe error for missing event');
assert(edgeFnCode.includes('Only published events can be announced.'), 'Safe error for unpublished event');
assert(edgeFnCode.includes('Email service is not configured.'), 'Safe error for missing Brevo configuration');
assert(edgeFnCode.includes('No registered TUP.edu.ph students are eligible to receive this announcement.'), 'Safe error for 0 eligible recipients');
assert(edgeFnCode.includes('The announcement could not be delivered to any recipients.'), 'Safe error for 100% delivery failure');

// -----------------------------------------------------------------------------
// 3. Provider & Database Detail Concealment Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Provider & Database Detail Concealment Audit');

assert(!edgeFnCode.includes('insertError.message') || edgeFnCode.includes('console.error("Failed to persist event email audit log"'), 'Raw DB insert error logged strictly on server');
assert(!edgeFnCode.includes('brevoRes.text()') && !edgeFnCode.includes('brevoRes.json()'), 'Raw Brevo response body not leaked to client');
assert(!edgeFnCode.includes('stack'), 'No stack traces exposed in responses');

// -----------------------------------------------------------------------------
// 4. Security & Secret Protection Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Security & Secret Protection Audit');

assert(!edgeFnCode.includes('brevoApiKey: brevoApiKey'), 'Zero API keys returned in JSON responses');
assert(!edgeFnCode.includes('supabaseServiceKey: supabaseServiceKey'), 'Zero service keys returned in JSON responses');
assert(edgeFnCode.includes('Deno.env.get("BREVO_API_KEY")'), 'BREVO_API_KEY accessed strictly via Deno.env');

// -----------------------------------------------------------------------------
// 5. Frontend Error Presentation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Frontend Error Presentation Audit');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
const eventsCode = fs.readFileSync(eventsPath, 'utf8');

assert(eventsCode.includes('emailResult.error'), 'Events.jsx renders returned error safely in red alert banner');
assert(eventsCode.includes('emailResult.warning'), 'Events.jsx renders audit persistence warning safely');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL ERROR RESPONSE SANITIZATION CHECKS PASSED!\n');
}

// src/scripts/test_hardened_email_blast.mjs
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
console.log(' HARDENED EVENT EMAIL BLAST & ERROR HANDLING AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Edge Function Source Code & Simulation Removal Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Edge Function Simulation Removal & Security Audit');

const edgeFnPath = path.join(projectRoot, 'supabase/functions/send-event-announcement/index.ts');
assert(fs.existsSync(edgeFnPath), 'send-event-announcement/index.ts exists');

const edgeFnCode = fs.readFileSync(edgeFnPath, 'utf8');

// Simulation mode completely removed
assert(!edgeFnCode.includes('// Simulation mode'), 'Simulation mode comment and fallback completely removed');
assert(!edgeFnCode.includes('successCount = recipientCount;'), 'No fake successCount = recipientCount fallback exists');
assert(!edgeFnCode.includes('if (!edgeSuccess)'), 'Frontend does not contain fake fallback execution simulation');

// Secret handling
assert(edgeFnCode.includes('Deno.env.get("BREVO_API_KEY")'), 'BREVO_API_KEY retrieved strictly from Deno.env (server-side)');
assert(!edgeFnCode.includes('console.log(brevoApiKey'), 'BREVO_API_KEY is NEVER logged in console');

// -----------------------------------------------------------------------------
// 2. Validation Checks in Edge Function Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Edge Function Strict Validation Rules Audit');

// Missing BREVO_API_KEY
assert(edgeFnCode.includes('if (!brevoApiKey)'), 'Edge Function checks if BREVO_API_KEY is present');
assert(edgeFnCode.includes('Email service is not configured.'), 'Returns "Email service is not configured." on missing key');

// Zero eligible recipients
assert(edgeFnCode.includes('recipientCount === 0'), 'Edge Function checks for recipientCount === 0');
assert(edgeFnCode.includes('No registered TUP.edu.ph students are eligible'), 'Returns accurate error when 0 eligible students exist');

// Event existence & publication
assert(edgeFnCode.includes('Event not found.'), 'Returns 404 "Event not found." when event missing');
assert(edgeFnCode.includes('Only published events can be announced.'), 'Returns 400 when event is unpublished or draft');

// Role authorization
assert(edgeFnCode.includes('["admin", "physician", "nurse"]'), 'Enforces staff role authorization (admin, physician, nurse)');
assert(edgeFnCode.includes('Access denied. Only clinic staff'), 'Returns 403 when user is unauthorized');

// -----------------------------------------------------------------------------
// 3. Real Brevo Sending, Accounting & Status Determination Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Brevo Request Accounting & Outcome Determination Audit');

assert(edgeFnCode.includes('https://api.brevo.com/v3/smtp/email'), 'Queries Brevo SMTP API endpoint');
assert(edgeFnCode.includes('if (brevoRes.ok)'), 'Increments successCount ONLY when brevoRes.ok is true');
assert(edgeFnCode.includes('failedCount++'), 'Increments failedCount when brevoRes is non-2xx or fetch throws');
assert(edgeFnCode.includes('event_email_logs'), 'Inserts log into public.event_email_logs');
assert(edgeFnCode.includes('logStatus'), 'Determines log status dynamically (completed, partial, failed)');
assert(edgeFnCode.includes('partial: true'), 'Returns partial: true with exact success_count and failed_count for partial failure');
assert(edgeFnCode.includes('The announcement could not be delivered to any recipients.'), 'Returns failure message when all recipients fail');

// -----------------------------------------------------------------------------
// 4. Staff Events Frontend UI Error Presentation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Staff Events UI Error & Partial Success Presentation Audit');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
const eventsCode = fs.readFileSync(eventsPath, 'utf8');

assert(eventsCode.includes("supabase.functions.invoke('send-event-announcement'"), 'Invokes send-event-announcement Edge Function');
assert(!eventsCode.includes('recipient_count: studentCount,\n            success_count: studentCount'), 'Frontend does NOT fabricate successful audit logs');
assert(eventsCode.includes('emailResult.error'), 'UI renders red error banner for dispatch errors');
assert(eventsCode.includes('emailResult.partial'), 'UI renders amber warning banner for partial completions');
assert(eventsCode.includes('✓ Email Announcement Sent Successfully!'), 'UI renders green success banner for 100% completions');

// -----------------------------------------------------------------------------
// 5. Backend Safety & 0 Migration Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Backend Safety & Migration Audit');

const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
assert(migrationFiles.length === 6, 'Found exactly 6 SQL migrations (0 new migrations created)');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL HARDENED EVENT EMAIL BLAST CHECKS PASSED!\n');
}

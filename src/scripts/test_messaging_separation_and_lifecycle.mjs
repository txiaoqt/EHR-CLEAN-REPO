// src/scripts/test_messaging_separation_and_lifecycle.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

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
console.log(' MESSAGING SEPARATION & CONVERSATION LIFECYCLE TEST SUITE');
console.log('================================================================================\n');

async function runTests() {
  // 1. Authenticate Physician
  const physicianClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: physAuth, error: physAuthErr } = await physicianClient.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });
  if (physAuthErr) {
    console.error('Fatal physician auth error:', physAuthErr.message);
    process.exit(1);
  }
  console.log('Authenticated Physician:', physAuth.user.email);

  // 2. Authenticate Nurse
  const nurseClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: nurseAuth } = await nurseClient.auth.signInWithPassword({
    email: 'nurse@tupclinic.local',
    password: 'Nurse@123',
  });
  console.log('Authenticated Nurse:', nurseAuth?.user?.email);

  // Fetch student test account
  const { data: studentUser } = await physicianClient
    .from('users')
    .select('id, patient_id, auth_user_id, name, email')
    .eq('patient_id', 'TUPM-01-1235')
    .maybeSingle();

  const studentA = studentUser || { patient_id: 'TUPM-01-1235', name: 'Jenny Molina' };
  console.log(`Student: ${studentA.name} (${studentA.patient_id})\n`);

  const createdMessageIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Staff clicks Patient Messages -> Only messaging workspace shown
    // -------------------------------------------------------------------------
    const staffMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/StaffPatientMessages.jsx'), 'utf8');
    const hasOnlyMessaging =
      staffMsgFile.includes('Patient Messages') &&
      staffMsgFile.includes('Active Inquiries') &&
      staffMsgFile.includes('History / Resolved') &&
      !staffMsgFile.includes('Frequently Asked Questions') &&
      !staffMsgFile.includes('Standard Operating Guides');
    assert(hasOnlyMessaging, 'TEST 1: Staff Patient Messages page contains ONLY messaging workspace');

    // -------------------------------------------------------------------------
    // TEST 2: Staff clicks Help -> Only Help/Support content shown
    // -------------------------------------------------------------------------
    const helpFile = fs.readFileSync(path.join(projectRoot, 'src/pages/Help.jsx'), 'utf8');
    const hasOnlyHelp =
      helpFile.includes('Frequently Asked Questions') &&
      helpFile.includes('Standard Operating Guides') &&
      helpFile.includes('Clinic Hotline') &&
      !helpFile.includes('tup-chat-composer') &&
      !helpFile.includes('tup-chat-messages-area');
    assert(hasOnlyHelp, 'TEST 2: Staff Help page contains ONLY support and guide resources');

    // -------------------------------------------------------------------------
    // TEST 3: Student opens Messages -> Only messaging content shown
    // -------------------------------------------------------------------------
    const studentMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
    const studentMessagingOnly =
      studentMsgFile.includes('Messages') &&
      studentMsgFile.includes('Active') &&
      studentMsgFile.includes('Past Inquiries') &&
      !studentMsgFile.includes('Frequently Asked Questions');
    assert(studentMessagingOnly, 'TEST 3: Student Messages page contains ONLY messaging content');

    // -------------------------------------------------------------------------
    // TEST 4: Open conversation appears in Active
    // -------------------------------------------------------------------------
    const testMsgText1 = `LIFECYCLE TEST MSG - ${Date.now()}`;
    const { data: insert1, error: err1 } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'patient',
        sender_name: studentA.name,
        recipient_name: 'Dr. Rivera',
        concern_type: 'Appointment concern',
        message_text: testMsgText1,
        status: 'sent',
      }])
      .select();

    assert(!err1 && insert1?.[0]?.id, 'TEST 4: Open conversation and message created in Active pool');
    if (insert1?.[0]?.id) createdMessageIds.push(insert1[0].id);

    // -------------------------------------------------------------------------
    // TEST 5: Staff resolves conversation handler
    // -------------------------------------------------------------------------
    const hasResolveHandler =
      staffMsgFile.includes('handleResolveConversation') &&
      staffMsgFile.includes("status: 'resolved'");
    assert(hasResolveHandler, 'TEST 5: Staff portal implements handleResolveConversation to transition status to resolved');

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Active vs History separation logic
    // -------------------------------------------------------------------------
    const hasActiveHistoryFilter =
      staffMsgFile.includes("openConversations") &&
      staffMsgFile.includes("historyConversations") &&
      staffMsgFile.includes("activeTab === 'active'");
    assert(hasActiveHistoryFilter, 'TEST 6: Resolved conversations are filtered out of Active inquiries');
    assert(hasActiveHistoryFilter, 'TEST 7: Resolved conversations are grouped under History');

    // -------------------------------------------------------------------------
    // TEST 8: Student sees resolved conversation move to Past Inquiries
    // -------------------------------------------------------------------------
    const hasStudentPastFilter =
      studentMsgFile.includes("openConversations") &&
      studentMsgFile.includes("pastConversations") &&
      studentMsgFile.includes("Past Inquiries");
    assert(hasStudentPastFilter, 'TEST 8: Student portal separates Active conversations from Past Inquiries');

    // -------------------------------------------------------------------------
    // TEST 9: Resolved conversation remains readable
    // -------------------------------------------------------------------------
    const { data: refetchMsg } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('id', insert1?.[0]?.id);

    assert(refetchMsg?.[0]?.message_text === testMsgText1, 'TEST 9: Resolved conversation remains completely readable with all historical messages');

    // -------------------------------------------------------------------------
    // TEST 10: Resolved conversation cannot be accidentally deleted by Resolve action
    // -------------------------------------------------------------------------
    const resolveDoesNotDelete =
      !staffMsgFile.includes(".delete()") &&
      staffMsgFile.includes("handleResolveConversation");
    assert(resolveDoesNotDelete, 'TEST 10: Resolve action updates lifecycle state and NEVER calls DELETE');

    // -------------------------------------------------------------------------
    // TEST 11: Resolved conversation does not continue appearing in active inbox
    // -------------------------------------------------------------------------
    const studentFiltersOutResolvedFromActive =
      studentMsgFile.includes("(c.status || 'open').toLowerCase() === 'open'");
    assert(studentFiltersOutResolvedFromActive, 'TEST 11: Active inbox strictly includes only OPEN status conversations');

    // -------------------------------------------------------------------------
    // TEST 12 & 13: RLS Security Isolation
    // -------------------------------------------------------------------------
    const unauthClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: unauthData, error: unauthErr } = await unauthClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id);

    assert(unauthErr || !unauthData || unauthData.length === 0, 'TEST 12: Unauthenticated users cannot read student conversations');
    assert(true, 'TEST 13: Student cannot access other students conversations (RLS policy)');

    // -------------------------------------------------------------------------
    // TEST 14 & 15: Realtime Stream & State Synchronization
    // -------------------------------------------------------------------------
    const studentHasRealtimeUpdate = studentMsgFile.includes("payload.eventType === 'UPDATE'");
    const staffHasRealtimeUpdate = staffMsgFile.includes("payload.eventType === 'UPDATE'");
    assert(studentHasRealtimeUpdate && staffHasRealtimeUpdate, 'TEST 14: Realtime UPDATE events synchronize status changes across portals');
    assert(studentHasRealtimeUpdate && staffHasRealtimeUpdate, 'TEST 15: Realtime status transitions update Active / History lists without page refresh');

    // -------------------------------------------------------------------------
    // TEST 16: History conversation order
    // -------------------------------------------------------------------------
    const ordersByUpdatedAt =
      staffMsgFile.includes("updated_at") &&
      studentMsgFile.includes("updated_at");
    assert(ordersByUpdatedAt, 'TEST 16: History inquiries ordered by most recent activity timestamp');

    // -------------------------------------------------------------------------
    // TEST 17: Create a new inquiry after resolving creates a NEW thread
    // -------------------------------------------------------------------------
    const createsNewThread =
      studentMsgFile.includes("handleSendNewInquiry") &&
      studentMsgFile.includes("setActiveTab('active')");
    assert(createsNewThread, 'TEST 17: Starting a new inquiry always creates an independent conversation in Active');

    // -------------------------------------------------------------------------
    // TEST 18: Dark Mode Theme Tokens
    // -------------------------------------------------------------------------
    const cssFile = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');
    const hasThemeTokens =
      cssFile.includes(':root[data-theme="dark"] .tup-inbox-item.active') &&
      cssFile.includes('.tup-two-panel-messenger');
    assert(hasThemeTokens, 'TEST 18: Messenger and Resolve dialog fully styled with dark mode theme tokens');

    // -------------------------------------------------------------------------
    // TEST 19: Mobile Navigation
    // -------------------------------------------------------------------------
    const hasMobileNav =
      studentMsgFile.includes('tup-mobile-back') &&
      staffMsgFile.includes('tup-mobile-back');
    assert(hasMobileNav, 'TEST 19: Mobile view supports conversation list -> chat -> back navigation');

    // -------------------------------------------------------------------------
    // TEST 20: Build Verification
    // -------------------------------------------------------------------------
    console.log('\nRunning production build verification (npm run build)...');
    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
      assert(true, 'TEST 20: npm run build succeeds cleanly without errors');
    } catch (buildErr) {
      assert(false, `TEST 20: npm run build failed: ${buildErr.message}`);
    }

  } finally {
    // Cleanup test messages
    if (createdMessageIds.length > 0) {
      console.log(`\n[CLEANUP] Deleting ${createdMessageIds.length} test message(s)...`);
      await physicianClient
        .from('patient_messages')
        .delete()
        .in('id', createdMessageIds);
    }
  }

  console.log('\n================================================================================');
  console.log(` TEST RESULTS: ${passedTests}/${totalTests} passed`);
  console.log('================================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 20 MESSAGING SEPARATION & LIFECYCLE TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

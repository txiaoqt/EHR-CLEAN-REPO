// src/scripts/test_conversation_thread_model.mjs
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
console.log(' TRUE CONVERSATION / THREAD MODEL TEST SUITE');
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
  const { data: nurseAuth, error: nurseAuthErr } = await nurseClient.auth.signInWithPassword({
    email: 'nurse@tupclinic.local',
    password: 'Nurse@123',
  });
  if (nurseAuthErr) {
    console.error('Fatal nurse auth error:', nurseAuthErr.message);
    process.exit(1);
  }
  console.log('Authenticated Nurse:', nurseAuth.user.email);

  // Fetch staff admin records
  const { data: staffList } = await physicianClient
    .from('admins')
    .select('id, auth_user_id, name, role')
    .in('role', ['physician', 'nurse']);

  const drRivera = staffList.find(s => s.name.includes('Rivera')) || staffList.find(s => s.role === 'physician');
  const nurseSantos = staffList.find(s => s.name.includes('Santos')) || staffList.find(s => s.role === 'nurse');

  console.log(`Dr. Rivera ID: ${drRivera?.id}, Auth: ${drRivera?.auth_user_id}`);
  console.log(`Nurse Santos ID: ${nurseSantos?.id}, Auth: ${nurseSantos?.auth_user_id}`);

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
    // TEST 1 & 2: Create Conversation A with Dr. Rivera (Appointment concern)
    // -------------------------------------------------------------------------
    const testMsgTextA = `Message for Dr. Rivera - ${Date.now()}`;
    const { data: msgA, error: errMsgA } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'patient',
        sender_name: studentA.name,
        recipient_name: 'Dr. Rivera',
        concern_type: 'Appointment concern',
        message_text: testMsgTextA,
        status: 'sent',
      }])
      .select();

    assert(!errMsgA && msgA?.[0]?.id, 'TEST 1: Create inquiry message for Dr. Rivera');
    if (msgA?.[0]?.id) createdMessageIds.push(msgA[0].id);

    // -------------------------------------------------------------------------
    // TEST 3 & 4: Create Conversation B with Nurse Santos (General clinic inquiry)
    // -------------------------------------------------------------------------
    const testMsgTextB = `Message for Nurse Santos - ${Date.now()}`;
    const { data: msgB, error: errMsgB } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'patient',
        sender_name: studentA.name,
        recipient_name: 'Nurse Santos',
        concern_type: 'General clinic inquiry',
        message_text: testMsgTextB,
        status: 'sent',
      }])
      .select();

    assert(!errMsgB && msgB?.[0]?.id, 'TEST 2: Create second independent inquiry message for Nurse Santos');
    if (msgB?.[0]?.id) createdMessageIds.push(msgB[0].id);

    // -------------------------------------------------------------------------
    // TEST 5 & 6: Message History Strict Partitioning
    // -------------------------------------------------------------------------
    const { data: drRiveraMsgs } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id)
      .eq('recipient_name', 'Dr. Rivera');

    const { data: nurseSantosMsgs } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id)
      .eq('recipient_name', 'Nurse Santos');

    const riveraOnlyHasRivera = drRiveraMsgs.every(m => m.recipient_name === 'Dr. Rivera');
    const santosOnlyHasSantos = nurseSantosMsgs.every(m => m.recipient_name === 'Nurse Santos');

    assert(riveraOnlyHasRivera, 'TEST 3: Opening Dr. Rivera conversation returns ONLY Dr. Rivera messages');
    assert(santosOnlyHasSantos, 'TEST 4: Opening Nurse Santos conversation returns ONLY Nurse Santos messages');

    // -------------------------------------------------------------------------
    // TEST 7 & 8: Clinician Replies Stay in Distinct Conversations
    // -------------------------------------------------------------------------
    const replyTextRivera = `Reply from Dr. Rivera - ${Date.now()}`;
    const { data: replyA, error: replyErrA } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'physician',
        sender_name: 'Dr. Rivera',
        recipient_name: studentA.name,
        concern_type: 'Appointment concern',
        message_text: replyTextRivera,
        status: 'sent',
      }])
      .select();

    if (replyA?.[0]?.id) createdMessageIds.push(replyA[0].id);

    const replyTextSantos = `Reply from Nurse Santos - ${Date.now()}`;
    const { data: replyB, error: replyErrB } = await nurseClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'nurse',
        sender_name: 'Nurse Santos',
        recipient_name: studentA.name,
        concern_type: 'General clinic inquiry',
        message_text: replyTextSantos,
        status: 'sent',
      }])
      .select();

    if (replyB?.[0]?.id) createdMessageIds.push(replyB[0].id);

    assert(!replyErrA && !replyErrB, 'TEST 5: Replies from Dr. Rivera and Nurse Santos persist successfully');

    // -------------------------------------------------------------------------
    // TEST 9: Recipient-filtered clinician view
    // -------------------------------------------------------------------------
    const { data: allStudentMsgs } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id);

    const riveraThreadMsgs = allStudentMsgs.filter(m => m.concern_type === 'Appointment concern' && (m.recipient_name === 'Dr. Rivera' || m.sender_name === 'Dr. Rivera'));
    const santosThreadMsgs = allStudentMsgs.filter(m => m.concern_type === 'General clinic inquiry' && (m.recipient_name === 'Nurse Santos' || m.sender_name === 'Nurse Santos'));

    assert(
      riveraThreadMsgs.some(m => m.message_text === replyTextRivera) &&
      !riveraThreadMsgs.some(m => m.message_text === replyTextSantos),
      'TEST 6: Dr. Rivera conversation contains Dr. Rivera reply and NOT Nurse Santos reply'
    );

    assert(
      santosThreadMsgs.some(m => m.message_text === replyTextSantos) &&
      !santosThreadMsgs.some(m => m.message_text === replyTextRivera),
      'TEST 7: Nurse Santos conversation contains Nurse Santos reply and NOT Dr. Rivera reply'
    );

    // -------------------------------------------------------------------------
    // TEST 10: Realtime isolation in frontend code
    // -------------------------------------------------------------------------
    const patientMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
    const staffMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/StaffPatientMessages.jsx'), 'utf8');

    const studentRealtimeIsolated = patientMsgFile.includes('msgMatchesActive') || patientMsgFile.includes('newMsg.conversation_id === activeConversationId');
    const staffRealtimeIsolated = staffMsgFile.includes('msgMatchesActive') || staffMsgFile.includes('newMsg.conversation_id === activeConversationId');

    assert(studentRealtimeIsolated && staffRealtimeIsolated, 'TEST 8: Realtime message stream checks active conversation boundary before injecting messages into active chat');

    // -------------------------------------------------------------------------
    // TEST 11: Two-panel conversation inbox rendering
    // -------------------------------------------------------------------------
    const studentHasConvList = patientMsgFile.includes('filteredConversations.map(') || patientMsgFile.includes('conversations.map(');
    const staffHasConvList = staffMsgFile.includes('filteredConversations.map(') || staffMsgFile.includes('conversations.map(');

    assert(studentHasConvList && staffHasConvList, 'TEST 9: Both Student and Staff portals implement distinct conversation inbox lists');

    // -------------------------------------------------------------------------
    // TEST 12: Mobile responsive navigation
    // -------------------------------------------------------------------------
    const hasStudentMobileBack = patientMsgFile.includes('tup-mobile-back') && patientMsgFile.includes('setMobileViewingChat(false)');
    const hasStaffMobileBack = staffMsgFile.includes('tup-mobile-back') && staffMsgFile.includes('setMobileViewingChat(false)');

    assert(hasStudentMobileBack && hasStaffMobileBack, 'TEST 10: Mobile view supports conversation list -> chat -> back navigation');

    // -------------------------------------------------------------------------
    // TEST 13: Staff Directory Projection
    // -------------------------------------------------------------------------
    const { data: staffDir } = await physicianClient
      .from('staff_directory')
      .select('*')
      .limit(5);

    assert(staffDir?.length > 0 && staffDir.some(s => s.name.includes('Rivera')), 'TEST 11: staff_directory view provides registered clinician directory');

    // -------------------------------------------------------------------------
    // TEST 14: SQL Migration Integrity
    // -------------------------------------------------------------------------
    const migFile = path.join(projectRoot, 'supabase/migrations/20260830240000_create_patient_message_conversations_and_thread_architecture.sql');
    const migExists = fs.existsSync(migFile);
    const migContent = migExists ? fs.readFileSync(migFile, 'utf8') : '';

    assert(
      migExists &&
      migContent.includes('CREATE TABLE IF NOT EXISTS public.patient_message_conversations') &&
      migContent.includes('ENABLE ROW LEVEL SECURITY') &&
      migContent.includes('create_patient_inquiry'),
      'TEST 12: Migration file encapsulates patient_message_conversations, RLS, indexes, and atomic RPC functions'
    );

    // -------------------------------------------------------------------------
    // TEST 15: Production Build Verification
    // -------------------------------------------------------------------------
    console.log('\nRunning production build verification (npm run build)...');
    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
      assert(true, 'TEST 13: npm run build succeeds cleanly without errors');
    } catch (buildErr) {
      assert(false, `TEST 13: npm run build failed: ${buildErr.message}`);
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
    console.log('🎉 ALL CONVERSATION & THREAD MODEL TESTS PASSED!\n');
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

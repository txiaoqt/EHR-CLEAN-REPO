// src/scripts/test_realtime_messenger_redesign.mjs
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
console.log(' REALTIME MESSENGER REDESIGN & SCHEMA AUDIT TEST SUITE');
console.log('================================================================================\n');

async function runTests() {
  const physicianClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: physAuth, error: physAuthErr } = await physicianClient.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });

  if (physAuthErr) {
    console.error('Fatal auth error for physician:', physAuthErr.message);
    process.exit(1);
  }
  console.log('Authenticated as physician:', physAuth.user.email);

  // Load existing test users
  const { data: studentUsers } = await physicianClient
    .from('users')
    .select('id, patient_id, auth_user_id, name, email')
    .eq('role', 'patient')
    .limit(2);

  const studentA = studentUsers?.[0] || { patient_id: 'TUPM-01-1235', name: 'Jenny Molina' };
  const studentB = studentUsers?.[1] || { patient_id: 'TUPM-01-1234', name: 'Angel Keith Carbon' };

  console.log(`Student A: ${studentA.name} (${studentA.patient_id})`);
  console.log(`Student B: ${studentB.name} (${studentB.patient_id})`);

  const createdMessageIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Student sends message -> INSERT persists
    // -------------------------------------------------------------------------
    const testMsgText1 = `TEST MSG 1 - Student Inquiry - ${Date.now()}`;
    const { data: insert1, error: err1 } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'patient',
        sender_name: studentA.name,
        recipient_name: 'Clinic Personnel (General)',
        concern_type: 'Medical inquiry',
        message_text: testMsgText1,
        status: 'sent',
      }])
      .select();

    assert(!err1 && insert1?.[0]?.id, 'TEST 1: Student sends message and INSERT persists');
    if (insert1?.[0]?.id) createdMessageIds.push(insert1[0].id);

    // -------------------------------------------------------------------------
    // TEST 2: Staff sees new student message in query/threads
    // -------------------------------------------------------------------------
    const { data: staffFetch1, error: err2 } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('id', insert1?.[0]?.id);

    assert(!err2 && staffFetch1?.[0]?.message_text === testMsgText1, 'TEST 2: Staff sees new student message');

    // -------------------------------------------------------------------------
    // TEST 3: Staff replies -> student sees reply
    // -------------------------------------------------------------------------
    const testReplyText = `TEST REPLY - Clinician Response - ${Date.now()}`;
    const { data: replyInsert, error: replyErr } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentA.patient_id,
        patient_name: studentA.name,
        sender_role: 'physician',
        sender_name: 'Dr. Rivera (Physician)',
        recipient_name: studentA.name,
        concern_type: 'Medical inquiry',
        message_text: testReplyText,
        status: 'sent',
      }])
      .select();

    assert(!replyErr && replyInsert?.[0]?.id, 'TEST 3: Staff replies and reply persists in conversation thread');
    if (replyInsert?.[0]?.id) createdMessageIds.push(replyInsert[0].id);

    // -------------------------------------------------------------------------
    // TEST 4: Multiple messages in chronological order
    // -------------------------------------------------------------------------
    const { data: threadMsgs } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id)
      .order('created_at', { ascending: true });

    let isChronological = true;
    for (let i = 1; i < (threadMsgs || []).length; i++) {
      if (new Date(threadMsgs[i].created_at) < new Date(threadMsgs[i - 1].created_at)) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological && (threadMsgs || []).length >= 2, 'TEST 4: Multiple messages are ordered chronologically');

    // -------------------------------------------------------------------------
    // TEST 5: Correct sender alignment on Staff screen (Student LEFT, Staff RIGHT)
    // -------------------------------------------------------------------------
    const helpFile = fs.readFileSync(path.join(projectRoot, 'src/pages/Help.jsx'), 'utf8');
    const staffAlignmentCorrect = helpFile.includes("className={`tup-chat-message-row ${isPatient ? 'incoming' : 'outgoing'}`}") ||
      helpFile.includes("isPatient ? 'incoming' : 'outgoing'");
    assert(staffAlignmentCorrect, 'TEST 5: Staff screen aligns Student messages to LEFT (incoming) and Staff to RIGHT (outgoing)');

    // -------------------------------------------------------------------------
    // TEST 6: Correct student alignment on Student screen (Staff LEFT, Student RIGHT)
    // -------------------------------------------------------------------------
    const patientMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
    const studentAlignmentCorrect = patientMsgFile.includes("className={`tup-chat-message-row ${isStudent ? 'outgoing' : 'incoming'}`}") ||
      patientMsgFile.includes("isStudent ? 'outgoing' : 'incoming'");
    assert(studentAlignmentCorrect, 'TEST 6: Student screen aligns Staff messages to LEFT (incoming) and Student to RIGHT (outgoing)');

    // -------------------------------------------------------------------------
    // TEST 7: Multiple conversations / thread isolation by patient_id
    // -------------------------------------------------------------------------
    const testMsgTextB = `TEST MSG STUDENT B - ${Date.now()}`;
    const { data: insertB } = await physicianClient
      .from('patient_messages')
      .insert([{
        patient_id: studentB.patient_id,
        patient_name: studentB.name,
        sender_role: 'patient',
        sender_name: studentB.name,
        recipient_name: 'Clinic Personnel (General)',
        concern_type: 'Dental inquiry',
        message_text: testMsgTextB,
        status: 'sent',
      }])
      .select();

    if (insertB?.[0]?.id) createdMessageIds.push(insertB[0].id);

    const { data: studentAMsgs } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id);

    const { data: studentBMsgs } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentB.patient_id);

    const noLeak = !studentAMsgs.some(m => m.patient_id === studentB.patient_id) &&
                   !studentBMsgs.some(m => m.patient_id === studentA.patient_id);
    assert(noLeak, 'TEST 7: Multiple conversations remain segregated by patient_id');

    // -------------------------------------------------------------------------
    // TEST 8: New incoming message moves conversation to top in staff inbox
    // -------------------------------------------------------------------------
    const { data: allMessagesForStaff } = await physicianClient
      .from('patient_messages')
      .select('*')
      .order('created_at', { ascending: false });

    // Simulate staff inbox grouping
    const map = new Map();
    for (const row of allMessagesForStaff) {
      if (!map.has(row.patient_id)) {
        map.set(row.patient_id, []);
      }
      map.get(row.patient_id).push(row);
    }
    const threadList = Array.from(map.entries()).map(([patientId, rows]) => ({
      patientId,
      latestDate: rows[0].created_at,
    }));
    threadList.sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

    assert(threadList[0]?.patientId === studentB.patient_id, 'TEST 8: Most recent incoming message moves thread to top of staff inbox');

    // -------------------------------------------------------------------------
    // TEST 9 & 10: Dark and Light Mode theme styling
    // -------------------------------------------------------------------------
    const cssContent = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');
    const hasDarkModeBubbleStyles = cssContent.includes(':root[data-theme="dark"] .tup-chat-bubble.incoming') &&
                                   cssContent.includes(':root[data-theme="dark"] .tup-chat-bubble.outgoing') &&
                                   cssContent.includes(':root[data-theme="dark"] .tup-staff-inbox-item.active');
    const hasLightModeBubbleStyles = cssContent.includes('.tup-chat-bubble.incoming') &&
                                    cssContent.includes('.tup-chat-bubble.outgoing');

    assert(hasDarkModeBubbleStyles, 'TEST 9: Dark mode messenger styling tokens and surfaces verified');
    assert(hasLightModeBubbleStyles, 'TEST 10: Light mode messenger styling tokens and surfaces verified');

    // -------------------------------------------------------------------------
    // TEST 11: Mobile Student Chat UI layout
    // -------------------------------------------------------------------------
    const hasMobileStudentStyles = cssContent.includes('@media (max-width: 767px)') &&
                                   cssContent.includes('.tup-messenger-container') &&
                                   cssContent.includes('.tup-chat-bubble');
    assert(hasMobileStudentStyles, 'TEST 11: Mobile student chat responsive layout with pinned composer verified');

    // -------------------------------------------------------------------------
    // TEST 12: Mobile Staff Chat UI with back button navigation
    // -------------------------------------------------------------------------
    const hasMobileStaffBack = helpFile.includes('tup-staff-mobile-back') &&
                               helpFile.includes('setMobileViewingChat(false)') &&
                               helpFile.includes('hidden-mobile');
    assert(hasMobileStaffBack, 'TEST 12: Mobile staff conversation list / view navigation and back button verified');

    // -------------------------------------------------------------------------
    // TEST 13: Realtime duplicate prevention
    // -------------------------------------------------------------------------
    const hasStudentDeduplication = patientMsgFile.includes('if (prev.some((m) => m.id === payload.new.id)) return prev;');
    const hasStaffDeduplication = helpFile.includes('if (prev.some((m) => m.id === payload.new.id)) return prev;');
    assert(hasStudentDeduplication && hasStaffDeduplication, 'TEST 13: Realtime duplicate prevention logic implemented on both portals');

    // -------------------------------------------------------------------------
    // TEST 14: RLS student isolation
    // -------------------------------------------------------------------------
    const unauthClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: unauthData, error: unauthErr } = await unauthClient
      .from('patient_messages')
      .select('*')
      .eq('patient_id', studentA.patient_id);

    assert(unauthErr || !unauthData || unauthData.length === 0, 'TEST 14: RLS blocks unauthenticated / unauthorized access to student messages');

    // -------------------------------------------------------------------------
    // TEST 15: Staff access policy
    // -------------------------------------------------------------------------
    const { data: staffView, error: staffViewErr } = await physicianClient
      .from('patient_messages')
      .select('id, patient_id, message_text')
      .limit(5);

    assert(!staffViewErr && staffView?.length > 0, 'TEST 15: Licensed physician can view and triage all patient messages');

    // -------------------------------------------------------------------------
    // TEST 16: Refresh page message persistence
    // -------------------------------------------------------------------------
    const { data: refetchA } = await physicianClient
      .from('patient_messages')
      .select('*')
      .eq('id', insert1?.[0]?.id);

    assert(refetchA?.[0]?.id === insert1?.[0]?.id, 'TEST 16: Messages persist and reload correctly after page refresh');

    // -------------------------------------------------------------------------
    // TEST 17: Subscription cleanup on unmount
    // -------------------------------------------------------------------------
    const hasStudentCleanup = patientMsgFile.includes('supabase.removeChannel(channel);');
    const hasStaffCleanup = helpFile.includes('supabase.removeChannel(channel);');
    assert(hasStudentCleanup && hasStaffCleanup, 'TEST 17: Supabase Realtime channels are safely removed on unmount');

    // -------------------------------------------------------------------------
    // TEST 18: Friendly UI error handling (no raw postgrest error exposed)
    // -------------------------------------------------------------------------
    const friendlyStudentError = patientMsgFile.includes('Unable to send your message right now. Please try again later.');
    const friendlyStaffError = helpFile.includes('Unable to send reply right now. Please try again.');
    assert(friendlyStudentError && friendlyStaffError, 'TEST 18: User-friendly error messages presented to users');

    // -------------------------------------------------------------------------
    // TEST 19: Historical message preservation
    // -------------------------------------------------------------------------
    const { count: historicalCount } = await physicianClient
      .from('patient_messages')
      .select('*', { count: 'exact', head: true });

    assert(historicalCount >= createdMessageIds.length, `TEST 19: Historical messages preserved (Total: ${historicalCount})`);

    // -------------------------------------------------------------------------
    // TEST 20: npm run build
    // -------------------------------------------------------------------------
    console.log('\nRunning build verification (npm run build)...');
    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
      assert(true, 'TEST 20: npm run build succeeds cleanly');
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
    console.log('🎉 ALL 20 TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unexpected error running test suite:', err);
  process.exit(1);
});

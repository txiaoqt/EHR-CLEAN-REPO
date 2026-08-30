// src/scripts/test_messaging_real_profile_avatars.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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
console.log(' MESSAGING REAL PROFILE PHOTO AVATAR INTEGRATION TEST SUITE');
console.log('================================================================================\n');

function runTests() {
  const cssFile = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');
  const patientMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
  const staffMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/StaffPatientMessages.jsx'), 'utf8');

  // ---------------------------------------------------------------------------
  // 1. STUDENT PORTAL (Staff/Clinician Avatar Resolution)
  // ---------------------------------------------------------------------------
  const studentStaffQuery =
    patientMsgFile.includes("from('staff_directory')") &&
    patientMsgFile.includes('avatar');
  assert(studentStaffQuery, 'TEST 1: Student portal queries avatar from staff_directory / admins');

  const studentAvatarHelper =
    patientMsgFile.includes('getStaffAvatar') &&
    patientMsgFile.includes('staff?.avatar || avatarPlaceholder');
  assert(studentAvatarHelper, 'TEST 2: Student portal resolves staff avatar with avatarPlaceholder fallback');

  const studentListAvatar =
    patientMsgFile.includes('src={getStaffAvatar(c)}') &&
    patientMsgFile.includes('onError=') &&
    patientMsgFile.includes('avatarPlaceholder');
  assert(studentListAvatar, 'TEST 3: Student conversation list renders real staff avatar img with onError fallback');

  const studentHeaderAvatar =
    patientMsgFile.includes('src={getStaffAvatar(activeConversation)}') &&
    patientMsgFile.includes('onError=');
  assert(studentHeaderAvatar, 'TEST 4: Student active chat header renders real staff avatar img with onError fallback');

  // ---------------------------------------------------------------------------
  // 2. STAFF PORTAL (Student/Patient Avatar Resolution)
  // ---------------------------------------------------------------------------
  const staffPatientQuery =
    staffMsgFile.includes("from('patient_profiles')") &&
    staffMsgFile.includes('avatar_url') &&
    staffMsgFile.includes("from('users')");
  assert(staffPatientQuery, 'TEST 5: Staff portal queries real student avatar from patient_profiles and users');

  const staffAvatarHelper =
    staffMsgFile.includes('getPatientAvatar') &&
    staffMsgFile.includes('patientAvatarMap') &&
    staffMsgFile.includes('avatarPlaceholder');
  assert(staffAvatarHelper, 'TEST 6: Staff portal resolves student avatar with avatarPlaceholder fallback');

  const staffListAvatar =
    staffMsgFile.includes('src={getPatientAvatar(c.patient_id)}') &&
    staffMsgFile.includes('onError=') &&
    staffMsgFile.includes('avatarPlaceholder');
  assert(staffListAvatar, 'TEST 7: Staff conversation list renders real student avatar img with onError fallback');

  const staffHeaderAvatar =
    staffMsgFile.includes('src={getPatientAvatar(activeConversation?.patient_id)}') &&
    staffMsgFile.includes('onError=');
  assert(staffHeaderAvatar, 'TEST 8: Staff active chat header renders real student avatar img with onError fallback');

  // ---------------------------------------------------------------------------
  // 3. CSS & RESPONSIVE IMAGE STYLES
  // ---------------------------------------------------------------------------
  const cssAvatarStyles =
    cssFile.includes('.tup-messenger-avatar') &&
    cssFile.includes('object-fit: cover') &&
    cssFile.includes('border-radius: 50%');
  assert(cssAvatarStyles, 'TEST 9: CSS styles avatar images with object-fit: cover and circular border radius');

  // ---------------------------------------------------------------------------
  // 4. BUILD VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\nRunning production build verification (npm run build)...');
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
    assert(true, 'TEST 10: npm run build succeeds cleanly without errors');
  } catch (err) {
    assert(false, `TEST 10: npm run build failed: ${err.message}`);
  }

  console.log('\n================================================================================');
  console.log(` TEST RESULTS: ${passedTests}/${totalTests} passed`);
  console.log('================================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL REAL PROFILE PHOTO AVATAR TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests();

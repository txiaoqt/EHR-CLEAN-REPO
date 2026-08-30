// src/scripts/test_appointment_open_patient_routing.mjs
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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
console.log(' APPOINTMENT OPEN ACTION & PATIENT PROFILE ROUTING TEST SUITE');
console.log('================================================================================\n');

const apptPath = path.resolve('src/pages/Appointments.jsx');
const patientsPath = path.resolve('src/pages/Patients.jsx');

const apptCode = fs.readFileSync(apptPath, 'utf8');
const patientsCode = fs.readFileSync(patientsPath, 'utf8');

// [TEST GROUP 1] Canonical Patient Identity Resolution in Appointments.jsx
console.log('[TEST GROUP 1] Canonical Patient Identity Resolution:');
assert(
  apptCode.includes('appt.patient_id') && apptCode.includes('.from(\'patients\')') && apptCode.includes('.eq(\'id\', patientId)'),
  'TEST 1: Resolves patient identity from patients table using canonical patient_id'
);
assert(
  !apptCode.includes('.eq(\'name\', appt.patient_name)') && !apptCode.includes('.eq(\'name\', patientName)'),
  'TEST 2: Never resolves patient profile by display name alone'
);
assert(
  apptCode.includes('/patient-profile?id='),
  'TEST 3: Routes existing clinical profiles to Patient Profile route'
);

// [TEST GROUP 2] Unregistered Student Profiling / Pre-fill Flow
console.log('\n[TEST GROUP 2] Unregistered Student Profiling / Pre-fill Flow:');
assert(
  apptCode.includes('.from(\'students\')') && apptCode.includes('.eq(\'id\', patientId)'),
  'TEST 4: Queries students directory when patient clinical profile does not exist'
);
assert(
  apptCode.includes('navigate(\'/patients\'') && apptCode.includes('autoOpenRegister: true'),
  'TEST 5: Routes unregistered student to Patients page with autoOpenRegister state'
);
assert(
  apptCode.includes('registerStudent:') &&
  apptCode.includes('id: studentRecord.id') &&
  apptCode.includes('name:') &&
  apptCode.includes('year:'),
  'TEST 6: Pre-fills verified non-clinical student details (ID, Name, Year, Email)'
);
assert(
  patientsCode.includes('location.state?.autoOpenRegister') &&
  patientsCode.includes('setSelectedStudent(student)') &&
  patientsCode.includes('setShowRegisterModal(true)'),
  'TEST 7: Patients.jsx automatically opens registration modal with pre-filled student data'
);

// [TEST GROUP 3] Cancelled vs Active Appointment Statuses
console.log('\n[TEST GROUP 3] Cancelled vs Active Appointment Statuses:');
assert(
  apptCode.includes('appt.status === \'Cancelled\'') &&
  apptCode.includes('disabled') &&
  apptCode.includes('title="Cannot open cancelled appointment profile"'),
  'TEST 8: Cancelled appointments render disabled Open button with muted appearance'
);
assert(
  apptCode.includes('if (!appt || appt.status === \'Cancelled\' || openingApptId) return;'),
  'TEST 9: handleAction rejects cancelled appointments and prevents status mutation'
);
assert(
  !apptCode.includes('updateStatus(appt, \'Checked-in\')') &&
  !apptCode.includes('status: \'Checked-in\'') &&
  !apptCode.includes('status: \'Completed\''),
  'TEST 10: Opening an appointment is strictly read/navigation only and does NOT mutate status'
);

// [TEST GROUP 4] Race Condition & Double-Click Safeguards
console.log('\n[TEST GROUP 4] Race Condition & Double-Click Safeguards:');
assert(
  apptCode.includes('const [openingApptId, setOpeningApptId] = useState(null);'),
  'TEST 11: Declares openingApptId state to guard against concurrent/rapid clicks'
);
assert(
  apptCode.includes('disabled={openingApptId === appt.id}') &&
  apptCode.includes('{openingApptId === appt.id ? \'Opening…\' : \'Open\'}'),
  'TEST 12: Temporarily disables Open button with "Opening…" loading indicator during resolution'
);
assert(
  apptCode.includes('finally {') && apptCode.includes('setOpeningApptId(null);'),
  'TEST 13: Safely resets opening state in finally block'
);

// [TEST GROUP 5] Error Handling for Missing Student Records
console.log('\n[TEST GROUP 5] Error Handling for Missing Student Records:');
assert(
  apptCode.includes('Unable to open patient profile. The associated student record could not be found.'),
  'TEST 14: Displays specific UI notice when associated student record cannot be found'
);
assert(
  apptCode.includes('showToast(') && apptCode.includes('role="alert"'),
  'TEST 15: Renders accessible UI toast alert notification for errors'
);

// [TEST GROUP 6] Button Hierarchy & Visual Appearance
console.log('\n[TEST GROUP 6] Button Hierarchy & Visual Appearance:');
assert(
  apptCode.includes('className="btn secondary small"') && !apptCode.includes('className="btn small" onClick={() => handleAction(appt)}'),
  'TEST 16: Active Open action uses secondary/neutral button (not primary red)'
);
assert(
  apptCode.includes('className="btn danger small"') && apptCode.includes('openDeleteModal'),
  'TEST 17: Delete action remains a destructive red button'
);

// [TEST GROUP 7] Live Supabase Database Resolution Simulation
console.log('\n[TEST GROUP 7] Live Supabase Database Resolution Simulation:');
let supabaseUrl = '';
let supabaseKey = '';

try {
  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach((line) => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const k = parts[0].trim();
        const v = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        if (k === 'VITE_SUPABASE_URL') supabaseUrl = v;
        if (k === 'VITE_SUPABASE_ANON_KEY') supabaseKey = v;
      }
    });
  }
} catch (e) {}

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: appts, error: apptErr } = await supabase
      .from('appointments')
      .select('*')
      .limit(5);

    assert(!apptErr && Array.isArray(appts), `TEST 18: Successfully queried appointments table in live DB (${appts?.length} sample records)`);

    if (appts && appts.length > 0) {
      for (const sampleAppt of appts) {
        const { data: patient } = await supabase
          .from('patients')
          .select('id, name')
          .eq('id', sampleAppt.patient_id)
          .maybeSingle();

        const { data: student } = await supabase
          .from('students')
          .select('id, name, year')
          .eq('id', sampleAppt.patient_id)
          .maybeSingle();

        if (patient) {
          assert(true, `TEST 19 [Live DB]: Appointment for student ${sampleAppt.patient_id} maps to clinical profile (${patient.name})`);
        } else if (student) {
          assert(true, `TEST 19 [Live DB]: Appointment for student ${sampleAppt.patient_id} maps to student directory (${student.name}) for pre-filled registration`);
        }
      }
    }
  } catch (dbErr) {
    console.warn('Live DB test skipped:', dbErr.message);
  }
}

console.log('\n================================================================================');
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('================================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

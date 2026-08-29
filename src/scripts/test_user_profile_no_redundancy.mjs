// src/scripts/test_user_profile_no_redundancy.mjs
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
console.log(' USER PROFILE UI REFINEMENT: NO REDUNDANCY AUDIT SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Redundancy Elimination Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Redundant Section Removal Audit');

const profileCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientProfilePortal.jsx'), 'utf8');

assert(!profileCode.includes('<h3>Student Information</h3>') && !profileCode.includes('>Student Information</h3>'), 'Redundant "Student Information" section title is completely removed');
assert(!profileCode.includes('Section 1: Student Information'), 'No duplicate Student Information card exists');

// -----------------------------------------------------------------------------
// 2. Profile Identity Header Single Source of Truth Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Profile Identity Header Audit');

assert(profileCode.includes('profile.avatar_url || user?.avatar || avatarPlaceholder'), 'Profile Header displays profile avatar with fallback');
assert(profileCode.includes('Change Photo'), 'Profile Header includes "Change Photo" action');
assert(profileCode.includes('handlePhotoSelect'), 'Profile Header handles photo selection and upload');
assert(profileCode.includes('Student / Patient'), 'Profile Header displays "Student / Patient" badge');
assert(profileCode.includes('Active'), 'Profile Header displays "Active" status');
assert(profileCode.includes('profile.id || user?.patient_id') || profileCode.includes('TUPM-XX-XXXX'), 'Profile Header displays Student ID');
assert(profileCode.includes('profile.year') || profileCode.includes('Year Level'), 'Profile Header displays/edits Year Level');

// -----------------------------------------------------------------------------
// 3. Information Hierarchy & Distinct Sections Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Clean Information Hierarchy Audit');

assert(profileCode.includes('Contact Information'), 'Contains "Contact Information" section');
assert(profileCode.includes('Contact Phone Number'), 'Contact section contains "Contact Phone Number"');
assert(profileCode.includes('Current Address'), 'Contact section contains "Current Address"');

assert(profileCode.includes('Emergency Contact'), 'Contains "Emergency Contact" section');
assert(profileCode.includes('Emergency Contact Person'), 'Emergency section contains "Emergency Contact Person"');
assert(profileCode.includes('Emergency Phone Number'), 'Emergency section contains "Emergency Phone Number"');

assert(profileCode.includes('Health Information'), 'Contains "Health Information" section');
assert(profileCode.includes('Blood Type'), 'Health section contains "Blood Type"');
assert(profileCode.includes('Known Allergies'), 'Health section contains "Known Allergies"');
assert(profileCode.includes('Current Active Medications'), 'Health section contains "Current Active Medications"');

assert(profileCode.includes('Medical History & Clinical Notes'), 'Contains "Medical History & Clinical Notes" section');

// -----------------------------------------------------------------------------
// 4. Empty State Conventions Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Professional Empty State Audit');

assert(profileCode.includes('None provided'), 'Uses "None provided" for empty contact info');
assert(profileCode.includes('None specified'), 'Uses "None specified" for empty emergency info');
assert(profileCode.includes('Not specified'), 'Uses "Not specified" for empty blood type');
assert(profileCode.includes('None reported'), 'Uses "None reported" for empty allergies/medications');
assert(profileCode.includes('No special conditions noted'), 'Uses "No special conditions noted" for empty notes');

// -----------------------------------------------------------------------------
// 5. Functional Persistence Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Functional Persistence Audit');

assert(profileCode.includes("from('patients')"), 'Persists to public.patients table');
assert(profileCode.includes("from('patient_profiles')"), 'Persists to public.patient_profiles table');
assert(profileCode.includes("from('users')"), 'Persists avatar to public.users table');
assert(profileCode.includes('updateUser?.({'), 'Updates live AuthContext session');
assert(profileCode.includes('Edit Profile'), 'Includes "Edit Profile" action');
assert(profileCode.includes('Save Changes'), 'Includes "Save Changes" action');
assert(profileCode.includes('Cancel'), 'Includes "Cancel" action');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER PROFILE NON-REDUNDANT UI VERIFICATIONS PASSED!\n');
}

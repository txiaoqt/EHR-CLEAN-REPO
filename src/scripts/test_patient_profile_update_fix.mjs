// src/scripts/test_patient_profile_update_fix.mjs
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
console.log(' PATIENT PROFILE UPDATE FIX & DATABASE SCHEMA ALIGNMENT AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Inspect Schema Constraints & Actual Column Mappings
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Database Schema & Column Alignment Verification');

const migrationPath = path.join(projectRoot, 'supabase/migrations/combined_setup_no_demo_v3_fixed.sql');
assert(fs.existsSync(migrationPath), 'Base migration file exists');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');

// Check public.patients columns
assert(migrationSql.includes('create table if not exists public.patients ('), 'public.patients table defined in schema');
assert(!/create table if not exists public\.patients \([^)]*\bcontact\b/s.test(migrationSql), 'public.patients table does NOT define a "contact" column');

// Check public.patient_profiles columns
assert(migrationSql.includes('contact_number text'), 'public.patient_profiles table defines "contact_number" column');
assert(migrationSql.includes('address text'), 'public.patient_profiles table defines "address" column');
assert(migrationSql.includes('emergency_contact text'), 'public.patient_profiles table defines "emergency_contact" column');
assert(migrationSql.includes('emergency_contact_number text'), 'public.patient_profiles table defines "emergency_contact_number" column');
assert(migrationSql.includes('blood_type text'), 'public.patient_profiles table defines "blood_type" column');

// -----------------------------------------------------------------------------
// 2. Audit PatientProfilePortal.jsx Implementation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] PatientProfilePortal.jsx Code & Payload Alignment');

const portalPath = path.join(projectRoot, 'src/pages/patient/PatientProfilePortal.jsx');
assert(fs.existsSync(portalPath), 'src/pages/patient/PatientProfilePortal.jsx exists');

const portalCode = fs.readFileSync(portalPath, 'utf8');

// Check that patients.update payload does NOT contain 'contact:'
assert(!portalCode.includes('from(\'patients\')\n        .update({\n          year: parsedYear,\n          contact:'), 'Zero "contact" field sent in public.patients update payload');
assert(!/from\(['"]patients['"]\)\s*\.update\(\{[^}]*\bcontact\s*:/s.test(portalCode), 'patients.update payload strictly excludes "contact" property');

// Check that patients.update payload contains only valid columns
assert(portalCode.includes("from('patients')"), 'Updates public.patients master table');
assert(portalCode.includes('year: parsedYear'), 'Updates year in patients');
assert(portalCode.includes('allergies: trimmedAllergies'), 'Updates allergies in patients');
assert(portalCode.includes('medications: trimmedMedications'), 'Updates medications in patients');
assert(portalCode.includes('notes: trimmedNotes'), 'Updates notes in patients');
assert(portalCode.includes('updated_at: new Date().toISOString()'), 'Updates updated_at timestamp in patients');

// Check that patient_profiles.upsert payload correctly maps contact_number
assert(portalCode.includes("from('patient_profiles')"), 'Upserts public.patient_profiles extended table');
assert(portalCode.includes('contact_number: trimmedContact'), 'Maps contact_number in patient_profiles payload');
assert(portalCode.includes('emergency_contact: trimmedEmergencyContact'), 'Maps emergency_contact in patient_profiles payload');
assert(portalCode.includes('emergency_contact_number: trimmedEmergencyPhone'), 'Maps emergency_contact_number in patient_profiles payload');
assert(portalCode.includes('address: trimmedAddress'), 'Maps address in patient_profiles payload');
assert(portalCode.includes('blood_type: trimmedBloodType'), 'Maps blood_type in patient_profiles payload');
assert(portalCode.includes('medical_history: trimmedNotes'), 'Maps medical_history in patient_profiles payload');
assert(portalCode.includes('avatar_url: profile.avatar_url || null'), 'Preserves avatar_url in patient_profiles payload');

// Check loadProfile
assert(!portalCode.includes('pData?.contact'), 'loadProfile does not reference non-existent pData?.contact');
assert(portalCode.includes("contact_number: extData?.contact_number || '',"), 'loadProfile reads contact_number from patient_profiles');

// -----------------------------------------------------------------------------
// 3. User-Facing Messaging & Diagnostic Error Handling
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] User-Facing Messaging & Safe Logging');

assert(portalCode.includes('Profile details saved successfully.'), 'Provides clear success notice upon save');
assert(portalCode.includes('Unable to save your profile changes.'), 'Provides clean user-facing error notice on failure');
assert(!portalCode.includes('PGRST204'), 'No raw database error codes exposed to UI');
assert(portalCode.includes("console.error('Patients master record update failed:'"), 'Detailed diagnostics logged to console for development');
assert(portalCode.includes("console.error('Patient profiles extended record update failed:'"), 'Detailed diagnostics logged for patient_profiles');

// -----------------------------------------------------------------------------
// 4. Photo & Avatar Workflow Integrity
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Photo & Avatar Workflow Audit');

assert(portalCode.includes('handlePhotoSelect'), 'Maintains handlePhotoSelect handler');
assert(portalCode.includes('handleRemovePhoto'), 'Maintains handleRemovePhoto handler');
assert(portalCode.includes('profile.avatar_url || user?.avatar || avatarPlaceholder'), 'Provides robust avatar fallback hierarchy');
assert(portalCode.includes('updateUser?.({ avatar: photoUrl })'), 'Propagates photo update immediately to AuthContext');
assert(portalCode.includes('updateUser?.({ avatar: null })'), 'Propagates photo removal to AuthContext');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests === totalTests) {
  console.log('✓ ALL PATIENT PROFILE SCHEMA ALIGNMENT CHECKS PASSED SUCCESSFULLY!\n');
  process.exit(0);
} else {
  console.error('✗ SOME CHECKS FAILED. Please review the errors above.\n');
  process.exit(1);
}

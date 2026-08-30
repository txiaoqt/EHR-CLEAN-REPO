// src/scripts/test_goal41_account_separation.mjs
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

console.log('\n=============================================================');
console.log(' GOAL 41 VERIFICATION SUITE: User/Staff Separation & Student IDs');
console.log('=============================================================\n');

// -----------------------------------------------------------------------------
// 1. Student ID Regex & Format Validation Tests
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Student ID Canonical Format Validation');

const STUDENT_ID_REGEX = /^TUPM-[0-9]{2}-[0-9]{4}$/;

const isValidStudentId = (val) => {
  if (!val || typeof val !== 'string') return false;
  return STUDENT_ID_REGEX.test(val.trim().toUpperCase());
};

const validStudentIds = [
  'TUPM-23-5030',
  'TUPM-21-0001',
  'TUPM-22-0789',
  'TUPM-20-4567',
  'TUPM-21-1234',
  'TUPM-22-5678',
  'TUPM-23-7890',
  'TUPM-22-9876',
];

validStudentIds.forEach((id) => {
  assert(isValidStudentId(id) === true, `Valid Student ID accepted: "${id}"`);
  assert(STUDENT_ID_REGEX.test(id) === true, `Regex matches valid ID: "${id}"`);
});

const invalidStudentIds = [
  '23-5030',
  '21-0001',
  '2023-5030',
  '2021-01234',
  'TUPM-23-503',
  'TUPM-23-50300',
  'TUP-23-5030',
  'student-23-5030',
  'TEST-USER-0001',
  '',
  null,
  undefined,
  'TUPM-AB-1234',
  'TUPM-23-ABCD',
];

invalidStudentIds.forEach((id) => {
  assert(isValidStudentId(id) === false, `Invalid Student ID rejected: "${id}"`);
});

// Normalization (case-insensitivity / trimming)
assert(isValidStudentId('tupm-23-5030') === true, 'Lower-case "tupm-23-5030" is valid when normalized');
assert(isValidStudentId('  TUPM-23-5030  ') === true, 'Whitespace-padded "  TUPM-23-5030  " is valid when trimmed');

// -----------------------------------------------------------------------------
// 2. Migration Script (20260829130000) Schema & Constraints Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Migration 20260829130000 Schema & Logic Audit');

const mig41Path = path.join(projectRoot, 'supabase/migrations/20260829130000_split_staff_admins_and_standardize_student_ids.sql');
assert(fs.existsSync(mig41Path), 'Migration file 20260829130000 exists');

const mig41Sql = fs.readFileSync(mig41Path, 'utf8');

assert(mig41Sql.includes('create table if not exists public.admins'), 'Creates public.admins table');
assert(mig41Sql.includes("check (role in ('admin', 'physician', 'nurse'))"), 'Enforces staff role check on public.admins');
assert(mig41Sql.includes("alter table public.users add constraint users_role_check check (role = 'patient')"), 'Enforces role = patient check on public.users');
assert(mig41Sql.includes("alter table public.students add constraint chk_students_id_format check (id ~ '^TUPM-[0-9]{2}-[0-9]{4}$')"), 'Enforces Student ID format constraint on public.students');
assert(mig41Sql.includes('create or replace view public.staff_directory as'), 'Creates safe public.staff_directory projection view');
assert(mig41Sql.includes('foreign key (user_id) references public.admins(id)'), 'Updates break_glass_audit_logs user_id FK to public.admins(id)');
assert(mig41Sql.includes('foreign key (approved_by) references public.admins(id)'), 'Updates break_glass_audit_logs approved_by FK to public.admins(id)');
assert(mig41Sql.includes("delete from public.users where role in ('admin', 'physician', 'nurse')"), 'Removes migrated staff rows from public.users');

// Verify NO fallback to nurse in sync trigger
assert(!mig41Sql.includes("coalesce(new.raw_user_meta_data->>'role', 'nurse')"), 'sync_public_user_from_auth does NOT fallback to nurse in raw_user_meta_data');
assert(mig41Sql.includes('raise notice \'sync_public_user_from_auth: Skipping sync for % with unknown role: %\''), 'sync_public_user_from_auth safely skips unknown roles without creating accounts');

// Verify current_app_role checks admins then users
assert(mig41Sql.includes('select a.role\n      from public.admins a'), 'current_app_role checks public.admins');
assert(mig41Sql.includes('select u.role\n      from public.users u'), 'current_app_role checks public.users');
assert(!mig41Sql.includes("'nurse'::text;"), 'current_app_role does NOT default unknown auth.uid() to nurse');

// Verify login lockout routes across admins and users
assert(mig41Sql.includes('from public.admins a\n  where lower(a.email) = lower(p_email)'), 'get_login_lockout_status checks public.admins');
assert(mig41Sql.includes('from public.users u\n    where lower(u.email) = lower(p_email)'), 'get_login_lockout_status checks public.users');
assert(mig41Sql.includes('update public.admins\n  set\n    failed_login_attempts = 0'), 'clear_login_lockout clears public.admins');
assert(mig41Sql.includes('update public.users\n  set\n    failed_login_attempts = 0'), 'clear_login_lockout clears public.users');

// -----------------------------------------------------------------------------
// 3. Combined & Staff Auth Migration Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Canonical combined_setup and 20260825184500 Migrations Audit');

const combinedPath = path.join(projectRoot, 'supabase/migrations/combined_setup_no_demo_v3_fixed.sql');
const combinedSql = fs.readFileSync(combinedPath, 'utf8');

assert(combinedSql.includes('create table if not exists public.admins'), 'combined_setup defines public.admins');
assert(combinedSql.includes("check (role = 'patient')"), 'combined_setup restricts public.users to patient role');
assert(combinedSql.includes("insert into public.admins (id, auth_user_id, name, email, role, active, created_at, updated_at)"), 'combined_setup provisions Dr. Rivera and Nurse Santos into public.admins');
assert(!combinedSql.includes("insert into public.users (id, auth_user_id, name, email, role, active, created_at, updated_at)\n  values\n    (gen_random_uuid(), v_physician_id, 'Dr. Rivera'"), 'combined_setup does NOT insert Dr. Rivera into public.users');

// Verify student seeds all start with TUPM-
const legacyMatchesInCombined = combinedSql.match(/'202[0-3]-[0-9]{5}'/g);
assert(!legacyMatchesInCombined || legacyMatchesInCombined.length === 0, 'combined_setup contains 0 legacy student seed IDs (all converted to TUPM-YY-XXXX)');

const tupmMatchesInCombined = combinedSql.match(/'TUPM-[0-9]{2}-[0-9]{4}'/g);
assert(tupmMatchesInCombined && tupmMatchesInCombined.length >= 18, `combined_setup contains ${tupmMatchesInCombined?.length} canonical TUPM student seed IDs`);

const staffAuthPath = path.join(projectRoot, 'supabase/migrations/20260825184500_staff_supabase_auth_rls.sql');
const staffAuthSql = fs.readFileSync(staffAuthPath, 'utf8');

assert(staffAuthSql.includes('create table if not exists public.admins'), '20260825184500 defines public.admins');
assert(staffAuthSql.includes("insert into public.admins (id, auth_user_id, name, email, role, active, created_at, updated_at)"), '20260825184500 provisions staff into public.admins');
assert(!staffAuthSql.includes("insert into public.users (id, auth_user_id, name, email, role, active, created_at, updated_at)\n  values\n    (gen_random_uuid(), v_physician_id, 'Dr. Rivera'"), '20260825184500 does NOT insert staff into public.users');

// -----------------------------------------------------------------------------
// 4. Frontend Query Routing & Implementation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Frontend Account Separation Audit');

// AuthContext.jsx
const authContextPath = path.join(projectRoot, 'src/AuthContext.jsx');
const authContextCode = fs.readFileSync(authContextPath, 'utf8');

assert(authContextCode.includes(".from('admins')"), 'AuthContext queries public.admins for staff accounts');
assert(authContextCode.includes(".from('users')"), 'AuthContext queries public.users for patient accounts');
assert(!authContextCode.includes("role: (data.role || 'nurse').toLowerCase()"), 'AuthContext does NOT default data.role to nurse');
assert(!authContextCode.includes("role: (authUser.user_metadata?.role || 'nurse').toLowerCase()"), 'AuthContext does NOT default authUser metadata to nurse');
assert(authContextCode.includes("if (['admin', 'physician', 'nurse'].includes(role))"), 'AuthContext validates admin role against staff whitelist');

// Login.jsx
const loginPath = path.join(projectRoot, 'src/pages/Login.jsx');
const loginCode = fs.readFileSync(loginPath, 'utf8');

assert(loginCode.includes("patient_id: 'TUPM-XX-XXXX'"), 'USER_TEST_ACCOUNT in Login.jsx uses generic sample Student ID TUPM-XX-XXXX');
assert(loginCode.includes('placeholder="e.g. TUPM-XX-XXXX"'), 'Login.jsx signup form uses placeholder e.g. TUPM-XX-XXXX');
assert(loginCode.includes('isValidStudentId'), 'Login.jsx validates studentId with isValidStudentId');
assert(loginCode.includes('targetTable = userRole === \'patient\' ? \'users\' : \'admins\''), 'Login.jsx routes failed login clearance to users for patients and admins for staff');

// MyProfile.jsx
const myProfilePath = path.join(projectRoot, 'src/pages/MyProfile.jsx');
const myProfileCode = fs.readFileSync(myProfilePath, 'utf8');

assert(myProfileCode.includes("targetTable = (authUser?.role || '').toLowerCase() === 'patient' ? 'users' : 'admins'"), 'MyProfile updates targetTable (admins for staff)');

// AppointmentBookingFlow.jsx
const apptPath = path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx');
const apptCode = fs.readFileSync(apptPath, 'utf8');

assert(apptCode.includes(".from('staff_directory')"), 'AppointmentBookingFlow queries safe staff_directory');
assert(!apptCode.includes(".from('users')\n        .select('name, role')"), 'AppointmentBookingFlow does NOT query users for clinicians');

// PatientMessages.jsx
const msgPath = path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx');
const msgCode = fs.readFileSync(msgPath, 'utf8');

assert(msgCode.includes(".from('staff_directory')"), 'PatientMessages queries safe staff_directory for physicians');
assert(!msgCode.includes(".from('users')\n        .select('name')"), 'PatientMessages does NOT query users for clinicians');

// authValidation.js
const authValPath = path.join(projectRoot, 'src/utils/authValidation.js');
const authValCode = fs.readFileSync(authValPath, 'utf8');

assert(authValCode.includes('STUDENT_ID_REGEX = /^TUPM-[0-9]{2}-[0-9]{4}$/'), 'authValidation.js defines STUDENT_ID_REGEX');
assert(authValCode.includes('isValidStudentId'), 'authValidation.js exports isValidStudentId');

// -----------------------------------------------------------------------------
// Final Summary
// -----------------------------------------------------------------------------
console.log('\n=============================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('=============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL GOAL 41 VERIFICATION CHECKS PASSED!\n');
}

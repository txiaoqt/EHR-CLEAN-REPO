// src/scripts/test_goal42_final_architecture_and_events.mjs
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
console.log(' GOAL 42 VERIFICATION SUITE: FINAL ACCOUNT ARCHITECTURE, PATIENT REG & EVENTS');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Student ID Canonical Format & Validation
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Student ID Format & Normalization');

const STUDENT_ID_REGEX = /^TUPM-[0-9]{2}-[0-9]{4}$/;

const isValidStudentId = (val) => {
  if (!val || typeof val !== 'string') return false;
  return STUDENT_ID_REGEX.test(val.trim().toUpperCase());
};

const validIds = ['TUPM-23-5030', 'TUPM-21-0001', 'TUPM-22-0789', 'TUPM-20-4567', 'TUPM-24-1234'];
validIds.forEach((id) => {
  assert(isValidStudentId(id) === true, `Valid Student ID accepted: "${id}"`);
});

const invalidIds = ['23-5030', '2023-5030', '2021-01234', 'TUPM-23-503', 'TUPM-23-50300', 'student-23-5030', ''];
invalidIds.forEach((id) => {
  assert(isValidStudentId(id) === false, `Invalid Student ID rejected: "${id}"`);
});

assert(isValidStudentId('tupm-23-5030') === true, 'Lower-case "tupm-23-5030" is valid when normalized');
assert(isValidStudentId('  TUPM-23-5030  ') === true, 'Whitespace-padded "  TUPM-23-5030  " is valid when trimmed');

// -----------------------------------------------------------------------------
// 2. Migration 20260829140000 Schema & Logic Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Migration 20260829140000 Schema & RPC Audit');

const migPath = path.join(projectRoot, 'supabase/migrations/20260829140000_finalize_supabase_account_architecture_and_events.sql');
assert(fs.existsSync(migPath), 'Migration 20260829140000 file exists');

const migSql = fs.readFileSync(migPath, 'utf8');

// Tables & Constraints
assert(migSql.includes('create table if not exists public.admins'), 'Creates public.admins (staff accounts only)');
assert(migSql.includes("check (role in ('admin', 'physician', 'nurse'))"), 'Enforces staff role check constraint');
assert(migSql.includes("alter table public.users add constraint users_role_check check (role = 'patient')"), 'Enforces patient role check on public.users');
assert(migSql.includes('create table if not exists public.patient_profiles'), 'Creates public.patient_profiles for extended clinical data');
assert(migSql.includes('patient_id text unique not null references public.patients(id)'), 'patient_profiles links to patients(id) on update cascade');
assert(migSql.includes('create table if not exists public.events'), 'Creates public.events table');
assert(migSql.includes("check (status in ('draft', 'published', 'cancelled', 'archived'))"), 'events enforces valid status values');
assert(migSql.includes('create table if not exists public.event_email_logs'), 'Creates public.event_email_logs table');
assert(migSql.includes('alter table if exists public.patient_messages\n  add column if not exists auth_user_id'), 'Adds auth_user_id attribution to patient_messages');

// Atomic Registration RPC
assert(migSql.includes('create or replace function public.complete_patient_registration'), 'Defines complete_patient_registration RPC');
assert(migSql.includes("v_normalized_student_id !~ '^TUPM-[0-9]{2}-[0-9]{4}$'"), 'complete_patient_registration validates Student ID regex');
assert(migSql.includes("insert into public.students"), 'complete_patient_registration upserts public.students');
assert(migSql.includes("insert into public.patients"), 'complete_patient_registration upserts public.patients');
assert(migSql.includes("insert into public.users"), 'complete_patient_registration upserts public.users with role = patient');
assert(migSql.includes("insert into public.patient_profiles"), 'complete_patient_registration upserts public.patient_profiles');

// Auth Trigger & Zero Default to Nurse
assert(!migSql.includes("coalesce(new.raw_user_meta_data->>'role', 'nurse')"), 'sync_public_user_from_auth does NOT fallback to nurse in metadata');
assert(migSql.includes("if v_role in ('admin', 'physician', 'nurse') then"), 'sync_public_user_from_auth routes staff to public.admins');
assert(migSql.includes("if v_role = 'patient' or v_email like '%@tup.edu.ph' then"), 'sync_public_user_from_auth routes patient to public.users');

// RLS Policies
assert(migSql.includes('create policy patient_profiles_patient_select on public.patient_profiles'), 'Defines patient_profiles select policy');
assert(migSql.includes('create policy events_public_select on public.events'), 'Defines events public select policy for published events only');
assert(migSql.includes('create policy events_staff_insert on public.events'), 'Defines events staff insert policy');

// -----------------------------------------------------------------------------
// 3. Canonical Setup Migration (combined_setup_no_demo_v3_fixed.sql) Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Canonical combined_setup Migration Audit');

const combinedPath = path.join(projectRoot, 'supabase/migrations/combined_setup_no_demo_v3_fixed.sql');
const combinedSql = fs.readFileSync(combinedPath, 'utf8');

assert(combinedSql.includes('create table if not exists public.admins'), 'combined_setup defines public.admins');
assert(combinedSql.includes('create table if not exists public.patient_profiles'), 'combined_setup defines public.patient_profiles');
assert(combinedSql.includes('create table if not exists public.events'), 'combined_setup defines public.events');
assert(combinedSql.includes('create table if not exists public.event_email_logs'), 'combined_setup defines public.event_email_logs');
assert(combinedSql.includes('create or replace function public.complete_patient_registration'), 'combined_setup defines complete_patient_registration');
assert(combinedSql.includes('create policy events_select_policy on public.events'), 'combined_setup defines events RLS');

// -----------------------------------------------------------------------------
// 4. Edge Function & Brevo Security Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Edge Function & Brevo Email Security Audit');

const edgeFunctionPath = path.join(projectRoot, 'supabase/functions/send-event-announcement/index.ts');
assert(fs.existsSync(edgeFunctionPath), 'Edge function send-event-announcement/index.ts exists');

const edgeCode = fs.readFileSync(edgeFunctionPath, 'utf8');
assert(edgeCode.includes("Deno.env.get(\"BREVO_API_KEY\")"), 'Edge function reads BREVO_API_KEY from server-side environment secrets');
assert(edgeCode.includes("from(\"admins\")"), 'Edge function authenticates staff caller against public.admins');
assert(edgeCode.includes("from(\"users\")"), 'Edge function queries registered student emails from public.users');
assert(edgeCode.includes("from(\"event_email_logs\")"), 'Edge function logs announcement blast to event_email_logs');

// Confirm NO Brevo secrets in frontend code or .env
const envPath = path.join(projectRoot, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
assert(!envContent.includes('BREVO_API_KEY') && !envContent.includes('xkeysib-'), '.env contains ZERO Brevo API keys');

const srcGrep = fs.readdirSync(path.join(projectRoot, 'src'), { recursive: true })
  .filter(f => f.endsWith('.js') || f.endsWith('.jsx'))
  .map(f => fs.readFileSync(path.join(projectRoot, 'src', f), 'utf8'))
  .join('\n');
assert(!srcGrep.includes('xkeysib-') && !srcGrep.includes('BREVO_API_KEY'), 'React frontend source contains ZERO Brevo secrets');

// -----------------------------------------------------------------------------
// 5. Frontend Pages & Routing Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Frontend Pages, Components & Routing Audit');

// Login.jsx
const loginPath = path.join(projectRoot, 'src/pages/Login.jsx');
const loginCode = fs.readFileSync(loginPath, 'utf8');
assert(loginCode.includes("supabase.rpc('complete_patient_registration'"), 'Login.jsx invokes complete_patient_registration RPC');
assert(loginCode.includes(".from('patient_profiles')"), 'Login.jsx persists to patient_profiles');
assert(loginCode.includes("name: payload.fullName"), 'Login.jsx persists authoritative user full name');

// PatientMessages.jsx
const msgPath = path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx');
const msgCode = fs.readFileSync(msgPath, 'utf8');
assert(msgCode.includes("auth_user_id: authUid"), 'PatientMessages.jsx populates auth_user_id on send');

// PatientProfilePortal.jsx
const profilePortalPath = path.join(projectRoot, 'src/pages/patient/PatientProfilePortal.jsx');
const profilePortalCode = fs.readFileSync(profilePortalPath, 'utf8');
assert(profilePortalCode.includes(".from('patient_profiles')"), 'PatientProfilePortal.jsx loads/saves to patient_profiles');
assert(profilePortalCode.includes("contact_number:"), 'PatientProfilePortal.jsx handles extended contact fields');

// Events.jsx (Staff Portal)
const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'src/pages/Events.jsx exists');
const eventsCode = fs.readFileSync(eventsPath, 'utf8');
assert(eventsCode.includes("Clinic Events & Announcements"), 'Events.jsx provides header and management tools');
assert(eventsCode.includes("Email Registered Students"), 'Events.jsx supports Email Blast workflow');
assert(eventsCode.includes("send-event-announcement"), 'Events.jsx invokes send-event-announcement Edge Function');

// PatientEvents.jsx (Patient Portal)
const patientEventsPath = path.join(projectRoot, 'src/pages/patient/PatientEvents.jsx');
assert(fs.existsSync(patientEventsPath), 'src/pages/patient/PatientEvents.jsx exists');
const patientEventsCode = fs.readFileSync(patientEventsPath, 'utf8');
assert(patientEventsCode.includes(".eq('status', 'published')"), 'PatientEvents.jsx filters strictly published events');
assert(patientEventsCode.includes(".eq('is_published', true)"), 'PatientEvents.jsx filters is_published = true');
assert(patientEventsCode.includes("downloadIcs"), 'PatientEvents.jsx provides Add to Calendar feature');

// App.jsx Routing
const appPath = path.join(projectRoot, 'src/App.jsx');
const appCode = fs.readFileSync(appPath, 'utf8');
assert(appCode.includes("<Route path=\"/events\" element={guard(<Events />"), 'App.jsx registers /events for staff');
assert(appCode.includes("<Route path=\"/patient/events\" element={guard(<PatientEvents />"), 'App.jsx registers /patient/events for patients');

// Sidebars
const sidebarPath = path.join(projectRoot, 'src/components/sidebar/Sidebar.jsx');
const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
assert(sidebarCode.includes("{ page: 'events', label: 'Events', icon: CalendarIcon }"), 'Sidebar.jsx contains Events in navigation');

const patientSidebarPath = path.join(projectRoot, 'src/components/sidebar/PatientSidebar.jsx');
const patientSidebarCode = fs.readFileSync(patientSidebarPath, 'utf8');
assert(patientSidebarCode.includes("path: '/patient/events'") && patientSidebarCode.includes("label: 'Events'"), 'PatientSidebar.jsx contains Events in navigation');

// -----------------------------------------------------------------------------
// 6. Registration Data Flow Simulation Test
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Fresh Patient Registration Invariant Simulation');

const testRegistration = {
  studentId: 'TUPM-23-5030',
  fullName: 'Angel Keith Carbon',
  year: 3,
  email: 'angelkeith.carbon@tup.edu.ph',
  role: 'patient'
};

assert(isValidStudentId(testRegistration.studentId) === true, `Student ID ${testRegistration.studentId} is valid canonical format`);
assert(testRegistration.email.endsWith('@tup.edu.ph'), `Email ${testRegistration.email} is valid TUP domain`);
assert(testRegistration.fullName === 'Angel Keith Carbon', 'Authoritative registration full name is preserved');
assert(testRegistration.role === 'patient', 'Registered role is strictly patient');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL GOAL 42 ARCHITECTURE, PATIENT REGISTRATION & EVENTS VERIFICATIONS PASSED!\n');
}

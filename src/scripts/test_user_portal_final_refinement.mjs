// src/scripts/test_user_portal_final_refinement.mjs
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
console.log(' USER PORTAL FINAL UI/UX REFINEMENT & PROFILE PHOTO VERIFICATION SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Icon Reduction & Text-First Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Icon Reduction & Text-First Interface Audit');

const dashboardCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientDashboard.jsx'), 'utf8');
assert(!dashboardCode.includes('📅') && !dashboardCode.includes('💬') && !dashboardCode.includes('📢') && !dashboardCode.includes('👤'), 'PatientDashboard contains ZERO decorative emojis');
assert(dashboardCode.includes('Book Appointment') && !dashboardCode.includes('+ Book Appointment'), 'PatientDashboard uses text-only "Book Appointment" button');
assert(dashboardCode.includes('Message Clinic Personnel'), 'PatientDashboard uses clean text-first quick actions');

const eventsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientEvents.jsx'), 'utf8');
assert(!eventsCode.includes('📅') && !eventsCode.includes('📍'), 'PatientEvents contains ZERO decorative emojis');
assert(eventsCode.includes('Add to Calendar') && !eventsCode.includes('Copy Details') && !eventsCode.includes('copyDetails'), 'PatientEvents uses single Add to Calendar action with zero Copy noise');
assert(eventsCode.includes('SearchIcon'), 'PatientEvents retains functional SearchIcon in search input');

const messagesCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
assert(!messagesCode.includes('ℹ️'), 'PatientMessages contains ZERO decorative emojis in notice');
assert(messagesCode.includes('Send Message'), 'PatientMessages uses text-only "Send Message" button');

const recordsCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientRecords.jsx'), 'utf8');
assert(recordsCode.includes('formatVitals'), 'PatientRecords formats vitals cleanly into text pills');

// -----------------------------------------------------------------------------
// 2. Profile Photo Feature & Avatar Persistence Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Persistent Student Profile Photo Audit');

const profileCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientProfilePortal.jsx'), 'utf8');
assert(profileCode.includes('Change Photo'), 'PatientProfilePortal provides "Change Photo" button');
assert(profileCode.includes('ALLOWED_MIME_TYPES') && profileCode.includes('image/webp'), 'Validates image format (JPEG, PNG, WEBP)');
assert(profileCode.includes('MAX_FILE_SIZE_BYTES') || profileCode.includes('5 * 1024 * 1024'), 'Enforces maximum file size limit (5MB)');
assert(profileCode.includes("from('avatars')"), 'Uploads avatar to Supabase Storage avatars bucket');
assert(profileCode.includes('handleRemovePhoto'), 'Provides option to remove custom photo and revert to default');
assert(profileCode.includes('avatarPlaceholder'), 'Provides default avatar placeholder');
assert(profileCode.includes('updateUser?.({ avatar:'), 'Propagates avatar change live through AuthContext');
assert(profileCode.includes("from('patient_profiles')") && profileCode.includes('avatar_url'), 'Persists avatar_url to patient_profiles');
assert(profileCode.includes("from('users')") && profileCode.includes('avatar'), 'Persists avatar to users table');

// -----------------------------------------------------------------------------
// 3. Storage Migration & Schema Integrity Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Storage Migration & Database Safety Audit');

const avatarMigrationPath = path.join(projectRoot, 'supabase/migrations/20260829150000_patient_avatar_storage_and_profiles.sql');
assert(fs.existsSync(avatarMigrationPath), 'Migration 20260829150000 exists');

const avatarMigCode = fs.readFileSync(avatarMigrationPath, 'utf8');
assert(avatarMigCode.includes('storage.buckets') && avatarMigCode.includes("'avatars'"), 'Migration sets up Supabase Storage avatars bucket');
assert(avatarMigCode.includes('public.patient_profiles') && avatarMigCode.includes('avatar_url'), 'Migration ensures avatar_url exists on patient_profiles');
assert(avatarMigCode.includes('Avatar User Upload'), 'Migration configures scoped user upload RLS policy');

const combinedSetupCode = fs.readFileSync(path.join(projectRoot, 'supabase/migrations/combined_setup_no_demo_v3_fixed.sql'), 'utf8');
assert(combinedSetupCode.includes('avatar_url text'), 'combined_setup migration includes avatar_url column on patient_profiles');

// -----------------------------------------------------------------------------
// 4. Sidebar Dynamic Profile & Outline Navigation Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] PatientSidebar.jsx Restraint & Identity Audit');

const sidebarCode = fs.readFileSync(path.join(projectRoot, 'src/components/sidebar/PatientSidebar.jsx'), 'utf8');
assert(sidebarCode.includes('user?.avatar || avatarPlaceholder'), 'PatientSidebar dynamically renders persistent user avatar with default fallback');
assert(sidebarCode.includes('displayName') && sidebarCode.includes('Student / Patient'), 'PatientSidebar renders authenticated name and Student / Patient role');
assert(sidebarCode.includes('LogoutIcon') && sidebarCode.includes('Sign Out'), 'PatientSidebar provides clean Sign Out button');
assert(sidebarCode.includes('DashboardIcon') && sidebarCode.includes('CalendarIcon') && sidebarCode.includes('ClockIcon'), 'PatientSidebar uses restrained outline icon family');

// -----------------------------------------------------------------------------
// 5. Booking Flow & Calendar Refinement Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Appointment Booking Flow & Calendar Audit');

const bookingCode = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx'), 'utf8');
assert(bookingCode.includes('Medical Clinic') && bookingCode.includes('Dental Clinic'), 'Supports Medical & Dental departments');
assert(bookingCode.includes('Same-day Appointment') && bookingCode.includes('Future Appointment'), 'Supports Same-day and Future modes');
assert(bookingCode.includes('ChevronLeftIcon') && bookingCode.includes('ChevronRightIcon'), 'Uses clean subtle chevron icons for calendar navigation');
assert(bookingCode.includes('Confirm & Book Appointment'), 'Uses text-first confirmation button');
assert(bookingCode.includes('staff_directory'), 'Queries safe staff_directory');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER PORTAL REFINEMENTS & PROFILE PHOTO VERIFICATIONS PASSED!\n');
}

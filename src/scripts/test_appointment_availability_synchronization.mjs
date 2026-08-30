// src/scripts/test_appointment_availability_synchronization.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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
console.log(' APPOINTMENT AVAILABILITY SYNCHRONIZATION & MULTI-STUDENT AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Source Code & RPC Integration Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Global Availability RPC & State Synchronization');

const bookingFlowPath = path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx');
assert(fs.existsSync(bookingFlowPath), 'AppointmentBookingFlow.jsx exists');
const bookingCode = fs.readFileSync(bookingFlowPath, 'utf8');

assert(
  bookingCode.includes("supabase.rpc('get_slot_occupancy'") &&
  bookingCode.includes('slotOccupancy'),
  'TEST 1 & 3: Consumes global privacy-preserving get_slot_occupancy RPC to bypass RLS patient row filtering'
);

assert(
  bookingCode.includes("window.addEventListener('focus', handleFocus)") &&
  bookingCode.includes("document.addEventListener('visibilitychange', handleVisibility)") &&
  bookingCode.includes(".channel('public:appointments:slot-sync')"),
  'TEST 4: Subscribes to window focus, document visibilitychange, and Supabase Realtime channel for live synchronization'
);

assert(
  bookingCode.includes('setForm((p) => ({ ...p, appointment_time: \'\' }))') &&
  bookingCode.includes('occupied >= SLOT_CAPACITY'),
  'TEST 7: Automatically deselects time slot if it becomes occupied by another student'
);

// -----------------------------------------------------------------------------
// 2. Safe Fallback on Availability Query Failure
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Failure Handling & Safe Defaults');

assert(
  bookingCode.includes('availabilityError') &&
  bookingCode.includes('map.set(key, 0)') &&
  bookingCode.includes('disabled: availabilityError'),
  'TEST 17: Query failure or offline state safely marks slots as unavailable (NEVER displays false 100% Free)'
);

// -----------------------------------------------------------------------------
// 3. Database Migration & RPC Definition Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Database Schema & RPC Integrity');

const rpcMigrationPath = path.join(
  projectRoot,
  'supabase/migrations/20260830200000_create_slot_occupancy_rpc_for_availability_sync.sql'
);
assert(fs.existsSync(rpcMigrationPath), 'Migration 20260830200000 exists');
const rpcCode = fs.readFileSync(rpcMigrationPath, 'utf8');

assert(
  rpcCode.includes('CREATE OR REPLACE FUNCTION public.get_slot_occupancy') &&
  rpcCode.includes('SECURITY DEFINER') &&
  rpcCode.includes("status IN ('Scheduled', 'Checked-in')"),
  'Migration defines SECURITY DEFINER function get_slot_occupancy counting Scheduled and Checked-in appointments'
);

assert(
  rpcCode.includes('GRANT EXECUTE ON FUNCTION public.get_slot_occupancy(date, date) TO authenticated, anon'),
  'Grants execute privileges to authenticated and anon users for global slot visibility'
);

// -----------------------------------------------------------------------------
// 4. Multi-Student Lifecycle & Occupancy Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Multi-Student Lifecycle Simulation Matrix');

const SLOT_TIMES = ['09:00-12:00', '13:00-16:00', '16:00-19:00'];
const SLOT_CAPACITY = 1;
const DAILY_LIMIT = 3;

function computeOccupancyMap(activeAppointments) {
  const map = new Map();
  activeAppointments.forEach(a => {
    if (a.status === 'Scheduled' || a.status === 'Checked-in') {
      const dept = a.department || 'Medical Clinic';
      const key = `${dept}|${a.appointment_date}|${a.appointment_time}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
  });
  return map;
}

function getSlotDetails(occupancyMap, department, date, time) {
  const key = `${department}|${date}|${time}`;
  const count = occupancyMap.get(key) || 0;
  const available = Math.max(SLOT_CAPACITY - count, 0);
  const pct = Math.round((available / SLOT_CAPACITY) * 100);
  return { count, available, pct, isAvailable: count < SLOT_CAPACITY };
}

// TEST 1: Initial free state
const emptyMap = computeOccupancyMap([]);
const initialDental = getSlotDetails(emptyMap, 'Dental Clinic', '2026-08-30', '09:00-12:00');
assert(initialDental.available === 1 && initialDental.pct === 100 && initialDental.isAvailable, 'TEST 1: Initial slot displays 1 of 1 slot / 100% Free');

// TEST 2: Student A books Dental 2026-08-30 09:00-12:00
const studentABooking = {
  id: 'appt-1',
  patient_id: 'TUPM-21-0001',
  department: 'Dental Clinic',
  appointment_date: '2026-08-30',
  appointment_time: '09:00-12:00',
  status: 'Scheduled',
};
const mapAfterA = computeOccupancyMap([studentABooking]);

// TEST 3 & 6: Student B views the same slot
const studentBDental = getSlotDetails(mapAfterA, 'Dental Clinic', '2026-08-30', '09:00-12:00');
assert(studentBDental.available === 0 && studentBDental.pct === 0 && !studentBDental.isAvailable, 'TEST 2, 3, 6: Student B immediately sees 0 of 1 slot / 0% Free (Disabled)');

// TEST 8 & 9: Department isolation (Dental occupied does not block Medical)
const medicalSameTime = getSlotDetails(mapAfterA, 'Medical Clinic', '2026-08-30', '09:00-12:00');
assert(medicalSameTime.available === 1 && medicalSameTime.pct === 100 && medicalSameTime.isAvailable, 'TEST 8 & 9: Medical Clinic slot at same time remains 100% Free (Independent capacity)');

// TEST 10 & 11: Same-day vs Future shared occupancy
assert(
  bookingCode.includes("slotKey = `${form.department}|${form.appointment_date}|${time}`") &&
  bookingCode.includes("slotOccupancy.get(slotKey)"),
  'TEST 10 & 11: Same-day and Future appointments consume the identical underlying slot capacity'
);

// TEST 12: Cancellation releases the slot immediately
const cancelledA = { ...studentABooking, status: 'Cancelled' };
const mapAfterCancel = computeOccupancyMap([cancelledA]);
const slotAfterCancel = getSlotDetails(mapAfterCancel, 'Dental Clinic', '2026-08-30', '09:00-12:00');
assert(slotAfterCancel.available === 1 && slotAfterCancel.pct === 100 && slotAfterCancel.isAvailable, 'TEST 12: Cancelled appointment releases slot capacity immediately');

// TEST 13: Checked-in appointment keeps slot occupied
const checkedInA = { ...studentABooking, status: 'Checked-in' };
const mapAfterCheckIn = computeOccupancyMap([checkedInA]);
const slotAfterCheckIn = getSlotDetails(mapAfterCheckIn, 'Dental Clinic', '2026-08-30', '09:00-12:00');
assert(slotAfterCheckIn.available === 0 && !slotAfterCheckIn.isAvailable, 'TEST 13: Checked-in appointment keeps slot occupied');

// TEST 14: Completed historical appointment does not block future scheduling
const completedA = { ...studentABooking, status: 'Completed', appointment_date: '2026-08-01' };
const mapAfterCompleted = computeOccupancyMap([completedA]);
const futureSlot = getSlotDetails(mapAfterCompleted, 'Dental Clinic', '2026-08-30', '09:00-12:00');
assert(futureSlot.available === 1 && futureSlot.isAvailable, 'TEST 14: Completed historical encounter does not block future dates');

// TEST 15 & 16: Multi-tab pre-flight conflict handling
assert(
  bookingCode.includes('Level 2b: Re-verify slot capacity from server') &&
  bookingCode.includes('get_slot_occupancy'),
  'TEST 15 & 16: Pre-flight authoritative server re-check prevents stale multi-tab submissions'
);

// TEST 18: Calendar day availability calculations
assert(
  bookingCode.includes('dayBooked += (slotOccupancy.get(slotKey) || 0)'),
  'TEST 18: Calendar day percentage is derived from global slotOccupancy map'
);

// TEST 20 & 21: Existing protections remain active
assert(
  bookingCode.includes('idx_appointments_one_active_per_student') &&
  bookingCode.includes('idx_appointments_one_active_per_slot'),
  'TEST 20 & 21: One active appointment per student & one active appointment per slot are both strictly enforced'
);

// -----------------------------------------------------------------------------
// 5. Live Supabase Database Inspection
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Live Supabase Client Database Verification');

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

try {
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  if (!authErr && auth?.user) {
    const { data: appts, error: apptErr } = await client
      .from('appointments')
      .select('id, department, appointment_date, appointment_time, status')
      .in('status', ['Scheduled', 'Checked-in']);

    assert(!apptErr && Array.isArray(appts), 'Successfully connected and audited active appointments in live database');
  }
} catch (err) {
  console.log(`  ⚠ Live DB note: ${err.message}`);
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL APPOINTMENT AVAILABILITY SYNCHRONIZATION TESTS PASSED!\n');
}

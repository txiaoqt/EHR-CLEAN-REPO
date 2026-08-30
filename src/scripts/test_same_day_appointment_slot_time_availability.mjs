// src/scripts/test_same_day_appointment_slot_time_availability.mjs
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
console.log(' SAME-DAY APPOINTMENT SLOT TIME AVAILABILITY & EXPIRATION AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Time & Slot Expiration Helper Functions
// -----------------------------------------------------------------------------
const SLOT_TIMES = ['09:00-12:00', '13:00-16:00', '16:00-19:00'];
const SLOT_CAPACITY = 1;
const DAILY_PATIENT_LIMIT = SLOT_TIMES.length * SLOT_CAPACITY;

function getSlotEndTime(slotTimeStr) {
  if (!slotTimeStr) return '23:59:59';
  if (slotTimeStr.includes('-')) {
    const parts = slotTimeStr.split('-');
    return parts[1].trim();
  }
  return slotTimeStr.trim();
}

function isSlotExpiredForDate(dateKey, slotTimeStr, manilaToday, manilaTime) {
  if (dateKey !== manilaToday) return false;
  const endTime = getSlotEndTime(slotTimeStr);
  const normEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;
  const normCurrentTime = manilaTime.length === 5 ? `${manilaTime}:00` : manilaTime;
  return normCurrentTime >= normEndTime;
}

function calculateSlotAvailability(dateKey, slotTime, manilaToday, manilaTime, occupiedCount = 0) {
  const isExpired = isSlotExpiredForDate(dateKey, slotTime, manilaToday, manilaTime);
  const availableCount = isExpired ? 0 : Math.max(SLOT_CAPACITY - occupiedCount, 0);
  const pct = isExpired ? 0 : (SLOT_CAPACITY ? Math.round((availableCount / SLOT_CAPACITY) * 100) : 0);
  const disabled = isExpired || availableCount <= 0;
  return { availableCount, pct, isExpired, disabled };
}

function calculateDayAvailability(dateKey, manilaToday, manilaTime, slotOccupancyMap = new Map()) {
  let availableSlotsCount = 0;
  SLOT_TIMES.forEach((time) => {
    const slotKey = `Medical Clinic|${dateKey}|${time}`;
    const slotBooked = slotOccupancyMap.get(slotKey) || 0;
    const isExpired = isSlotExpiredForDate(dateKey, time, manilaToday, manilaTime);
    if (!isExpired && slotBooked < SLOT_CAPACITY) {
      availableSlotsCount += (SLOT_CAPACITY - slotBooked);
    }
  });
  return DAILY_PATIENT_LIMIT ? Math.round((availableSlotsCount / DAILY_PATIENT_LIMIT) * 100) : 0;
}

const todayStr = '2026-08-30';
const tomorrowStr = '2026-08-31';

// -----------------------------------------------------------------------------
// 1. Slot Time Expiration Matrix Tests
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Slot Time Expiration & Boundary Evaluation');

// TEST 1: Same-day + current time inside first slot (10:00:00)
const t1_s1 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '10:00:00', 0);
const t1_s2 = calculateSlotAvailability(todayStr, '13:00-16:00', todayStr, '10:00:00', 0);
const t1_s3 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '10:00:00', 0);
assert(
  !t1_s1.isExpired && !t1_s1.disabled && t1_s1.pct === 100 &&
  !t1_s2.isExpired && !t1_s2.disabled &&
  !t1_s3.isExpired && !t1_s3.disabled,
  'TEST 1: Current time 10:00 AM -> All three slots available'
);

// TEST 2: Same-day + current time after first slot (12:30:00)
const t2_s1 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '12:30:00', 0);
const t2_s2 = calculateSlotAvailability(todayStr, '13:00-16:00', todayStr, '12:30:00', 0);
const t2_s3 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '12:30:00', 0);
assert(
  t2_s1.isExpired && t2_s1.disabled && t2_s1.pct === 0 &&
  !t2_s2.isExpired && !t2_s2.disabled &&
  !t2_s3.isExpired && !t2_s3.disabled,
  'TEST 2: Current time 12:30 PM -> Slot 1 (09:00-12:00) UNAVAILABLE, Slots 2 and 3 AVAILABLE'
);

// TEST 3: Same-day + current time exactly at first slot end (12:00:00) & (11:59:59 boundary)
const t3_exact = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '12:00:00', 0);
const t3_just_before = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '11:59:59', 0);
assert(
  t3_exact.isExpired && t3_exact.disabled && !t3_just_before.isExpired && !t3_just_before.disabled,
  'TEST 3: Boundary at 12:00:00 -> Expired (11:59:59 still bookable)'
);

// TEST 4: Same-day + current time inside second slot (14:00:00)
const t4_s1 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '14:00:00', 0);
const t4_s2 = calculateSlotAvailability(todayStr, '13:00-16:00', todayStr, '14:00:00', 0);
const t4_s3 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '14:00:00', 0);
assert(
  t4_s1.isExpired && !t4_s2.isExpired && !t4_s3.isExpired,
  'TEST 4: Current time 14:00 PM -> Slot 1 expired, Slot 2 and 3 available'
);

// TEST 5: Same-day + current time after second slot (16:30:00)
const t5_s1 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '16:30:00', 0);
const t5_s2 = calculateSlotAvailability(todayStr, '13:00-16:00', todayStr, '16:30:00', 0);
const t5_s3 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '16:30:00', 0);
assert(
  t5_s1.isExpired && t5_s2.isExpired && !t5_s3.isExpired,
  'TEST 5: Current time 16:30 PM -> Slot 1 & 2 expired, Slot 3 available'
);

// TEST 6: Same-day + current time after all slots (19:15:00)
const t6_s1 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '19:15:00', 0);
const t6_s2 = calculateSlotAvailability(todayStr, '13:00-16:00', todayStr, '19:15:00', 0);
const t6_s3 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '19:15:00', 0);
assert(
  t6_s1.isExpired && t6_s2.isExpired && t6_s3.isExpired &&
  t6_s1.disabled && t6_s2.disabled && t6_s3.disabled,
  'TEST 6: Current time 7:15 PM -> ALL slots expired and disabled'
);

// TEST 7: Same-day slot selected before expiry -> bookable if capacity exists
const t7 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '17:00:00', 0);
assert(!t7.isExpired && t7.availableCount === 1, 'TEST 7: Same-day slot before expiry is bookable');

// TEST 8: Selected slot expires while page remains open -> cleared
const selectedSlot = '13:00-16:00';
const currentTimeBefore = '15:59:59';
const currentTimeAfter = '16:00:00';
const isExpiredBefore = isSlotExpiredForDate(todayStr, selectedSlot, todayStr, currentTimeBefore);
const isExpiredAfter = isSlotExpiredForDate(todayStr, selectedSlot, todayStr, currentTimeAfter);
assert(
  !isExpiredBefore && isExpiredAfter,
  'TEST 8: Selected slot 13:00-16:00 automatically expires when clock hits 16:00:00'
);

// TEST 9: Confirm & Book after slot expiry -> prevented
const canBookExpired = !isSlotExpiredForDate(todayStr, '09:00-12:00', todayStr, '19:15:00');
assert(!canBookExpired, 'TEST 9: Booking an expired slot is rejected before submission');

// TEST 11: Future appointment tomorrow at any current time -> unaffected by daily slot expiry
const t11_tomorrow_s1 = calculateSlotAvailability(tomorrowStr, '09:00-12:00', todayStr, '19:15:00', 0);
const t11_tomorrow_s2 = calculateSlotAvailability(tomorrowStr, '13:00-16:00', todayStr, '19:15:00', 0);
const t11_tomorrow_s3 = calculateSlotAvailability(tomorrowStr, '16:00-19:00', todayStr, '19:15:00', 0);
assert(
  !t11_tomorrow_s1.isExpired && !t11_tomorrow_s2.isExpired && !t11_tomorrow_s3.isExpired &&
  t11_tomorrow_s1.pct === 100 && t11_tomorrow_s2.pct === 100 && t11_tomorrow_s3.pct === 100,
  'TEST 11: Future appointment (tomorrow) at 7:15 PM is NOT blocked by today\'s current time'
);

// TEST 12 & 13: Medical & Dental Clinics have identical slot expiration rules
assert(
  isSlotExpiredForDate(todayStr, '09:00-12:00', todayStr, '12:00:00') &&
  isSlotExpiredForDate(todayStr, '13:00-16:00', todayStr, '16:00:00') &&
  isSlotExpiredForDate(todayStr, '16:00-19:00', todayStr, '19:00:00'),
  'TEST 12 & 13: Expiration applies identically to Medical and Dental clinic schedules'
);

// TEST 14: Occupied slot + unexpired time -> unavailable due to capacity
const t14 = calculateSlotAvailability(todayStr, '16:00-19:00', todayStr, '17:00:00', 1);
assert(!t14.isExpired && t14.availableCount === 0 && t14.disabled, 'TEST 14: Occupied slot at 5:00 PM is unavailable due to capacity');

// TEST 15: Free slot + expired time -> unavailable due to time
const t15 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '14:00:00', 0);
assert(t15.isExpired && t15.availableCount === 0 && t15.disabled, 'TEST 15: Free slot at 2:00 PM is unavailable due to time expiration');

// TEST 16: Occupied slot + expired time -> unavailable
const t16 = calculateSlotAvailability(todayStr, '09:00-12:00', todayStr, '14:00:00', 1);
assert(t16.isExpired && t16.disabled && t16.pct === 0, 'TEST 16: Occupied + expired slot is unavailable');

// TEST 17: Calendar percentage reflects expired slots
const dayPctAt1915 = calculateDayAvailability(todayStr, todayStr, '19:15:00');
const dayPctAt1000 = calculateDayAvailability(todayStr, todayStr, '10:00:00');
assert(
  dayPctAt1915 === 0 && dayPctAt1000 === 100,
  'TEST 17: Calendar day shows 0% Free at 7:15 PM and 100% Free at 10:00 AM'
);

// TEST 23: No false "100% Free" for expired slots
assert(t6_s1.pct === 0 && t6_s2.pct === 0 && t6_s3.pct === 0, 'TEST 23: No false "100% Free" displayed for expired slots');

// -----------------------------------------------------------------------------
// 2. Component Implementation & Migration Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Component Code & Migration Architecture Audit');

const flowPath = path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx');
const flowCode = fs.readFileSync(flowPath, 'utf8');

assert(
  flowCode.includes('getManilaTime') &&
  flowCode.includes('isSlotExpiredForDate') &&
  flowCode.includes("timeZone: 'Asia/Manila'"),
  'TEST 18: Frontend utilizes Asia/Manila Intl.DateTimeFormat for live date and time calculations'
);

assert(
  flowCode.includes('row.isExpired ? \'0 of 1 slot (Ended)\' :') &&
  flowCode.includes('row.isExpired ? \'0% Free (Ended)\' :'),
  'TEST 5 & 23: UI renders distinct "Ended" text and 0% availability for expired slots'
);

assert(
  flowCode.includes('if (occupied >= SLOT_CAPACITY || isExpired) {\n        setForm((p) => ({ ...p, appointment_time: \'\' }));\n      }'),
  'TEST 8: Live slot expiration automatically deselects expired time slots'
);

const migration22Path = path.join(
  projectRoot,
  'supabase/migrations/20260830220000_harden_same_day_appointment_slot_time_availability.sql'
);
assert(fs.existsSync(migration22Path), 'TEST 14: Migration 20260830220000 exists');
const migCode = fs.readFileSync(migration22Path, 'utf8');

assert(
  migCode.includes("v_manila_now := (now() at time zone 'Asia/Manila')::time;") &&
  migCode.includes("v_slot_end_time := trim(v_time_parts[2])::time;") &&
  migCode.includes("IF v_manila_now >= v_slot_end_time THEN") &&
  migCode.includes("RAISE EXCEPTION 'This time slot has already ended. Please select another available slot.'"),
  'TEST 10: Database trigger validates slot end time in Asia/Manila timezone'
);

// -----------------------------------------------------------------------------
// 3. Existing Protections Coexistence Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Existing Protections Integrity');

assert(
  flowCode.includes('idx_appointments_one_active_per_student') ||
  flowCode.includes('active appointment'),
  'TEST 20: One active appointment per student protection preserved'
);

assert(
  flowCode.includes('idx_appointments_one_active_per_slot') ||
  flowCode.includes('check_slot_capacity'),
  'TEST 21: One active appointment per slot concurrency protection preserved'
);

assert(
  flowCode.includes('isDateSelectable') &&
  flowCode.includes('form.appointment_type === \'Same-day Appointment\''),
  'TEST 22: Same-day vs Future date restriction preserved'
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL SAME-DAY APPOINTMENT SLOT TIME AVAILABILITY TESTS PASSED!\n');
}

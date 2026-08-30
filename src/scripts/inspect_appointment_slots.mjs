// src/scripts/inspect_appointment_slots.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSlots() {
  console.log('=== AUDITING APPOINTMENTS FOR DUPLICATE ACTIVE SLOTS ===\n');

  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  const { data: appts, error: apptErr } = await client
    .from('appointments')
    .select('id, patient_id, patient_name, department, appointment_date, appointment_time, status, created_at')
    .order('appointment_date', { ascending: false });

  if (apptErr) {
    console.error('Fetch error:', apptErr);
    return;
  }

  console.log(`Total appointments in DB: ${appts?.length || 0}`);

  // Check active appointments
  const activeAppts = appts.filter(a => a.status === 'Scheduled' || a.status === 'Checked-in');
  console.log(`Total active (Scheduled / Checked-in) appointments: ${activeAppts.length}\n`);

  activeAppts.forEach(a => {
    console.log(`  - [${a.status}] Dept: ${a.department || 'Medical Clinic'} | Date: ${a.appointment_date} | Time: ${a.appointment_time} | Patient: ${a.patient_id} (${a.patient_name || 'N/A'})`);
  });

  // Check for duplicate active slots (department + appointment_date + appointment_time)
  const slotCounts = {};
  activeAppts.forEach(a => {
    const dept = a.department || 'Medical Clinic';
    const key = `${dept}|${a.appointment_date}|${a.appointment_time}`;
    slotCounts[key] = (slotCounts[key] || []);
    slotCounts[key].push(a);
  });

  const duplicateSlots = Object.entries(slotCounts).filter(([_, items]) => items.length > 1);

  console.log('\n--- DUPLICATE ACTIVE SLOTS AUDIT ---');
  if (duplicateSlots.length === 0) {
    console.log('Zero duplicate active slot bookings found! (0 collisions)');
  } else {
    console.log(`Found ${duplicateSlots.length} slot collisions:`);
    duplicateSlots.forEach(([slotKey, items]) => {
      console.log(`\nConflict in Slot: ${slotKey} (${items.length} active bookings):`);
      items.forEach(it => {
        console.log(`    * ID: ${it.id}, Patient: ${it.patient_id}, Status: ${it.status}, Created: ${it.created_at}`);
      });
    });
  }
}

inspectSlots();

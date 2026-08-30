// src/scripts/test_rls_and_slot_occupancy.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function testRls() {
  console.log('--- TESTING STUDENT APPOINTMENT VISIBILITY ---');

  // Let's test direct select as anon / unprivileged
  const { data: anonAppts, error: anonErr } = await client
    .from('appointments')
    .select('id, department, appointment_date, appointment_time, status, patient_id');

  console.log('Anon query result count:', anonAppts?.length, 'Error:', anonErr?.message);
  if (anonAppts) {
    console.log('Appointments returned:');
    anonAppts.forEach(a => console.log(`  - [${a.status}] ${a.department} ${a.appointment_date} ${a.appointment_time} (Patient: ${a.patient_id})`));
  }
}

testRls();

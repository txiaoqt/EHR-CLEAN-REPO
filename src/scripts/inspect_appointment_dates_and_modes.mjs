// src/scripts/inspect_appointment_dates_and_modes.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function inspectAppointments() {
  console.log('=== AUDITING APPOINTMENTS FOR DATE VS APPOINTMENT TYPE ===\n');

  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });

  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  const { data: appts, error: apptErr } = await client
    .from('appointments')
    .select('id, patient_id, patient_name, department, appointment_type, appointment_date, appointment_time, status, created_at')
    .order('created_at', { ascending: false });

  if (apptErr) {
    console.error('Fetch error:', apptErr);
    return;
  }

  console.log(`Total appointments in DB: ${appts?.length || 0}\n`);

  // Manila date now:
  const nowManila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  console.log(`Current Asia/Manila Date: ${nowManila}\n`);

  appts.forEach((a) => {
    const isSameDay = a.appointment_type === 'Same-day Appointment';
    const isFuture = a.appointment_type === 'Future Appointment';
    let flag = 'VALID';

    if (isSameDay && a.appointment_date !== nowManila) {
      flag = `HISTORICAL / MISMATCH (Same-day on ${a.appointment_date} vs Manila today ${nowManila})`;
    } else if (isFuture && a.appointment_date <= nowManila) {
      flag = `HISTORICAL / MISMATCH (Future on ${a.appointment_date} <= Manila today ${nowManila})`;
    }

    console.log(`  - ID: ${a.id} | [${a.status}] ${a.department} | Mode: "${a.appointment_type}" | Date: ${a.appointment_date} | Time: ${a.appointment_time} | Patient: ${a.patient_id} | Status: ${flag}`);
  });
}

inspectAppointments();

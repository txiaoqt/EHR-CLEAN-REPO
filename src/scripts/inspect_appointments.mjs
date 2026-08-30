import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function inspectAppointments() {
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  const { data, error } = await client
    .from('appointments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching appointments:', error);
    return;
  }

  console.log(`Found ${data.length} recent appointments:`);
  data.forEach((appt) => {
    console.log(`- ID: ${appt.id}, Patient: ${appt.patient_id} (${appt.patient_name}), Date: ${appt.appointment_date} ${appt.appointment_time}, Type: ${appt.appointment_type}, Status: ${appt.status}`);
  });
}

inspectAppointments();

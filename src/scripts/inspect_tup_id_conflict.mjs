import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function inspectDetail() {
  await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  const { data: users } = await client.from('users').select('*').eq('patient_id', 'TUPM-25-3232');
  console.log('Users for TUPM-25-3232:', JSON.stringify(users, null, 2));

  const { data: students } = await client.from('students').select('*').eq('id', 'TUPM-25-3232');
  console.log('Students for TUPM-25-3232:', JSON.stringify(students, null, 2));

  const { data: patients } = await client.from('patients').select('*').eq('id', 'TUPM-25-3232');
  console.log('Patients for TUPM-25-3232:', JSON.stringify(patients, null, 2));

  const { data: profiles } = await client.from('patient_profiles').select('*').eq('patient_id', 'TUPM-25-3232');
  console.log('Patient Profiles for TUPM-25-3232:', JSON.stringify(profiles, null, 2));
}

inspectDetail();

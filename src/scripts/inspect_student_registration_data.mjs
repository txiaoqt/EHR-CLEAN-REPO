// src/scripts/inspect_student_registration_data.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function inspectData() {
  console.log('=== AUDITING STUDENT REGISTRATION DATA & DUPLICATE TUP IDs ===\n');

  // Authenticate as physician to read tables under RLS
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  // 1. Query public.students
  const { data: students, error: sErr } = await client.from('students').select('*').order('id');
  console.log(`[students] Total count: ${students?.length || 0}`);
  students?.forEach((s) => console.log(`  - Student ID: ${s.id}, Name: ${s.name}, Year: ${s.year}`));

  // Check for duplicate IDs in students
  const studentIdCounts = {};
  students?.forEach((s) => {
    studentIdCounts[s.id] = (studentIdCounts[s.id] || 0) + 1;
  });
  const dupStudents = Object.entries(studentIdCounts).filter(([_, count]) => count > 1);
  console.log(`Duplicate IDs in public.students: ${dupStudents.length === 0 ? 'None (0)' : JSON.stringify(dupStudents)}`);

  // 2. Query public.patients
  const { data: patients, error: pErr } = await client.from('patients').select('id, name, year').order('id');
  console.log(`\n[patients] Total count: ${patients?.length || 0}`);
  patients?.forEach((p) => console.log(`  - Patient ID: ${p.id}, Name: ${p.name}, Year: ${p.year}`));

  // 3. Query public.users (role = 'patient')
  const { data: users, error: uErr } = await client.from('users').select('id, auth_user_id, name, email, role, patient_id, student_id').order('email');
  console.log(`\n[users (patients)] Total count: ${users?.length || 0}`);
  users?.forEach((u) => console.log(`  - User: ${u.email}, Name: ${u.name}, patient_id: ${u.patient_id}, student_id: ${u.student_id}, auth_uid: ${u.auth_user_id}`));

  // Check for duplicate patient_id in users
  const userPatientIdCounts = {};
  users?.filter(u => u.patient_id)?.forEach((u) => {
    userPatientIdCounts[u.patient_id] = (userPatientIdCounts[u.patient_id] || 0) + 1;
  });
  const dupUserPatientIds = Object.entries(userPatientIdCounts).filter(([_, count]) => count > 1);
  console.log(`Duplicate patient_id in public.users: ${dupUserPatientIds.length === 0 ? 'None (0)' : JSON.stringify(dupUserPatientIds)}`);

  // 4. Query public.patient_profiles
  const { data: profiles, error: profErr } = await client.from('patient_profiles').select('id, patient_id, student_id, full_name, email, year').order('patient_id');
  console.log(`\n[patient_profiles] Total count: ${profiles?.length || 0}`);
  profiles?.forEach((pr) => console.log(`  - Profile: patient_id: ${pr.patient_id}, student_id: ${pr.student_id}, Full Name: ${pr.full_name}, Email: ${pr.email}`));

  const profilePatientIdCounts = {};
  profiles?.forEach((pr) => {
    profilePatientIdCounts[pr.patient_id] = (profilePatientIdCounts[pr.patient_id] || 0) + 1;
  });
  const dupProfilePatientIds = Object.entries(profilePatientIdCounts).filter(([_, count]) => count > 1);
  console.log(`Duplicate patient_id in public.patient_profiles: ${dupProfilePatientIds.length === 0 ? 'None (0)' : JSON.stringify(dupProfilePatientIds)}`);
}

inspectData();

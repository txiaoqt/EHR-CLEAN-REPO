import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function inspectData() {
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  if (authError) {
    console.error('Auth error:', authError);
    return;
  }
  console.log('Logged in as:', authData.user.email);

  const todayIso = new Date().toISOString().split('T')[0];
  const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log('\n--- DASHBOARD QUERIES ---');
  console.log('todayIso:', todayIso, 'tomorrowIso:', tomorrowIso);

  const [
    checkedInRes,
    encTodayRes,
    futureApptsRes,
    patientsCountRes,
    recentEncRes,
    visitsRes,
    complaintsRes,
    allAppts,
    allEncounters,
    allPatients,
    allStudents,
    allInventory
  ] = await Promise.all([
    client.from('appointments').select('*').eq('appointment_date', todayIso).eq('status', 'Checked-in'),
    client.from('encounters').select('*', { head: true, count: 'exact' }).gte('encounter_date', todayIso).lt('encounter_date', tomorrowIso),
    client.from('appointments').select('*', { head: true, count: 'exact' }).gt('appointment_date', todayIso).eq('status', 'Scheduled'),
    client.from('students').select('*', { head: true, count: 'exact' }),
    client.from('encounters').select('*').order('created_at', { ascending: false }).limit(6),
    client.from('encounters').select('encounter_date'),
    client.from('encounters').select('chief_complaint').not('chief_complaint', 'is', null),
    client.from('appointments').select('*'),
    client.from('encounters').select('*'),
    client.from('patients').select('*'),
    client.from('students').select('*'),
    client.from('inventory').select('*')
  ]);

  console.log('1. Checked-in Today appointments:', checkedInRes.data?.length, 'error:', checkedInRes.error);
  console.log('2. Encounters Today count:', encTodayRes.count, 'error:', encTodayRes.error);
  console.log('3. Future Scheduled Appts count:', futureApptsRes.count, 'error:', futureApptsRes.error);
  console.log('4. Total Students/Patients count:', patientsCountRes.count, 'error:', patientsCountRes.error);
  console.log('5. Recent Encounters length:', recentEncRes.data?.length, 'error:', recentEncRes.error);
  console.log('6. Visits rows:', visitsRes.data?.length, 'error:', visitsRes.error);
  console.log('7. Complaints rows:', complaintsRes.data?.length, 'error:', complaintsRes.error);

  console.log('\n--- TOTAL RECORDS IN DB ---');
  console.log('Total Appointments in DB:', allAppts.data?.length, 'dates:', allAppts.data?.map(a => `${a.appointment_date} (${a.status})`));
  console.log('Total Encounters in DB:', allEncounters.data?.length, 'sample dates:', allEncounters.data?.slice(0, 5).map(e => e.encounter_date));
  console.log('Total Patients in DB:', allPatients.data?.length);
  console.log('Total Students in DB:', allStudents.data?.length);
  console.log('Total Inventory in DB:', allInventory.data?.length);
}

inspectData().catch(console.error);

// src/scripts/inspect_conversations_architecture.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data: auth } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });
  console.log('Logged in as:', auth?.user?.email);

  // 1. Inspect staff_directory
  console.log('\n--- STAFF DIRECTORY ---');
  const { data: staff, error: staffErr } = await client
    .from('staff_directory')
    .select('*');
  console.log('staff_directory rows:', staff, 'error:', staffErr);

  // 2. Inspect users table (staff & admins & patients)
  console.log('\n--- USERS / ADMINS / PROFILES ---');
  const { data: users, error: usersErr } = await client
    .from('users')
    .select('id, name, email, role, patient_id, auth_user_id')
    .limit(10);
  console.log('users sample:', users);

  const { data: admins, error: adminsErr } = await client
    .from('admins')
    .select('*')
    .limit(5);
  console.log('admins sample:', admins);

  // 3. Inspect existing patient_messages
  console.log('\n--- PATIENT MESSAGES SAMPLE ---');
  const { data: msgs, error: msgErr } = await client
    .from('patient_messages')
    .select('*')
    .limit(10);
  console.log('patient_messages count:', msgs?.length, 'sample:', msgs);

  process.exit(0);
}

main().catch(console.error);

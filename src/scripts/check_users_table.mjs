import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function checkUsers() {
  const { data: authData } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  console.log('Auth user ID:', authData.user.id);
  console.log('Auth user email:', authData.user.email);
  console.log('Auth metadata:', authData.user.user_metadata);

  const { data: publicUsers, error } = await client.from('users').select('*');
  console.log('\npublic.users rows:', publicUsers, 'error:', error);
}

checkUsers().catch(console.error);

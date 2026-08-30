// src/scripts/debug_conv_error.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });
  console.log('Auth:', auth?.user?.email, 'authErr:', authErr);

  const { data, error } = await client
    .from('patient_message_conversations')
    .select('*')
    .limit(1);

  console.log('patient_message_conversations select:', { data, error });
}

main().catch(console.error);

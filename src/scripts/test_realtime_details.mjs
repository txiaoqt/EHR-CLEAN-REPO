// src/scripts/test_realtime_details.mjs
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

  // Check if we can test broadcast or postgres_changes
  console.log('Setting up channel with filter...');
  let eventReceived = false;

  const channel = client.channel('patient_messages_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patient_messages' }, (payload) => {
      console.log('✓ REALTIME INSERT RECEIVED:', payload.new?.id, payload.new?.message_text);
      eventReceived = true;
    })
    .subscribe(async (status) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Inserting message to test realtime...');
        const { data: inserted, error: insertErr } = await client
          .from('patient_messages')
          .insert([{
            patient_id: 'TUPM-01-1234',
            patient_name: 'Angel Keith Carbon',
            sender_role: 'physician',
            sender_name: 'Dr. Rivera',
            recipient_name: 'Angel Keith Carbon',
            concern_type: 'General clinic inquiry',
            message_text: 'TEST REALTIME BROADCAST',
            status: 'sent',
          }])
          .select();

        if (insertErr) {
          console.error('Insert error:', insertErr);
        } else {
          console.log('Inserted:', inserted?.[0]?.id);
        }

        setTimeout(async () => {
          if (inserted?.[0]?.id) {
            await client.from('patient_messages').delete().eq('id', inserted[0].id);
          }
          client.removeChannel(channel);
          console.log('Event received?', eventReceived);
          process.exit(0);
        }, 4000);
      }
    });
}

main().catch(console.error);

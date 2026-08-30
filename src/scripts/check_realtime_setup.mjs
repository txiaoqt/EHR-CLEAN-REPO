// src/scripts/check_realtime_setup.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Testing Realtime connection on patient_messages...');
  
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });
  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }
  console.log('✓ Authenticated as:', auth.user.email);

  let receivedEvent = null;
  const channel = client
    .channel('test-messages-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_messages' }, (payload) => {
      console.log('⚡ Realtime payload received:', payload.eventType, payload.new?.id);
      receivedEvent = payload;
    })
    .subscribe(async (status) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Channel subscribed. Inserting a test message...');
        const { data, error } = await client
          .from('patient_messages')
          .insert([{
            patient_id: 'TUPM-01-1235',
            patient_name: 'Jenny Molina',
            sender_role: 'physician',
            sender_name: 'Dr. Rivera',
            recipient_name: 'Jenny Molina',
            concern_type: 'General clinic inquiry',
            message_text: 'TEST REALTIME EVENT',
            status: 'sent',
          }])
          .select();

        if (error) {
          console.error('Insert error:', error.message);
        } else {
          console.log('✓ Inserted message ID:', data?.[0]?.id);
          
          // Wait 3 seconds to see if realtime fires
          setTimeout(async () => {
            if (data?.[0]?.id) {
              await client.from('patient_messages').delete().eq('id', data[0].id);
              console.log('Cleaned up test message');
            }
            client.removeChannel(channel);
            if (receivedEvent) {
              console.log('🎉 REALTIME WORKS FOR patient_messages!');
            } else {
              console.log('⚠️ Realtime did NOT receive event. Migration may be needed to add table to publication.');
            }
            process.exit(0);
          }, 3000);
        }
      }
    });
}

main().catch(console.error);

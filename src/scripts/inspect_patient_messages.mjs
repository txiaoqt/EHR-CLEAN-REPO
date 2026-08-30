// src/scripts/inspect_patient_messages.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('\n================================================================================');
  console.log(' PATIENT MESSAGES SCHEMA INSPECTION');
  console.log('================================================================================\n');

  // 1. Sign in as physician to get full access
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123',
  });

  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }
  console.log('✓ Authenticated as:', auth.user.email);

  // 2. Query existing messages to understand schema
  const { data: msgs, error: msgsErr } = await client
    .from('patient_messages')
    .select('*')
    .limit(5);

  if (msgsErr) {
    console.error('Messages query error:', msgsErr.message);
  } else {
    console.log(`\n[EXISTING MESSAGES] Found ${msgs?.length || 0} rows`);
    if (msgs && msgs.length > 0) {
      console.log('Columns present:', Object.keys(msgs[0]));
      console.log('\nSample row:');
      console.log(JSON.stringify(msgs[0], null, 2));
    }
  }

  // 3. Try the exact insert that the frontend currently does to reproduce the error
  console.log('\n[TEST INSERT 1] Attempting insert with user_id field (should fail)...');
  const { error: insertErr } = await client
    .from('patient_messages')
    .insert([{
      patient_id: 'TUPM-24-0002',
      user_id: 'test-value',
      auth_user_id: auth.user.id,
      recipient_name: 'Test Recipient',
      concern_type: 'General clinic inquiry',
      message_text: 'TEST — inspect schema mismatch',
      status: 'sent',
    }]);

  if (insertErr) {
    console.log('✓ Expected failure:', insertErr.message);
    console.log('  Code:', insertErr.code);
  } else {
    console.log('⚠ Insert unexpectedly succeeded — user_id column may exist');
  }

  // 4. Try insert without user_id but with proper sender_role
  console.log('\n[TEST INSERT 2] Attempting insert without user_id, with sender_role...');
  const { data: ins2, error: ins2Err } = await client
    .from('patient_messages')
    .insert([{
      patient_id: 'TUPM-24-0002',
      auth_user_id: auth.user.id,
      patient_name: 'Test Student',
      sender_role: 'patient',
      sender_name: 'Test Student',
      recipient_name: 'Test Recipient',
      concern_type: 'General clinic inquiry',
      message_text: 'TEST — schema mismatch fix verification',
      status: 'sent',
    }])
    .select();

  if (ins2Err) {
    console.log('✗ Insert 2 failed:', ins2Err.message);
    console.log('  Code:', ins2Err.code);
  } else {
    console.log('✓ Insert 2 succeeded!');
    console.log('  Row:', JSON.stringify(ins2?.[0], null, 2));

    // Clean up test row
    if (ins2?.[0]?.id) {
      await client.from('patient_messages').delete().eq('id', ins2[0].id);
      console.log('  (Test row deleted)');
    }
  }

  // 5. Test with an expanded concern_type that's NOT in the original DB constraint
  console.log('\n[TEST INSERT 3] Testing expanded concern_type value...');
  const { data: ins3, error: ins3Err } = await client
    .from('patient_messages')
    .insert([{
      patient_id: 'TUPM-24-0002',
      auth_user_id: auth.user.id,
      patient_name: 'Test Student',
      sender_role: 'patient',
      sender_name: 'Test Student',
      recipient_name: 'Test Recipient',
      concern_type: 'Medical Certificate Request',
      message_text: 'TEST — expanded concern_type',
      status: 'sent',
    }])
    .select();

  if (ins3Err) {
    console.log('✗ Insert 3 failed (expanded concern_type):', ins3Err.message);
    console.log('  Code:', ins3Err.code);
  } else {
    console.log('✓ Insert 3 succeeded (expanded concern_type accepted)');
    if (ins3?.[0]?.id) {
      await client.from('patient_messages').delete().eq('id', ins3[0].id);
      console.log('  (Test row deleted)');
    }
  }

  // 6. Check the users table to understand identity mapping
  console.log('\n[USERS TABLE] Inspecting identity columns...');
  const { data: users, error: usersErr } = await client
    .from('users')
    .select('id, patient_id, auth_user_id, name, role')
    .limit(5);

  if (usersErr) {
    console.log('Users query error:', usersErr.message);
  } else {
    console.log(`Found ${users?.length || 0} users`);
    if (users?.length > 0) {
      console.log('Columns:', Object.keys(users[0]));
      users.forEach((u) => console.log(`  ${u.id} | patient_id=${u.patient_id} | auth_user_id=${u.auth_user_id} | role=${u.role}`));
    }
  }

  // 7. Check RLS status
  console.log('\n[RLS] Attempting insert as patient user...');
  await client.auth.signOut();
  const { data: patientAuth, error: pAuthErr } = await client.auth.signInWithPassword({
    email: 'student@tupclinic.local',
    password: 'Student@123',
  });

  if (pAuthErr) {
    console.log('Patient auth error (student@tupclinic.local):', pAuthErr.message);
    // Try alternate email patterns
    const { data: pa2, error: pa2Err } = await client.auth.signInWithPassword({
      email: 'TUPM-24-0001@tup.edu.ph',
      password: 'Student@123',
    });
    if (pa2Err) {
      console.log('Patient auth error (TUPM-24-0001@tup.edu.ph):', pa2Err.message);
    } else {
      console.log('✓ Authenticated as patient:', pa2.user.email);
    }
  } else {
    console.log('✓ Authenticated as patient:', patientAuth.user.email);
  }

  console.log('\n================================================================================');
  console.log(' INSPECTION COMPLETE');
  console.log('================================================================================\n');
}

main().catch(console.error);

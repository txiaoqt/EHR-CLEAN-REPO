import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

async function testRoleQueries(roleName, email, password) {
  console.log(`\n======================================================`);
  console.log(` TESTING ROLE: ${roleName} (${email})`);
  console.log(`======================================================`);

  const mockStore = {};
  const storage = {
    getItem: (k) => mockStore[k] || null,
    setItem: (k, v) => { mockStore[k] = String(v); },
    removeItem: (k) => { delete mockStore[k]; }
  };

  // 1. Fresh Login
  const client1 = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  const { data: authData, error: authErr } = await client1.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.error(`Sign in error for ${roleName}:`, authErr);
    return;
  }
  console.log(`[Fresh Login] Session: true, User ID: ${authData.user.id}`);

  // Test all queries
  async function runAllQueries(client, label) {
    const todayIso = new Date().toISOString().split('T')[0];
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const results = await Promise.allSettled([
      // Dashboard queries
      client.from('appointments').select('*').eq('appointment_date', todayIso).eq('status', 'Checked-in'),
      client.from('encounters').select('*', { head: true, count: 'exact' }).gte('encounter_date', todayIso).lt('encounter_date', tomorrowIso),
      client.from('appointments').select('*', { head: true, count: 'exact' }).gt('appointment_date', todayIso).eq('status', 'Scheduled'),
      client.from('students').select('*', { head: true, count: 'exact' }),
      client.from('encounters').select('*').order('created_at', { ascending: false }).limit(6),
      client.from('encounters').select('encounter_date'),
      client.from('encounters').select('chief_complaint').not('chief_complaint', 'is', null),
      client.from('inventory').select('id,item_name,stock_quantity,reorder_level,unit'),

      // Patients page query
      client.from('patients').select('*').order('name', { ascending: true }),

      // Appointments page query
      client.from('appointments').select('*').order('appointment_date', { ascending: false }),

      // Encounters page query
      client.from('encounters').select('*').order('encounter_date', { ascending: false }),

      // Inventory page query
      client.from('inventory').select('*'),
      client.from('inventory_transactions').select('*').order('created_at', { ascending: false }),

      // Settings page query
      client.from('settings').select('*'),

      // Audit logs
      client.from('audit_logs').select('*').limit(10),

      // Users profile query
      client.from('users').select('id, name, email, role, auth_user_id').limit(5)
    ]);

    const names = [
      'Dashboard: Checked-in Today',
      'Dashboard: Encounters Today',
      'Dashboard: Future Appts',
      'Dashboard: Total Patients (students)',
      'Dashboard: Recent Encounters',
      'Dashboard: Visits',
      'Dashboard: Complaints',
      'Dashboard: Low Stock (inventory)',
      'Patients Page: select *',
      'Appointments Page: select *',
      'Encounters Page: select *',
      'Inventory Page: select *',
      'Inventory Page: transactions',
      'Settings Page: select *',
      'Audit Logs: select *',
      'Users Table: select *'
    ];

    console.log(`\n--- ${label} Query Results ---`);
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        const val = r.value;
        const count = val.count != null ? val.count : val.data?.length;
        const err = val.error ? `ERROR: ${val.error.code} - ${val.error.message}` : 'OK';
        console.log(`  ${names[idx].padEnd(36)} -> count/rows: ${String(count).padEnd(4)} [${err}]`);
      } else {
        console.log(`  ${names[idx].padEnd(36)} -> REJECTED: ${r.reason}`);
      }
    });
  }

  await runAllQueries(client1, 'FRESH LOGIN');

  // 2. Page Reload Simulation
  const client2 = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  const { data: { session: restoredSession }, error: restoreErr } = await client2.auth.getSession();
  console.log(`\n[After Reload] getSession session exists: ${!!restoredSession}, error: ${restoreErr}`);

  await runAllQueries(client2, 'AFTER RELOAD');
}

async function run() {
  await testRoleQueries('Physician', 'physician@tupclinic.local', 'Physician@123');
  await testRoleQueries('Nurse', 'nurse@tupclinic.local', 'Nurse@123');
}

run().catch(console.error);

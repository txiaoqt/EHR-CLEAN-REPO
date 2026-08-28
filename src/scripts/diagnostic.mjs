import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

// Emulate browser localStorage accurately
const store = {};
const mockLocalStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

// Global fetch inspector to safely check request headers
let lastRequestHeaders = null;
const customFetch = async (url, options = {}) => {
  if (url.includes('/rest/v1/')) {
    const authHeader = options.headers?.['Authorization'] || options.headers?.['authorization'] || '';
    const apikeyHeader = options.headers?.['apikey'] || '';
    const hasBearer = authHeader.startsWith('Bearer ');
    const isAnon = authHeader === `Bearer ${supabaseAnonKey}`;
    lastRequestHeaders = {
      url: url.split('?')[0].split('/rest/v1/')[1],
      hasAuthHeader: !!authHeader,
      isBearer: hasBearer,
      isUserJWT: hasBearer && !isAnon,
      isAnonKey: isAnon,
      hasApiKey: !!apikeyHeader
    };
  }
  return fetch(url, options);
};

console.log('================================================================');
console.log('   EHR SUPABASE AUTH & RELOAD REPRODUCTION & DIAGNOSTIC SUITE   ');
console.log('================================================================\n');

async function main() {
  console.log('--- TEST 1: FRESH LOGIN ---');
  // Client A (Fresh login client)
  const clientA = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: mockLocalStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    global: { fetch: customFetch }
  });

  const { data: authData, error: authError } = await clientA.auth.signInWithPassword({
    email: 'physician@tupclinic.local',
    password: 'Physician@123'
  });

  if (authError) {
    console.error('Fresh Login FAILED:', authError);
    return;
  }

  const sessionA = authData.session;
  const userA = authData.user;
  console.log('[AUTH-DEBUG] Fresh Login:');
  console.log('  session exists:', !!sessionA);
  console.log('  user id:', userA?.id);
  console.log('  session expires_at:', sessionA?.expires_at);
  console.log('  access token exists:', !!sessionA?.access_token);

  // Fetch profile
  const { data: profileA, error: profileErrA } = await clientA
    .from('users')
    .select('id, name, email, role, auth_user_id, active')
    .or(`auth_user_id.eq.${userA.id},email.ilike.${userA.email}`)
    .limit(1)
    .maybeSingle();

  console.log('  profile loaded:', !!profileA, 'name:', profileA?.name, 'role:', profileA?.role);
  console.log('  auth.uid matches public.users.auth_user_id:', userA.id === profileA?.auth_user_id);
  console.log('  last request headers:', lastRequestHeaders);

  // Run queries as Fresh Login
  const [studA, patA, apptA, encA, invA] = await Promise.all([
    clientA.from('students').select('*', { count: 'exact' }).limit(5),
    clientA.from('patients').select('*', { count: 'exact' }).limit(5),
    clientA.from('appointments').select('*', { count: 'exact' }).limit(5),
    clientA.from('encounters').select('*', { count: 'exact' }).limit(5),
    clientA.from('inventory').select('*', { count: 'exact' }).limit(5),
  ]);

  console.log('\n[QUERY RESULTS - FRESH LOGIN]');
  console.log('  students:     count =', studA.count, 'rows =', studA.data?.length, 'error =', studA.error?.message || null);
  console.log('  patients:     count =', patA.count, 'rows =', patA.data?.length, 'error =', patA.error?.message || null);
  console.log('  appointments: count =', apptA.count, 'rows =', apptA.data?.length, 'error =', apptA.error?.message || null);
  console.log('  encounters:   count =', encA.count, 'rows =', encA.data?.length, 'error =', encA.error?.message || null);
  console.log('  inventory:    count =', invA.count, 'rows =', invA.data?.length, 'error =', invA.error?.message || null);

  console.log('\nLocalStorage keys after Fresh Login:', Object.keys(store));

  console.log('\n----------------------------------------------------------------');
  console.log('--- TEST 2: BROWSER RELOAD SIMULATION ---');
  console.log('----------------------------------------------------------------');
  // Client B simulates new JS runtime on page reload with existing localStorage
  const clientB = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: mockLocalStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    global: { fetch: customFetch }
  });

  // What happens immediately on page reload BEFORE getSession() resolves?
  console.log('\n[TIMING TEST: Immediate query on Client B before getSession()]');
  const immediateQuery = await clientB.from('students').select('*', { count: 'exact' }).limit(5);
  console.log('  Immediate query result BEFORE getSession resolved:');
  console.log('    count =', immediateQuery.count, 'rows =', immediateQuery.data?.length, 'error =', immediateQuery.error?.message || null);
  console.log('    request headers during immediate query:', lastRequestHeaders);

  // Now resolve getSession() as AuthContext does
  const { data: { session: sessionB }, error: sessionErrB } = await clientB.auth.getSession();
  console.log('\n[AUTH-DEBUG] After getSession() resolves on Client B:');
  console.log('  session exists:', !!sessionB);
  console.log('  user id:', sessionB?.user?.id);
  console.log('  session expires_at:', sessionB?.expires_at);
  console.log('  access token exists:', !!sessionB?.access_token);
  console.log('  session error:', sessionErrB);

  const { data: profileB, error: profileErrB } = await clientB
    .from('users')
    .select('id, name, email, role, auth_user_id, active')
    .or(`auth_user_id.eq.${sessionB?.user?.id},email.ilike.${sessionB?.user?.email}`)
    .limit(1)
    .maybeSingle();

  console.log('  profile loaded:', !!profileB, 'name:', profileB?.name, 'role:', profileB?.role);
  console.log('  auth.uid matches public.users.auth_user_id:', sessionB?.user?.id === profileB?.auth_user_id);
  console.log('  last request headers after getSession:', lastRequestHeaders);

  // Run queries after getSession() resolved
  const [studB, patB, apptB, encB, invB] = await Promise.all([
    clientB.from('students').select('*', { count: 'exact' }).limit(5),
    clientB.from('patients').select('*', { count: 'exact' }).limit(5),
    clientB.from('appointments').select('*', { count: 'exact' }).limit(5),
    clientB.from('encounters').select('*', { count: 'exact' }).limit(5),
    clientB.from('inventory').select('*', { count: 'exact' }).limit(5),
  ]);

  console.log('\n[QUERY RESULTS - AFTER RELOAD (After getSession resolved)]');
  console.log('  students:     count =', studB.count, 'rows =', studB.data?.length, 'error =', studB.error?.message || null);
  console.log('  patients:     count =', patB.count, 'rows =', patB.data?.length, 'error =', patB.error?.message || null);
  console.log('  appointments: count =', apptB.count, 'rows =', apptB.data?.length, 'error =', apptB.error?.message || null);
  console.log('  encounters:   count =', encB.count, 'rows =', encB.data?.length, 'error =', encB.error?.message || null);
  console.log('  inventory:    count =', invB.count, 'rows =', invB.data?.length, 'error =', invB.error?.message || null);
}

main().catch(console.error);

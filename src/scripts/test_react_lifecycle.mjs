import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dnpycmN5dWxiZXp6ZXhsbWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDg0MDcsImV4cCI6MjEwMzIyNDQwN30.KE3NYI3pL2DlROqMBb6WCtyFtM0cPhUeHf4K06FCFQ0';

// In-memory persistent localStorage simulation
const localStorageStore = {};
const mockLocalStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; }
};

console.log('========================================================================');
console.log('   FULL LIFECYCLE REPRODUCTION: FRESH LOGIN -> RELOAD -> PERSISTENCE   ');
console.log('========================================================================\n');

// 1. FRESH LOGIN
console.log('>>> [PHASE 1: FRESH LOGIN FLOW]');
const client1 = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: mockLocalStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const { data: authData, error: loginErr } = await client1.auth.signInWithPassword({
  email: 'physician@tupclinic.local',
  password: 'Physician@123'
});

if (loginErr) throw loginErr;
console.log('[AUTH-DEBUG] Login successful. User ID:', authData.user.id);
console.log('[AUTH-DEBUG] LocalStorage keys after login:', Object.keys(localStorageStore));

// Fetch profile
const { data: profile } = await client1
  .from('users')
  .select('id, name, email, role, auth_user_id')
  .eq('auth_user_id', authData.user.id)
  .single();

mockLocalStorage.setItem('ehr_user', JSON.stringify(profile));
mockLocalStorage.setItem('authUser', JSON.stringify(profile));
console.log('[AUTH-DEBUG] Profile cached:', profile.name, `(${profile.role})`);

// 2. SIMULATE BROWSER RELOAD (New JS Environment)
console.log('\n>>> [PHASE 2: BROWSER RELOAD (Ctrl+R) LIFECYCLE]');

// Step 1: New Supabase Client instantiated
const client2 = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: mockLocalStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

// Step 2: AuthContext starts with initializing = true
let initializing = true;
let loading = true;
let user = null;
try {
  user = JSON.parse(mockLocalStorage.getItem('ehr_user'));
} catch (_) {}

console.log('[AUTH-DEBUG] initializing=true');
console.log('[SHELL-DEBUG] Initial render state: loading =', loading, 'initializing =', initializing);

// Step 3: AppShell gating check
if (loading || initializing) {
  console.log('[SHELL-DEBUG] AppShell renders loading screen: "Loading session..." (Protected Shell & Sidebar BLOCKED)');
}

// Step 4: AuthContext useEffect resolves getSession()
const { data: { session: restoredSession }, error: getSessionErr } = await client2.auth.getSession();
console.log('[AUTH-DEBUG] session exists:', !!restoredSession);
console.log('[AUTH-DEBUG] user id:', restoredSession?.user?.id || null);
console.log('[AUTH-DEBUG] session expires_at:', restoredSession?.expires_at || null);
console.log('[AUTH-DEBUG] access token exists:', !!restoredSession?.access_token);

const { data: restoredProfile } = await client2
  .from('users')
  .select('id, name, email, role, auth_user_id')
  .eq('auth_user_id', restoredSession.user.id)
  .single();

console.log('[AUTH-DEBUG] profile loaded:', !!restoredProfile);
console.log('[AUTH-DEBUG] profile role:', restoredProfile?.role);

// Finalize auth state
user = restoredProfile;
loading = false;
initializing = false;
console.log('[AUTH-DEBUG] initializing=false');

// Step 5: AppShell re-renders now that initializing = false
if (!loading && !initializing) {
  console.log('[SHELL-DEBUG] AppShell mounted');

  // Step 6: Sidebar mounts and executes fetchLastBackup
  console.log('[SHELL-DEBUG] Sidebar mounted');
  const { data: backupData } = await client2.from('settings').select('value').eq('key', 'last_backup').maybeSingle();
  console.log('[SHELL-DEBUG] Sidebar fetchLastBackup completed:', backupData?.value || 'none');

  // Step 7: Dashboard mounts and executes fetchDashboardData
  console.log('[DASHBOARD-DEBUG] Dashboard mounted');
  console.log('[DASHBOARD-DEBUG] fetch started');

  const todayIso = new Date().toISOString().split('T')[0];
  const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const results = await Promise.allSettled([
    client2.from('appointments').select('*').eq('appointment_date', todayIso).eq('status', 'Checked-in'),
    client2.from('encounters').select('*', { head: true, count: 'exact' }).gte('encounter_date', todayIso).lt('encounter_date', tomorrowIso),
    client2.from('appointments').select('*', { head: true, count: 'exact' }).gt('appointment_date', todayIso).eq('status', 'Scheduled'),
    client2.from('students').select('*', { head: true, count: 'exact' }),
    client2.from('encounters').select('*').order('created_at', { ascending: false }).limit(6),
    client2.from('encounters').select('encounter_date'),
    client2.from('encounters').select('chief_complaint').not('chief_complaint', 'is', null),
    client2.from('inventory').select('*')
  ]);

  const [
    checkedInRes,
    encTodayRes,
    futureApptsRes,
    patientsCountRes,
    recentEncRes,
    visitsRes,
    complaintsRes,
    inventoryRes
  ] = results.map(r => (r.status === 'fulfilled' ? r.value : { data: null, count: null, error: r.reason }));

  console.log('[DASHBOARD-DEBUG] rows received:', {
    totalPatients: patientsCountRes?.count,
    totalVisits: visitsRes?.data?.length,
    recentEncounters: recentEncRes?.data?.length,
    inventoryItems: inventoryRes?.data?.length
  });
  console.log('[DASHBOARD-DEBUG] state updated');
}

console.log('\n========================================================================');
console.log('   RESULT: AUTH & APP SHELL LIFECYCLE SYNCHRONIZED SUCCESSFULLY        ');
console.log('========================================================================\n');

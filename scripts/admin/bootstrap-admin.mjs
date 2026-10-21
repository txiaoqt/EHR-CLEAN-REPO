import { runtime } from './supabase-runtime.mjs';
const { service } = runtime();
const password = process.env.EHR_ADMIN_INITIAL_PASSWORD;
if (!password || password.length < 12) throw new Error('Supply EHR_ADMIN_INITIAL_PASSWORD with at least 12 characters.');
const email = 'ehradmin@admin.tup-clinic.invalid';
const { data: existing, error: lookupError } = await service.from('admins').select('auth_user_id,role').eq('email', email).maybeSingle();
if (lookupError) throw new Error(`Could not check the initial administrator (${lookupError.code}).`);
if (existing) {
  if (existing.role !== 'admin' || !existing.auth_user_id) throw new Error('The reserved administrator account needs manual review.');
  console.log('Initial administrator already exists; its password was not changed.');
} else {
  const { error } = await service.auth.admin.createUser({ email, password, email_confirm: true,
    app_metadata: { staff_role: 'admin', policy_signup_exempt: true },
    user_metadata: { name: 'System Administrator' },
  });
  if (error) throw new Error(`Could not create the initial administrator (${error.code || error.status}).`);
  console.log('Initial administrator created through Supabase Auth.');
}
const { data: profile, error: profileError } = await service.from('admins').select('auth_user_id').eq('email', email).single();
if (profileError || !profile.auth_user_id) throw new Error('The trusted administrator profile is missing.');
const { error: usernameError } = await service.rpc('provision_system_admin_username', { p_user: profile.auth_user_id, p_username: 'ehradmin' });
if (usernameError) throw new Error(`Could not configure the administrator username (${usernameError.code}).`);
console.log('Administrator username configured. Existing passwords were not reset.');

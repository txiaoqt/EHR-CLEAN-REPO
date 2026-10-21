import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
process.on('uncaughtException', error => {
  console.error('FAIL:', error.message, error.where || '', error.internalQuery || ''); process.exit(1);
});

// A disposable local PostgreSQL instance. No live credentials or patient data.
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage; create schema private;
  create function private.app_policy_status() returns jsonb language sql as $$select '{}'::jsonb$$;
  create function private.app_policy_accept(text,boolean,boolean) returns jsonb language sql as $$select '{}'::jsonb$$;
  create function private.can_read_appointment_photo(text) returns boolean language sql as $$select false$$;
  create function private.can_delete_own_unlinked_appointment_photo(text) returns boolean language sql as $$select false$$;
  create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,
    email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,
    raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
  create table public.admins(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique,
    name text not null,email text unique,role text,avatar text,department text,active boolean default true,
    failed_login_attempts int default 0,locked_until timestamptz,lockout_reason text,clearance_level smallint,
    abac_attributes jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
  create table public.users(like public.admins including all);
  alter table public.users add column patient_id text; alter table public.users add column student_id text;
  create table public.enrollees(id uuid primary key default gen_random_uuid(),auth_user_id uuid,
    first_name text,middle_name text,surname text,suffix text,personal_email text,applicant_id text,
    status text default 'enrollee',tup_email text,elevated_student_id text,created_at timestamptz default now());
  create table public.patient_profiles(patient_id text primary key,avatar_url text);
  create table public.students(id text primary key,name text,year int,updated_at timestamptz);
  create table public.patients(id text primary key,name text,year int,sensitivity_level text,updated_at timestamptz);
  create table public.settings(key text primary key,value jsonb);
  create table public.audit_logs(id uuid primary key default gen_random_uuid(),user_name text,action text,description text,meta jsonb,created_at timestamptz default now());
  create table public.encounters(id uuid primary key default gen_random_uuid(),note text);
  create table storage.objects(id uuid primary key default gen_random_uuid(),name text);
  create view public.staff_directory as select id,name,role,avatar,department,active,auth_user_id from public.admins where active;
  grant usage on schema public,auth,storage to authenticated,anon,service_role;
  grant all on all tables in schema public to authenticated,service_role;
  grant all on storage.objects to authenticated,service_role;
`);
async function migration(suffix) {
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => file.endsWith('_' + suffix + '.sql'));
  assert.equal(files.length, 1, 'Unique migration for ' + suffix);
  return readFile(new URL(files[0], directory), 'utf8');
}
const sql = await migration('system_administration_portal');
await db.exec(sql);
await db.exec(await migration('harden_admin_invitation_recovery'));
await db.exec(await migration('admin_bootstrap_and_invitation_repair'));
await db.exec(`create trigger fixture_auth_sync after insert or update on auth.users
  for each row execute function public.sync_public_user_from_auth();`);
// Model existing permissive policies, plus the migration's restrictive gates.
await db.exec(`do $$declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t.tablename);
  execute format('create policy fixture_access on public.%I for all to authenticated using (true) with check (true)',t.tablename);
end loop; end $$;
alter table storage.objects enable row level security;
create policy fixture_storage on storage.objects for all to authenticated using (true) with check (true);`);

const admin = '10000000-0000-4000-8000-000000000001';
const staff = '10000000-0000-4000-8000-000000000002';
const patient = '10000000-0000-4000-8000-000000000003';
const enrollee = '10000000-0000-4000-8000-000000000004';
for (const [id, role] of [[admin,'admin'],[staff,'physician'],[patient,'patient'],[enrollee,'enrollee']]) {
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}@test.invalid`]);
  if (role === 'admin' || role === 'physician') await db.query('insert into public.admins(auth_user_id,name,email,role) values($1,$2,$3,$4)',[id,role,`${role}@test.invalid`,role]);
  else if(role === 'patient') await db.query('insert into public.users(auth_user_id,name,email,role,patient_id) values($1,$2,$3,$4,$5)',[id,role,`${role}@test.invalid`,role,'TUPM-26-1234']);
  else await db.query("insert into public.enrollees(auth_user_id,first_name,surname,personal_email,applicant_id) values($1,'Test','Applicant','enrollee@test.invalid','AP-1')",[id]);
}
await db.exec(`insert into public.encounters(note) values('local fixture'); insert into storage.objects(name) values('fixture.pdf');`);
async function actAs(id) {
  await db.exec('reset role');
  if (!id) { await db.query("select set_config('request.jwt.claims','{}',false)"); return; }
  const { rows } = await db.query('insert into auth.sessions(user_id) values($1) returning id',[id]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:rows[0].id,role:'authenticated'})]);
  await db.exec('set role authenticated');
}
async function operation(actor,action,payload={}) {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claims','{}',false)");
  return (await db.query('select public.system_admin_action($1,$2,$3) as result',[actor,action,JSON.stringify(payload)])).rows[0].result;
}
async function one(query) { return (await db.query(query)).rows[0]; }
await actAs(admin);
assert.equal((await one('select public.current_app_role() as role')).role,'system_admin');
assert.equal((await one('select count(*)::int as n from public.encounters')).n,0,'admin cannot read clinical rows');
assert.equal((await one('select count(*)::int as n from storage.objects')).n,0,'admin cannot read clinical files');
assert.equal((await one("select (public.admin_portal_data('overview')->>'active_staff')::int as n")).n,1);
assert.equal((await one('select public.get_my_portal_identity() as profile')).profile.role,'admin');
await actAs(staff);
assert.equal((await one("select private.can_read_appointment_photo('fixture.pdf') as readable")).readable,false,'existing storage policy helper remains executable');
assert.equal((await one('select private.can_publish_clinic_staff_presence() as allowed')).allowed,true);
assert.equal((await one('select public.current_app_role() as role')).role,'physician');
assert.equal((await one('select count(*)::int as n from public.encounters')).n,1,'existing physician access remains');
await assert.rejects(db.query("select public.admin_portal_data('overview')"),/administrator access required/i);
await assert.rejects(db.query("select public.system_admin_action(null,'settings','{}')"),/permission denied/i);
await assert.rejects(db.query("update public.admins set role='admin' where auth_user_id=$1",[staff]),/permissions must be changed/i);
await operation(admin,'suspend',{id:patient,reason:'Local suspension test'});
await actAs(patient);
assert.equal((await one('select public.account_can_access() as allowed')).allowed,false);
assert.equal((await one('select count(*)::int as n from public.encounters')).n,0);
assert.equal((await one('select public.get_my_portal_identity() as profile')).profile.active,false);
await assert.rejects(db.query("insert into public.encounters(note) values('blocked')"),/access is unavailable/i);
await operation(admin,'reactivate',{id:patient,reason:'Local restoration test'});
await actAs(patient);
assert.equal((await one('select public.account_can_access() as allowed')).allowed,true);
await operation(admin,'suspend',{id:enrollee,reason:'Applicant access test'});
await actAs(enrollee);
assert.equal((await one('select public.get_my_portal_identity() as profile')).profile.active,false);
await assert.rejects(operation(admin,'suspend',{id:admin,reason:'Self suspension forbidden'}),/own access/i);
await assert.rejects(operation(staff,'settings',{}),/administrator access required/i);
await operation(admin,'reactivate',{id:enrollee,reason:'Restore applicant'});

const invitation = await operation(admin,'invite_reserve',{name:'Invited Nurse',email:'invite@test.invalid',role:'nurse'});
const invited = '10000000-0000-4000-8000-000000000005';
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[invited,'invite@test.invalid']);
await operation(admin,'invite_sent',{id:invitation.id,auth_user_id:invited});
await actAs(invited);
assert.equal((await one('select public.account_can_access() as allowed')).allowed,false,'pending invite is not staff access');
assert.equal((await one('select public.get_my_portal_identity() as profile')).profile.staff_setup_required,true);
await operation(invited,'complete_invitation');
await actAs(invited);
assert.equal((await one('select public.current_app_role() as role')).role,'nurse');
await assert.rejects(operation(invited,'complete_invitation'),/no longer available/i);
// Expired and revoked invitation records never become clinical accounts.
for (const [label, expired] of [['expired',true],['revoked',false]]) {
  const invite = await operation(admin,'invite_reserve',{name:'Test '+label,email:label+'@test.invalid',role:'nurse'});
  const { rows } = await db.query('insert into auth.users(email,email_confirmed_at) values($1,now()) returning id',[label+'@test.invalid']);
  const target = rows[0].id;
  await operation(admin,'invite_sent',{id:invite.id,auth_user_id:target});
  if (expired) await db.query("update private.staff_invitations set expires_at=now()-interval '1 minute' where id=$1",[invite.id]);
  else await operation(admin,'invite_revoke',{id:invite.id});
  await actAs(target);
  assert.equal((await one('select public.get_my_portal_identity() as profile')).profile.active,false);
  await assert.rejects(operation(target,'complete_invitation'),/no longer available/i);
}
await operation(admin,'change_role',{id:invited,role:'physician'});
await actAs(invited);
assert.equal((await one('select public.current_app_role() as role')).role,'physician');
// Deleting a server-side session invalidates its existing JWT at the Data API.
await db.exec('reset role'); await db.query('delete from auth.sessions where user_id=$1',[invited]); await db.exec('set role authenticated');
assert.equal((await one('select public.account_can_access() as allowed')).allowed,false);

await actAs(null);
await db.exec('set role anon');
await assert.rejects(db.query("select public.admin_portal_data('overview')"),/permission denied/i);
await assert.rejects(db.query('select public.get_my_portal_identity()'),/permission denied/i);
await db.close();
console.log('PASS: local PostgreSQL migration, three-role isolation, invitation setup, suspension, revocation, and escalation checks.');

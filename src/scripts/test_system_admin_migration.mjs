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
    email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,deleted_at timestamptz,created_at timestamptz default now(),
    raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
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
    status text default 'enrollee',tup_email text,elevated_student_id text,elevated_at timestamptz,created_at timestamptz default now());
  create table public.patient_profiles(patient_id text primary key,avatar_url text);
  create table public.students(id text primary key,name text,year int,updated_at timestamptz);
  create table public.patients(id text primary key,name text,year int,sensitivity_level text,updated_at timestamptz);
  create table public.settings(key text primary key,value jsonb);
  create table public.audit_logs(id uuid primary key default gen_random_uuid(),user_name text,performed_by text,action text,description text,meta jsonb,created_at timestamptz default now());
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
await db.exec(await migration('administrator_invitations_and_directory'));
await db.exec(await migration('invitation_and_administrator_deletion'));
await db.exec(await migration('live_user_accounts_and_account_history'));
await db.exec(await migration('account_sign_in_audit'));
await db.exec(await migration('retain_enrollee_after_auth_deletion'));
await db.exec(await migration('recover_user_deletion_cleanup'));
await db.exec(await migration('unique_administrator_names'));
await db.exec(`create trigger fixture_enrollee_guard before update on public.enrollees
  for each row execute function public.guard_enrollee_sensitive_updates();`);
await db.exec(`create trigger fixture_auth_sync after insert or update on auth.users
  for each row execute function public.sync_public_user_from_auth();`);
// Model existing permissive policies, plus the migration's restrictive gates.
await db.exec(`do $$declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t.tablename);
  execute format('create policy fixture_access on public.%I for all to authenticated using (true) with check (true)',t.tablename);
end loop; end $$;
alter table storage.objects enable row level security;
create policy fixture_storage on storage.objects for all to authenticated using (true) with check (true);`);
await db.exec(`create policy fixture_audit_staff_insert on public.audit_logs as restrictive for insert to authenticated
  with check(public.current_app_role() in ('physician','nurse','system_admin'));`);

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

// Invited administrators choose a unique username and complete setup on their
// own portal. No real Auth account, email or production record is touched.
await db.exec('reset role');
await db.query("insert into private.account_controls(user_id,login_username) values($1,'primary_admin')",[admin]);
const administratorInvite = await operation(admin,'invite_reserve',{name:'Invited Administrator',email:'administrator-invite@test.invalid',role:'admin'});
const administratorUser = '10000000-0000-4000-8000-000000000006';
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[administratorUser,'administrator-invite@test.invalid']);
await operation(admin,'invite_sent',{id:administratorInvite.id,auth_user_id:administratorUser});
await actAs(administratorUser);
const administratorSetupClaims = (await one('select auth.jwt() as claims')).claims;
assert.equal((await one('select public.get_my_portal_identity() as profile')).profile.staff_setup_required,true);
assert.equal((await one('select public.current_app_role() as role')).role,null);
await assert.rejects(db.query("select public.admin_portal_data('administrators')"),/administrator access required/i);
await assert.rejects(db.query('select public.complete_administrator_invitation($1,$2)',[administratorUser,'new_admin']),/permission denied/i);
await db.exec('reset role');
await assert.rejects(db.query('select public.complete_administrator_invitation($1,$2)',[administratorUser,'1invalid']),/starting with a letter/i);
await assert.rejects(db.query('select public.complete_administrator_invitation($1,$2)',[administratorUser,'PRIMARY_ADMIN']),/already taken/i);
assert.equal((await one(`select active from public.admins where auth_user_id='${administratorUser}'`)).active,false);
assert.equal((await one(`select status from private.staff_invitations where id='${administratorInvite.id}'`)).status,'pending');
// The Edge Function's service client has service-role claims, not the setup JWT.
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
await db.exec('set role service_role');
const acceptedAdmin = (await db.query('select public.complete_administrator_invitation($1,$2) as result',[administratorUser,'new_admin'])).rows[0].result;
assert.equal(acceptedAdmin.accepted,true);
assert.equal(acceptedAdmin.username,'new_admin');
await db.exec('reset role');
assert.equal((await one(`select count(*)::int as n from auth.sessions where user_id='${administratorUser}'`)).n,0,'setup sessions are revoked atomically');
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(administratorSetupClaims)]);
await db.exec('set role authenticated');
assert.equal((await one('select public.account_can_access() as allowed')).allowed,false,'the setup JWT cannot gain admin access');
await actAs(administratorUser);
assert.equal((await one('select public.current_app_role() as role')).role,'system_admin');
const administratorDirectory = (await one("select public.admin_portal_data('administrators') as result")).result;
assert.equal(administratorDirectory.total,2);
assert.ok(administratorDirectory.rows.every(row=>row.role==='admin'));
assert.equal((await one("select public.admin_portal_data('administrators','new_admin') as result")).result.total,1);
assert.equal((await one("select public.admin_portal_data('administrators','no-such-administrator') as result")).result.total,0);
assert.ok((await one("select public.admin_portal_data('staff') as result")).result.rows.every(row=>['physician','nurse'].includes(row.role)));
assert.ok((await one("select public.admin_portal_data('administrator_invitations') as result")).result.rows.every(row=>row.role==='admin'));
assert.ok((await one("select public.admin_portal_data('invitations') as result")).result.rows.every(row=>['physician','nurse'].includes(row.role)));
assert.equal((await one('select count(*)::int as n from public.encounters')).n,0,'new admins do not gain clinical access');
// Name uniqueness is enforced in Postgres across renames, direct writes and
// reserved invitations. It never makes clinical staff names unique.
await actAs(null);
const rename = async (actor,name) => {
  await actAs(null);
  await db.exec('set role service_role');
  return (await db.query('select public.update_administrator_name($1,$2) as result',[actor,name])).rows[0].result;
};
assert.equal((await rename(admin,'  Primary   Administrator  ')).name,'Primary Administrator');
assert.equal((await rename(administratorUser,'Secondary Administrator')).name,'Secondary Administrator');
assert.equal((await rename(admin,'Primary Administrator')).saved,false,'unchanged own name is a no-op');
await assert.rejects(rename(admin,' secondary   ADMINISTRATOR '),/another administrator already uses this name/i);
await assert.rejects(rename(staff,'Forbidden Rename'),/administrator access required/i);
await assert.rejects(rename(admin,' \t '),/full name with 2-120/i);
await operation(admin,'save_profile',{name:'Primary Administrator'});
await assert.rejects(operation(admin,'save_profile',{name:'SECONDARY ADMINISTRATOR'}),/another administrator/i);
await assert.rejects(db.query("insert into public.admins(name,email,role) values(' PRIMARY   administrator ','duplicate-name@test.invalid','admin')"),/another administrator/i);
const clinicalName=(await db.query("insert into public.admins(name,email,role) values('Primary Administrator','clinical-same-name@test.invalid','nurse') returning id")).rows[0].id;
await db.query('delete from public.admins where id=$1',[clinicalName]);
await assert.rejects(operation(admin,'invite_reserve',{name:'primary administrator',email:'duplicate-invite-name@test.invalid',role:'admin'}),/another administrator/i);
const reservedName=await operation(admin,'invite_reserve',{name:'  Reserved   Administrator ',email:'reserved-name@test.invalid',role:'admin'});
assert.equal(reservedName.name,'Reserved Administrator');
await assert.rejects(rename(administratorUser,'reserved ADMINISTRATOR'),/another administrator/i);
await assert.rejects(operation(admin,'invite_reserve',{name:'RESERVED ADMINISTRATOR',email:'second-reserved-name@test.invalid',role:'admin'}),/another administrator/i);
await operation(admin,'invite_failed',{id:reservedName.id,message:'Fixture releases unsent name reservation'});
await actAs(admin);
assert.equal((await one("select public.admin_portal_data('administrators','Primary Administrator') as result")).result.rows[0].name,'Primary Administrator');
await assert.rejects(db.query('select public.update_administrator_name($1,$2)',[admin,'Bypass Name']),/permission denied/i);
const nameHistory=(await db.query("select public.admin_account_history($1,'','ADMIN_NAME_CHANGED') as result",[admin])).rows[0].result;
assert.equal(nameHistory.rows[0].meta.target_user_id,admin,'name audit preserves stable account ID');
await assert.rejects(operation(administratorUser,'suspend',{id:admin,reason:'Protected administrator check'}),/protected/i);
await assert.rejects(db.query('select public.complete_administrator_invitation($1,$2)',[administratorUser,'new_admin']),/no longer available/i);
for (const [label, expired] of [['expired-admin',true],['revoked-admin',false],['unverified-admin',false]]) {
  const invite = await operation(admin,'invite_reserve',{name:'Administrator '+label,email:label+'@test.invalid',role:'admin'});
  const { rows } = await db.query('insert into auth.users(email,email_confirmed_at) values($1,$2) returning id',[label+'@test.invalid',label==='unverified-admin'?null:new Date().toISOString()]);
  const target = rows[0].id;
  await operation(admin,'invite_sent',{id:invite.id,auth_user_id:target});
  if (expired) await db.query("update private.staff_invitations set expires_at=now()-interval '1 minute' where id=$1",[invite.id]);
  else if(label==='revoked-admin') await operation(admin,'invite_revoke',{id:invite.id});
  await assert.rejects(db.query('select public.complete_administrator_invitation($1,$2)',[target,label.replaceAll('-','_')]),label==='unverified-admin'?/verify your invitation/i:/no longer available/i);
  assert.equal((await db.query('select active from public.admins where auth_user_id=$1',[target])).rows[0].active,false);
}

// Deletions are service-only, confirmed, retryable and preserve clinical/audit
// records. Auth's server API is represented by its documented soft-delete state.
async function deletion(actor, kind, target, email, stage='prepare') {
  await actAs(null);
  await db.exec('set role service_role');
  return (await db.query('select public.admin_delete_account($1,$2,$3,$4,$5) as result',
    [actor,kind,target,email,stage])).rows[0].result;
}
async function softDeleteFixture(id) {
  await actAs(null);
  await db.query("update auth.users set deleted_at=now(),email='deleted-'||id::text,raw_user_meta_data='{}',raw_app_meta_data='{}' where id=$1",[id]);
  await db.query('delete from auth.sessions where user_id=$1',[id]);
}
await actAs(admin);
const correctedStaffDirectory = (await one("select public.admin_portal_data('staff') as result")).result;
assert.equal(correctedStaffDirectory.rows.find(row=>row.email==='revoked@test.invalid').status,'revoked');
assert.equal(correctedStaffDirectory.rows.find(row=>row.email==='expired@test.invalid').status,'expired');
const deletedInvite = await operation(admin,'invite_reserve',{name:'Delete Pending Nurse',email:'delete-pending@test.invalid',role:'nurse'});
const deletedUser = '10000000-0000-4000-8000-000000000007';
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[deletedUser,'delete-pending@test.invalid']);
await operation(admin,'invite_sent',{id:deletedInvite.id,auth_user_id:deletedUser});
await actAs(deletedUser);
const deletedSetupClaims=(await one('select auth.jwt() as claims')).claims;
await assert.rejects(db.query('select public.admin_delete_account($1,$2,$3,$4,$5)',[admin,'invitation',deletedInvite.id,deletedInvite.email,'prepare']),/permission denied/i);
await assert.rejects(deletion(staff,'invitation',deletedInvite.id,deletedInvite.email),/administrator access required/i);
await assert.rejects(deletion(admin,'invitation',deletedInvite.id,'wrong@test.invalid'),/email address to confirm/i);
const preparedDeletion=await deletion(admin,'invitation',deletedInvite.id,deletedInvite.email);
assert.equal(preparedDeletion.auth_user_id,deletedUser);
assert.equal(preparedDeletion.completed,false);
assert.equal((await deletion(admin,'invitation',deletedInvite.id,deletedInvite.email)).completed,false,'retry uses the same request');
await assert.rejects(deletion(admin,'invitation',deletedInvite.id,deletedInvite.email,'complete'),/not been deleted yet/i);
await operation(admin,'invite_get',{id:deletedInvite.id});
await db.query("update private.staff_invitations set last_sent_at=now()-interval '2 minutes' where id=$1",[deletedInvite.id]);
await assert.rejects(operation(admin,'invite_resend',{id:deletedInvite.id}),/deletion is incomplete/i);
await assert.rejects(operation(deletedUser,'complete_invitation'),/no longer available/i);
await actAs(admin);
assert.equal((await one("select public.admin_portal_data('staff','delete-pending') as result")).result.rows[0].status,'deletion_pending');
assert.equal((await one("select public.admin_portal_data('invitations','delete-pending') as result")).result.rows[0].display_status,'deletion_pending');
await actAs(null);
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(deletedSetupClaims)]);
await db.exec('set role authenticated');
assert.equal((await one('select public.account_can_access() as allowed')).allowed,false,'setup JWT loses access before Auth deletion');
await softDeleteFixture(deletedUser);
await assert.rejects(operation(admin,'invite_reserve',{name:'Too Soon',email:deletedInvite.email,role:'nurse'}),/deletion is incomplete/i);
assert.equal((await deletion(admin,'invitation',deletedInvite.id,deletedInvite.email,'complete')).completed,true);
assert.equal((await deletion(admin,'invitation',deletedInvite.id,deletedInvite.email)).completed,true,'a completed retry is idempotent');
await actAs(admin);
assert.equal((await one("select public.admin_portal_data('staff','delete-pending') as result")).result.total,0);
assert.equal((await one("select public.admin_portal_data('invitations','delete-pending') as result")).result.total,0);
await actAs(null);
assert.equal((await one("select count(*)::int as n from public.audit_logs where action='STAFF_INVITATION_DELETED'")).n,1);
assert.ok((await operation(admin,'invite_reserve',{name:'Reinvited Nurse',email:deletedInvite.email,role:'nurse'})).id,'deleted email can be invited again');
await assert.rejects(deletion(admin,'invitation',invitation.id,invitation.email),/accepted invitation cannot be deleted/i);
const sendingInvite=await operation(admin,'invite_reserve',{name:'Still Sending',email:'sending@test.invalid',role:'nurse'});
await assert.rejects(deletion(admin,'invitation',sendingInvite.id,sendingInvite.email),/being sent/i);
await assert.rejects(operation(admin,'invite_revoke',{id:sendingInvite.id}),/being sent/i);
// An email failure can leave an Auth identity before invite_sent linked it.
const orphanInvite=await operation(admin,'invite_reserve',{name:'Failed Send',email:'failed-send@test.invalid',role:'nurse'});
await operation(admin,'invite_failed',{id:orphanInvite.id,message:'Fixture delivery failure'});
const orphanUser=(await db.query("insert into auth.users(email,invited_at,raw_user_meta_data) values($1,now(),$2) returning id",
  [orphanInvite.email,JSON.stringify({role:'staff_invited',invitation_id:orphanInvite.id})])).rows[0].id;
assert.equal((await deletion(admin,'invitation',orphanInvite.id,orphanInvite.email)).auth_user_id,orphanUser);
await softDeleteFixture(orphanUser);
await deletion(admin,'invitation',orphanInvite.id,orphanInvite.email,'complete');
const noAuthInvite=await operation(admin,'invite_reserve',{name:'No Auth Identity',email:'no-auth@test.invalid',role:'admin'});
await operation(admin,'invite_failed',{id:noAuthInvite.id,message:'Fixture email unavailable'});
assert.equal((await deletion(admin,'invitation',noAuthInvite.id,noAuthInvite.email)).auth_user_id,null);
await deletion(admin,'invitation',noAuthInvite.id,noAuthInvite.email,'complete');
// Never delete an existing unrelated sign-in based on matching email alone.
const unrelatedInvite=await operation(admin,'invite_reserve',{name:'Unrelated',email:'unrelated@test.invalid',role:'nurse'});
await operation(admin,'invite_failed',{id:unrelatedInvite.id,message:'Fixture failure'});
await db.query('insert into auth.users(email) values($1)',[unrelatedInvite.email]);
await assert.rejects(deletion(admin,'invitation',unrelatedInvite.id,unrelatedInvite.email),/existing account uses this email/i);

await actAs(null);
const primaryProfile=(await db.query('select id from public.admins where auth_user_id=$1',[admin])).rows[0].id;
const secondaryProfile=(await db.query('select id from public.admins where auth_user_id=$1',[administratorUser])).rows[0].id;
const physicianProfile=(await db.query('select id from public.admins where auth_user_id=$1',[staff])).rows[0].id;
await assert.rejects(deletion(admin,'administrator',primaryProfile,'admin@test.invalid'),/own administrator account/i);
await assert.rejects(deletion(admin,'administrator',physicianProfile,'physician@test.invalid'),/administrator not found/i);
await actAs(administratorUser);
const secondaryClaims=(await one('select auth.jwt() as claims')).claims;
await deletion(admin,'administrator',secondaryProfile,'administrator-invite@test.invalid');
// Models the second of two concurrent reciprocal deletions after it obtains the
// serialization lock: its actor is no longer authorized, so one admin remains.
await assert.rejects(deletion(administratorUser,'administrator',primaryProfile,'admin@test.invalid'),/administrator access required/i);
await actAs(null);
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(secondaryClaims)]);
await db.exec('set role authenticated');
await assert.rejects(db.query("select public.admin_portal_data('overview')"),/administrator access required/i);
await softDeleteFixture(administratorUser);
await deletion(admin,'administrator',secondaryProfile,'administrator-invite@test.invalid','complete');
await actAs(null);
assert.equal((await one("select count(*)::int as n from public.admins where role='admin' and active")).n,1,'last active admin remains');
assert.equal((await one(`select count(*)::int as n from private.account_controls where user_id='${administratorUser}'`)).n,0,'deleted username is released');
assert.equal((await one("select count(*)::int as n from public.audit_logs where action='ADMIN_ACCOUNT_DELETED'")).n,1);
assert.equal((await one('select count(*)::int as n from public.encounters')).n,1,'clinical records retained');
await db.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify({staff_role:'admin'}),administratorUser]);
assert.equal((await one(`select count(*)::int as n from public.admins where auth_user_id='${administratorUser}'`)).n,0,'Auth maintenance cannot recreate a deleted profile');
// Accounts linked to patient data cannot be removed using admin cleanup.
const mixedProfile=(await db.query("insert into public.admins(auth_user_id,name,email,role) values($1,'Mixed','mixed-admin@test.invalid','admin') returning id",[patient])).rows[0].id;
await assert.rejects(deletion(admin,'administrator',mixedProfile,'mixed-admin@test.invalid'),/also linked to a patient or enrollee/i);

// The user directory represents existing Auth identities, never orphaned clinic
// profiles. Account deletion retains medical history and enrollee submissions.
await actAs(null);
const orphanProfile=(await db.query("insert into public.users(name,email,role,patient_id) values('Orphan Clinic Profile','orphan-profile@test.invalid','patient','TUPM-26-9100') returning id")).rows[0].id;
await actAs(admin);
assert.equal((await one("select public.admin_portal_data('users','orphan-profile') as result")).result.total,0,'retained profile without a sign-in is not an account');
const userFixtures=[];
for (const role of ['patient','enrollee']) {
  await actAs(null);
  const email=`delete-${role}-account@test.invalid`;
  const target=(await db.query('insert into auth.users(email,email_confirmed_at,raw_user_meta_data) values($1,now(),$2) returning id',
    [email,JSON.stringify({role,name:'Same Display Name'})])).rows[0].id;
  if(role==='enrollee') await db.query("insert into public.enrollees(auth_user_id,first_name,surname,personal_email,applicant_id) values($1,'Same','Display Name',$2,'AP-DELETE')",[target,email]);
  const profile=(await db.query(`select id from public.${role==='patient'?'users':'enrollees'} where auth_user_id=$1`,[target])).rows[0].id;
  userFixtures.push({target,profile,email,role});
  await actAs(admin);
  const listed=(await one(`select public.admin_portal_data('users','${email}') as result`)).result;
  assert.equal(listed.total,1); assert.equal(listed.rows[0].id,target);
  await assert.rejects(operation(admin,'password_reset',{id:target}),/forgot password/i);
}
const userPatient=userFixtures[0],userEnrollee=userFixtures[1];
await actAs(userEnrollee.target);
await assert.rejects(db.query('update public.enrollees set auth_user_id=null where id=$1',[userEnrollee.profile]),/only clinic staff or the elevation workflow/i);
await actAs(admin);
assert.equal((await one("select public.admin_portal_data('overview') as result")).result.user_accounts,
  (await one("select public.admin_portal_data('users') as result")).result.total,'overview and directory count the same live identities');
await actAs(userPatient.target);
await assert.rejects(db.query("insert into public.audit_logs(user_name,action,meta) values('Same Display Name','LOGIN_SUCCESS',$1)",
  [JSON.stringify({actor_user_id:userEnrollee.target})]),/row-level security/i);
await db.exec('select public.record_my_sign_in(); select public.record_my_sign_in()');
await actAs(userEnrollee.target);
await db.exec('select public.record_my_sign_in()');
await operation(admin,'suspend',{id:userPatient.target,reason:'Account history filter check'});
await actAs(admin);
let history=(await db.query('select public.admin_account_history($1) as result',[userPatient.target])).rows[0].result;
assert.equal(history.total,2,'history includes actions by and affecting the account');
assert.ok(history.rows.every(row=>row.meta.actor_user_id===userPatient.target || row.meta.target_user_id===userPatient.target));
assert.ok(!history.rows.some(row=>row.meta.actor_user_id===userEnrollee.target),'matching names never merge accounts');
assert.equal(history.rows.filter(row=>row.action==='LOGIN_SUCCESS').length,1,'sign-in event deduplicates one Auth session');
assert.equal(history.rows.find(row=>row.action==='LOGIN_SUCCESS').meta.actor_user_id,userPatient.target,'actor is derived from the Auth session');
assert.equal((await db.query("select public.admin_account_history($1,'history filter','ADMIN_SUSPEND') as result",[userPatient.target])).rows[0].result.total,1);
await actAs(null);
for(const timestamp of ['2026-10-25T23:59:59.999999+08:00','2026-10-26T00:00:00+08:00']) {
  await db.query("insert into public.audit_logs(user_name,action,description,meta,created_at) values('Fixture','DATE_CHECK','Manila day boundary',$1,$2)",
    [JSON.stringify({target_user_id:userPatient.target}),timestamp]);
}
await actAs(admin);
const dated=(await db.query("select public.admin_account_history($1,'Manila','DATE_CHECK','2026-10-25','2026-10-25') as result",[userPatient.target])).rows[0].result;
assert.equal(dated.total,1,'whole Manila end date includes fractional last second and excludes next day');
await actAs(null);
for(let i=0;i<27;i++) await db.query("insert into public.audit_logs(user_name,action,description,meta) values('Fixture','PAGE_CHECK','Paged account history',$1)",[JSON.stringify({target_user_id:userPatient.target})]);
await actAs(admin);
const firstPage=(await db.query("select public.admin_account_history($1,'','PAGE_CHECK',null,null,1) as result",[userPatient.target])).rows[0].result;
const secondPage=(await db.query("select public.admin_account_history($1,'','PAGE_CHECK',null,null,2) as result",[userPatient.target])).rows[0].result;
const exported=(await db.query("select public.admin_account_history($1,'','PAGE_CHECK',null,null,1,true) as result",[userPatient.target])).rows[0].result;
assert.equal(firstPage.total,27); assert.equal(firstPage.rows.length,25); assert.equal(secondPage.rows.length,2);
assert.deepEqual([...firstPage.rows,...secondPage.rows].map(row=>row.id),exported.rows.map(row=>row.id),'display and export use identical filters and order');
await actAs(staff);
await assert.rejects(db.query('select public.admin_account_history($1)',[userPatient.target]),/administrator access required/i);
await actAs(null);
// Model dependent submissions to prove a dashboard Auth deletion cannot cascade
// through retained enrollee records after the FK change.
await db.exec('create table public.fixture_submission(id int primary key,enrollee_id uuid references public.enrollees(id) on delete cascade)');
await db.query('insert into public.fixture_submission values(1,$1)',[userEnrollee.profile]);
for(const item of userFixtures) {
  await deletion(admin,'user',item.target,item.email);
  await assert.rejects(operation(admin,'reactivate',{id:item.target,reason:'Cannot restore a deleting account'}),/deletion is incomplete/i);
  await actAs(item.target);
  assert.equal((await one('select public.account_can_access() as allowed')).allowed,false,'pending user deletion remains blocked even with a fresh Auth session');
  await assert.rejects(deletion(admin,'user',item.target,item.email,'complete'),/not been deleted yet/i);
  await softDeleteFixture(item.target);
  await actAs(admin);
  const pendingCleanup=(await one(`select public.admin_portal_data('users','${item.email}') as result`)).result;
  assert.equal(pendingCleanup.rows[0].status,'deletion_pending','removed Auth remains visible only for explicit, unfinished cleanup');
  assert.equal((await one("select public.admin_portal_data('overview') as result")).result.user_accounts,
    (await one("select public.admin_portal_data('users') as result")).result.total,'counts include pending cleanup consistently');
  await deletion(admin,'user',item.target,item.email,'complete');
  await actAs(admin);
  assert.equal((await one(`select public.admin_portal_data('users','${item.email}') as result`)).result.total,0);
  assert.ok((await db.query('select public.admin_account_history($1) as result',[item.target])).rows[0].result.total>0,'history survives sign-in deletion');
  await actAs(null);
  assert.equal((await db.query(`select count(*)::int as n from public.${item.role==='patient'?'users':'enrollees'} where id=$1`,[item.profile])).rows[0].n,1,'clinic profile retained');
}
assert.equal((await one('select count(*)::int as n from public.fixture_submission')).n,1,'enrollee submission retained');
await db.query('delete from auth.users where id=$1',[userEnrollee.target]);
assert.equal((await one('select count(*)::int as n from public.fixture_submission')).n,1,'external Auth deletion does not cascade documents');
await db.query('insert into public.fixture_submission values(2,(select id from public.enrollees where auth_user_id=$1))',[enrollee]);
await db.query('delete from auth.users where id=$1',[enrollee]);
assert.equal((await one('select count(*)::int as n from public.fixture_submission')).n,2,'dashboard deletion detaches the live enrollee and retains submissions');
await assert.rejects(deletion(admin,'user',admin,'admin@test.invalid'),/staff and administrator sign-ins/i);
await actAs(null);
await db.exec('set role anon');
await assert.rejects(db.query('select public.admin_account_history(null)'),/permission denied/i);
await assert.rejects(db.query('select public.record_my_sign_in()'),/permission denied/i);
await assert.rejects(db.query("select public.admin_portal_data('overview')"),/permission denied/i);
await assert.rejects(db.query('select public.get_my_portal_identity()'),/permission denied/i);
await db.close();
console.log('PASS: Live Auth-backed directory, user/admin/invitation deletion, retained clinic records, actor/target history, filters, pagination/export, session revocation and role guards.');

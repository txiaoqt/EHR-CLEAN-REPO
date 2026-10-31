// src/scripts/test_staff_page_access.mjs
import assert from 'node:assert/strict';
import fs from 'fs';
import { STAFF_PAGE_OPTIONS, DENTAL_PAGE_OPTIONS, canOpenStaffPage } from '../staffPageAccess.mjs';

const nurse = { role: 'nurse', page_access: ['appointments', 'patients'] };
assert.equal(canOpenStaffPage(nurse, 'appointments'), true);
assert.equal(canOpenStaffPage(nurse, 'inventory'), false);
assert.equal(canOpenStaffPage(nurse, 'encounter'), true, 'encounter follows Patients');
assert.equal(canOpenStaffPage(nurse, 'messages'), false, '/messages follows Patient Messages');
assert.equal(canOpenStaffPage(nurse, 'dashboard'), true, 'Dashboard is always available');
assert.equal(canOpenStaffPage({ role: 'nurse', page_access: [] }, 'settings'), true);
assert.equal(canOpenStaffPage({ role: 'physician' }, 'inventory'), true, 'no saved list keeps defaults');

const dentist = { role: 'dentist', page_access: ['appointments'] };
assert.equal(canOpenStaffPage(dentist, 'dental-encounter'), true, 'the encounter follows Appointments');
assert.equal(canOpenStaffPage(dentist, 'consultation-log'), false);
assert.equal(canOpenStaffPage(dentist, 'dental-record'), false, 'the record follows Patients');

// The browser lists and the database lists must name the same pages.
const sql = fs.readFileSync(new URL('../../supabase/migrations/20261031100000_dental_clinic.sql', import.meta.url), 'utf8');
const body = sql.slice(sql.indexOf('function private.role_page_options'), sql.indexOf('$$;', sql.indexOf('function private.role_page_options')));
const [dentalBody, staffBody] = body.split(' else ');
const pagesIn = text => [...text.matchAll(/'([a-z-]+)'/g)].map(m => m[1]).filter(p => p !== 'dentist');
assert.deepEqual(pagesIn(staffBody), STAFF_PAGE_OPTIONS.map(o => o.page));
assert.deepEqual(pagesIn(dentalBody), DENTAL_PAGE_OPTIONS.map(o => o.page));
const auditSql = fs.readFileSync(new URL('../../supabase/migrations/20261030150000_admin_only_audit_and_backups.sql', import.meta.url), 'utf8');
// Audit Trail and Backup & Recovery are System Admin Portal pages only.
const sidebar = fs.readFileSync(new URL('../components/sidebar/Sidebar.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
for (const page of ['audit-trail', 'backup-recovery']) {
  assert.ok(!STAFF_PAGE_OPTIONS.some(o => o.page === page) && !sidebar.includes(page) && !app.includes("path=\"/" + page), page + ' is not a staff page');
}
assert.ok(auditSql.includes("current_app_role()) = 'system_admin'"), 'only system admins read audit logs');

console.log('staff page access checks passed');

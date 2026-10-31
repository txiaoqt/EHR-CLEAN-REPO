/**
 * Regression checks for the patient record form's course and mobile inputs,
 * including exact parity between the browser RPC arguments and PostgreSQL's
 * submit_record_form signature.
 *
 * Run: node src/scripts/test_record_form_inputs.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const server = await createServer({
  configFile: path.join(root, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { COURSE_GROUPS, ALL_PROGRAMS, limitPhone, isValidPhMobile, matchPrograms } =
    await server.ssrLoadModule('/src/utils/courses.js');

  const found = (q) => matchPrograms(q).map((o) => o.program);
  assert.deepEqual(found('BSIT'), ['BS Information Technology'], 'acronym search finds the program');
  assert.ok(found('bscs').includes('BS Computer Science'), 'acronym search ignores case');
  assert.ok(found('mechatronics').some((p) => p.includes('Mechatronics')), 'word search matches inside names');
  assert.ok(found('college of science').includes('BS Environmental Science'), 'search matches the college');
  assert.equal(found('').length, ALL_PROGRAMS.length, 'empty search lists every program');
  assert.equal(found('zzz').length, 0, 'unknown text matches nothing');

  assert.equal(COURSE_GROUPS.length, 6, 'all six TUP Manila colleges are grouped');
  assert.ok(ALL_PROGRAMS.includes('BS Information Technology'), 'TUP course appears in the shared list');
  assert.ok(ALL_PROGRAMS.length >= 30, 'list includes programmes beyond College of Science');
  assert.equal(new Set(ALL_PROGRAMS).size, ALL_PROGRAMS.length, 'course choices have no duplicates');

  assert.equal(limitPhone('0917 123 4567'), '09171234567', 'spaces are stripped from a pasted phone');
  assert.equal(limitPhone('(0917) 123-4567'), '09171234567', 'punctuation is stripped');
  assert.equal(limitPhone('091712345678'), '09171234567', 'typed value is capped at 11 digits');
  assert.equal(isValidPhMobile('09171234567'), true, 'valid PH mobile is accepted');
  assert.equal(isValidPhMobile('08171234567'), false, 'number must start with 09');
  assert.equal(isValidPhMobile('0917123456'), false, '10 digits is rejected');
  assert.equal(isValidPhMobile('091712345678'), false, '12 digits is rejected');

  const component = readFileSync(path.join(root, 'src/components/PatientRecordForm.jsx'), 'utf8');
  const migration = readFileSync(
    path.join(root, 'supabase/migrations/20261018110000_patient_record_forms.sql'),
    'utf8'
  );
  const phoneMigration = readFileSync(
    path.join(root, 'supabase/migrations/20261018140000_patient_record_mobile_phone_checks.sql'),
    'utf8'
  );
  const rpcBlock = component.match(/supabase\.rpc\('submit_record_form',\s*\{([\s\S]*?)\}\)/)?.[1];
  assert.ok(rpcBlock, 'client calls submit_record_form');
  const sentArgs = [...rpcBlock.matchAll(/^\s*(p_[a-z_]+):/gm)].map((m) => m[1]);

  const signatureBlock = migration.match(
    /create or replace function public\.submit_record_form\(([\s\S]*?)\)\s*returns/i
  )?.[1];
  assert.ok(signatureBlock, 'database defines submit_record_form');
  const expectedArgs = [...signatureBlock.matchAll(/^\s*(p_[a-z_]+)\s+\w+/gm)].map((m) => m[1]);
  assert.deepEqual(sentArgs, expectedArgs, 'client argument names/order match the SQL RPC signature');

  assert.match(component, /type: 'course-select'/, 'College/Course is a dropdown field');
  assert.match(component, /maxLength=\{field\.mobileNumber \? 11 : undefined\}/, 'mobile fields cap input at 11 characters');
  assert.match(component, /pattern=\{field\.mobileNumber \? '09\[0-9\]\{9\}' : undefined\}/, 'mobile fields require 09 + 9 digits');
  assert.match(phoneMigration, /cell_phone ~ '\^09\[0-9\]\{9\}\$'/, 'SQL constrains patient mobile numbers');
  assert.match(phoneMigration, /guardian_cp ~ '\^09\[0-9\]\{9\}\$'/, 'SQL constrains guardian mobile numbers');
  assert.match(component, /error\?\.details/, 'RPC failure details are shown for diagnosis instead of a generic message');

  console.log('Record form inputs: course list, mobile formatting, and RPC signature all pass.');
} finally {
  await server.close();
}

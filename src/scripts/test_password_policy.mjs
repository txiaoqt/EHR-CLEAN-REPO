import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPasswordValid, passwordCriteria, createTemporaryPassword,
  PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_SPECIAL_CHARACTERS, AUTH_PASSWORD_CONFIG,
} from '../../supabase/functions/_shared/passwordPolicy.mjs';

test('the minimum is eight characters and a valid eight-character password is accepted', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(isPasswordValid('Abcdef1!'), true);
  assert.equal(isPasswordValid('Abcde1!'), false);
});

test('uppercase, number and special character are each enforced independently', () => {
  assert.equal(isPasswordValid('abcdef1!'), false);
  assert.equal(isPasswordValid('Abcdefg!'), false);
  assert.equal(isPasswordValid('Abcdef12'), false);
  assert.equal(isPasswordValid('Abcdef1 '), false, 'whitespace is not a special character');
  assert.equal(isPasswordValid('ABCDEF1!'), true, 'a lowercase letter was not requested');
});

test('supported special characters all satisfy the same rule as Auth configuration', () => {
  for (const character of PASSWORD_SPECIAL_CHARACTERS) assert.equal(isPasswordValid(`Abcdef1${character}`), true, character);
  assert.deepEqual(AUTH_PASSWORD_CONFIG.password_required_characters.split(':'), ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', PASSWORD_SPECIAL_CHARACTERS]);
});

test('empty, non-string and oversized passwords are rejected', () => {
  for (const value of ['', null, undefined, 12345678, {}, ' '.repeat(8)]) assert.equal(isPasswordValid(value), false);
  assert.equal(isPasswordValid(`A1!${'x'.repeat(PASSWORD_MAX_LENGTH - 3)}`), true);
  assert.equal(isPasswordValid(`A1!${'x'.repeat(PASSWORD_MAX_LENGTH - 2)}`), false);
});

test('checklist results agree with validation for partially and fully completed input', () => {
  assert.deepEqual(passwordCriteria('Abcdef12').map(rule => rule.valid), [true, true, true, false]);
  assert.equal(passwordCriteria('Abcdef1!').every(rule => rule.valid), true);
});

test('OTP-only temporary passwords are unique and meet the project policy', () => {
  const passwords = Array.from({ length: 30 }, createTemporaryPassword);
  assert.equal(new Set(passwords).size, passwords.length);
  assert.ok(passwords.every(isPasswordValid));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestVerifiedBackup } from '../utils/backupSummary.mjs';

const verified = { status: 'completed', conclusion: 'success', updatedAt: '2026-10-17T18:42:22Z', runNumber: 3 };

test('a verified workflow is shown even when the stored timestamp is missing', () => {
  const backup = latestVerifiedBackup([verified], null);
  assert.equal(backup.at, verified.updatedAt);
  assert.equal(backup.runNumber, 3);
  const local = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(backup.at));
  const parts = Object.fromEntries(local.map(({ type, value }) => [type, value]));
  assert.deepEqual([parts.month, parts.day, parts.hour, parts.minute], ['10', '18', '02', '42']);
});

test('a newer failed or running attempt does not replace a verified backup', () => {
  const failed = { ...verified, conclusion: 'failure', updatedAt: '2026-10-25T13:00:00Z' };
  const running = { ...verified, status: 'in_progress', conclusion: null, updatedAt: '2026-10-25T14:00:00Z' };
  assert.equal(latestVerifiedBackup([running, failed, verified]).at, verified.updatedAt);
});

test('successful attempts are selected by completion time rather than array order', () => {
  const newer = { ...verified, updatedAt: '2026-10-24T18:42:22Z', runNumber: 4 };
  assert.equal(latestVerifiedBackup([verified, newer]).runNumber, 4);
});

test('the recorded timestamp remains a fallback when older success is outside run history', () => {
  const failed = { ...verified, conclusion: 'failure' };
  assert.deepEqual(latestVerifiedBackup([failed], verified.updatedAt), { at: verified.updatedAt, source: 'recorded' });
  assert.equal(latestVerifiedBackup([], { completedAt: verified.updatedAt }).at, verified.updatedAt);
});

test('a newer recorded backup is retained instead of being replaced by an older history page', () => {
  const recorded = '2026-10-24T18:42:22Z';
  assert.equal(latestVerifiedBackup([verified], recorded).at, recorded);
  assert.equal(latestVerifiedBackup([verified], '2026-10-16T18:42:22Z').source, 'workflow');
});

test('an empty or failed-only history and malformed timestamps do not claim a verified backup', () => {
  assert.equal(latestVerifiedBackup(), null);
  assert.equal(latestVerifiedBackup([{ ...verified, conclusion: 'failure' }]), null);
  assert.equal(latestVerifiedBackup([{ ...verified, updatedAt: 'invalid' }], 'invalid'), null);
});

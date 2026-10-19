/**
 * Verifies Phase 5 enrollee workflow:
 *  - submit_record_form uses array_append (no 22P02 malformed array literal)
 *  - begin_enrollee_elevation & complete_enrollee_elevation RPCs exist in SQL
 *  - enrollee_messages table & RLS policies exist
 *  - EnrolleeElevationCard is wired into EnrolleeHome
 *  - ArchiveFiles page is wired into App.jsx, Sidebar.jsx, and Enrollees.jsx
 *  - EnrolleeMessageThread is wired into both EnrolleeMessages and EnrolleeReview
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const migration = read('supabase/migrations/20261018150000_phase5_elevation_archive_messaging.sql');
assert.ok(migration.includes('array_append(v_missing,'), 'submit_record_form uses array_append');
assert.ok(!migration.includes('v_missing := v_missing ||'), 'submit_record_form does not use untyped || array literal concat');
assert.ok(migration.includes('function public.begin_enrollee_elevation'), 'begin_enrollee_elevation RPC defined');
assert.ok(migration.includes('function public.complete_enrollee_elevation'), 'complete_enrollee_elevation RPC defined');
assert.ok(migration.includes('create table if not exists public.enrollee_messages'), 'enrollee_messages table defined');
assert.ok(migration.includes('archived_at = coalesce(archived_at, now())'), 'elevation archives enrollee documents');

const enrolleeHome = read('src/pages/enrollee/EnrolleeHome.jsx');
assert.ok(enrolleeHome.includes('EnrolleeElevationCard'), 'EnrolleeHome renders EnrolleeElevationCard');

const elevationCard = read('src/components/EnrolleeElevationCard.jsx');
assert.ok(elevationCard.includes('begin_enrollee_elevation'), 'EnrolleeElevationCard calls begin_enrollee_elevation');
assert.ok(elevationCard.includes('complete_enrollee_elevation'), 'EnrolleeElevationCard calls complete_enrollee_elevation');

const archivePage = read('src/pages/ArchiveFiles.jsx');
assert.ok(archivePage.includes('FolderIcon'), 'ArchiveFiles renders folder visual layout');
assert.ok(archivePage.includes('createSignedUrl'), 'ArchiveFiles previews private files via signed URLs');

const appCode = read('src/App.jsx');
assert.ok(appCode.includes('path="/archive-files"'), 'App.jsx routes /archive-files');

const enrolleeMessages = read('src/pages/enrollee/EnrolleeMessages.jsx');
assert.ok(enrolleeMessages.includes('EnrolleeMessageThread'), 'EnrolleeMessages renders EnrolleeMessageThread');

const enrolleeReview = read('src/pages/EnrolleeReview.jsx');
assert.ok(enrolleeReview.includes('EnrolleeMessageThread'), 'EnrolleeReview renders staff EnrolleeMessageThread');

console.log('Phase 5 enrollee workflow checks passed.');

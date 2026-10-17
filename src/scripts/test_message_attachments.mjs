import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' PATIENT MESSAGE PHOTO ATTACHMENTS');
console.log('='.repeat(80));

const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

// Evaluate the shipped validation logic rather than a copy of it.
const helperSrc = read('src/utils/messageAttachments.js');
const slice = helperSrc.slice(
  helperSrc.indexOf('export const MESSAGE_ATTACHMENT_BUCKET'),
  helperSrc.indexOf('const extensionFor')
);
const sandbox = new Function(
  `${slice.replace(/export const /g, 'const ')}\nreturn { validateAttachmentFile, formatFileSize, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, RESOLVED_PHOTO_NOTICE };`
)();
const { validateAttachmentFile, formatFileSize, MAX_ATTACHMENT_BYTES, RESOLVED_PHOTO_NOTICE } = sandbox;

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 1] File validation happens before upload');
// -----------------------------------------------------------------------------
assert.strictEqual(validateAttachmentFile({ type: 'image/jpeg', size: 1024, name: 'a.jpg' }), null, 'a normal JPG passes');
assert.strictEqual(validateAttachmentFile({ type: 'image/png', size: 1024, name: 'a.png' }), null, 'a PNG passes');
assert.strictEqual(validateAttachmentFile({ type: 'image/webp', size: 1024, name: 'a.webp' }), null, 'a WebP passes');

assert(/not supported/.test(validateAttachmentFile({ type: 'application/pdf', size: 10, name: 'x.pdf' })), 'a PDF is rejected');
assert(/not supported/.test(validateAttachmentFile({ type: 'video/mp4', size: 10, name: 'x.mp4' })), 'a video is rejected');
assert(/limit/.test(validateAttachmentFile({ type: 'image/png', size: MAX_ATTACHMENT_BYTES + 1, name: 'big.png' })), 'an oversized photo is rejected');
assert.strictEqual(validateAttachmentFile(null), 'No file selected.');
console.log('  ✓ PASS: supported types accepted, others rejected with a readable reason');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Sizes are shown in human terms');
// -----------------------------------------------------------------------------
assert.strictEqual(formatFileSize(512), '512 B');
assert.strictEqual(formatFileSize(2048), '2 KB');
assert.strictEqual(formatFileSize(3 * 1024 * 1024), '3.0 MB');
assert.strictEqual(formatFileSize(0), '');
assert.strictEqual(formatFileSize(null), '');
console.log('  ✓ PASS: byte counts render as B / KB / MB');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] The bucket is private');
// -----------------------------------------------------------------------------
const migration = read('supabase/migrations/20261017250000_message_photo_attachments.sql');
assert(/ADD COLUMN IF NOT EXISTS attachment_path/.test(migration), 'attachment_path exists');
for (const col of ['attachment_name', 'attachment_type', 'attachment_size', 'attachment_removed_at']) {
  assert(migration.includes(col), `${col} exists`);
}
assert(/VALUES \(\s*'message-attachments',\s*'message-attachments',\s*false,/.test(migration), 'the bucket is created with public = false');
assert(/createSignedUrl/.test(helperSrc), 'reads go through a signed URL, not a public link');
assert(!/getPublicUrl/.test(helperSrc), 'no public URL is ever generated for an attachment');
console.log('  ✓ PASS: private bucket, signed URLs only');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Both portals can send and display photos');
// -----------------------------------------------------------------------------
const staff = read('src/pages/StaffPatientMessages.jsx');
const patient = read('src/pages/patient/PatientMessages.jsx');

for (const [label, src] of [['staff', staff], ['patient', patient]]) {
  assert(src.includes('uploadMessageAttachment'), `${label}: uploads an attachment`);
  assert(src.includes('validateAttachmentFile'), `${label}: validates before uploading`);
  assert(src.includes('accept="image/jpeg,image/png,image/webp,image/heic,image/heif"'), `${label}: the picker accepts photos only`);
  assert(src.includes('<MessageAttachment'), `${label}: renders the attachment`);
  assert(/pendingPhoto/.test(src), `${label}: shows a pending-photo preview`);
  // A message carrying a photo must not go through the RPC, which has no
  // attachment parameters.
  assert(/rpcError \|\| hasPhoto/.test(src), `${label}: a photo message is written directly, not via the RPC`);
}
console.log('  ✓ PASS: staff and patient portals both attach, validate and render');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Resolving deletes the photo and says so');
// -----------------------------------------------------------------------------
assert(/deleteMessageAttachments\(paths\)/.test(staff), 'resolve deletes the thread\'s photos');
assert(/attachment_removed_at: new Date\(\)\.toISOString\(\)/.test(staff), 'resolve records that the photo was removed');
assert(/RESOLVED_PHOTO_NOTICE/.test(staff), 'resolve posts the removal notice');
assert(
  /paths\.length > 0 && !removalFailed/.test(staff),
  'the notice is only posted when a photo was actually removed'
);
assert(
  /removalFailed/.test(staff) && /could not be removed/.test(staff),
  'a failed deletion is reported rather than silently claimed'
);
assert(
  /any photos sent in this thread will be permanently deleted/.test(staff),
  'the confirmation dialog warns that photos are deleted'
);

const attachment = read('src/components/MessageAttachment.jsx');
assert(attachment.includes('RESOLVED_PHOTO_NOTICE'), 'the thread renders the removal notice');
assert(/removedAt/.test(attachment), 'a removed photo shows the notice instead of a broken image');
console.log('  ✓ PASS: photos are deleted on resolve, recorded, and reported honestly');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] The notice wording is exactly as specified');
// -----------------------------------------------------------------------------
assert.strictEqual(
  RESOLVED_PHOTO_NOTICE,
  'Chat resolved. Photo has been removed.',
  'notice text matches the requirement'
);
console.log(`  ✓ PASS: "${RESOLVED_PHOTO_NOTICE}"`);

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] A photo-only message draws no empty bubble');
// -----------------------------------------------------------------------------
for (const [label, src] of [['staff', staff], ['patient', patient]]) {
  assert(
    /msg\.message_text \? \(/.test(src),
    `${label}: the bubble is only rendered when there is text`
  );
  assert(
    /\{\(msg\.attachment_path \|\| msg\.attachment_removed_at\) && \(/.test(src),
    `${label}: the attachment renders regardless of text`
  );
}
console.log('  ✓ PASS: a photo with no text shows the photo alone, not an empty bubble');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] Reactions');
// -----------------------------------------------------------------------------
const reactionMigration = read('supabase/migrations/20261017260000_message_reactions.sql');
assert(/CREATE TABLE IF NOT EXISTS public\.patient_message_reactions/.test(reactionMigration), 'the table exists');
assert(
  /UNIQUE INDEX IF NOT EXISTS idx_patient_message_reactions_unique\s*\n\s*ON public\.patient_message_reactions \(message_id, reactor_auth_user_id, emoji\)/.test(reactionMigration),
  'one reaction per person per emoji, so tapping twice toggles'
);
assert(/ON DELETE CASCADE/.test(reactionMigration), 'removing a message removes its reactions');
assert(/WITH CHECK \(reactor_auth_user_id = auth\.uid\(\)\)/.test(reactionMigration), 'a person may only add their own reaction');
assert(/USING \(reactor_auth_user_id = auth\.uid\(\)\)/.test(reactionMigration), 'a person may only remove their own reaction');
assert(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.patient_message_reactions/.test(reactionMigration), 'reactions stream in realtime');

const reactionsComponent = read('src/components/MessageReactions.jsx');
assert(/export const REACTION_EMOJIS/.test(reactionsComponent), 'the emoji set is defined');
assert(/aria-pressed=/.test(reactionsComponent), 'a reaction the user made is exposed to assistive tech');
assert(/setPickerOpen/.test(reactionsComponent), 'there is a picker');

for (const [label, src] of [['staff', staff], ['patient', patient]]) {
  assert(src.includes('<MessageReactions'), `${label}: renders reactions`);
  assert(/toggleReaction/.test(src), `${label}: can toggle a reaction`);
  assert(/patient_message_reactions/.test(src), `${label}: reads and writes the reactions table`);
  assert(/table: 'patient_message_reactions'/.test(src), `${label}: subscribes to reaction changes`);
}
console.log('  ✓ PASS: reactions on both portals, toggle-able, streamed live');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 9] Reaction picker stays inside the chat area');
// -----------------------------------------------------------------------------
assert(
  /align === 'right' \? \{ right: 0 \} : \{ left: 0 \}/.test(reactionsComponent),
  'the picker anchors to the side the message sits on'
);
assert(
  /justifyContent: align === 'right' \? 'flex-end' : 'flex-start'/.test(reactionsComponent),
  'reaction chips sit under the message they belong to'
);
for (const [label, src] of [['staff', staff], ['patient', patient]]) {
  assert(/align=\{is\w+ \? '(left|right)' : '(left|right)'\}/.test(src), `${label}: passes the message alignment`);
}
console.log('  ✓ PASS: the picker no longer overflows the thread');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 10] Chat scrolls without a visible scrollbar');
// -----------------------------------------------------------------------------
const css = read('src/styles/components.css');
const chatArea = css.slice(
  css.indexOf('.tup-chat-messages-area {'),
  css.indexOf('.tup-chat-date-divider')
);
assert(/overflow-x: hidden/.test(chatArea), 'a conversation never scrolls sideways');
assert(/scrollbar-width: thin/.test(chatArea), 'Firefox: thin scrollbar');
assert(/scrollbar-color: transparent transparent/.test(chatArea), 'Firefox: invisible at rest');
assert(/:hover[\s\S]{0,80}scrollbar-color: rgba/.test(chatArea), 'Firefox: revealed on hover');
assert(/\.tup-chat-messages-area::-webkit-scrollbar\s*\{[^}]*height: 0/.test(chatArea), 'WebKit: no horizontal track');
assert(/::-webkit-scrollbar-thumb\s*\{[^}]*background: transparent/.test(chatArea), 'WebKit: thumb invisible at rest');
assert(
  /:hover::-webkit-scrollbar-thumb[\s\S]{0,200}background: rgba/.test(chatArea),
  'WebKit: thumb revealed on hover'
);
console.log('  ✓ PASS: scrollbar hidden until hover, scrolling unaffected');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 11] A resolved inquiry is read-only');
// -----------------------------------------------------------------------------
const lockMigration = read('supabase/migrations/20261017280000_block_reactions_on_resolved.sql');
assert(/CREATE TRIGGER trg_block_reaction_on_resolved/.test(lockMigration), 'the database rejects reactions on resolved threads');
assert(/lower\(v_status\) <> 'open'/.test(lockMigration), 'only an open conversation accepts reactions');
assert(/BEFORE INSERT ON public\.patient_message_reactions/.test(lockMigration), 'enforced before the row is written');

for (const [label, src] of [['staff', staff], ['patient', patient]]) {
  assert(
    /disabled=\{isCurrentConversationResolved\}/.test(src),
    `${label}: the reaction control is disabled on a resolved thread`
  );
  assert(
    /if \(isCurrentConversationResolved\) return;/.test(src),
    `${label}: toggling is guarded even if the control were reached`
  );
}
console.log('  ✓ PASS: reactions closed on resolve, in the UI and in the database');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 12] Clearing an attachment does not rely on a table UPDATE');
// -----------------------------------------------------------------------------
// patient_messages has no UPDATE policy, so a direct update was silently
// rejected (0 rows, no error) and the thread showed "no longer available"
// instead of the removal notice.
const rpcMigration = read('supabase/migrations/20261017270000_clear_message_attachment_rpc.sql');
assert(/CREATE OR REPLACE FUNCTION public\.clear_message_attachment/.test(rpcMigration), 'a dedicated RPC clears the attachment');
assert(/SECURITY DEFINER/.test(rpcMigration), 'it runs with the privileges it needs');
assert(/v_role NOT IN \('admin', 'physician', 'nurse'\)/.test(rpcMigration), 'only clinic staff may clear an attachment');
assert(
  /FROM storage\.objects o[\s\S]{0,120}o\.name = m\.attachment_path/.test(rpcMigration),
  'rows whose file is already gone are repaired'
);
assert(
  /supabase\.rpc\('clear_message_attachment'/.test(staff),
  'the staff page uses the RPC rather than a direct update'
);
assert(
  !/from\('patient_messages'\)\s*\n?\s*\.update\(/.test(staff),
  'no direct UPDATE of patient_messages remains'
);
assert(
  /bookkeeping\.some\(\(r\) => r\.error \|\| r\.data === false\)/.test(staff),
  'a failed bookkeeping write is treated as a failed removal'
);
console.log('  ✓ PASS: attachment clearing goes through the RPC and reports failure');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 13] A resolved inquiry can be deleted');
// -----------------------------------------------------------------------------
const deleteMigration = read('supabase/migrations/20261017290000_delete_resolved_conversation_rpc.sql');
assert(
  /CREATE OR REPLACE FUNCTION public\.delete_resolved_conversation/.test(deleteMigration),
  'a dedicated RPC deletes a conversation'
);
assert(/SECURITY DEFINER/.test(deleteMigration), 'it runs with the privileges it needs');
assert(
  /v_role NOT IN \('admin', 'physician', 'nurse'\)/.test(deleteMigration),
  'only clinic staff may delete'
);
assert(
  /lower\(v_status\) = 'open'[\s\S]{0,160}RAISE EXCEPTION/.test(deleteMigration),
  'an open inquiry is refused, so a live consultation cannot be removed'
);
assert(
  /DELETE FROM public\.patient_message_conversations WHERE id = p_conversation_id/.test(deleteMigration),
  'the conversation is deleted'
);

// Photos go first: a plpgsql function cannot remove a Storage object, so an
// orphaned clinical photo would otherwise be left with no record pointing at it.
assert(
  /const \{ failed \} = await deleteMessageAttachments\(paths\)/.test(staff),
  'the delete removes the thread\'s photos first'
);
assert(
  /failed\.length > 0[\s\S]{0,220}return;/.test(staff),
  'if a photo cannot be removed the deletion is aborted, not half-done'
);
// RLS-blocked writes report success with nothing done.
assert(
  /if \(data !== true\)/.test(staff),
  'the RPC result is checked rather than trusting the absence of an error'
);

assert(/setDeleteModalOpen\(true\)/.test(staff), 'a delete confirmation is offered');
assert(
  /Delete this inquiry\?/.test(staff) && /cannot be undone/.test(staff),
  'the confirmation says the deletion is permanent'
);
assert(
  /!isCurrentConversationResolved \? \(/.test(staff),
  'Delete is only offered on a resolved thread'
);
console.log('  ✓ PASS: resolved inquiries can be deleted, photos first, open ones refused');

console.log('\n' + '='.repeat(80));
console.log(' ALL MESSAGE ATTACHMENT TESTS PASSED (100%)');
console.log('='.repeat(80));

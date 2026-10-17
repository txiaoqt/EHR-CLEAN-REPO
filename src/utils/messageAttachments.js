// src/utils/messageAttachments.js
//
// Photo attachments for patient messages, shared by the staff and patient
// portals so both behave identically.
//
// The bucket is private, so an attachment is read through a short-lived signed
// URL rather than a public link. When a conversation is resolved the file is
// deleted outright and the message row keeps only a note that it was removed —
// clinical photographs should not outlive the inquiry they were sent for.

import { supabase } from '../supabaseClient.js';

export const MESSAGE_ATTACHMENT_BUCKET = 'message-attachments';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // matches the bucket limit
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

/** Shown in the thread once the photo has been deleted on resolve. */
export const RESOLVED_PHOTO_NOTICE = 'Chat resolved. Photo has been removed.';

/** Signed URLs are short-lived; an hour is ample for a chat session. */
export const SIGNED_URL_TTL_SECONDS = 3600;

export const formatFileSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Returns a human-readable problem with the chosen file, or null when it is
 * acceptable. Checked before upload so the user is not left waiting for a
 * round-trip that the bucket would reject anyway.
 */
export const validateAttachmentFile = (file) => {
  if (!file) return 'No file selected.';
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return 'That file type is not supported. Please send a JPG, PNG or WebP photo.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `That photo is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`;
  }
  return null;
};

const extensionFor = (file) => {
  const fromName = (file.name || '').split('.').pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  return (file.type.split('/')[1] || 'jpg').toLowerCase();
};

/**
 * Uploads a photo and returns the metadata to store on the message row.
 * The path is namespaced by conversation so a thread's files can be found and
 * removed together.
 */
export const uploadMessageAttachment = async (file, conversationId) => {
  const problem = validateAttachmentFile(file);
  if (problem) throw new Error(problem);

  const folder = conversationId || 'unfiled';
  const path = `${folder}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENT_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw new Error(error.message || 'The photo could not be uploaded.');

  return {
    attachment_path: path,
    attachment_name: file.name || 'photo',
    attachment_type: file.type,
    attachment_size: file.size,
  };
};

/** A viewable URL for a private attachment, or null if it cannot be signed. */
export const signedMessageAttachmentUrl = async (path, expiresIn = SIGNED_URL_TTL_SECONDS) => {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
};

/**
 * Deletes attachment files. Returns what actually went, so the caller can tell
 * the truth in the thread rather than claiming a removal that failed.
 */
export const deleteMessageAttachments = async (paths) => {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) return { removed: [], failed: [] };

  try {
    const { data, error } = await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).remove(list);
    if (error) return { removed: [], failed: list };
    const removed = (data || []).map((d) => d.name);
    const failed = list.filter((p) => !removed.includes(p));
    return { removed, failed };
  } catch {
    return { removed: [], failed: list };
  }
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import ResultDialog from './ResultDialog.jsx';
import { AlertIcon, CheckIcon } from './icons/Icons.jsx';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const formatDate = (value) => (
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not submitted'
);

const EnrolleeDocumentUpload = ({ locked = false }) => {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const [docs, setDocs] = useState([]);
  const [queuedFiles, setQueuedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('error');
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) {
      setDocs([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('enrollee_documents')
        .select('id, file_name, storage_path, status, revision_note, revision_due_at, submitted_at, mime_type')
        .eq('enrollee_id', user.id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setDocs(data || []);
    } catch (error) {
      console.warn('Could not load your documents:', error);
      if (!quiet) {
        setTone('error');
        setMessage('Your submissions could not be loaded. Please refresh and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase
      .channel(`enrollee-documents-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'enrollee_documents',
        filter: `enrollee_id=eq.${user.id}`,
      }, () => load({ quiet: true }))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const announce = (nextTone, nextMessage) => {
    setTone(nextTone);
    setMessage(nextMessage);
  };

  const handleFilesSelected = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    const valid = [];
    const invalid = [];
    selected.forEach((file) => {
      if (file.size > MAX_BYTES) {
        invalid.push(`${file.name} is larger than 10 MB`);
      } else if (!ACCEPTED.includes(file.type)) {
        invalid.push(`${file.name} is not a JPG, PNG, WEBP, or PDF`);
      } else {
        valid.push({ id: crypto.randomUUID(), file });
      }
    });

    if (valid.length) {
      setQueuedFiles((current) => [...current, ...valid]);
      setMessage('');
    }
    if (invalid.length) {
      announce('error', `${invalid.join('. ')}. Choose a photo or PDF up to 10 MB each.`);
    }
  };

  const persistQueuedFiles = async (entries) => {
    const saved = [];
    const documentIds = [];

    try {
      for (const entry of entries) {
        const file = entry.file;
        const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('enrollee-documents')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        const { data, error } = await supabase.rpc('save_enrollee_document', {
          p_storage_path: path,
          p_file_name: file.name,
          p_mime_type: file.type,
          p_size_bytes: file.size,
        });

        if (error || !data?.success || !data?.document_id) {
          await supabase.storage.from('enrollee-documents').remove([path]).catch(() => {});
          throw new Error(data?.error || 'A file could not be saved as a draft.');
        }

        saved.push(entry.id);
        documentIds.push(data.document_id);
      }
    } catch (error) {
      error.savedQueueIds = saved;
      throw error;
    }

    return { savedQueueIds: saved, documentIds };
  };

  const forgetSavedQueueItems = (ids) => {
    if (!ids?.length) return;
    const savedIds = new Set(ids);
    setQueuedFiles((current) => current.filter((entry) => !savedIds.has(entry.id)));
  };

  const saveDrafts = async () => {
    if (busyRef.current || locked || !queuedFiles.length) return;
    busyRef.current = true;
    setBusyAction('saving');
    setMessage('');

    try {
      const result = await persistQueuedFiles(queuedFiles);
      forgetSavedQueueItems(result.savedQueueIds);
      await load({ quiet: true });
      announce('success', `${result.documentIds.length} ${result.documentIds.length === 1 ? 'file was' : 'files were'} saved as draft. The clinic cannot see them until you submit for review.`);
    } catch (error) {
      forgetSavedQueueItems(error.savedQueueIds);
      if (error.savedQueueIds?.length) await load({ quiet: true });
      announce('error', error.message || 'Your draft could not be saved. Please try again.');
    } finally {
      busyRef.current = false;
      setBusyAction('');
    }
  };

  const submitDrafts = async () => {
    if (busyRef.current || locked) return;
    setConfirmSubmit(false);
    busyRef.current = true;
    setBusyAction('submitting');
    setMessage('');

    let persistedQueueIds = [];
    let newDraftIds = [];
    try {
      if (queuedFiles.length) {
        const saved = await persistQueuedFiles(queuedFiles);
        persistedQueueIds = saved.savedQueueIds;
        newDraftIds = saved.documentIds;
        forgetSavedQueueItems(persistedQueueIds);
      }

      const savedDraftIds = docs.filter((doc) => doc.status === 'draft').map((doc) => doc.id);
      const documentIds = [...new Set([...savedDraftIds, ...newDraftIds])];
      if (!documentIds.length) {
        throw new Error('Choose or save at least one file before submitting.');
      }

      const { data, error } = await supabase.rpc('submit_enrollee_documents', {
        p_document_ids: documentIds,
      });
      if (error || !data?.success) throw new Error(data?.error || 'Your documents could not be submitted.');

      await load({ quiet: true });
      announce('success', `${data.submitted_count || documentIds.length} ${documentIds.length === 1 ? 'document was' : 'documents were'} submitted for clinic review.`);
    } catch (error) {
      const savedIds = error.savedQueueIds || persistedQueueIds;
      forgetSavedQueueItems(savedIds);
      if (savedIds.length || newDraftIds.length) await load({ quiet: true });
      announce('error', savedIds.length || newDraftIds.length
        ? `Your files are safe as drafts, but could not be submitted: ${error.message || 'Please try again.'}`
        : error.message || 'Your documents could not be submitted. Please try again.');
    } finally {
      busyRef.current = false;
      setBusyAction('');
    }
  };

  const removeDraft = async (doc) => {
    if (busyRef.current || doc.status !== 'draft') return;
    busyRef.current = true;
    setBusyAction(`remove-${doc.id}`);
    setMessage('');
    try {
      if (doc.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('enrollee-documents')
          .remove([doc.storage_path]);
        if (storageError) throw storageError;
      }

      const { data, error } = await supabase.rpc('delete_enrollee_document_draft', {
        p_document_id: doc.id,
      });
      if (error || !data?.success) throw new Error(data?.error || 'This draft could not be removed.');
      await load({ quiet: true });
      announce('success', 'Draft removed.');
    } catch (error) {
      announce('error', error.message || 'This draft could not be removed. Please try again.');
    } finally {
      busyRef.current = false;
      setBusyAction('');
    }
  };

  const statusPill = (status) => {
    const map = {
      draft: { label: 'Draft', color: 'var(--text-muted)', background: 'var(--surface-raised)' },
      approved: { label: 'Approved', color: 'var(--color-emerald-text)', background: 'var(--color-emerald-bg)' },
      needs_revision: { label: 'Needs revision', color: 'var(--color-rose-text)', background: 'var(--color-rose-bg)' },
      pending: { label: 'Pending review', color: 'var(--text)', background: 'var(--surface-raised)' },
    };
    const style = map[status] || map.pending;
    return (
      <span className="enrollee-document-status" style={{ color: style.color, background: style.background }}>
        {style.label}
      </span>
    );
  };

  const drafts = docs.filter((doc) => doc.status === 'draft');
  const submissions = docs.filter((doc) => doc.status !== 'draft');
  const pendingSubmissionCount = drafts.length + queuedFiles.length;
  const canSubmit = !locked && !busyAction && pendingSubmissionCount > 0;

  return (
    <>
      <div className="enrollee-drop" aria-disabled={locked || undefined}>
        <div className="enrollee-drop-title">
          {submissions.length || drafts.length ? 'Add more files' : 'Choose photos or PDFs'}
        </div>
        <div className="enrollee-drop-note">
          Files stay on this device until you save them as drafts or submit them. Only submitted files are visible to clinic staff.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesSelected}
        />
        <button
          type="button"
          className="btn"
          disabled={locked || Boolean(busyAction)}
          onClick={() => inputRef.current?.click()}
        >
          {busyAction === 'saving' ? 'Saving drafts…' : busyAction === 'submitting' ? 'Submitting…' : locked ? 'Locked' : 'Choose files'}
        </button>
        <div className="settings-row-note" style={{ marginTop: 10 }}>
          {locked
            ? 'Available once your clinic record is complete.'
            : 'JPG, PNG, WEBP, or PDF · up to 10 MB per file · select more than one.'}
        </div>
      </div>

      {queuedFiles.length > 0 && (
        <section className="enrollee-document-group" aria-labelledby="selected-files-title">
          <div className="enrollee-document-group-head">
            <div>
              <h3 id="selected-files-title">Ready to save or submit</h3>
              <p>These files have not been uploaded.</p>
            </div>
            <span className="enrollee-document-count">{queuedFiles.length}</span>
          </div>
          <div className="enrollee-document-list">
            {queuedFiles.map((entry) => (
              <div className="enrollee-document-row" key={entry.id}>
                <div className="enrollee-document-copy">
                  <strong title={entry.file.name}>{entry.file.name}</strong>
                  <span>{entry.file.size >= 1024 * 1024 ? `${(entry.file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(entry.file.size / 1024))} KB`} · Not uploaded</span>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={Boolean(busyAction)}
                  onClick={() => setQueuedFiles((current) => current.filter((file) => file.id !== entry.id))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="enrollee-document-actions">
            <button type="button" className="btn secondary" disabled={locked || Boolean(busyAction)} onClick={saveDrafts}>
              Save as draft
            </button>
            <button type="button" className="btn" disabled={!canSubmit} onClick={() => setConfirmSubmit(true)}>
              Submit for review
            </button>
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="enrollee-document-group" aria-labelledby="saved-drafts-title">
          <div className="enrollee-document-group-head">
            <div>
              <h3 id="saved-drafts-title">Saved drafts</h3>
              <p>Only you can see these files. Submit them when they are ready.</p>
            </div>
            <span className="enrollee-document-count">{drafts.length}</span>
          </div>
          <div className="enrollee-document-list">
            {drafts.map((doc) => (
              <div className="enrollee-document-row" key={doc.id}>
                <div className="enrollee-document-copy">
                  <strong title={doc.file_name}>{doc.file_name}</strong>
                  <span>Saved as draft</span>
                </div>
                <div className="enrollee-document-row-actions">
                  {statusPill(doc.status)}
                  <button type="button" className="btn secondary small" disabled={Boolean(busyAction)} onClick={() => removeDraft(doc)}>
                    {busyAction === `remove-${doc.id}` ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!queuedFiles.length && (
            <div className="enrollee-document-actions">
              <button type="button" className="btn" disabled={!canSubmit} onClick={() => setConfirmSubmit(true)}>
                Submit drafts for review
              </button>
            </div>
          )}
        </section>
      )}

      {message && (
        <div
          role="status"
          className="record-form-message"
          style={{
            marginTop: 14,
            marginBottom: 0,
            background: tone === 'success' ? 'var(--color-emerald-bg)' : 'var(--color-rose-bg)',
            color: tone === 'success' ? 'var(--color-emerald-text)' : 'var(--color-rose-text)',
          }}
        >
          {tone === 'success' ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div className="settings-row-note" style={{ marginTop: 16 }}>Loading your submissions…</div>
      ) : submissions.length === 0 ? (
        !drafts.length && !queuedFiles.length && (
          <div className="settings-row" style={{ borderBottom: 'none', paddingBottom: 0, marginTop: 16 }}>
            <div>
              <div className="settings-row-label">Nothing submitted yet</div>
              <div className="settings-row-note">You can save files as drafts first. The clinic sees them only after you submit.</div>
            </div>
          </div>
        )
      ) : (
        <section className="enrollee-document-group" aria-labelledby="submissions-title">
          <div className="enrollee-document-group-head">
            <div>
              <h3 id="submissions-title">Submitted files</h3>
              <p>Add more files any time; each submission is reviewed separately.</p>
            </div>
            <span className="enrollee-document-count">{submissions.length}</span>
          </div>
          <div className="enrollee-document-list">
            {submissions.map((doc) => (
              <div className="enrollee-document-row" key={doc.id}>
                <div className="enrollee-document-copy">
                  <strong title={doc.file_name}>{doc.file_name}</strong>
                  <span>Submitted {formatDate(doc.submitted_at)}</span>
                  {doc.status === 'needs_revision' && doc.revision_note && (
                    <span className="enrollee-document-revision-note">
                      “{doc.revision_note}”{doc.revision_due_at && ` — resubmit by ${formatDate(doc.revision_due_at)}`}
                    </span>
                  )}
                </div>
                {statusPill(doc.status)}
              </div>
            ))}
          </div>
        </section>
      )}

      <ResultDialog
        open={confirmSubmit}
        tone="info"
        title="Submit these documents for review?"
        message="Once submitted, the clinic staff can open the files and record a decision. You can still add more files later."
        details={[
          `${drafts.length + queuedFiles.length} ${drafts.length + queuedFiles.length === 1 ? 'file' : 'files'} will be submitted.`,
          ...(queuedFiles.length ? [`${queuedFiles.length} newly selected ${queuedFiles.length === 1 ? 'file will' : 'files will'} upload now.`] : []),
        ]}
        actions={[
          { label: 'Submit for review', onClick: submitDrafts },
          { label: 'Keep editing', variant: 'secondary', onClick: () => setConfirmSubmit(false) },
        ]}
        onClose={() => setConfirmSubmit(false)}
      />
    </>
  );
};

export default EnrolleeDocumentUpload;

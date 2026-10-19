import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { createReviewPreviewCache, reviewFileKey } from '../utils/reviewPreviewCache.js';
import RecordSummaryCard from '../components/RecordSummaryCard.jsx';
import PdfJsDocumentPreview from '../components/PdfJsDocumentPreview.jsx';
import EnrolleeMessageThread from '../components/EnrolleeMessageThread.jsx';
import EnrolleeApprovalDialog from '../components/EnrolleeApprovalDialog.jsx';
import ResultDialog from '../components/ResultDialog.jsx';
import { AlertIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons/Icons.jsx';

const statusText = {
  approved: 'Approved',
  needs_revision: 'Needs revision',
  pending: 'Pending review',
};

const statusTone = {
  approved: 'approved',
  needs_revision: 'revision',
  pending: 'pending',
};

const formatDate = (value, options = { dateStyle: 'medium' }) => (
  value ? new Date(value).toLocaleString(undefined, options) : '—'
);

const formatSize = (bytes) => {
  if (!bytes) return 'Size unavailable';
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const StatusBadge = ({ status }) => (
  <span className={`enrollee-review-status is-${statusTone[status] || 'pending'}`}>
    {statusText[status] || 'Pending review'}
  </span>
);

const awaitingReview = (document) => ['pending', 'needs_revision'].includes(document.status);

const EnrolleeReview = () => {
  const { enrolleeId } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [informationCollapsed, setInformationCollapsed] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [previewSource, setPreviewSource] = useState(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [checkedFileKeys, setCheckedFileKeys] = useState(() => new Set());
  const [approvalProgress, setApprovalProgress] = useState(null);
  const [approvalRequest, setApprovalRequest] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queueRef = useRef(null);
  const selectAllRef = useRef(null);
  const decisionBusyRef = useRef(false);
  const activeReviewRef = useRef(null);
  const previewCache = useMemo(() => createReviewPreviewCache(), [enrolleeId]);

  useEffect(() => previewCache.retain(), [previewCache]);
  useEffect(() => {
    activeReviewRef.current = previewCache;
    return () => { activeReviewRef.current = null; };
  }, [previewCache]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const { data: enrollee, error: enrolleeError } = await supabase
        .from('enrollees')
        .select('id, personal_email, applicant_id, first_name, middle_name, surname, date_of_birth, status, tup_email, elevated_at, created_at, updated_at')
        .eq('id', enrolleeId)
        .maybeSingle();
      if (enrolleeError) throw enrolleeError;
      if (activeReviewRef.current !== previewCache) return;

      if (!enrollee) {
        setPerson(null);
        setDocuments([]);
        setPageError('This enrollee could not be found. It may have been removed.');
        return;
      }

      const { data: submittedDocuments, error: documentsError } = await supabase
        .from('enrollee_documents')
        .select('id, enrollee_id, file_name, storage_path, mime_type, size_bytes, status, revision_note, revision_due_at, reviewed_by, reviewed_at, submitted_at, updated_at')
        .eq('enrollee_id', enrolleeId)
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false });
      if (documentsError) throw documentsError;
      if (activeReviewRef.current !== previewCache) return;

      const nextDocuments = submittedDocuments || [];
      previewCache.setDocuments(nextDocuments);
      setPerson(enrollee);
      setDocuments(nextDocuments);
      setSelectedDocId((current) => (
        nextDocuments.some((doc) => doc.id === current) ? current : nextDocuments[0]?.id || null
      ));
      setPageError('');
    } catch (error) {
      console.error('Could not load enrollee review:', error);
      if (!quiet && activeReviewRef.current === previewCache) setPageError('The enrollee details could not be loaded. Refresh the page and try again.');
    } finally {
      if (!quiet && activeReviewRef.current === previewCache) setLoading(false);
    }
  }, [enrolleeId, previewCache]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enrolleeId) return undefined;

    const channel = supabase
      .channel(`enrollee-review-${enrolleeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'enrollee_documents',
        filter: `enrollee_id=eq.${enrolleeId}`,
      }, () => load({ quiet: true }))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'enrollees',
        filter: `id=eq.${enrolleeId}`,
      }, () => load({ quiet: true }))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enrolleeId, load]);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocId) || null,
    [documents, selectedDocId]
  );
  const selectedIndex = documents.findIndex((document) => document.id === selectedDocId);
  const reviewableDocuments = documents.filter(awaitingReview);
  const checkedDocuments = documents.filter((document) => checkedFileKeys.has(reviewFileKey(document))
    && (awaitingReview(document) || approvalProgress));
  const allChecked = reviewableDocuments.length > 0
    && reviewableDocuments.every((document) => checkedFileKeys.has(reviewFileKey(document)));
  const partiallyChecked = !allChecked && checkedDocuments.length > 0;
  const decisionDocument = checkedDocuments.length > 1 ? null : checkedDocuments[0] || selectedDocument;
  const selectedFileKey = reviewFileKey(selectedDocument);
  const previewUrl = previewSource?.key === selectedFileKey ? previewSource.url : '';
  const fullName = person
    ? [person.first_name, person.middle_name, person.surname].filter(Boolean).join(' ')
    : '';

  useEffect(() => {
    setRevisionOpen(false);
    setRevisionNote(decisionDocument?.revision_note || '');
  }, [decisionDocument?.id, decisionDocument?.revision_note]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallyChecked;
  }, [partiallyChecked]);

  useEffect(() => {
    if (savingDecision) return;
    const eligible = new Set(documents.filter(awaitingReview).map(reviewFileKey));
    setCheckedFileKeys((current) => {
      const next = new Set([...current].filter((key) => eligible.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [documents, savingDecision]);

  useEffect(() => {
    setCheckedFileKeys(new Set());
    setApprovalRequest(null);
    setApprovalProgress(null);
    setSavingDecision(false);
    decisionBusyRef.current = false;
  }, [enrolleeId]);

  const approvalTargetsUnchanged = useCallback((request) => request?.scope === enrolleeId
    && request.documents.every((target) => documents.some((document) => awaitingReview(document)
      && reviewFileKey(document) === reviewFileKey(target))), [enrolleeId, documents]);

  useEffect(() => {
    if (!approvalRequest || savingDecision) return;
    if (!approvalTargetsUnchanged(approvalRequest)) {
      setApprovalRequest(null);
      setResult({ tone: 'info', title: 'Documents changed', message: 'One or more files changed or were reviewed by another staff member. Review the updated queue before confirming approval again.' });
    }
  }, [approvalRequest, approvalTargetsUnchanged, savingDecision]);

  const beginApproval = () => {
    if (decisionBusyRef.current || person?.id !== enrolleeId) return;
    const targets = (checkedDocuments.length ? checkedDocuments : [decisionDocument]).filter((document) => document && awaitingReview(document));
    if (!targets.length) return;
    setApprovalRequest({ scope: enrolleeId, documents: targets.map((document) => ({ ...document })) });
  };

  const toggleDocument = (document) => {
    if (decisionBusyRef.current || !awaitingReview(document)) return;
    const key = reviewFileKey(document);
    setCheckedFileKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllDocuments = () => {
    if (decisionBusyRef.current) return;
    setCheckedFileKeys(allChecked ? new Set() : new Set(reviewableDocuments.map(reviewFileKey)));
  };

  useEffect(() => {
    const queue = queueRef.current;
    const selected = queue?.querySelector('[aria-current="true"]')?.closest('.enrollee-review-queue-item');
    if (!selected) return;
    // Keep document navigation inside the queue without scrolling the page.
    const top = selected.offsetTop;
    const bottom = top + selected.offsetHeight;
    if (top < queue.scrollTop) queue.scrollTop = top;
    else if (bottom > queue.scrollTop + queue.clientHeight) {
      queue.scrollTop = bottom - queue.clientHeight;
    }
  }, [selectedDocId, documents.length]);

  const requestRevision = async (note = '') => {
    if (!decisionDocument || decisionBusyRef.current || savingDecision) return;
    if (!note.trim()) return;

    const target = decisionDocument;
    decisionBusyRef.current = true;
    setSavingDecision(true);
    try {
      const { data, error } = await supabase.rpc('review_enrollee_document', {
        p_document_id: target.id,
        p_decision: 'needs_revision',
        p_note: note.trim(),
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'The decision could not be saved.');

      await logAudit(
        'Enrollee Document Reviewed',
        `Requested a revision on ${target.file_name}`,
        undefined,
        { type: 'enrollee' }
      );

      await load({ quiet: true });
      if (activeReviewRef.current !== previewCache) return;
      setCheckedFileKeys((current) => {
        const next = new Set(current);
        next.delete(reviewFileKey(target));
        return next;
      });
      setRevisionOpen(false);
      setRevisionNote('');
      setResult({
        tone: 'success',
        title: 'Revision requested',
        message: 'The applicant has five days to resubmit and can see your note.',
      });
    } catch (error) {
      if (activeReviewRef.current === previewCache) setResult({ tone: 'error', title: 'Decision not saved', message: error.message });
    } finally {
      if (activeReviewRef.current === previewCache) {
        decisionBusyRef.current = false;
        setSavingDecision(false);
      }
    }
  };

  const approveDocuments = async (request, reviewAcknowledged) => {
    if (reviewAcknowledged !== true || !request || request !== approvalRequest || decisionBusyRef.current) return;
    if (!approvalTargetsUnchanged(request)) {
      setApprovalRequest(null);
      setResult({ tone: 'info', title: 'Documents changed', message: 'Review the updated queue and acknowledge the current files before approving.' });
      return;
    }
    const targets = request.documents;
    if (!targets.length) return;
    decisionBusyRef.current = true;
    setSavingDecision(true);
    setRevisionOpen(false);
    const approved = [];
    const failed = [];
    try {
      for (const [index, document] of targets.entries()) {
        if (activeReviewRef.current === previewCache) setApprovalProgress({ current: index + 1, total: targets.length });
        try {
          // Each file uses the existing staff-authorized review operation.
          const { data, error } = await supabase.rpc('review_enrollee_document', {
            p_document_id: document.id, p_decision: 'approved', p_note: null,
          });
          if (error || !data?.success) throw new Error(error?.message || data?.error || 'Approval could not be confirmed.');
          approved.push(document);
        } catch (error) {
          failed.push({ document, error: error.message || 'Approval could not be confirmed.' });
        }
      }

      if (approved.length) {
        const confirmedKeys = new Set(approved.map(reviewFileKey));
        if (activeReviewRef.current === previewCache) {
          setDocuments((current) => current.map((document) => confirmedKeys.has(reviewFileKey(document))
            ? { ...document, status: 'approved', revision_note: null, revision_due_at: null, reviewed_at: null }
            : document));
        }
        await logAudit('Enrollee Document Reviewed',
          `Approved ${approved.length} selected document${approved.length === 1 ? '' : 's'} for ${fullName}: ${approved.map((document) => document.file_name).join('; ')}`,
          undefined, { type: 'enrollee', meta: { enrollee_id: enrolleeId, document_ids: approved.map((document) => document.id), bulk: targets.length > 1, review_acknowledged: true } });
      }
      if (activeReviewRef.current !== previewCache) return;
      setCheckedFileKeys(new Set(failed.map(({ document }) => reviewFileKey(document))));
      await load({ quiet: true });
      if (activeReviewRef.current !== previewCache) return;
      setResult(failed.length ? {
        tone: 'error',
        title: approved.length ? 'Some documents need attention' : 'Documents not approved',
        message: `${approved.length} of ${targets.length} approvals confirmed. Files still awaiting review remain selected so you can retry.`,
        details: failed.map(({ document, error }) => `${document.file_name}: ${error}`),
      } : {
        tone: 'success',
        title: targets.length === 1 ? 'Document approved' : 'Documents approved',
        message: `${targets.length} document${targets.length === 1 ? '' : 's'} approved. The applicant can see the decisions.`,
      });
    } finally {
      if (activeReviewRef.current === previewCache) {
        decisionBusyRef.current = false;
        setSavingDecision(false);
        setApprovalProgress(null);
        setApprovalRequest(null);
      }
    }
  };

  const removeEnrollee = async () => {
    setDeleting(true);
    try {
      const { data: documentRows, error: documentsError } = await supabase
        .from('enrollee_documents')
        .select('storage_path')
        .eq('enrollee_id', enrolleeId);
      if (documentsError) throw documentsError;

      const paths = (documentRows || []).map((document) => document.storage_path).filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from('enrollee-documents').remove(paths);
        if (storageError) throw storageError;
      }

      const { error } = await supabase.from('enrollees').delete().eq('id', enrolleeId);
      if (error) throw error;

      await logAudit(
        'Enrollee Deleted',
        `Removed ${documents.length} enrollee submission${documents.length === 1 ? '' : 's'} and their files`,
        undefined,
        { type: 'enrollee' }
      );
      navigate('/enrollees', { replace: true });
    } catch (error) {
      setResult({ tone: 'error', title: 'Could not remove enrollee', message: error.message || 'Nothing was deleted. Try again.' });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
      setAcknowledged(false);
    }
  };

  return (
    <main className="main">
      <div className="page enrollee-review-page">
        <button type="button" className="enrollee-review-back" onClick={() => navigate('/enrollees')}>
          <ChevronLeftIcon size={16} />
          Back to Enrollees
        </button>

        {loading ? (
          <div className="card settings-card"><div className="settings-row-note">Loading enrollee details…</div></div>
        ) : pageError ? (
          <section className="card enrollee-review-error" role="alert">
            <h1>Enrollee review unavailable</h1>
            <p>{pageError}</p>
            <button type="button" className="btn secondary" onClick={() => navigate('/enrollees')}>
              Return to Enrollees
            </button>
          </section>
        ) : person && (
          <>
            <header className="enrollee-review-heading">
              <div>
                <h1>{fullName}</h1>
                <p>{person.applicant_id || 'No applicant ID'} <span aria-hidden="true">·</span> {person.personal_email}</p>
              </div>
              <div className="enrollee-review-heading-actions">
                <span className={`enrollee-review-account-status is-${person.status === 'elevated' ? 'approved' : 'pending'}`}>
                  {person.status === 'elevated' ? 'Elevated student' : 'Enrollee'}
                </span>
                <button type="button" className="btn secondary" disabled={savingDecision || deleting} onClick={() => setConfirmDelete(true)}>
                  Delete enrollee
                </button>
              </div>
            </header>

            <section className="card enrollee-review-profile" aria-labelledby="enrollee-details-title">
              <div className={`enrollee-review-section-head enrollee-review-profile-head${informationCollapsed ? '' : ' is-open'}`}>
                <div>
                  <h2 id="enrollee-details-title">Applicant details</h2>
                  <p>Personal, account, and clinic record information.</p>
                </div>
                <div className="enrollee-review-profile-actions">
                  <span className="enrollee-review-doc-count">
                    {documents.length} {documents.length === 1 ? 'document' : 'documents'} submitted
                  </span>
                  <button
                    type="button"
                    className="btn secondary small enrollee-review-disclosure-toggle"
                    aria-expanded={!informationCollapsed}
                    aria-controls="enrollee-review-profile-details"
                    onClick={() => setInformationCollapsed((collapsed) => !collapsed)}
                  >
                    {informationCollapsed ? 'Expand Details' : 'Collapse Details'}
                    <ChevronDownIcon
                      className={`enrollee-review-disclosure-icon${informationCollapsed ? '' : ' is-open'}`}
                      size={15}
                    />
                  </button>
                </div>
              </div>
              <div id="enrollee-review-profile-details" className="enrollee-review-profile-content" hidden={informationCollapsed}>
                <div className="enrollee-review-facts">
                  <div><span>Applicant ID</span><strong>{person.applicant_id || '—'}</strong></div>
                  <div><span>Date of birth</span><strong>{formatDate(person.date_of_birth)}</strong></div>
                  <div><span>Personal email</span><strong>{person.personal_email || '—'}</strong></div>
                  <div><span>Account created</span><strong>{formatDate(person.created_at)}</strong></div>
                  <div><span>TUP email</span><strong>{person.tup_email || 'Not linked'}</strong></div>
                  <div><span>Elevated on</span><strong>{person.elevated_at ? formatDate(person.elevated_at) : 'Not elevated'}</strong></div>
                  <div><span>Last updated</span><strong>{formatDate(person.updated_at)}</strong></div>
                </div>
                <div className="enrollee-review-record">
                  <h3>Clinic record</h3>
                  <RecordSummaryCard subjectType="enrollee" subjectId={person.id} person={person} collapsible={false} displayMode="grid" />
                </div>
              </div>
            </section>

            <div className="enrollee-review-layout">
              <section className="card enrollee-review-preview-card" aria-labelledby="submission-preview-title">
                <header className="enrollee-review-section-head enrollee-review-preview-head">
                  <div className="enrollee-review-preview-name">
                    <h2 id="submission-preview-title">{selectedDocument?.file_name || 'Document preview'}</h2>
                    {selectedDocument && (
                      <p>Submitted {formatDate(selectedDocument.submitted_at)} <span aria-hidden="true">·</span> {formatSize(selectedDocument.size_bytes)}</p>
                    )}
                  </div>
                  {documents.length > 1 && (
                    <div className="enrollee-review-preview-nav" aria-label="Document navigation">
                      <button
                        type="button"
                        className="btn secondary small"
                        aria-label="Previous document"
                        disabled={selectedIndex <= 0}
                        onClick={() => setSelectedDocId(documents[selectedIndex - 1]?.id)}
                      >
                        <ChevronLeftIcon />
                      </button>
                      <span>File {selectedIndex + 1} of {documents.length}</span>
                      <button
                        type="button"
                        className="btn secondary small"
                        aria-label="Next document"
                        disabled={selectedIndex < 0 || selectedIndex >= documents.length - 1}
                        onClick={() => setSelectedDocId(documents[selectedIndex + 1]?.id)}
                      >
                        <ChevronRightIcon />
                      </button>
                    </div>
                  )}
                </header>

                <div className={`enrollee-review-preview-surface${!selectedDocument ? ' is-empty' : ''}`}>
                  {!selectedDocument ? (
                    <div className="empty-state empty-state-compact">
                      <h3>No documents submitted yet</h3>
                      <p>The applicant’s clinic record is shown above. Submitted certificates will appear here.</p>
                    </div>
                  ) : (
                    <PdfJsDocumentPreview
                      key={`${enrolleeId}:${selectedFileKey}`}
                      document={selectedDocument}
                      cache={previewCache}
                      onSourceReady={setPreviewSource}
                    />
                  )}
                </div>
                {selectedDocument && previewUrl && (
                  <div className="enrollee-review-preview-footer">
                    <StatusBadge status={selectedDocument.status} />
                    <button type="button" className="btn secondary small" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
                      Open original
                    </button>
                  </div>
                )}
              </section>

              <aside className="enrollee-review-sidebar">
                <section className="card enrollee-review-queue" aria-labelledby="document-queue-title">
                  <div className="enrollee-review-section-head">
                    <div>
                      <h2 id="document-queue-title">Document queue</h2>
                      <p>Select a submission to preview and review it.</p>
                    </div>
                    <span className="enrollee-review-queue-total">{documents.length}</span>
                  </div>
                  {documents.length === 0 ? (
                    <div className="enrollee-review-empty-note">No documents submitted yet.</div>
                  ) : (
                    <>
                    <div className="enrollee-review-queue-selection">
                      <label className="enrollee-review-select-all">
                        <input type="checkbox" className="enrollee-review-checkbox" ref={selectAllRef} checked={allChecked}
                          aria-label="Select all documents awaiting approval"
                          disabled={savingDecision || !reviewableDocuments.length}
                          onChange={toggleAllDocuments} />
                        <span>Select all</span>
                      </label>
                      <div className="enrollee-review-selection-summary">
                        <span role="status">{reviewableDocuments.length || checkedDocuments.length ? `${checkedDocuments.length} selected` : 'All approved'}</span>
                        {checkedDocuments.length > 0 && <button type="button" className="enrollee-review-clear-selection" disabled={savingDecision} onClick={() => setCheckedFileKeys(new Set())}>Clear</button>}
                      </div>
                    </div>
                    <div className="enrollee-review-queue-list" ref={queueRef} role="group" aria-label="Submitted documents">
                      {documents.map((document) => (
                        <div
                          key={document.id}
                          className={`enrollee-review-queue-item${document.id === selectedDocId ? ' is-active' : ''}${checkedFileKeys.has(reviewFileKey(document)) ? ' is-checked' : ''}`}
                        >
                          <label className="enrollee-review-queue-check" title={awaitingReview(document) ? 'Select for approval' : 'Already approved'}>
                            <input type="checkbox" className="enrollee-review-checkbox" aria-label={`Select ${document.file_name} for approval`}
                              checked={checkedFileKeys.has(reviewFileKey(document))}
                              disabled={savingDecision || !awaitingReview(document)}
                              onChange={() => toggleDocument(document)} />
                          </label>
                          <button type="button" className="enrollee-review-queue-preview"
                            aria-current={document.id === selectedDocId ? 'true' : undefined}
                            title={document.file_name} onClick={() => setSelectedDocId(document.id)}>
                            <span className="enrollee-review-queue-copy">
                              <strong>{document.file_name}</strong>
                              <span>{formatDate(document.submitted_at)} <span aria-hidden="true">·</span> {formatSize(document.size_bytes)}</span>
                            </span>
                            <StatusBadge status={document.status} />
                          </button>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                </section>

                <section className="card enrollee-review-decision" aria-labelledby="review-decision-title">
                  <div className="enrollee-review-section-head">
                    <div>
                      <h2 id="review-decision-title">Review decision</h2>
                      <p>{approvalProgress ? `Approving ${approvalProgress.current} of ${approvalProgress.total}…`
                        : checkedDocuments.length ? `${checkedDocuments.length} document${checkedDocuments.length === 1 ? '' : 's'} selected for review.`
                          : 'Decisions apply to the previewed document.'}</p>
                    </div>
                  </div>
                  {!decisionDocument && !checkedDocuments.length ? (
                    <div className="enrollee-review-empty-note">There is no document to review.</div>
                  ) : decisionDocument?.status === 'approved' && !checkedDocuments.length ? (
                    <div className="enrollee-review-approved-note">
                      <strong>This document is approved.</strong>
                      <span>{decisionDocument.reviewed_at ? `Reviewed ${formatDate(decisionDocument.reviewed_at)}` : 'The applicant can see this decision.'}</span>
                    </div>
                  ) : (
                    <>
                      {checkedDocuments.length === 1 && <p className="enrollee-review-decision-target">{decisionDocument.file_name}</p>}
                      {decisionDocument?.revision_note && !revisionOpen && (
                        <div className="enrollee-review-revision-note">
                          <strong>Previous revision note</strong>
                          <span>{decisionDocument.revision_note}</span>
                          {decisionDocument.revision_due_at && <small>Due {formatDate(decisionDocument.revision_due_at)}</small>}
                        </div>
                      )}
                      {revisionOpen && decisionDocument ? (
                        <div className="enrollee-review-revision-form">
                          <label htmlFor="enrollee-revision-note">What needs changing?</label>
                          <textarea
                            id="enrollee-revision-note"
                            className="input"
                            rows={4}
                            placeholder="Explain what the applicant should correct or resubmit."
                            value={revisionNote}
                            disabled={savingDecision}
                            onChange={(event) => setRevisionNote(event.target.value)}
                          />
                          <div className="enrollee-review-decision-actions">
                            <button
                              type="button"
                              className="btn"
                              disabled={!revisionNote.trim() || savingDecision}
                              onClick={() => requestRevision(revisionNote)}
                            >
                              {savingDecision ? 'Saving…' : 'Send revision request'}
                            </button>
                            <button type="button" className="btn secondary" disabled={savingDecision} onClick={() => setRevisionOpen(false)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="enrollee-review-decision-actions enrollee-review-decision-options">
                            <button type="button" className="btn" disabled={savingDecision}
                              onClick={beginApproval}>
                              {approvalProgress ? `Approving ${approvalProgress.current}/${approvalProgress.total}…`
                                : savingDecision ? 'Saving…' : checkedDocuments.length ? `Approve selected (${checkedDocuments.length})` : 'Approve document'}
                            </button>
                            <button type="button" className="btn secondary" disabled={savingDecision || checkedDocuments.length > 1}
                              aria-describedby={checkedDocuments.length > 1 ? 'enrollee-revision-selection-note' : undefined}
                              onClick={() => setRevisionOpen(true)}>
                              Request revision
                            </button>
                          </div>
                          {checkedDocuments.length > 1 && <p className="enrollee-review-selection-note" id="enrollee-revision-selection-note">Select one document to request a revision.</p>}
                        </>
                      )}
                    </>
                  )}
                </section>

                <section className="card enrollee-review-messages" aria-labelledby="enrollee-messages-title">
                  <div className="enrollee-review-section-head">
                    <div>
                      <h2 id="enrollee-messages-title">Applicant messages</h2>
                      <p>Direct thread with {fullName || 'this applicant'}.</p>
                    </div>
                  </div>
                  <EnrolleeMessageThread
                    enrolleeId={enrolleeId}
                    enrolleeName={fullName || 'Applicant'}
                    viewer="staff"
                    compact
                  />
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      {approvalRequest && (
        <EnrolleeApprovalDialog
          documents={approvalRequest.documents}
          applicantName={fullName}
          busy={savingDecision}
          progress={approvalProgress}
          onConfirm={(reviewAcknowledged) => approveDocuments(approvalRequest, reviewAcknowledged)}
          onCancel={() => { if (!decisionBusyRef.current) setApprovalRequest(null); }}
        />
      )}

      {confirmDelete && (
        <div className="record-gate-backdrop" role="presentation" onClick={() => { setConfirmDelete(false); setAcknowledged(false); }}>
          <div className="record-gate-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="record-gate-head">
              <AlertIcon size={18} />
              <h2>Delete this enrollee?</h2>
            </div>
            <p className="record-gate-body">
              This removes the applicant, their medical certificates, and the files themselves. It cannot be undone, and the applicant will no longer be able to sign in.
            </p>
            <label className="enrollee-review-delete-ack">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I understand this cannot be undone.</span>
            </label>
            <div className="record-gate-actions">
              <button type="button" className="btn danger" disabled={!acknowledged || deleting} onClick={removeEnrollee}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button type="button" className="btn secondary" disabled={deleting} onClick={() => { setConfirmDelete(false); setAcknowledged(false); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog
        open={Boolean(result)}
        tone={result?.tone}
        title={result?.title}
        message={result?.message}
        details={result?.details}
        actions={[{ label: 'Close', onClick: () => setResult(null) }]}
        onClose={() => setResult(null)}
      />
    </main>
  );
};

export default EnrolleeReview;

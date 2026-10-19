import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { useTablePagination } from '../hooks/useTablePagination.js';
import TablePagination from '../components/table/TablePagination.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ResultDialog from '../components/ResultDialog.jsx';
import { AlertIcon, SearchIcon, UserIcon, CheckIcon, ClockIcon } from '../components/icons/Icons.jsx';

const ENROLLEE_DOCUMENT_FILTERS = [
  { id: 'all', label: 'All applicants' },
  { id: 'pending', label: 'Pending review' },
  { id: 'needs_revision', label: 'Needs revision' },
  { id: 'approved', label: 'Approved' },
  { id: 'not_submitted', label: 'Not submitted' },
];

const getDocumentSummary = (enrollee) => {
  const documents = Array.isArray(enrollee.documents) ? enrollee.documents : [];
  if (documents.length === 0) return { label: 'Not submitted', tone: 'none', filter: 'not_submitted' };
  if (documents.some((document) => document.status === 'needs_revision')) {
    return { label: 'Needs revision', tone: 'revision', filter: 'needs_revision' };
  }
  if (documents.some((document) => document.status === 'pending')) {
    return { label: 'Pending review', tone: 'pending', filter: 'pending' };
  }
  return { label: 'Approved', tone: 'approved', filter: 'approved' };
};

/**
 * Enrollees — the queue the clinic used to keep on paper.
 *
 * The point of this page is that nobody has to collect a certificate by hand,
 * and nobody has to be phoned to fix a blurry photo. Everything the clinic needs
 * to decide is available from the applicant's review page, and the decision is
 * recorded where the applicant can see it.
 *
 * Status is approved or needs_revision. There is no reject: a dead end with no
 * way back is the wrong answer for someone trying to enrol, so a submission
 * beyond saving is deleted instead — behind a confirmation, singly or in bulk.
 */
const Enrollees = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [documentFilter, setDocumentFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const { data: enrollees, error: enrolleesError } = await supabase
        .from('enrollees')
        .select('id, applicant_id, first_name, middle_name, surname, personal_email, date_of_birth, status, created_at')
        .order('created_at', { ascending: false });
      if (enrolleesError) throw enrolleesError;

      const { data: docs, error: documentsError } = await supabase
        .from('enrollee_documents')
        .select('id, enrollee_id, file_name, storage_path, mime_type, size_bytes, status, revision_note, submitted_at')
        .neq('status', 'draft');
      if (documentsError) throw documentsError;

      const byEnrollee = new Map();
      for (const doc of docs || []) {
        if (!byEnrollee.has(doc.enrollee_id)) byEnrollee.set(doc.enrollee_id, []);
        byEnrollee.get(doc.enrollee_id).push(doc);
      }

      setRows((enrollees || []).map((e) => ({ ...e, documents: byEnrollee.get(e.id) || [] })));
    } catch (err) {
      console.error('Could not load enrollees:', err);
      if (!quiet) setResult({ tone: 'error', title: 'Could not load enrollees', message: 'Try refreshing the page.' });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('enrollees-admin-document-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollees' }, () => load({ quiet: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollee_documents' }, () => load({ quiet: true }))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const kpis = useMemo(() => {
    const today = rows.filter((r) => new Date(r.created_at) >= startOfToday).length;
    const approved = rows.filter((r) => r.documents.some((d) => d.status === 'approved')).length;
    const pending = rows.filter((r) => r.documents.some((d) => d.status === 'pending')).length;
    return { today, approved, pending, total: rows.length };
  }, [rows, startOfToday]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (!q || [r.applicant_id, r.first_name, r.middle_name, r.surname, r.personal_email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)))
      && (documentFilter === 'all' || getDocumentSummary(r).filter === documentFilter)
      && (accountFilter === 'all' || (accountFilter === 'elevated' ? r.status === 'elevated' : r.status !== 'elevated'))
    );
  }, [rows, search, documentFilter, accountFilter]);

  const documentFilterCounts = useMemo(() => {
    const counts = { all: rows.length, pending: 0, needs_revision: 0, approved: 0, not_submitted: 0 };
    rows.forEach((row) => { counts[getDocumentSummary(row).filter] += 1; });
    return counts;
  }, [rows]);

  const pagination = useTablePagination(filtered, {
    pageSize: 10,
    resetKey: `${search}|${documentFilter}|${accountFilter}`,
  });

  const nameOf = (r) => [r.first_name, r.middle_name, r.surname].filter(Boolean).join(' ');

  const latestSubmitted = (r) => {
    const documents = Array.isArray(r.documents) ? r.documents : [];
    if (documents.length === 0) return null;
    return documents.map((d) => d.submitted_at).filter(Boolean).sort().slice(-1)[0] || null;
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = pagination.pageRows.map((r) => r.id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (ids.every((id) => next.has(id))) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const removeEnrollees = async (ids) => {
    setConfirmDelete(null);
    setAcknowledged(false);
    try {
      // Documents cascade with the enrollee row. The storage objects are removed
      // first, so a failure leaves a record rather than an orphaned file.
      const { data: documentRows, error: documentsError } = await supabase
        .from('enrollee_documents')
        .select('storage_path')
        .in('enrollee_id', ids);
      if (documentsError) throw documentsError;

      const paths = (documentRows || []).map((document) => document.storage_path).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from('enrollee-documents').remove(paths).catch(() => {});
      }
      const { error } = await supabase.from('enrollees').delete().in('id', ids);
      if (error) throw error;

      await logAudit(
        'Enrollee Deleted',
        `Removed ${ids.length} enrollee record${ids.length > 1 ? 's' : ''} and their submissions`,
        undefined,
        { type: 'enrollee' }
      );

      setSelected(new Set());
      setResult({
        tone: 'success',
        title: ids.length > 1 ? 'Enrollees removed' : 'Enrollee removed',
        message: 'Their submissions and files were removed with them.',
      });
      await load();
    } catch (err) {
      console.error('Delete failed:', err);
      setResult({ tone: 'error', title: 'Could not remove', message: 'Nothing was deleted. Try again.' });
    }
  };

  const Pill = ({ label, tone }) => (
    <span className={`enrollees-document-pill enrollees-document-pill--${tone}`}>
      {label}
    </span>
  );

  return (
    <main className="main">
      <div className="page">
        <div
          className="page-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div className="page-header-title-block">
            <h1 className="page-header-title">Enrollees</h1>
            <div className="page-header-subtitle">
              Medical certificates submitted by applicants. Review, approve, or ask for a better copy —
              without collecting anything by hand.
            </div>
          </div>
          <button
            type="button"
            className="btn secondary"
            onClick={() => navigate('/archive-files')}
          >
            Archive Files
          </button>
        </div>

        <section className="dashboard-kpis-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 20 }}>
          {[
            { title: 'Enrollees Today', val: kpis.today, sub: `${kpis.total} total`, Icon: UserIcon },
            { title: 'Approved', val: kpis.approved, sub: 'Certificate accepted', Icon: CheckIcon },
            { title: 'Pending Review', val: kpis.pending, sub: 'Waiting on the clinic', Icon: ClockIcon },
          ].map((kpi) => (
            <KpiCard
              key={kpi.title}
              title={kpi.title}
              value={kpi.val}
              description={kpi.sub}
              Icon={kpi.Icon}
            />
          ))}
        </section>

        <div className="card settings-card enrollees-table-card table-section-card">
          <div className="table-section-header">
            <div>
              <h2 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Enrollee submissions</h2>
              <span className="card-subtitle">Review uploaded documents, applicant details, and account status.</span>
            </div>
            <span className="badge badge-neutral">{rows.length.toLocaleString()} {rows.length === 1 ? 'applicant' : 'applicants'}</span>
          </div>

          <div className="enrollees-table-toolbar table-section-toolbar">
            <div className="enrollees-status-filters" aria-label="Filter by document status">
              {ENROLLEE_DOCUMENT_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`enrollees-filter-chip${documentFilter === filter.id ? ' active' : ''}`}
                  aria-pressed={documentFilter === filter.id}
                  onClick={() => {
                    setDocumentFilter(filter.id);
                    setSelected(new Set());
                  }}
                >
                  <span>{filter.label}</span>
                  <span className="enrollees-filter-count">{documentFilterCounts[filter.id]}</span>
                </button>
              ))}
            </div>

            <div className="enrollees-table-controls">
              <label className="enrollees-search-field">
                <SearchIcon size={17} />
                <input
                  type="search"
                  placeholder="Search name, applicant ID, or email"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelected(new Set());
                  }}
                  aria-label="Search enrollees by name, applicant ID, or email"
                />
              </label>

              <label className="enrollees-account-filter">
                <span>Account</span>
                <select
                  className="input"
                  value={accountFilter}
                  onChange={(e) => {
                    setAccountFilter(e.target.value);
                    setSelected(new Set());
                  }}
                  aria-label="Filter by account status"
                >
                  <option value="all">All accounts</option>
                  <option value="enrollee">Enrollee</option>
                  <option value="elevated">Elevated</option>
                </select>
              </label>

              {selected.size > 0 && (
                <div className="enrollees-bulk-actions">
                  <span>{selected.size} selected</span>
                  <button type="button" className="btn secondary" onClick={() => setConfirmDelete([...selected])}>
                    Delete selected
                  </button>
                  <button type="button" className="btn secondary" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="table enrollees-table" aria-label="Enrollees">
              <thead>
                <tr>
                  <th className="enrollees-select-column">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={pagination.pageRows.length > 0 && pagination.pageRows.every((r) => selected.has(r.id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>Applicant ID</th>
                  <th>Student</th>
                  <th>Documents</th>
                  <th>Last submitted</th>
                  <th>Account status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="enrollees-table-empty-row">
                    <td colSpan={7}>Loading enrollees…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr className="enrollees-table-empty-row">
                    <td colSpan={7}>{rows.length === 0 ? 'No enrollees yet' : 'No matching enrollees'}</td>
                  </tr>
                ) : pagination.pageRows.map((row) => {
                    const summary = getDocumentSummary(row);
                    const submitted = latestSubmitted(row);
                    const documents = Array.isArray(row.documents) ? row.documents : [];
                    return (
                      <tr key={row.id} className="enrollees-table-row">
                        <td className="enrollees-select-column">
                          <input
                            type="checkbox"
                            aria-label={`Select ${nameOf(row)}`}
                            checked={selected.has(row.id)}
                            onChange={() => toggle(row.id)}
                          />
                        </td>
                        <td className="enrollees-applicant-id">
                          {row.applicant_id || '—'}
                        </td>
                        <td>
                          <div className="enrollees-student-name">{nameOf(row) || 'Unnamed applicant'}</div>
                          <div className="enrollees-student-email">{row.personal_email || 'No personal email'}</div>
                        </td>
                        <td>
                          <div className="enrollees-documents-cell">
                            <Pill label={summary.label} tone={summary.tone} />
                            <span>{documents.length} {documents.length === 1 ? 'file' : 'files'}</span>
                          </div>
                        </td>
                        <td className="enrollees-submitted-date">
                          {submitted ? new Date(submitted).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                        </td>
                        <td>
                          <span className={`enrollees-account-pill${row.status === 'elevated' ? ' elevated' : ''}`}>
                            {row.status === 'elevated' ? 'Elevated' : 'Enrollee'}
                          </span>
                        </td>
                        <td className="enrollees-action-cell">
                          <button
                            type="button"
                            className="btn small enrollees-review-button"
                            onClick={() => navigate(`/enrollees/${row.id}/review`)}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                })}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            total={pagination.total}
            pageSize={pagination.pageSize}
            selectedCount={selected.size}
            itemLabel="enrollees"
            showWhenEmpty={!loading}
          />
        </div>
      </div>

      {confirmDelete && (
        <div className="record-gate-backdrop" role="presentation" onClick={() => { setConfirmDelete(null); setAcknowledged(false); }}>
          <div className="record-gate-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="record-gate-head">
              <AlertIcon size={18} />
              <h2>Delete {confirmDelete.length > 1 ? `${confirmDelete.length} enrollees` : 'this enrollee'}?</h2>
            </div>
            <p className="record-gate-body">
              This removes the applicant, their medical certificates, and the files themselves. It
              cannot be undone, and the applicant will no longer be able to sign in.
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--font-size-sm)', color: 'var(--text)', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I understand this cannot be undone.</span>
            </label>
            <div className="record-gate-actions">
              <button
                type="button"
                className="btn"
                disabled={!acknowledged}
                onClick={() => removeEnrollees(confirmDelete)}
              >
                Delete permanently
              </button>
              <button type="button" className="btn secondary" onClick={() => { setConfirmDelete(null); setAcknowledged(false); }}>
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
        actions={[{ label: 'Close', onClick: () => setResult(null) }]}
        onClose={() => setResult(null)}
      />
    </main>
  );
};

export default Enrollees;

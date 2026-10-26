// src/pages/AuditTrail.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { SearchIcon, ChevronDownIcon, CloseIcon } from '../components/icons/Icons.jsx';
import TablePagination from '../components/table/TablePagination.jsx';
import ExportDialog from '../components/export/ExportDialog.jsx';
import { useTableExport } from '../hooks/useTableExport.js';
import { auditLogsExportConfig } from '../utils/export/configs.js';
import { adminAccountHistory } from '../admin/adminApi.js';
import useVisibleRefresh from '../hooks/useVisibleRefresh.js';

const PAGE_SIZE = 25;
// Ceiling for a full export. A clinic log is small; this just stops a runaway
// download if the table ever grows unexpectedly.
const EXPORT_ROW_LIMIT = 5000;

// Convenience filters over the actions the portal actually writes. Unknown
// actions still appear under "All actions".
const ACTION_FILTERS = [
  { value: 'all', label: 'All actions' },
  { value: 'EXPORT', label: 'Data exports' },
  { value: 'LOGIN_SUCCESS', label: 'Logins' },
  { value: 'run_report', label: 'Reports run' },
  { value: 'Appointment Status Change', label: 'Appointment status changes' },
  { value: 'Appointment Auto-Cancelled', label: 'Auto-cancelled (no-show)' },
  { value: 'Appointment Creation', label: 'Appointment creations' },
  { value: 'Appointment Deletion', label: 'Appointment deletions' },
  { value: 'Encounter Creation', label: 'Encounter creations' },
  { value: 'Inventory Stock Adjustment', label: 'Stock adjustments' },
  { value: 'Inventory Item Addition', label: 'Inventory additions' },
  { value: 'Inventory Item Deletion', label: 'Inventory deletions' },
  { value: 'Student Create', label: 'Student registrations' },
];

const manilaDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

const actorOf = (row) => row.performed_by || row.user_name || 'Unknown';

const actionTone = (action) => {
  const a = (action || '').toLowerCase();
  if (a === 'export') return { bg: 'var(--color-purple-bg)', color: 'var(--color-purple-text)' };
  if (a.includes('delete') || a.includes('cancel')) return { bg: 'var(--color-rose-bg)', color: 'var(--color-rose-text)' };
  if (a.includes('login')) return { bg: 'var(--color-emerald-bg)', color: 'var(--color-emerald-text)' };
  if (a.includes('report')) return { bg: 'var(--color-amber-bg)', color: 'var(--color-amber-text)' };
  return { bg: 'var(--color-blue-bg)', color: 'var(--color-blue-text)' };
};

const AuditTrail = ({ administration = false, accountId = null, accountLabel = '', onClearAccount }) => {
  const actionFilters = administration ? [
    { value: 'all', label: 'All actions' },
    { value: 'ADMIN_SUSPEND', label: 'Account suspensions' },
    { value: 'ADMIN_REACTIVATE', label: 'Account reactivations' },
    { value: 'ADMIN_NAME_CHANGED', label: 'Administrator name changes' },
    { value: 'ADMIN_USER_ACCOUNT_DELETED', label: 'User account deletions' },
    { value: 'ADMIN_ACCOUNT_DELETED', label: 'Administrator deletions' },
    { value: 'STAFF_INVITATION_DELETED', label: 'Invitation deletions' },
    { value: 'ADMIN_CHANGE_ROLE', label: 'Staff role changes' },
    { value: 'ADMIN_UNLOCK', label: 'Account unlocks' },
    { value: 'STAFF_INVITATION_SENT', label: 'Invitations sent' },
    { value: 'STAFF_INVITATION_ACCEPTED', label: 'Invitations accepted' },
    { value: 'STAFF_INVITATION_REVOKE', label: 'Invitations revoked' },
    { value: 'ADMIN_LOGIN_SUCCEEDED', label: 'Admin sign-ins' },
    { value: 'ADMIN_LOGIN_FAILED', label: 'Failed admin sign-ins' },
    ...ACTION_FILTERS.slice(1),
  ] : ACTION_FILTERS;
  const { user } = useAuth();

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestRef = useRef(null);
  const loadedKey = useRef('');
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [toast, setToast] = useState(null);

  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // One place that builds the filter set, so the on-screen page and the export
  // can never diverge.
  const applyFilters = useCallback(
    (query) => {
      let q = query;
      if (accountId) q = q.eq('meta->>target_user_id', accountId);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00+08:00`);
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59+08:00`);
      const safe = search.trim().replace(/[,()%*"'\\]/g, ' ').trim();
      if (safe) {
        q = q.or(
          `action.ilike.%${safe}%,description.ilike.%${safe}%,performed_by.ilike.%${safe}%,user_name.ilike.%${safe}%`
        );
      }
      return q;
    },
    [actionFilter, dateFrom, dateTo, search, accountId]
  );

  const fetchPage = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const key = JSON.stringify([administration, accountId, actionFilter, dateFrom, dateTo, search, page]);
    setLoading(loadedKey.current !== key);
    setLoadError('');
    try {
      let rows, totalRows;
      if (administration) {
        const result = await adminAccountHistory({ accountId, search, action: actionFilter, dateFrom, dateTo, page, signal: controller.signal });
        rows = result.rows; totalRows = result.total;
      } else {
        const from = page * PAGE_SIZE;
        const { data, error, count } = await applyFilters(supabase.from('audit_logs').select('*', { count: 'exact' }))
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(from, from + PAGE_SIZE - 1).abortSignal(controller.signal);
        if (error) throw error;
        rows = data; totalRows = count;
      }
      if (controller.signal.aborted) return;
      loadedKey.current = key;
      setLogs(rows || []);
      setTotal(totalRows || 0);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Failed to load audit trail:', err);
      setLoadError(err?.message || 'Failed to load the audit trail.');
      setLogs([]);
      setTotal(0);
    } finally {
      if (!controller.signal.aborted) { setLoading(false); requestRef.current = null; }
    }
  }, [applyFilters, administration, accountId, search, actionFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchPage();
    return () => requestRef.current?.abort();
  }, [fetchPage]);

  useVisibleRefresh(() => { if (!requestRef.current) fetchPage(); }, administration);

  // Live-append when new entries are written anywhere in the portal.
  useEffect(() => {
    const onAdded = () => { if (page === 0) fetchPage(); };
    window.addEventListener('auditLogAdded', onAdded);
    return () => window.removeEventListener('auditLogAdded', onAdded);
  }, [fetchPage, page]);

  // Any filter change restarts at page 1.
  useEffect(() => {
    setPage(0);
  }, [search, actionFilter, dateFrom, dateTo, accountId]);

  const activeFilterLines = useMemo(() => {
    const lines = [];
    if (accountId) lines.push(`Account: ${accountLabel || 'Selected account'}`);
    if (actionFilter !== 'all') {
      lines.push(`Action: ${actionFilters.find((f) => f.value === actionFilter)?.label || actionFilter}`);
    }
    if (dateFrom) lines.push(`From: ${dateFrom}`);
    if (dateTo) lines.push(`To: ${dateTo}`);
    if (search.trim()) lines.push(`Search: "${search.trim()}"`);
    return lines;
  }, [actionFilter, dateFrom, dateTo, search, accountId, accountLabel]);

  const fetchAllForExport = useCallback(async () => {
    if (administration) {
      const result = await adminAccountHistory({ accountId, search, action: actionFilter, dateFrom, dateTo, exportAll: true });
      return result.rows || [];
    }
    const { data, error } = await applyFilters(
      supabase.from('audit_logs').select('*')
    )
      .order('created_at', { ascending: false })
      .limit(EXPORT_ROW_LIMIT);
    if (error) throw error;
    return data || [];
  }, [applyFilters, administration, accountId, search, actionFilter, dateFrom, dateTo]);

  const exporter = useTableExport({
    config: auditLogsExportConfig,
    getRows: fetchAllForExport,
    getFilterLines: () => activeFilterLines,
    itemLabel: 'audit entries',
    count: total,
    onMessage: showToast,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (!loading && !loadError && page >= totalPages) setPage(totalPages - 1); }, [loading, loadError, page, totalPages]);
  const startIndex = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const endIndex = Math.min((page + 1) * PAGE_SIZE, total);
  const hasFilters = activeFilterLines.length > 0;

  const clearFilters = () => {
    onClearAccount?.();
    setSearch('');
    setActionFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Audit Trail</h1>
            <div className="page-header-subtitle">
              {administration ? 'Recorded account, invitation, and system activity.' : 'Every recorded action across the staff portal — logins, record changes and data exports.'}
            </div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={fetchPage} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="btn" onClick={exporter.openExport} disabled={total === 0}>
              Export
            </button>
          </div>
        </div>

        {administration && accountId && <div className="system-admin-history-filter" role="region" aria-label="Selected account history">
          <div><strong>Account history: {accountLabel || 'Selected account'}</strong><p>Actions performed by or affecting this account. Older entries that were not linked to an account may not appear.</p></div>
          <button type="button" className="btn secondary small" onClick={clearFilters}>View all activity</button>
        </div>}
        <div className="card table-section-card audit-trail-table-card" aria-busy={loading}>
          <div className="card-header table-section-header">
            <div>
              <h3 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Activity Log</h3>
              <span className="card-subtitle">Append-only record, newest first</span>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}>
              {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* Filters */}
          <div className="table-section-toolbar audit-trail-toolbar">
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', display: 'inline-flex' }}>
                <SearchIcon size={16} />
              </span>
              <input
                type="search"
                className="input"
                style={{ width: '100%', paddingLeft: 36 }}
                placeholder="Search action, description or user…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search the audit trail"
              />
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200 }}>
              <select
                className="input"
                style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="Filter by action"
              >
                {actionFilters.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>

            <input
              type="date"
              className="input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <input
              type="date"
              className="input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />

            {hasFilters && (
              <button type="button" className="btn secondary small" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          {loadError && (
            <div className="table-section-feedback" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-rose-bg)', color: 'var(--color-rose-text)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>
              {loadError}
            </div>
          )}

          <div className="table-responsive">
            <table className="table" aria-label="Audit trail table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Timestamp</th>
                  <th>Performed By</th>
                  <th>Action</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading audit entries…
                    </td>
                  </tr>
                ) : logs.length === 0 ? !administration && (
                  <tr className="table-empty-row">
                    <td colSpan={4}>{hasFilters ? 'No matching audit entries' : 'No audit entries yet'}</td>
                  </tr>
                ) : (
                  logs.map((row) => {
                    const tone = actionTone(row.action);
                    return (
                      <tr key={row.id}>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {manilaDateTime(row.created_at)}
                        </td>
                        <td style={{ fontWeight: 'var(--font-weight-semibold)' }}>{actorOf(row)}</td>
                        <td>
                          <span
                            className="badge"
                            style={{ background: tone.bg, color: tone.color, fontWeight: 'var(--font-weight-bold)', whiteSpace: 'nowrap' }}
                          >
                            {row.action || 'Unknown'}
                          </span>
                        </td>
                        <td style={{ maxWidth: 620 }}>{row.description || row.message || row.detail || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {administration && !loading && !loadError && !logs.length && <div className="system-admin-table-state" role="status">
            <p className="system-admin-table-state-title">{accountId ? 'No recorded activity for this account' : hasFilters ? 'No matching audit entries' : 'No audit entries yet'}</p>
            <p className="system-admin-table-state-description">{accountId ? 'New linked activity will appear here automatically.' : hasFilters ? 'Try adjusting your search or filters.' : 'Account and system activity will appear here.'}</p>
          </div>}

          <TablePagination
            page={page}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            total={total}
            onPageChange={(next) => setPage(Math.max(0, Math.min(next, totalPages - 1)))}
            itemLabel="audit entries"
            showWhenEmpty={!loading}
          />
        </div>
      </div>

      <ExportDialog
        open={exporter.exportOpen}
        config={auditLogsExportConfig}
        rowCount={exporter.rowCount}
        itemLabel="audit entries"
        busy={exporter.exportBusy}
        onClose={exporter.closeExport}
        onExport={exporter.runExport}
      />

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 7000,
            padding: '12px 20px',
            borderRadius: 12,
            color: 'var(--text-on-primary)',
            fontWeight: 'var(--font-weight-bold)',
            backgroundColor: toast.type === 'error' ? 'var(--danger)' : 'var(--color-emerald)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
    </main>
  );
};

export default AuditTrail;

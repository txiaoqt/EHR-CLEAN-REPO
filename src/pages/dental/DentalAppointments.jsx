import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon, CloseIcon, ChevronDownIcon } from '../../components/icons/Icons.jsx';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import { NextAppointmentFields } from './DentalForms.jsx';
import { STATUS_BADGE, formatDay, formatTimeLabel, loadDentists, todayIso } from './dentalShared.js';
import './dental.css';

const VIEWS = [['upcoming', 'Upcoming'], ['today', 'Today'], ['past', 'Past'], ['all', 'All']];

/** A small dialog with focus moved in on open and Escape to close. */
export const DentalDialog = ({ title, subtitle, onClose, children, footer, busy }) => {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input, select, textarea, button:not(.modal-close-btn)')?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previous instanceof HTMLElement) previous.focus(); };
  }, [onClose, busy]);
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={ref} className="modal-container" role="dialog" aria-modal="true" aria-labelledby="dental-dialog-title" style={{ width: 640, maxWidth: '100%' }}>
        <div className="modal-header">
          <div><h2 className="modal-title" id="dental-dialog-title">{title}</h2>{subtitle && <span className="modal-subtitle">{subtitle}</span>}</div>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={busy} aria-label="Close"><CloseIcon size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
};

const DentalAppointments = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('upcoming');
  const [status, setStatus] = useState('Scheduled');
  const [search, setSearch] = useState('');
  const [dentists, setDentists] = useState([]);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    const { data, error } = await supabase.from('appointments')
      .select('id, patient_id, patient_name, appointment_date, appointment_time, service_type, clinician_name, status')
      .eq('department', 'Dental Clinic').order('appointment_date').order('appointment_time').limit(2000);
    if (error) setLoadError('Appointments could not be loaded. Try again.');
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); loadDentists().then(setDentists); }, [load]);

  const filtered = useMemo(() => {
    const today = todayIso();
    const q = search.trim().toLowerCase();
    const list = rows.filter((a) => (status === 'all' || a.status === status)
      && (view === 'all' || (view === 'today' && a.appointment_date === today)
        || (view === 'upcoming' && a.appointment_date >= today) || (view === 'past' && a.appointment_date < today))
      && (!q || [a.patient_name, a.patient_id, a.service_type, a.clinician_name].some((v) => (v || '').toLowerCase().includes(q))));
    return view === 'past' || view === 'all' ? [...list].reverse() : list;
  }, [rows, view, status, search]);
  const pagination = useTablePagination(filtered, { resetKey: `${view}|${status}|${search}` });

  const closeAction = () => { setAction(null); setActionError(''); };
  const run = async (patch, message) => {
    setBusy(true); setActionError('');
    const { error } = await supabase.from('appointments').update(patch).eq('id', action.row.id);
    setBusy(false);
    if (error) {
      setActionError(error.code === '23505' ? 'That dentist already has an appointment at this date and time.'
        : error.code === '22000' ? error.message : 'The appointment could not be updated. Try again.');
      return;
    }
    setNotice(message); closeAction(); load();
  };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Appointments</h1>
            <div className="page-header-subtitle">Procedure visits scheduled from the Consultation Log. Open one to record the procedure.</div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn" onClick={() => navigate('/consultation-log?new=1')}>Log Consultation</button>
          </div>
        </div>

        {notice && <p className="dental-alert dental-alert--ok" role="status">{notice}</p>}

        <div className="card table-section-card">
          <div className="table-section-header">
            <div className="segmented-control-container" role="tablist" aria-label="Appointment dates">
              {VIEWS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} className={`segmented-tab-btn ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="patients-toolbar table-section-toolbar">
            <div className="patients-search-wrapper">
              <span style={{ color: 'var(--text-light)', display: 'inline-flex' }}><SearchIcon size={16} /></span>
              <input type="search" className="patients-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, ID, procedure or dentist…" aria-label="Search appointments" />
            </div>
            <div className="patients-filter-group">
              <div className="patients-select-wrapper">
                <select className="patients-filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                  <option value="Scheduled">Status: Scheduled</option>
                  <option value="Completed">Status: Completed</option>
                  <option value="Cancelled">Status: Cancelled</option>
                  <option value="all">Status: All</option>
                </select>
                <span className="patients-filter-chevron"><ChevronDownIcon size={13} /></span>
              </div>
            </div>
          </div>
          {loadError && <p className="dental-alert" role="alert" style={{ margin: '0 24px 16px' }}>{loadError} <button type="button" className="btn secondary small" onClick={load}>Retry</button></p>}
          <div className="table-responsive">
            <table className="table" aria-label="Dental appointments">
              <thead><tr><th>Date</th><th>Time</th><th>Patient</th><th>Procedure</th><th>Dentist</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading appointments…</td></tr>
                  : filtered.length === 0 ? <tr className="table-empty-row"><td colSpan={7}>{rows.length ? 'No appointments match these filters' : 'No dental appointments yet. They appear when a consultation sets the next visit.'}</td></tr>
                  : pagination.pageRows.map((a) => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDay(a.appointment_date)}</td>
                      <td className="dental-time">{formatTimeLabel(a.appointment_time)}</td>
                      <td>
                        <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>{a.patient_name || a.patient_id}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{a.patient_id}</div>
                      </td>
                      <td>{a.service_type || '—'}</td>
                      <td>{a.clinician_name}</td>
                      <td><span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>{a.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          {a.status === 'Scheduled' ? (
                            <>
                              <button type="button" className="btn secondary small" onClick={() => setAction({ type: 'reschedule', row: a, next: { date: a.appointment_date, time: a.appointment_time, procedure: a.service_type || '', dentist: a.clinician_name } })}>Reschedule</button>
                              <button type="button" className="btn secondary small" onClick={() => setAction({ type: 'cancel', row: a })}>Cancel</button>
                              <button type="button" className="btn small" onClick={() => navigate(`/dental-encounter?appointment=${a.id}`)}>Open Encounter</button>
                            </>
                          ) : (
                            <button type="button" className="btn secondary small" onClick={() => navigate(`/dental-record?id=${encodeURIComponent(a.patient_id)}`)}>View Record</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={pagination.page} totalPages={pagination.totalPages} startIndex={pagination.startIndex}
            endIndex={pagination.endIndex} total={pagination.total} onPageChange={pagination.goToPage} itemLabel="appointments" showWhenEmpty={!loading} />
        </div>

        {action?.type === 'reschedule' && (
          <DentalDialog title="Reschedule Appointment" subtitle={`${action.row.patient_name} · for class suspensions and other reasons beyond the patient’s control`}
            onClose={closeAction} busy={busy}
            footer={<>
              <button type="button" className="btn secondary" onClick={closeAction} disabled={busy}>Keep Current Schedule</button>
              <button type="button" className="btn" disabled={busy || !action.next.date}
                onClick={() => run({ appointment_date: action.next.date, appointment_time: action.next.time, service_type: action.next.procedure.trim() || null, clinician_name: action.next.dentist },
                  `${action.row.patient_name}’s appointment moved to ${formatDay(action.next.date)} at ${formatTimeLabel(action.next.time)}.`)}>
                {busy ? 'Saving…' : 'Save New Schedule'}</button>
            </>}>
            <NextAppointmentFields value={action.next} onChange={(next) => setAction({ ...action, next })} dentists={dentists} disabled={busy} />
            {actionError && <p className="dental-alert" role="alert" style={{ margin: '16px 0 0' }}>{actionError}</p>}
          </DentalDialog>
        )}
        {action?.type === 'cancel' && (
          <DentalDialog title="Cancel Appointment?" subtitle={`${action.row.patient_name} · ${formatDay(action.row.appointment_date)} at ${formatTimeLabel(action.row.appointment_time)}`}
            onClose={closeAction} busy={busy}
            footer={<>
              <button type="button" className="btn secondary" onClick={closeAction} disabled={busy}>Keep Appointment</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => run({ status: 'Cancelled' }, `${action.row.patient_name}’s appointment was cancelled.`)}>{busy ? 'Cancelling…' : 'Cancel Appointment'}</button>
            </>}>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>The patient will see it as cancelled on their Dental Appointment page. To book them again, log a new date from their record.</p>
            {actionError && <p className="dental-alert" role="alert" style={{ margin: '16px 0 0' }}>{actionError}</p>}
          </DentalDialog>
        )}
      </div>
    </main>
  );
};

export default DentalAppointments;

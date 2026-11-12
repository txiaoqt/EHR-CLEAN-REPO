import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import useVisibleRefresh from '../../hooks/useVisibleRefresh.js';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import { formatDay } from '../dental/dentalShared.js';

const cell = { padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--text)' };
const muted = <span style={{ color: 'var(--muted)' }}>None</span>;

/** The services the dentist logged for this patient, newest first. */
const PatientDentalHistory = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useVisibleRefresh(() => setTick((t) => t + 1));
  const pages = useTablePagination(rows || []);

  useEffect(() => {
    if (!user?.patient_id) { setRows([]); return; }
    supabase.from('dental_services')
      .select('id, service_date, service_rendered, teeth, medicine, anesthesia, dentist_name')
      .eq('patient_id', user.patient_id)
      .order('service_date', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        setError(loadError ? 'Your dental history could not be loaded. Refresh the page to try again.' : '');
        setRows(data || []);
      });
  }, [user?.patient_id, tick]);

  const teeth = (r) => (r.teeth?.length ? r.teeth.join(', ') : muted);
  const given = (r) => [r.medicine, r.anesthesia && `Anesthesia: ${r.anesthesia}`].filter(Boolean).join(' · ') || muted;

  return (
    <div className="card table-section-card patient-records-section">
      <div className="table-section-header">
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>Dental History</h3>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
            Services rendered at the Dental Clinic, as logged by your dentist
          </div>
        </div>
        <span className="badge badge-neutral" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
          {(rows || []).length} Dental Visit(s)
        </span>
      </div>
      {error && <p className="dental-alert" role="alert" style={{ margin: '0 16px 12px' }}>{error}</p>}

      <div className={`patient-records-table-view table-responsive${!rows?.length ? ' patient-records-table-view--empty' : ''}`}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Visit Date</th>
              <th style={{ textAlign: 'left' }}>Dentist</th>
              <th style={{ textAlign: 'left' }}>Service Rendered</th>
              <th style={{ textAlign: 'left' }}>Teeth</th>
              <th style={{ textAlign: 'left' }}>Medicine / Anesthesia</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr className="table-empty-row"><td colSpan={5}>Loading dental records…</td></tr>
            ) : rows.length === 0 ? (
              <tr className="table-empty-row"><td colSpan={5}>No dental visits yet</td></tr>
            ) : pages.pageRows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...cell, fontWeight: 'var(--font-weight-semibold)', whiteSpace: 'nowrap' }}>{formatDay(r.service_date)}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.dentist_name}</td>
                <td style={{ ...cell, fontWeight: 'var(--font-weight-semibold)', maxWidth: 280 }}>{r.service_rendered}</td>
                <td style={cell}>{teeth(r)}</td>
                <td style={{ ...cell, maxWidth: 260 }}>{given(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows !== null && (
        <TablePagination page={pages.page} totalPages={pages.totalPages} startIndex={pages.startIndex}
          endIndex={pages.endIndex} total={pages.total} onPageChange={pages.goToPage} itemLabel="visits" showWhenEmpty />
      )}

      {rows?.length > 0 && (
        <div className="patient-records-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pages.pageRows.map((r) => (
            <div key={r.id} style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <strong style={{ fontSize: 'var(--font-size-md)' }}>{formatDay(r.service_date)}</strong>
                <span className="badge badge-info">Dental Clinic</span>
              </div>
              <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{r.service_rendered}</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{r.dentist_name}</div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>Teeth: {teeth(r)}</div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>{given(r)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientDentalHistory;

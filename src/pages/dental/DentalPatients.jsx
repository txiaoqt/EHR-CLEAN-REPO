import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon, CloseIcon } from '../../components/icons/Icons.jsx';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import { ageFrom, formatDay, recordSortName } from './dentalShared.js';
import './dental.css';

/** Patients with a dental record, i.e. everyone who has had a dental consultation. */
const DentalPatients = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: records, error }, { data: visits }] = await Promise.all([
        supabase.from('dental_records').select('patient_id, surname, first_name, middle_name, classification, college_course_unit, sex, date_of_birth').order('surname'),
        supabase.from('dental_services').select('patient_id, service_date').order('service_date', { ascending: false }),
      ]);
      if (error) setLoadError('Patients could not be loaded. Refresh the page to try again.');
      const last = {};
      (visits || []).forEach((v) => { if (!last[v.patient_id]) last[v.patient_id] = v.service_date; });
      setRows((records || []).map((r) => ({ ...r, last_visit: last[r.patient_id] || null })));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => [recordSortName(r), r.patient_id, r.college_course_unit].some((v) => (v || '').toLowerCase().includes(q))) : rows;
  }, [rows, search]);
  const pagination = useTablePagination(filtered, { resetKey: search });

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Patients</h1>
            <div className="page-header-subtitle">Everyone with a dental record. Open one for the pink form, visit history and Dental Card.</div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn" onClick={() => navigate('/consultation-log?new=1')}>Log Consultation</button>
          </div>
        </div>

        <div className="card table-section-card">
          <div className="patients-toolbar table-section-toolbar" style={{ paddingTop: 20 }}>
            <div className="patients-search-wrapper">
              <span style={{ color: 'var(--text-light)', display: 'inline-flex' }}><SearchIcon size={16} /></span>
              <input type="search" className="patients-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID number or college…" aria-label="Search dental patients" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: 'var(--text-muted)' }}><CloseIcon size={14} /></button>}
            </div>
          </div>
          {loadError && <p className="dental-alert" role="alert" style={{ margin: '0 24px 16px' }}>{loadError}</p>}
          <div className="table-responsive">
            <table className="table" aria-label="Dental patients">
              <thead><tr><th>Patient</th><th>ID Number</th><th>Classification</th><th>College / Unit</th><th>Age · Sex</th><th>Last Visit</th><th style={{ textAlign: 'right' }}>Record</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading patients…</td></tr>
                  : filtered.length === 0 ? <tr className="table-empty-row"><td colSpan={7}>{rows.length ? 'No matching patients' : 'No dental patients yet. They are added when you log a consultation.'}</td></tr>
                  : pagination.pageRows.map((r) => (
                    <tr key={r.patient_id}>
                      <td style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>{recordSortName(r)}</td>
                      <td><span className="badge badge-neutral" style={{ fontWeight: 'var(--font-weight-bold)' }}>{r.patient_id}</span></td>
                      <td>{r.classification}</td>
                      <td>{r.college_course_unit || '—'}</td>
                      <td>{[ageFrom(r.date_of_birth), r.sex].filter((v) => v !== '' && v != null).join(' · ') || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.last_visit ? formatDay(r.last_visit) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn secondary small" onClick={() => navigate(`/dental-record?id=${encodeURIComponent(r.patient_id)}`)}>View Record</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={pagination.page} totalPages={pagination.totalPages} startIndex={pagination.startIndex}
            endIndex={pagination.endIndex} total={pagination.total} onPageChange={pagination.goToPage} itemLabel="patients" showWhenEmpty={!loading} />
        </div>
      </div>
    </main>
  );
};

export default DentalPatients;

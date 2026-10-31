import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon, CloseIcon } from '../../components/icons/Icons.jsx';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import { ageFrom, formatDay, recordSortName } from './dentalShared.js';
import './dental.css';

const sexLetter = (sex) => ({ f: 'F', female: 'F', m: 'M', male: 'M' }[String(sex || '').toLowerCase()] || '');

/**
 * The same patient directory as the Medical Clinic, plus anyone registered here
 * first. Only directory fields are read: the medical notes stay on the medical side.
 */
const DentalPatients = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const [patientsRes, recordsRes, { data: visits }, { data: profiles }] = await Promise.all([
        supabase.from('patients').select('id, name, year, date_of_birth').order('name'),
        supabase.from('dental_records').select('patient_id, surname, first_name, middle_name, classification, college_course_unit, sex, date_of_birth'),
        supabase.from('dental_services').select('patient_id, service_date').order('service_date', { ascending: false }),
        supabase.from('patient_profiles').select('patient_id, sex, course'),
      ]);
      if (patientsRes.error || recordsRes.error) setLoadError('Patients could not be loaded. Refresh the page to try again.');
      const last = {};
      (visits || []).forEach((v) => { if (!last[v.patient_id]) last[v.patient_id] = v.service_date; });
      const profileOf = Object.fromEntries((profiles || []).map((p) => [p.patient_id, p]));
      const byId = new Map();
      (patientsRes.data || []).forEach((p) => byId.set(p.id, {
        patient_id: p.id, name: p.name, date_of_birth: p.date_of_birth, classification: 'Student',
        college_course_unit: profileOf[p.id]?.course || '', sex: sexLetter(profileOf[p.id]?.sex), hasRecord: false,
      }));
      (recordsRes.data || []).forEach((r) => byId.set(r.patient_id, {
        ...byId.get(r.patient_id), ...r, name: recordSortName(r), hasRecord: true,
        college_course_unit: r.college_course_unit || byId.get(r.patient_id)?.college_course_unit || '',
      }));
      setRows([...byId.values()].map((r) => ({ ...r, last_visit: last[r.patient_id] || null }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => [r.name, r.patient_id, r.college_course_unit].some((v) => (v || '').toLowerCase().includes(q))) : rows;
  }, [rows, search]);
  const pagination = useTablePagination(filtered, { resetKey: search });

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Patients</h1>
            <div className="page-header-subtitle">The clinic’s patient directory. Open a record for the pink form, visit history and Dental Card, or log a first consultation.</div>
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
                  : filtered.length === 0 ? <tr className="table-empty-row"><td colSpan={7}>{rows.length ? 'No matching patients' : 'No patients yet. Register one when you log a consultation.'}</td></tr>
                  : pagination.pageRows.map((r) => (
                    <tr key={r.patient_id}>
                      <td style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>{r.name}</td>
                      <td><span className="badge badge-neutral" style={{ fontWeight: 'var(--font-weight-bold)' }}>{r.patient_id}</span></td>
                      <td>{r.classification || '—'}</td>
                      <td>{r.college_course_unit || '—'}</td>
                      <td>{[ageFrom(r.date_of_birth), r.sex].filter((v) => v !== '' && v != null).join(' · ') || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.last_visit ? formatDay(r.last_visit) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.hasRecord
                          ? <button type="button" className="btn secondary small" onClick={() => navigate(`/dental-record?id=${encodeURIComponent(r.patient_id)}`)}>View Record</button>
                          : <button type="button" className="btn small" onClick={() => navigate(`/consultation-log?new=1&patient=${encodeURIComponent(r.patient_id)}`)}>Log Consultation</button>}
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

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon, CloseIcon } from '../../components/icons/Icons.jsx';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import useVisibleRefresh from '../../hooks/useVisibleRefresh.js';
import { ageFrom, formatDay, recordSortName } from './dentalShared.js';
import { patientTypeOf, isValidStudentId, isValidFacultyId } from '../../utils/authValidation.js';
import { composeFullName, toProperName } from '../../utils/nameFormat.js';
import { findSameNamePatients } from '../../utils/duplicatePatients.js';
import { DentalDialog } from './DentalAppointments.jsx';
import './dental.css';

const EMPTY_FORM = { kind: 'student', id: '', first: '', middle: '', last: '', suffix: '', year: '1' };

/**
 * Registers into the same patients list the Medical Clinic uses, keyed by TUPM ID,
 * so the patient appears in both clinics and in the admin directory, and their own
 * portal sign-up with that ID joins this record instead of making a second one.
 */
const RegisterPatientDialog = ({ onClose, onDone }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sameName, setSameName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const faculty = form.kind === 'faculty';
  const id = form.id.trim().toUpperCase();
  const set = (key, value) => { setSameName(null); setError(''); setForm((f) => ({ ...f, [key]: value })); };

  const save = async (differentPerson = false) => {
    if (!form.first.trim() || !form.last.trim()) { setError('Enter the first name and surname.'); return; }
    if (faculty ? !isValidFacultyId(id) : !isValidStudentId(id)) {
      setError(faculty ? 'Employee ID must look like TUPM120172-001.' : 'Student ID must look like TUPM-23-0123.');
      return;
    }
    setBusy(true); setError('');
    try {
      if (!differentPerson) {
        const matches = await findSameNamePatients({ firstName: form.first, surname: form.last, excludeId: id });
        if (matches.length) { setSameName(matches); return; }
      }
      const parts = { first_name: toProperName(form.first), middle_name: toProperName(form.middle) || null, surname: toProperName(form.last), suffix: form.suffix.trim() || null };
      const name = composeFullName({ firstName: parts.first_name, middleName: parts.middle_name, lastName: parts.surname, suffix: parts.suffix });
      const year = faculty ? null : Number(form.year);
      const { error: studentError } = await supabase.from('students').insert({ id, name, year, ...parts });
      if (studentError && studentError.code !== '23505') throw studentError;
      const { error: patientError } = await supabase.from('patients').insert({ id, name, year });
      if (patientError?.code === '23505') { setError(`${id} is already registered. Search for it in the list.`); return; }
      if (patientError) throw patientError;
      onDone(`${name} (${id}) registered. They now appear in the Dental and Medical Clinic and in the admin directory.`);
    } catch (e) {
      console.warn('[Dental] register patient', e);
      setError('The patient could not be registered. Check the details and try again.');
    } finally { setBusy(false); }
  };

  const field = (key, label, placeholder, optional) => (
    <label className="dental-field"><span>{label}{optional && ' (optional)'}</span>
      <input className="input" value={form[key]} maxLength={80} placeholder={placeholder} disabled={busy}
        onChange={(e) => set(key, e.target.value)}
        onBlur={(e) => key !== 'suffix' && setForm((f) => ({ ...f, [key]: toProperName(e.target.value) }))} /></label>
  );

  return (
    <DentalDialog title="Register Patient" subtitle="Shared with the Medical Clinic. The patient's own sign-up with this ID joins the same record." onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn" onClick={() => save(false)} disabled={busy || Boolean(sameName)}>{busy ? 'Registering…' : 'Register Patient'}</button>
      </>}>
      <div className="dental-stack" style={{ gap: 12 }}>
        <div className="segmented-control-container" role="radiogroup" aria-label="Patient type" style={{ alignSelf: 'flex-start' }}>
          {[['student', 'Student'], ['faculty', 'Faculty']].map(([kind, label]) => (
            <button key={kind} type="button" role="radio" aria-checked={form.kind === kind} disabled={busy}
              className={`segmented-tab-btn ${form.kind === kind ? 'active' : ''}`} onClick={() => set('kind', kind)}>{label}</button>
          ))}
        </div>
        <div className="dental-fields">
          <label className="dental-field"><span>{faculty ? 'Employee ID' : 'Student ID'}</span>
            <input className="input" value={form.id} disabled={busy} placeholder={faculty ? 'TUPM120172-001' : 'TUPM-23-0123'}
              onChange={(e) => set('id', e.target.value.toUpperCase())} /></label>
          {!faculty && <label className="dental-field"><span>Year Level</span>
            <select className="input" value={form.year} disabled={busy} onChange={(e) => set('year', e.target.value)}>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select></label>}
        </div>
        <div className="dental-fields">
          {field('last', 'Surname', 'e.g. Dela Cruz')}
          {field('first', 'First Name', 'e.g. Juan')}
          {field('middle', 'Middle Name', 'e.g. Santos', true)}
          {field('suffix', 'Suffix', 'e.g. Jr., III', true)}
        </div>
        {sameName && (
          <div className="dental-alert dental-alert--warn" role="alert">
            <p style={{ margin: '0 0 10px' }}><strong>{sameName[0].name}</strong> is already registered as <strong>{sameName.map((m) => m.id).join(', ')}</strong>. Is this the same person? If so, close this and use that record.</p>
            <button type="button" className="btn secondary small" onClick={() => save(true)} disabled={busy}>Register as a different person</button>
          </div>
        )}
        {error && <p className="dental-alert" role="alert" style={{ margin: 0 }}>{error}</p>}
      </div>
    </DentalDialog>
  );
};

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
  const [view, setView] = useState('active');
  const [kind, setKind] = useState('student'); // 'student' | 'faculty', by ID format
  const [tick, setTick] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  useVisibleRefresh(() => setTick((t) => t + 1));

  useEffect(() => {
    (async () => {
      const [patientsRes, recordsRes, { data: visits }, { data: profiles }] = await Promise.all([
        supabase.from('patients').select('id, name, year, date_of_birth, archived_at, archived_reason').order('name'),
        supabase.from('dental_records').select('patient_id, surname, first_name, middle_name, classification, college_course_unit, sex, date_of_birth'),
        supabase.from('dental_services').select('patient_id, service_date').order('service_date', { ascending: false }),
        supabase.from('patient_profiles').select('patient_id, sex, course'),
      ]);
      setLoadError(patientsRes.error || recordsRes.error ? 'Patients could not be loaded. Refresh the page to try again.' : '');
      const last = {};
      (visits || []).forEach((v) => { if (!last[v.patient_id]) last[v.patient_id] = v.service_date; });
      const profileOf = Object.fromEntries((profiles || []).map((p) => [p.patient_id, p]));
      const byId = new Map();
      (patientsRes.data || []).forEach((p) => byId.set(p.id, {
        patient_id: p.id, name: p.name, date_of_birth: p.date_of_birth, archived_reason: p.archived_at ? (p.archived_reason || 'Archived') : null, classification: patientTypeOf(p.id) === 'faculty' ? 'Faculty' : 'Student',
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
  }, [tick]);

  // Archived in the Medical Portal (graduated, left TUP, account deleted); records stay readable.
  const ofKind = rows.filter((r) => patientTypeOf(r.patient_id) === kind);
  const facultyCount = rows.filter((r) => patientTypeOf(r.patient_id) === 'faculty').length;
  const archivedCount = ofKind.filter((r) => r.archived_reason).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inView = ofKind.filter((r) => (view === 'archived') === Boolean(r.archived_reason));
    return q ? inView.filter((r) => [r.name, r.patient_id, r.college_course_unit].some((v) => (v || '').toLowerCase().includes(q))) : inView;
  }, [ofKind, search, view]);
  const pagination = useTablePagination(filtered, { resetKey: `${kind}|${view}|${search}` });

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Patients</h1>
            <div className="page-header-subtitle">The clinic’s patient directory. Open a record for the pink form, visit history and Dental Card. Consultations are logged in the Consultation Log.</div>
          </div>
          <button type="button" className="btn" onClick={() => { setNotice(''); setRegistering(true); }}>Register Patient</button>
        </div>
        {notice && <p className="dental-alert dental-alert--ok" role="status" style={{ marginBottom: 16 }}>{notice}</p>}
        {registering && <RegisterPatientDialog onClose={() => setRegistering(false)}
          onDone={(message) => { setRegistering(false); setNotice(message); setTick((t) => t + 1); }} />}

        <div className="card table-section-card">
          <div className="table-section-header" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="segmented-control-container" role="tablist" aria-label="Patient type">
              {[['student', `Students (${rows.length - facultyCount})`], ['faculty', `Faculty (${facultyCount})`]].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={kind === id} className={`segmented-tab-btn ${kind === id ? 'active' : ''}`} onClick={() => setKind(id)}>{label}</button>
              ))}
            </div>
            <div className="segmented-control-container" role="tablist" aria-label="Patient list">
              {[['active', `Active (${ofKind.length - archivedCount})`], ['archived', `Archived (${archivedCount})`]].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} className={`segmented-tab-btn ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="patients-toolbar table-section-toolbar">
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
                  : filtered.length === 0 ? <tr className="table-empty-row"><td colSpan={7}>{rows.length ? 'No matching patients' : 'No patients yet.'}</td></tr>
                  : pagination.pageRows.map((r) => (
                    <tr key={r.patient_id}>
                      <td style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>{r.name}{r.archived_reason && <div><span className="badge badge-neutral" style={{ marginTop: 4 }}>Archived · {r.archived_reason}</span></div>}</td>
                      <td><span className="badge badge-neutral" style={{ fontWeight: 'var(--font-weight-bold)' }}>{r.patient_id}</span></td>
                      <td>{r.classification || '—'}</td>
                      <td>{r.college_course_unit || '—'}</td>
                      <td>{[ageFrom(r.date_of_birth), r.sex].filter((v) => v !== '' && v != null).join(' · ') || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.last_visit ? formatDay(r.last_visit) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.hasRecord
                          ? <button type="button" className="btn secondary small" onClick={() => navigate(`/dental-record?id=${encodeURIComponent(r.patient_id)}`)}>View Record</button>
                          : <span className="dental-list-sub">No record yet</span>}
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

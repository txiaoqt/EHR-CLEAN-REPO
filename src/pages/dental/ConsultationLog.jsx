import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { SearchIcon, CloseIcon } from '../../components/icons/Icons.jsx';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import ToothChart from './ToothChart.jsx';
import { PatientPicker, RecordFields, NextAppointmentFields, loadRecordFor, emptyNext, nextPayload } from './DentalForms.jsx';
import { formatDay, loadDentists, recordPayload, saveDentalVisit, formatTimeLabel } from './dentalShared.js';
import './dental.css';

/**
 * Consultation Log: every service row from page 2 of the pink form, and the form
 * for a first consultation. The next date logged here becomes the patient's
 * dental appointment, which they see on their Dental Appointment page.
 */
const ConsultationForm = ({ initialPatientId, onDone, onCancel }) => {
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [record, setRecord] = useState(null);
  const [existing, setExisting] = useState(false);
  const [service, setService] = useState({ service_rendered: 'Consultation', medicine: '', anesthesia: '' });
  const [dentists, setDentists] = useState([]);
  const [next, setNext] = useState(emptyNext(user?.name || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadDentists().then(setDentists); }, []);
  useEffect(() => {
    if (!initialPatientId) return;
    supabase.from('students').select('id, name, year').eq('id', initialPatientId).maybeSingle()
      .then(({ data }) => { if (data) setPatient(data); });
  }, [initialPatientId]);
  useEffect(() => {
    setRecord(null); setError('');
    if (!patient) return undefined;
    let current = true;
    loadRecordFor(patient).then((result) => { if (current) { setRecord(result.record); setExisting(result.existing); } });
    return () => { current = false; };
  }, [patient]);

  const submit = async (e) => {
    e.preventDefault();
    if (!record.surname.trim() || !record.first_name.trim()) { setError('Enter the patient’s surname and name.'); return; }
    if (!service.service_rendered.trim()) { setError('Describe the service rendered.'); return; }
    setSaving(true); setError('');
    try {
      if (patient.isNew) {
        const { error: studentError } = await supabase.from('students').insert({ id: patient.id, name: patient.name, year: patient.year });
        if (studentError && studentError.code !== '23505') throw new Error('The new patient could not be registered. Check the ID number.');
      }
      await saveDentalVisit({ patientId: patient.id, record: recordPayload(record), service, next: nextPayload(next) });
      onDone(next.date
        ? `Consultation logged for ${patient.name}. Next appointment: ${formatDay(next.date)} at ${formatTimeLabel(next.time)}. It now appears on their Dental Appointment page.`
        : `Consultation logged for ${patient.name}.`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <form className="card" style={{ padding: 0 }} onSubmit={submit} aria-busy={saving}>
      <section className="dental-section" aria-labelledby="consult-patient">
        <h2 className="dental-section-title" id="consult-patient">Patient</h2>
        <p className="dental-section-sub">Find the patient who came in for their first consultation, or register them.</p>
        <PatientPicker value={patient} onChange={setPatient} disabled={saving} />
        {patient && existing && <p className="dental-muted">This patient already has a dental record. Saving updates it.</p>}
      </section>

      {patient && !record && <div className="dental-empty" role="status">Loading the patient’s details…</div>}
      {record && (
        <>
          <section className="dental-section" aria-labelledby="consult-info">
            <h2 className="dental-section-title" id="consult-info">Patient Information</h2>
            <p className="dental-section-sub">Page 1 of the pink form, as the patient filled it in.</p>
            <RecordFields record={record} onChange={setRecord} disabled={saving} />
          </section>

          <section className="dental-section" aria-labelledby="consult-chart">
            <h2 className="dental-section-title" id="consult-chart">Dental Chart</h2>
            <p className="dental-section-sub">Findings from today’s examination.</p>
            <ToothChart value={record.tooth_chart} onChange={(chart) => setRecord({ ...record, tooth_chart: chart })} />
            <label className="dental-field dental-field--wide" style={{ marginTop: 16 }}>
              <span>Remarks</span>
              <textarea className="input" value={record.remarks || ''} maxLength={2000} disabled={saving}
                onChange={(e) => setRecord({ ...record, remarks: e.target.value })} placeholder="Findings, treatment plan, medical conditions to watch for" />
            </label>
          </section>

          <section className="dental-section" aria-labelledby="consult-service">
            <h2 className="dental-section-title" id="consult-service">Service Rendered</h2>
            <p className="dental-section-sub">Recorded as today’s row on page 2.</p>
            <div className="dental-fields">
              <label className="dental-field"><span>Service</span>
                <input className="input" required maxLength={500} value={service.service_rendered} disabled={saving}
                  onChange={(e) => setService({ ...service, service_rendered: e.target.value })} /></label>
              <label className="dental-field"><span>Medicine</span>
                <input className="input" maxLength={300} value={service.medicine} disabled={saving}
                  onChange={(e) => setService({ ...service, medicine: e.target.value })} placeholder="None" /></label>
              <label className="dental-field"><span>Anesthesia</span>
                <input className="input" maxLength={300} value={service.anesthesia} disabled={saving}
                  onChange={(e) => setService({ ...service, anesthesia: e.target.value })} placeholder="None" /></label>
            </div>
          </section>

          <section className="dental-section" aria-labelledby="consult-next">
            <h2 className="dental-section-title" id="consult-next">Next Appointment</h2>
            <p className="dental-section-sub">The procedure visit. It is added to Appointments and shown to the patient.</p>
            <NextAppointmentFields value={next} onChange={setNext} dentists={dentists} disabled={saving} optional />
          </section>
        </>
      )}

      <div className="dental-actions">
        {error && <p className="dental-alert" role="alert" style={{ margin: '0 auto 0 0' }}>{error}</p>}
        <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn" disabled={!record || saving}>{saving ? 'Saving…' : 'Save Consultation'}</button>
      </div>
    </form>
  );
};

const ConsultationLog = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const formOpen = params.get('new') === '1';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    const { data, error } = await supabase.from('dental_services')
      .select('id, patient_id, service_date, service_rendered, medicine, anesthesia, dentist_name, created_at, dental_records(surname, first_name, middle_name)')
      .order('service_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
    if (error) setLoadError('The consultation log could not be loaded. Try again.');
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.patient_id, r.service_rendered, r.dentist_name, r.dental_records?.surname, r.dental_records?.first_name]
      .some((v) => (v || '').toLowerCase().includes(q)));
  }, [rows, search]);
  const pagination = useTablePagination(filtered, { resetKey: search });

  const openForm = (open) => {
    const nextParams = new URLSearchParams(params);
    if (open) nextParams.set('new', '1'); else { nextParams.delete('new'); nextParams.delete('patient'); }
    setParams(nextParams);
  };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">{formOpen ? 'Log Consultation' : 'Consultation Log'}</h1>
            <div className="page-header-subtitle">
              {formOpen ? 'Encode the pink form from the patient’s first visit and set their procedure appointment.'
                : 'Every consultation and procedure recorded on the pink form, newest first.'}
            </div>
          </div>
          {!formOpen && (
            <div className="page-header-actions">
              <button type="button" className="btn" onClick={() => { setNotice(''); openForm(true); }}>Log Consultation</button>
            </div>
          )}
        </div>

        {notice && <p className="dental-alert dental-alert--ok" role="status">{notice}</p>}

        {formOpen ? (
          <ConsultationForm initialPatientId={params.get('patient')} onCancel={() => openForm(false)}
            onDone={(message) => { setNotice(message); openForm(false); load(); }} />
        ) : (
          <div className="card table-section-card">
            <div className="table-section-header">
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>Services Rendered</h2>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Date, service, medicine, anesthesia and the dentist who signed</div>
              </div>
            </div>
            <div className="patients-toolbar table-section-toolbar">
              <div className="patients-search-wrapper">
                <span style={{ color: 'var(--text-light)', display: 'inline-flex' }}><SearchIcon size={16} /></span>
                <input type="search" className="patients-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by patient, ID, service or dentist…" aria-label="Search the consultation log" />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: 'var(--text-muted)' }}><CloseIcon size={14} /></button>}
              </div>
            </div>
            {loadError && <p className="dental-alert" role="alert" style={{ margin: '0 24px 16px' }}>{loadError} <button type="button" className="btn secondary small" onClick={load}>Retry</button></p>}
            <div className="table-responsive">
              <table className="table" aria-label="Consultation log">
                <thead><tr><th>Date</th><th>Patient</th><th>Service Rendered</th><th>Medicine</th><th>Anesthesia</th><th>Signed By</th><th style={{ textAlign: 'right' }}>Record</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading the consultation log…</td></tr>
                    : filtered.length === 0 ? <tr className="table-empty-row"><td colSpan={7}>{rows.length ? 'No matching entries' : 'No consultations logged yet. Use Log Consultation after a patient’s first visit.'}</td></tr>
                    : pagination.pageRows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDay(r.service_date)}</td>
                        <td>
                          <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                            {r.dental_records ? `${r.dental_records.surname}, ${r.dental_records.first_name}` : r.patient_id}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{r.patient_id}</div>
                        </td>
                        <td>{r.service_rendered}</td>
                        <td>{r.medicine || '—'}</td>
                        <td>{r.anesthesia || '—'}</td>
                        <td>{r.dentist_name}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn secondary small" onClick={() => navigate(`/dental-record?id=${encodeURIComponent(r.patient_id)}`)}>View</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={pagination.page} totalPages={pagination.totalPages} startIndex={pagination.startIndex}
              endIndex={pagination.endIndex} total={pagination.total} onPageChange={pagination.goToPage} itemLabel="entries" showWhenEmpty={!loading} />
          </div>
        )}
      </div>
    </main>
  );
};

export default ConsultationLog;

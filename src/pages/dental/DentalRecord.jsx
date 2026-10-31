import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import ToothChart from './ToothChart.jsx';
import { RecordFields, NextAppointmentFields, emptyNext, nextPayload } from './DentalForms.jsx';
import { DentalDialog } from './DentalAppointments.jsx';
import { dentalCardHtml, dentalSummaryHtml, printHtml, transactionId } from './printDentalCard.js';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons/Icons.jsx';
import {
  STATUS_BADGE, ageFrom, formatDay, formatTimeLabel, loadDentists, recordName, recordPayload, saveDentalVisit,
} from './dentalShared.js';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import './dental.css';

/** Page 2 of the pink form: one row per visit, three at a time. */
export const ServiceHistory = ({ services, compact = false }) => {
  const pagination = useTablePagination(services, { pageSize: 3 });
  if (services.length === 0) return <div className="dental-empty">No visits recorded yet.</div>;
  return (
    <>
      <div className="table-responsive">
        <table className="table" aria-label="Services rendered">
          <thead><tr><th>Date</th><th>Service Rendered</th>{!compact && <><th>Medicine</th><th>Anesthesia</th></>}<th>Signed By</th></tr></thead>
          <tbody>
            {pagination.pageRows.map((s) => (
              <tr key={s.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDay(s.service_date)}</td>
                <td>{s.service_rendered}{s.teeth?.length ? <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Teeth {s.teeth.join(', ')}</div> : null}</td>
                {!compact && <><td>{s.medicine || '—'}</td><td>{s.anesthesia || '—'}</td></>}
                <td>{s.dentist_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={pagination.page} totalPages={pagination.totalPages} startIndex={pagination.startIndex}
        endIndex={pagination.endIndex} total={pagination.total} onPageChange={pagination.goToPage} itemLabel="visits" />
    </>
  );
};

const formatSavedAt = (iso) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

const DentalRecord = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const patientId = params.get('id');
  const [state, setState] = useState({ loading: true, record: null, services: [], appointments: [], profile: null, versions: [] });
  const [versionIndex, setVersionIndex] = useState(0); // 0 is the latest save
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [dentists, setDentists] = useState([]);

  const load = useCallback(async () => {
    const [{ data: record }, { data: services }, { data: appointments }, { data: profile }, { data: versions }] = await Promise.all([
      supabase.from('dental_records').select('*').eq('patient_id', patientId).maybeSingle(),
      supabase.from('dental_services').select('*').eq('patient_id', patientId).order('service_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('appointments').select('id, appointment_date, appointment_time, service_type, clinician_name, status')
        .eq('patient_id', patientId).eq('department', 'Dental Clinic').order('appointment_date', { ascending: false }).limit(20),
      supabase.from('patient_profiles').select('email, contact_number, address, year, course, blood_type, allergies, medications')
        .eq('patient_id', patientId).limit(1).maybeSingle(),
      supabase.from('dental_record_versions').select('id, record, saved_at').eq('patient_id', patientId).order('saved_at', { ascending: false }),
    ]);
    setState({ loading: false, record, services: services || [], appointments: appointments || [], profile, versions: versions || [] });
    setVersionIndex(0);
  }, [patientId]);
  useEffect(() => { load(); loadDentists().then(setDentists); }, [load]);

  const { record: latest, services, appointments, profile, versions } = state;
  // The page shows whichever saved version is selected; edits always start from the latest.
  const record = versions[versionIndex]?.record || latest;
  const version = versions[versionIndex];
  const print = (html) => { if (!printHtml(html)) setNotice('Allow pop-ups for this site to print.'); };
  const scheduled = appointments.find((a) => a.status === 'Scheduled');
  const close = () => { setDialog(null); setDialogError(''); };
  const save = async (args, message) => {
    setBusy(true); setDialogError('');
    try { await saveDentalVisit({ patientId, ...args }); setNotice(message); close(); await load(); }
    catch (err) { setDialogError(err.message); } finally { setBusy(false); }
  };

  if (state.loading) return <main className="main"><div className="page"><div className="card dental-empty" role="status">Loading the dental record…</div></div></main>;
  if (!latest) {
    return (
      <main className="main"><div className="page">
        <div className="card dental-empty" role="alert">
          No dental record for {patientId} yet. One is created when their first consultation is logged in the Consultation Log.
        </div>
      </div></main>
    );
  }

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">{recordName(record)}</h1>
            <div className="page-header-subtitle">{patientId} · Dental record · {transactionId(record)}</div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={() => navigate('/patients')}>All Patients</button>
            <button type="button" className="btn secondary" onClick={() => print(dentalSummaryHtml(latest, services, profile || {}))}>Print Dental Card</button>
            <button type="button" className="btn secondary" onClick={() => print(dentalCardHtml(latest, services))}>Print Pink Form</button>
            <button type="button" className="btn secondary" onClick={() => setDialog({ type: 'edit', record: { ...latest } })}>Edit Record</button>
            {scheduled ? (
              <button type="button" className="btn" onClick={() => navigate(`/dental-encounter?appointment=${scheduled.id}`)}>Open Encounter</button>
            ) : (
              <button type="button" className="btn" onClick={() => setDialog({ type: 'schedule', next: emptyNext(user?.name || '') })}>Schedule Appointment</button>
            )}
          </div>
        </div>

        {notice && <p className="dental-alert dental-alert--ok" role="status">{notice}</p>}

        <div className="dental-two-col">
          <div className="dental-stack">
            <section className="card" style={{ padding: 0 }} aria-labelledby="record-info">
              <div className="dental-section">
                <div className="dental-version-bar">
                  <div>
                    <h2 className="dental-section-title" id="record-info">Patient Information</h2>
                    <p className="dental-section-sub" style={{ margin: 0 }}>
                      Page 1 of the pink form{version ? ` · saved ${formatSavedAt(version.saved_at)}` : ''}
                    </p>
                  </div>
                  {versions.length > 1 && (
                    <div className="dental-version-nav" role="group" aria-label="Earlier versions of this record">
                      <button type="button" className="btn secondary small" aria-label="Older version"
                        disabled={versionIndex >= versions.length - 1} onClick={() => setVersionIndex(versionIndex + 1)}><ChevronLeftIcon size={16} /></button>
                      <span aria-live="polite">{versionIndex === 0 ? 'Latest' : `Version ${versions.length - versionIndex}`} of {versions.length}</span>
                      <button type="button" className="btn secondary small" aria-label="Newer version"
                        disabled={versionIndex === 0} onClick={() => setVersionIndex(versionIndex - 1)}><ChevronRightIcon size={16} /></button>
                    </div>
                  )}
                </div>
                {versionIndex > 0 && <p className="dental-alert dental-alert--warn" style={{ margin: '12px 0 0' }}>You are viewing an earlier version. Edit Record and the prints use the latest.</p>}
                <div style={{ height: 16 }} />
                <dl className="dental-facts">
                  <div><dt>Classification</dt><dd>{record.classification}</dd></div>
                  <div><dt>College / Course / Unit</dt><dd>{record.college_course_unit || '—'}</dd></div>
                  <div><dt>Date of Birth</dt><dd>{record.date_of_birth ? `${formatDay(record.date_of_birth)} · ${ageFrom(record.date_of_birth)} yrs` : '—'}</dd></div>
                  <div><dt>Sex</dt><dd>{record.sex === 'F' ? 'Female' : record.sex === 'M' ? 'Male' : '—'}</dd></div>
                  <div><dt>Place of Birth</dt><dd>{record.place_of_birth || '—'}</dd></div>
                  <div><dt>Address</dt><dd>{record.address || '—'}</dd></div>
                </dl>
              </div>
              <div className="dental-section">
                <h3 className="dental-section-title" style={{ fontSize: 'var(--font-size-sm)' }}>In Case of Emergency</h3>
                <dl className="dental-facts" style={{ marginTop: 10 }}>
                  <div><dt>Name</dt><dd>{record.emergency_name || '—'}</dd></div>
                  <div><dt>Relationship</dt><dd>{record.emergency_relationship || '—'}</dd></div>
                  <div><dt>Contact Number</dt><dd>{record.emergency_contact || '—'}</dd></div>
                  <div><dt>Address</dt><dd>{record.emergency_address || '—'}</dd></div>
                </dl>
              </div>
              <div className="dental-section">
                <h3 className="dental-section-title" style={{ fontSize: 'var(--font-size-sm)' }}>Dental Chart</h3>
                <div style={{ marginTop: 10 }}><ToothChart value={record.tooth_chart} /></div>
                {record.remarks && <><h3 className="dental-section-title" style={{ marginTop: 16, fontSize: 'var(--font-size-sm)' }}>Remarks</h3><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{record.remarks}</p></>}
              </div>
            </section>
            <section className="card" style={{ padding: 0 }} aria-labelledby="record-services">
              <div className="dental-section" style={{ paddingBottom: 8 }}>
                <h2 className="dental-section-title" id="record-services">Services Rendered</h2>
                <p className="dental-section-sub" style={{ margin: 0 }}>Page 2 of the pink form</p>
              </div>
              <ServiceHistory services={services} />
            </section>
          </div>

          <section className="card" style={{ padding: 0 }} aria-labelledby="record-appointments">
            <div className="dental-section" style={{ paddingBottom: 8 }}><h2 className="dental-section-title" id="record-appointments">Appointments</h2></div>
            {appointments.length === 0 ? <div className="dental-empty">No dental appointments.</div> : (
              <ul className="dental-list">
                {appointments.map((a) => (
                  <li key={a.id}>
                    <div className="dental-list-main">
                      <div className="dental-list-title">{formatDay(a.appointment_date)} · {formatTimeLabel(a.appointment_time)}</div>
                      <div className="dental-list-sub">{[a.service_type, a.clinician_name].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>{a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {dialog?.type === 'edit' && (
          <DentalDialog title="Edit Dental Record" subtitle="Page 1 of the pink form and the dental chart" onClose={close} busy={busy}
            footer={<>
              <button type="button" className="btn secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="btn" disabled={busy || !dialog.record.surname.trim() || !dialog.record.first_name.trim()}
                onClick={() => save({ record: recordPayload(dialog.record) }, 'Dental record updated.')}>{busy ? 'Saving…' : 'Save Record'}</button>
            </>}>
            <RecordFields record={dialog.record} onChange={(r) => setDialog({ ...dialog, record: r })} disabled={busy} />
            <h3 className="dental-section-title" style={{ marginTop: 22 }}>Dental Chart</h3>
            <div style={{ marginTop: 10 }}><ToothChart value={dialog.record.tooth_chart} onChange={(chart) => setDialog({ ...dialog, record: { ...dialog.record, tooth_chart: chart } })} /></div>
            <label className="dental-field dental-field--wide" style={{ marginTop: 16 }}><span>Remarks</span>
              <textarea className="input" maxLength={2000} value={dialog.record.remarks || ''} disabled={busy}
                onChange={(e) => setDialog({ ...dialog, record: { ...dialog.record, remarks: e.target.value } })} /></label>
            {dialogError && <p className="dental-alert" role="alert" style={{ margin: '16px 0 0' }}>{dialogError}</p>}
          </DentalDialog>
        )}
        {dialog?.type === 'schedule' && (
          <DentalDialog title="Schedule Appointment" subtitle={`${recordName(record)} · appears on the patient’s Dental Appointment page`} onClose={close} busy={busy}
            footer={<>
              <button type="button" className="btn secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="btn" disabled={busy || !dialog.next.date}
                onClick={() => save({ next: nextPayload(dialog.next) }, `Appointment set for ${formatDay(dialog.next.date)} at ${formatTimeLabel(dialog.next.time)}.`)}>{busy ? 'Saving…' : 'Schedule'}</button>
            </>}>
            <NextAppointmentFields value={dialog.next} onChange={(next) => setDialog({ ...dialog, next })} dentists={dentists} disabled={busy} />
            {dialogError && <p className="dental-alert" role="alert" style={{ margin: '16px 0 0' }}>{dialogError}</p>}
          </DentalDialog>
        )}
      </div>
    </main>
  );
};

export default DentalRecord;

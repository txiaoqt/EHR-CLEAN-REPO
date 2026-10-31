import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import ToothChart from './ToothChart.jsx';
import { NextAppointmentFields, emptyNext, nextPayload } from './DentalForms.jsx';
import { ServiceHistory } from './DentalRecord.jsx';
import {
  ageFrom, formatDay, formatTimeLabel, loadDentists, recordName, recordPayload, saveDentalVisit, todayIso,
} from './dentalShared.js';
import './dental.css';

/**
 * The procedure visit, opened from a dental appointment. Unlike the medical
 * encounter (vitals, assessment, plan), it records one row of page 2 of the pink
 * form, updates the tooth chart, and can book the next visit.
 */
const DentalEncounter = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const appointmentId = params.get('appointment');
  const [state, setState] = useState({ loading: true, error: '', appointment: null, record: null, services: [] });
  const [chart, setChart] = useState({});
  const [service, setService] = useState({ service_rendered: '', medicine: '', anesthesia: '' });
  const [teeth, setTeeth] = useState('');
  const [dentists, setDentists] = useState([]);
  const [next, setNext] = useState(emptyNext(user?.name || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    (async () => {
      const { data: appointment } = await supabase.from('appointments')
        .select('id, patient_id, patient_name, appointment_date, appointment_time, service_type, clinician_name, status')
        .eq('id', appointmentId).eq('department', 'Dental Clinic').maybeSingle();
      if (!current) return;
      if (!appointment) { setState({ loading: false, error: 'This dental appointment was not found.' }); return; }
      const [{ data: record }, { data: services }] = await Promise.all([
        supabase.from('dental_records').select('*').eq('patient_id', appointment.patient_id).maybeSingle(),
        supabase.from('dental_services').select('*').eq('patient_id', appointment.patient_id).order('service_date', { ascending: false }).order('created_at', { ascending: false }),
      ]);
      if (!current) return;
      setState({ loading: false, error: record ? '' : 'This patient has no dental record yet. Log their consultation first.', appointment, record, services: services || [] });
      setChart(record?.tooth_chart || {});
      setService((s) => ({ ...s, service_rendered: appointment.service_type || '' }));
    })();
    loadDentists().then(setDentists);
    return () => { current = false; };
  }, [appointmentId]);

  const { appointment, record, services } = state;
  const done = appointment && appointment.status !== 'Scheduled';

  const submit = async (e) => {
    e.preventDefault();
    if (!service.service_rendered.trim()) { setError('Describe the service rendered.'); return; }
    setSaving(true); setError('');
    try {
      await saveDentalVisit({
        patientId: appointment.patient_id,
        record: recordPayload({ ...record, tooth_chart: chart }),
        service: { ...service, service_date: todayIso(), teeth: teeth.split(/[\s,]+/).filter(Boolean) },
        appointmentId: appointment.id,
        next: nextPayload(next),
      });
      navigate(`/dental-record?id=${encodeURIComponent(appointment.patient_id)}`, { replace: true, state: {
        notice: `Procedure recorded for ${recordName(record)}.${next.date ? ` Next appointment: ${formatDay(next.date)} at ${formatTimeLabel(next.time)}.` : ''}`,
      } });
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Dental Encounter</h1>
            <div className="page-header-subtitle">
              {appointment ? `${appointment.patient_name || appointment.patient_id} · ${formatDay(appointment.appointment_date)} at ${formatTimeLabel(appointment.appointment_time)}${appointment.service_type ? ` · ${appointment.service_type}` : ''}` : 'Record the procedure for this appointment.'}
            </div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={() => navigate('/appointments')}>Back to Appointments</button>
          </div>
        </div>

        {state.loading ? <div className="card dental-empty" role="status">Loading the appointment…</div>
          : state.error ? <div className="card dental-empty" role="alert">{state.error}</div>
          : (
            <div className="dental-two-col">
              <form className="card" style={{ padding: 0 }} onSubmit={submit} aria-busy={saving}>
                {done && <p className="dental-alert" role="status" style={{ margin: '20px 24px 0' }}>This appointment is {appointment.status.toLowerCase()}. Saving is turned off.</p>}
                <fieldset disabled={done || saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                  <section className="dental-section" aria-labelledby="enc-service">
                    <h2 className="dental-section-title" id="enc-service">Procedure</h2>
                    <p className="dental-section-sub">Today’s row on page 2, signed with your name.</p>
                    <div className="dental-fields">
                      <label className="dental-field dental-field--wide"><span>Service Rendered</span>
                        <input className="input" required maxLength={500} value={service.service_rendered}
                          onChange={(e) => setService({ ...service, service_rendered: e.target.value })} placeholder="e.g. Oral prophylaxis; composite filling on 16" /></label>
                      <label className="dental-field"><span>Teeth Treated</span>
                        <input className="input" value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="e.g. 16, 26" inputMode="numeric" /></label>
                      <label className="dental-field"><span>Medicine</span>
                        <input className="input" maxLength={300} value={service.medicine} onChange={(e) => setService({ ...service, medicine: e.target.value })} placeholder="None" /></label>
                      <label className="dental-field"><span>Anesthesia</span>
                        <input className="input" maxLength={300} value={service.anesthesia} onChange={(e) => setService({ ...service, anesthesia: e.target.value })} placeholder="None" /></label>
                    </div>
                  </section>
                  <section className="dental-section" aria-labelledby="enc-chart">
                    <h2 className="dental-section-title" id="enc-chart">Dental Chart</h2>
                    <p className="dental-section-sub">Update what changed today, such as a filled or extracted tooth.</p>
                    <ToothChart value={chart} onChange={done ? undefined : setChart} marked={teeth.split(/[\s,]+/).filter(Boolean)} />
                  </section>
                  <section className="dental-section" aria-labelledby="enc-next">
                    <h2 className="dental-section-title" id="enc-next">Next Appointment</h2>
                    <p className="dental-section-sub">Leave the date empty if no further visit is needed.</p>
                    <NextAppointmentFields value={next} onChange={setNext} dentists={dentists} optional />
                  </section>
                </fieldset>
                <div className="dental-actions">
                  {error && <p className="dental-alert" role="alert" style={{ margin: '0 auto 0 0' }}>{error}</p>}
                  <button type="button" className="btn secondary" onClick={() => navigate('/appointments')} disabled={saving}>Cancel</button>
                  <button type="submit" className="btn" disabled={done || saving}>{saving ? 'Saving…' : 'Complete Visit'}</button>
                </div>
              </form>

              <aside className="dental-stack" aria-label="Patient record">
                <section className="card" style={{ padding: 0 }}>
                  <div className="dental-section">
                    <h2 className="dental-section-title">{recordName(record)}</h2>
                    <p className="dental-section-sub">{appointment.patient_id}</p>
                    <dl className="dental-facts">
                      <div><dt>Age · Sex</dt><dd>{[ageFrom(record.date_of_birth), record.sex === 'F' ? 'Female' : record.sex === 'M' ? 'Male' : ''].filter((v) => v !== '').join(' · ') || '—'}</dd></div>
                      <div><dt>Classification</dt><dd>{record.classification}</dd></div>
                      <div><dt>College / Unit</dt><dd>{record.college_course_unit || '—'}</dd></div>
                      <div><dt>Emergency Contact</dt><dd>{[record.emergency_name, record.emergency_contact].filter(Boolean).join(' · ') || '—'}</dd></div>
                    </dl>
                    {record.remarks && <><h3 className="dental-section-title" style={{ marginTop: 16, fontSize: 'var(--font-size-sm)' }}>Remarks</h3><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{record.remarks}</p></>}
                  </div>
                </section>
                <section className="card" style={{ padding: 0 }}>
                  <div className="dental-section" style={{ paddingBottom: 8 }}><h2 className="dental-section-title">Past Visits</h2></div>
                  <ServiceHistory services={services} compact />
                </section>
              </aside>
            </div>
          )}
      </div>
    </main>
  );
};

export default DentalEncounter;

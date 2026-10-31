import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { ClockIcon, UserIcon } from '../../components/icons/Icons.jsx';
import { STATUS_BADGE, formatDay, formatTimeLabel, todayIso } from '../dental/dentalShared.js';
import '../dental/dental.css';

const dateParts = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    month: new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(d),
    day: d.getUTCDate(),
    weekday: new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'UTC' }).format(d),
  };
};

/**
 * Read-only: dental appointments are set by the dentist after the onsite
 * consultation, so patients see them here rather than booking them.
 */
const PatientDentalAppointments = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.patient_id) { setRows([]); return; }
    supabase.from('appointments')
      .select('id, appointment_date, appointment_time, service_type, clinician_name, status')
      .eq('patient_id', user.patient_id).eq('department', 'Dental Clinic')
      .order('appointment_date', { ascending: false }).order('appointment_time', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError('Your dental appointments could not be loaded. Refresh the page to try again.');
        setRows(data || []);
      });
  }, [user?.patient_id]);

  const today = todayIso();
  const upcoming = (rows || []).filter((a) => a.status === 'Scheduled' && a.appointment_date >= today).reverse();
  const history = (rows || []).filter((a) => !upcoming.includes(a));

  return (
    <main className="main">
      <section className="page" style={{ width: '100%', maxWidth: '1100px', margin: '0 auto', boxSizing: 'border-box' }}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>Dental Appointment</h2>
          <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
            Your dentist sets these after your consultation at the Dental Clinic. Come on the date and time shown.
          </div>
        </div>

        {error && <p className="dental-alert" role="alert">{error}</p>}
        {rows === null ? <div className="card dental-empty" role="status">Loading your dental appointments…</div> : (
          <div className="dental-stack">
            <section aria-labelledby="dental-upcoming">
              <h3 id="dental-upcoming" className="dental-section-title" style={{ marginBottom: 12 }}>Upcoming</h3>
              {upcoming.length === 0 ? (
                <div className="card dental-empty">
                  No upcoming dental appointment. Your first dental visit is a consultation at the Dental Clinic. Bring your COR and school ID.
                </div>
              ) : upcoming.map((a) => {
                const d = dateParts(a.appointment_date);
                return (
                  <article key={a.id} className="card patient-event-card patient-dental-card">
                    <div className="patient-event-card-top">
                      <div className="patient-event-date-block" aria-hidden="true">
                        <span className="patient-event-date-month">{d.month}</span>
                        <span className="patient-event-date-day">{d.day}</span>
                      </div>
                      <div className="patient-event-header-info">
                        <div className="patient-event-badge-row"><span className="badge badge-info">Dental Clinic</span></div>
                        <h4 className="patient-event-title" style={{ margin: '4px 0 0' }}>{a.service_type || 'Dental procedure'}</h4>
                      </div>
                    </div>
                    <div className="patient-event-meta-card">
                      <div className="patient-event-meta-item"><ClockIcon size={14} className="patient-event-meta-icon" />
                        <span className="patient-event-meta-text">{d.weekday}, {formatDay(a.appointment_date)} at {formatTimeLabel(a.appointment_time)}</span></div>
                      <div className="patient-event-meta-item"><UserIcon size={14} className="patient-event-meta-icon" />
                        <span className="patient-event-meta-text">{a.clinician_name}</span></div>
                    </div>
                  </article>
                );
              })}
              <p className="dental-muted" style={{ marginTop: 12 }}>
                Classes suspended or another reason you cannot control? <Link to="/patient/messages">Send a Dental inquiry</Link> and the clinic will set a new schedule.
              </p>
            </section>

            {history.length > 0 && (
              <section className="card" style={{ padding: 0 }} aria-labelledby="dental-history">
                <div className="dental-section" style={{ paddingBottom: 8 }}><h3 id="dental-history" className="dental-section-title" style={{ margin: 0 }}>Past Appointments</h3></div>
                <ul className="dental-list">
                  {history.map((a) => (
                    <li key={a.id}>
                      <div className="dental-list-main">
                        <div className="dental-list-title">{a.service_type || 'Dental procedure'}</div>
                        <div className="dental-list-sub">{formatDay(a.appointment_date)} · {formatTimeLabel(a.appointment_time)} · {a.clinician_name}</div>
                      </div>
                      <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>{a.status === 'Scheduled' ? 'Missed' : a.status}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientDentalAppointments;

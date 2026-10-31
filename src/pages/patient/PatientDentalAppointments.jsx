import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { ClockIcon, MessagesIcon, UserIcon } from '../../components/icons/Icons.jsx';
import { STATUS_BADGE, formatDay, formatTimeLabel, todayIso } from '../dental/dentalShared.js';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import '../dental/dental.css';

const dateParts = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    month: new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(d),
    day: d.getUTCDate(),
    weekday: new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'UTC' }).format(d),
  };
};

const daysUntil = (todayIso, iso) => {
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
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
  const historyPages = useTablePagination(history, { pageSize: 5 });

  return (
    <main className="main">
      <section className="page" style={{ width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>Dental Appointment</h2>
            <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
              Your dentist sets these after your consultation at the Dental Clinic. Come on the date and time shown.
            </div>
          </div>
        </div>

        {error && <p className="dental-alert" role="alert">{error}</p>}
        {rows === null ? <div className="card dental-empty" role="status">Loading your dental appointments…</div> : (
          <div className="patient-dental-layout">
            <div className="dental-stack">
              <section aria-labelledby="dental-upcoming">
                <div className="patient-dental-heading">
                  <h3 id="dental-upcoming" className="dental-section-title" style={{ margin: 0 }}>Upcoming</h3>
                  {upcoming.length > 0 && <span className="badge badge-neutral">{upcoming.length}</span>}
                </div>
                {upcoming.length === 0 ? (
                  <div className="card dental-empty">
                    <strong className="patient-dental-empty-title">No upcoming dental appointment</strong>
                    Your first dental visit is a consultation at the Dental Clinic. Bring your COR and school ID.
                  </div>
                ) : upcoming.map((a) => {
                  const d = dateParts(a.appointment_date);
                  const when = daysUntil(today, a.appointment_date);
                  return (
                    <article key={a.id} className="card patient-dental-card">
                      <div className="patient-dental-date" aria-hidden="true">
                        <span className="patient-dental-date-month">{d.month}</span>
                        <span className="patient-dental-date-day">{d.day}</span>
                        <span className="patient-dental-date-weekday">{d.weekday.slice(0, 3)}</span>
                      </div>
                      <div className="patient-dental-body">
                        <div className="patient-dental-badges">
                          <span className="badge badge-info">Dental Clinic</span>
                          <span className={`badge ${when === 'Today' ? 'badge-warning' : 'badge-success'}`}>{when}</span>
                        </div>
                        <h4 className="patient-dental-title">{a.service_type || 'Dental procedure'}</h4>
                        <dl className="patient-dental-meta">
                          <div><dt><ClockIcon size={14} /> Date and time</dt>
                            <dd>{d.weekday}, {formatDay(a.appointment_date)} at {formatTimeLabel(a.appointment_time)}</dd></div>
                          <div><dt><UserIcon size={14} /> Dentist</dt>
                            <dd>{a.clinician_name || 'Dental Clinic'}</dd></div>
                        </dl>
                      </div>
                    </article>
                  );
                })}
              </section>

              {history.length > 0 && (
                <section className="card" style={{ padding: 0 }} aria-labelledby="dental-history">
                  <div className="dental-section" style={{ paddingBottom: 8 }}><h3 id="dental-history" className="dental-section-title" style={{ margin: 0 }}>Past Appointments</h3></div>
                  <ul className="dental-list">
                    {historyPages.pageRows.map((a) => (
                      <li key={a.id}>
                        <div className="dental-list-main">
                          <div className="dental-list-title">{a.service_type || 'Dental procedure'}</div>
                          <div className="dental-list-sub">{formatDay(a.appointment_date)} · {formatTimeLabel(a.appointment_time)} · {a.clinician_name}</div>
                        </div>
                        <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>{a.status === 'Scheduled' ? 'Missed' : a.status}</span>
                      </li>
                    ))}
                  </ul>
                  <TablePagination page={historyPages.page} totalPages={historyPages.totalPages} startIndex={historyPages.startIndex}
                    endIndex={historyPages.endIndex} total={historyPages.total} onPageChange={historyPages.goToPage} itemLabel="appointments" />
                </section>
              )}
            </div>

            <aside className="card patient-dental-aside" aria-labelledby="dental-help">
              <h3 id="dental-help" className="dental-section-title">Can't make it?</h3>
              <p>
                Classes suspended or another reason you cannot control? Send a Dental inquiry and the clinic will set a new schedule.
              </p>
              <Link to="/patient/messages" className="btn secondary"><MessagesIcon size={16} /> Send a Dental inquiry</Link>
              <hr />
              <h3 className="dental-section-title">What to bring</h3>
              <p>Your COR and school ID.</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientDentalAppointments;

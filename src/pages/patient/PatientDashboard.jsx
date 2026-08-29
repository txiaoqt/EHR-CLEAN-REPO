// src/pages/patient/PatientDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const studentName = user?.name || 'Angel Keith Carbon';

  useEffect(() => {
    let mounted = true;
    const loadDashboardData = async () => {
      if (!user?.patient_id) {
        if (mounted) setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [{ data: appts }, { data: encs }, { data: msgs }] = await Promise.all([
          supabase
            .from('appointments')
            .select('*')
            .eq('patient_id', user.patient_id)
            .order('appointment_date', { ascending: true })
            .order('appointment_time', { ascending: true }),
          supabase
            .from('encounters')
            .select('id, encounter_date, clinician_name, chief_complaint, assessment_plan, status')
            .eq('patient_id', user.patient_id)
            .eq('status', 'Completed')
            .order('encounter_date', { ascending: false })
            .limit(3),
          supabase
            .from('patient_messages')
            .select('id, created_at, recipient_name, concern_type, message_text, status')
            .eq('patient_id', user.patient_id)
            .order('created_at', { ascending: false })
            .limit(3),
        ]);

        if (!mounted) return;
        setAppointments(appts || []);
        setEncounters(encs || []);
        setRecentMessages(msgs || []);
      } catch (err) {
        console.warn('Dashboard data fetch error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDashboardData();
    return () => { mounted = false; };
  }, [user?.patient_id]);

  const nextAppointment = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (appointments || []).find((a) => a.appointment_date >= today && a.status !== 'Cancelled') || null;
  }, [appointments]);

  const completedVisitsCount = encounters.length;
  const pendingCount = (appointments || []).filter((a) => a.status === 'Scheduled' || a.status === 'Checked-in').length;

  return (
    <main className="main">
      <section className="page patient-dashboard-page patient-main-layout-grid" style={{ width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Page Header & Welcome */}
        <div className="page-header patient-page-header" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12, boxSizing: 'border-box' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>Home</h2>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
              Welcome back, <strong>{studentName}</strong>. Manage your clinic appointments, communications, and health records.
            </div>
          </div>
          <button
            type="button"
            className="btn primary patient-desktop-header-action"
            onClick={() => navigate('/patient/schedule')}
          >
            Book Appointment
          </button>
        </div>

        {/* 4-Item KPI Metrics / 2x2 Summary Grid (Full Width) */}
        <div className="patient-kpi-grid" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 18 }}>
          <div className="card patient-kpi-card" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>Next Clinic Visit</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: nextAppointment ? 'var(--primary, #8b0000)' : 'var(--text)', marginTop: 4 }}>
              {loading ? '...' : nextAppointment ? nextAppointment.appointment_date : 'None'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nextAppointment ? `${nextAppointment.department || 'Clinic'} (${nextAppointment.appointment_time || 'General'})` : 'Schedule is clear'}
            </div>
          </div>

          <div className="card patient-kpi-card" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>Active Appointments</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
              {loading ? '...' : pendingCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Scheduled or checked-in
            </div>
          </div>

          <div className="card patient-kpi-card" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>Completed Visits</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
              {loading ? '...' : completedVisitsCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Recorded consultations
            </div>
          </div>

          <div className="card patient-kpi-card" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>Clinic Inquiries</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
              {loading ? '...' : recentMessages.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Messages to clinic staff
            </div>
          </div>
        </div>

        {/* Next Scheduled Appointment (Contextual Hero Card) */}
        <div className="card patient-next-appt-card" style={{ width: '100%', boxSizing: 'border-box', padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                Next Scheduled Appointment
              </h3>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                Your upcoming confirmed or queue booking with TUP Clinic
              </div>
            </div>
            {nextAppointment && (
              <span
                className={`badge ${nextAppointment.status === 'Checked-in' ? 'badge-success' : 'badge-primary'}`}
                style={{ fontWeight: 700 }}
              >
                {nextAppointment.status || 'Scheduled'}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Loading schedule details...
            </div>
          ) : nextAppointment ? (
            <div style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Date & Time Slot
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                    {nextAppointment.appointment_date} • {nextAppointment.appointment_time || 'Regular Clinic Hours'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Department & Service
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                    {nextAppointment.department || 'Medical Clinic'} ({nextAppointment.service_type || nextAppointment.type || 'Consultation'})
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Attending Clinician:</span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    {nextAppointment.clinician_name || 'To be assigned'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {nextAppointment.queue_number ? 'Queue Number:' : 'Booking Reference:'}
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary, #8b0000)', marginTop: 2 }}>
                    {nextAppointment.queue_number ? `#${nextAppointment.queue_number}` : nextAppointment.reference_code || 'Confirmed'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => navigate('/patient/schedule')}
                >
                  View Schedule
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => navigate('/patient/messages')}
                >
                  Message Clinic
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--bg, #f8fafc)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                No upcoming appointments
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, maxWidth: 340, margin: '4px auto 14px' }}>
                Your schedule is currently clear. Book a consultation or dental appointment anytime.
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => navigate('/patient/schedule')}
              >
                Book Appointment
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions Card (Desktop only - hidden on mobile/tablet) */}
        <div className="card patient-quick-actions-card" style={{ width: '100%', boxSizing: 'border-box', padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            Quick Actions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="btn secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px' }}
              onClick={() => navigate('/patient/schedule')}
            >
              Book Appointment
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px' }}
              onClick={() => navigate('/patient/messages')}
            >
              Message Clinic Personnel
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px' }}
              onClick={() => navigate('/patient/events')}
            >
              View Campus Health Events
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px' }}
              onClick={() => navigate('/patient/profile')}
            >
              Update Profile Information
            </button>
          </div>
        </div>

        {/* Recent Completed Visits (Records Preview) */}
        <div className="card patient-consultations-card" style={{ width: '100%', boxSizing: 'border-box', padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                Recent Completed Consultations
              </h3>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Selected summaries of your past clinic encounters
              </div>
            </div>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigate('/patient/records')}
            >
              View All Records
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 18, color: 'var(--muted)', fontSize: 13 }}>
              Loading visit records...
            </div>
          ) : encounters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 14px', background: 'var(--bg, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                No completed visits recorded yet
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                Your completed consultations and clinical summaries will appear here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {encounters.map((enc) => (
                <div
                  key={enc.id}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg, #f8fafc)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      {enc.chief_complaint || 'General Medical Consultation'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {enc.encounter_date ? new Date(enc.encounter_date).toLocaleDateString() : 'Recent'} • Clinician: {enc.clinician_name || 'Clinic Physician'}
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ fontWeight: 600, fontSize: 11, flexShrink: 0 }}>
                    Completed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Inquiries Preview */}
        <div className="card patient-inquiries-card" style={{ width: '100%', boxSizing: 'border-box', padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Recent Inquiries
            </h3>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigate('/patient/messages')}
            >
              Open Messages
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 13 }}>
              Loading inquiries...
            </div>
          ) : recentMessages.length === 0 ? (
            <div style={{ padding: '16px 14px', background: 'var(--bg, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>No active conversations</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Have a question? Send a non-emergency message to clinic staff.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentMessages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: 10,
                    background: 'var(--bg, #f8fafc)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    <span>To: {m.recipient_name || 'Clinic'}</span>
                    <span style={{ color: 'var(--muted)' }}>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.message_text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default PatientDashboard;

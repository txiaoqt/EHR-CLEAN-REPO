// src/pages/patient/PatientDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { RecordIncompleteBanner } from '../../components/RecordGate.jsx';
import { CalendarIcon, ClockIcon, CheckIcon, MessagesIcon } from '../../components/icons/Icons.jsx';
import KpiCard from '../../components/KpiCard.jsx';
import { isVisitCompleted } from '../../utils/visitStatus.js';

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [completedVisitsCount, setCompletedVisitsCount] = useState(0);
  const [recentMessages, setRecentMessages] = useState([]);
  const [inquiryCounts, setInquiryCounts] = useState({ total: 0, active: 0, past: 0 });
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
        const [
          { data: appts },
          { data: visits, error: visitsError },
          { data: msgs },
          { data: inquiryConversations, error: inquiryError },
        ] = await Promise.all([
          supabase
            .from('appointments')
            .select('*')
            .eq('patient_id', user.patient_id)
            .order('appointment_date', { ascending: true })
            .order('appointment_time', { ascending: true }),
          supabase
            .from('medical_log_visits')
            .select('visit_id, visit_source, appointment_id, encounter_id, appointment_status, encounter_status, visit_date, clinician_name, chief_complaint, assessment_plan')
            .eq('patient_id', user.patient_id)
            .order('visit_date', { ascending: false }),
          supabase
            .from('patient_messages')
            .select('id, created_at, recipient_name, concern_type, message_text, status')
            .eq('patient_id', user.patient_id)
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('patient_message_conversations')
            .select('id, status')
            .eq('patient_id', user.patient_id),
        ]);

        if (visitsError) throw visitsError;
        if (!mounted) return;

        // The KPI counts inquiry threads, matching the Active and Past Inquiries
        // folders in Messages. Recent message rows are still used for the preview.
        let conversations = inquiryConversations || [];
        if (inquiryError?.code === 'PGRST205') {
          const { data: rawMessages } = await supabase
            .from('patient_messages')
            .select('id, conversation_id, patient_id, recipient_name, concern_type, created_at')
            .eq('patient_id', user.patient_id)
            .order('created_at', { ascending: false });

          const threadMap = new Map();
          (rawMessages || []).forEach((message) => {
            const key = message.conversation_id || `${message.patient_id}_${message.recipient_name || 'Clinic'}_${message.concern_type}`;
            if (!threadMap.has(key)) threadMap.set(key, { id: key, status: 'open' });
          });
          conversations = Array.from(threadMap.values());
        }

        const activeInquiryCount = conversations.filter(
          (conversation) => (conversation.status || 'open').toLowerCase() === 'open'
        ).length;
        setInquiryCounts({
          total: conversations.length,
          active: activeInquiryCount,
          past: conversations.length - activeInquiryCount,
        });

        const completedVisits = (visits || []).filter(isVisitCompleted);
        setAppointments(appts || []);
        setCompletedVisitsCount(completedVisits.length);
        setEncounters(completedVisits.slice(0, 3).map((visit) => ({
          ...visit,
          id: visit.visit_id,
          encounter_date: visit.visit_date,
        })));
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
    // Only Scheduled bookings are upcoming. Completed ones drop off the list
    // entirely; Cancelled ones never show.
    return (appointments || []).find((a) => a.appointment_date >= today && a.status === 'Scheduled') || null;
  }, [appointments]);

  const pendingCount = (appointments || []).filter((a) => a.status === 'Scheduled').length;

  return (
    <main className="main">
      <section className="page patient-dashboard-page patient-main-layout-grid" style={{ width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Page Header & Welcome */}
        <div className="page-header patient-page-header" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12, boxSizing: 'border-box' }}>
          <div>
            <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>Home</h2>
            <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
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

        {/* The form is optional for enrolled students, so keep the reminder
            near the page heading without gating portal actions. */}
        <RecordIncompleteBanner
          className="patient-dashboard-record-notice"
          onOpen={() => navigate('/patient/profile')}
        />

        {/* 4-Item KPI Metrics / 2x2 Summary Grid (Full Width) */}
        <div className="patient-kpi-grid" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 18 }}>
          {[
            {
              title: 'Next Clinic Visit',
              value: loading ? '...' : nextAppointment ? nextAppointment.appointment_date : 'None',
              description: nextAppointment ? `${nextAppointment.department || 'Clinic'} visit` : 'No upcoming visit',
              Icon: CalendarIcon,
              valueClassName: 'kpi-value-compact',
            },
            { title: 'Active Appointments', value: loading ? '...' : pendingCount, description: 'Scheduled or checked in', Icon: ClockIcon },
            { title: 'Completed Visits', value: loading ? '...' : completedVisitsCount, description: 'Recorded consultations', Icon: CheckIcon },
            {
              title: 'Clinic Inquiries',
              value: loading ? '...' : inquiryCounts.total,
              description: loading ? 'Loading inquiries' : `${inquiryCounts.active} active · ${inquiryCounts.past} past`,
              Icon: MessagesIcon,
            },
          ].map((kpi) => (
            <KpiCard
              key={kpi.title}
              title={kpi.title}
              value={kpi.value}
              description={kpi.description}
              Icon={kpi.Icon}
              className="patient-kpi-card"
              valueClassName={kpi.valueClassName}
            />
          ))}
        </div>

        {/* Next Scheduled Appointment (Contextual Hero Card) */}
        <div className="card patient-next-appt-card" style={{ width: '100%', boxSizing: 'border-box', padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Next Scheduled Appointment
              </h3>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
                Your upcoming confirmed or queue booking with TUP Clinic
              </div>
            </div>
            {nextAppointment && (
              <span
                className="badge badge-primary"
                style={{ fontWeight: 'var(--font-weight-bold)' }}
              >
                {nextAppointment.status || 'Scheduled'}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
              Loading schedule details...
            </div>
          ) : nextAppointment ? (
            <div style={{ background: 'var(--surface-raised, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase' }}>
                    Date & Time Slot
                  </div>
                  <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)', marginTop: 2 }}>
                    {nextAppointment.appointment_date} • {nextAppointment.appointment_time || 'Regular Clinic Hours'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase' }}>
                    Department & Service
                  </div>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginTop: 2 }}>
                    {nextAppointment.department || 'Medical Clinic'} ({nextAppointment.service_type || nextAppointment.type || 'Consultation'})
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--muted)' }}>Attending Clinician:</span>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', marginTop: 2 }}>
                    {nextAppointment.clinician_name || 'To be assigned'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--muted)' }}>
                    {nextAppointment.queue_number ? 'Queue Number:' : 'Booking Reference:'}
                  </span>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-rose-text, #fda4af)', marginTop: 2 }}>
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
            <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--surface-raised, #f8fafc)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                No upcoming appointments
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 4, maxWidth: 340, margin: '4px auto 14px' }}>
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
          <h3 style={{ margin: '0 0 12px 0', fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
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
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Recent Completed Consultations
              </h3>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2 }}>
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
            <div style={{ textAlign: 'center', padding: 18, color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>
              Loading visit records...
            </div>
          ) : encounters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 14px', background: 'var(--bg, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                No completed visits recorded yet
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 3 }}>
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
                    <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)', color: 'var(--text)' }}>
                      {enc.chief_complaint || 'General Medical Consultation'}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--muted)', marginTop: 2 }}>
                      {enc.encounter_date ? new Date(enc.encounter_date).toLocaleDateString() : 'Recent'} • Clinician: {enc.clinician_name || 'Clinic Physician'}
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-2xs)', flexShrink: 0 }}>
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
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
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
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>
              Loading inquiries...
            </div>
          ) : recentMessages.length === 0 ? (
            <div style={{ padding: '16px 14px', background: 'var(--bg, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>No active conversations</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                    <span>To: {m.recipient_name || 'Clinic'}</span>
                    <span style={{ color: 'var(--muted)' }}>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

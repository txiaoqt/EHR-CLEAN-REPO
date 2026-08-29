// src/pages/patient/PatientMessages.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';

const CONCERN_TYPES = [
  'General clinic inquiry',
  'General Medical Inquiry',
  'Dental Inquiry',
  'Prescription & Medication Follow-up',
  'Medical Certificate Request',
  'Lab / Diagnostic Result Inquiry',
  'Appointment Reschedule / Follow-up',
  'Emergency / Urgent Assistance',
];

const PatientMessages = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [physicians, setPhysicians] = useState([]);
  const [form, setForm] = useState({
    recipient_name: '',
    concern_type: CONCERN_TYPES[0],
    message_text: '',
  });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);

  // Load registered physicians from safe staff_directory view
  useEffect(() => {
    let mounted = true;
    const loadPhysicians = async () => {
      try {
        const { data, error } = await supabase
          .from('staff_directory')
          .select('id, name, role')
          .in('role', ['physician', 'nurse'])
          .order('name');

        if (!error && mounted) {
          setPhysicians((data || []).map((s) => s.name));
        }
      } catch (err) {
        console.warn('Load physicians error:', err);
      }
    };
    loadPhysicians();
    return () => { mounted = false; };
  }, []);

  // Load student message history
  const loadMessages = async () => {
    if (!user?.patient_id) return;
    try {
      const { data, error } = await supabase
        .from('patient_messages')
        .select('*')
        .eq('patient_id', user.patient_id)
        .order('created_at', { ascending: false });

      if (!error) {
        setMessages(data || []);
      }
    } catch (err) {
      console.warn('Load messages error:', err);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [user?.patient_id]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!form.message_text.trim() || !user?.patient_id) return;
    setSending(true);
    setNotice('');

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || user?.id || null;

      const { error } = await supabase
        .from('patient_messages')
        .insert([
          {
            patient_id: user.patient_id,
            user_id: user.id || null,
            auth_user_id: authUid,
            recipient_name: form.recipient_name || 'Clinic Personnel (General)',
            concern_type: form.concern_type,
            message_text: form.message_text.trim(),
            status: 'sent',
          },
        ]);

      if (error) throw error;

      setNotice('Your inquiry has been sent to the clinic personnel. You will receive advice or assistance shortly.');
      setForm({
        recipient_name: '',
        concern_type: CONCERN_TYPES[0],
        message_text: '',
      });
      await loadMessages();
    } catch (err) {
      console.error(err);
      setNotice(`Unable to send message: ${err.message || 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (notice) setNoticeOpen(true);
  }, [notice]);

  return (
    <main className="main">
      <section className="page patient-messages-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>Messages</h2>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
              Direct non-emergency inquiries and follow-ups with university clinic personnel.
            </div>
          </div>
        </div>

        {/* Clinical Advisory Banner */}
        <div
          style={{
            background: 'var(--bg, #f8fafc)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--muted)',
          }}
        >
          <strong style={{ color: 'var(--text)' }}>Clinical Notice:</strong> This messaging interface is intended for non-emergency inquiries, appointment questions, and routine follow-ups. In case of medical emergencies, please proceed directly to the university clinic or the nearest emergency room.
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="patient-main-layout-grid" style={{ alignItems: 'start' }}>
          {/* Left Column: Compose Form */}
          <div className="card" style={{ padding: 22, border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              New Inquiry
            </h3>

            <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Recipient
                </label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={form.recipient_name}
                  onChange={(e) => setForm((p) => ({ ...p, recipient_name: e.target.value }))}
                >
                  <option value="">Clinic Personnel (General)</option>
                  {physicians.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Concern Category
                </label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={form.concern_type}
                  onChange={(e) => setForm((p) => ({ ...p, concern_type: e.target.value }))}
                >
                  {CONCERN_TYPES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Message Content *
                </label>
                <textarea
                  className="input"
                  style={{ width: '100%', minHeight: 120, lineHeight: 1.4 }}
                  placeholder="Describe your inquiry or question in detail..."
                  value={form.message_text}
                  onChange={(e) => setForm((p) => ({ ...p, message_text: e.target.value }))}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={sending || !form.message_text.trim()}
                style={{ width: '100%', marginTop: 4 }}
              >
                {sending ? 'Sending Inquiry...' : 'Send Message'}
              </button>
            </form>
          </div>

          {/* Right Column: Message History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card" style={{ padding: 22, border: '1px solid var(--border)', borderRadius: 12 }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                Message History
              </h3>

              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--bg, #f8fafc)', borderRadius: 10, border: '1px dashed var(--border)' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>No conversations yet</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    Send a non-emergency inquiry to clinic personnel using the form on the left.
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop/Tablet Table View (>= 768px) */}
                  <div className="patient-messages-table-view table-responsive" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Recipient</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Category</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Message</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {messages.map((m) => (
                          <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {m.created_at ? new Date(m.created_at).toLocaleDateString() : '-'}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                              {m.recipient_name || 'Clinic General'}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 13 }}>
                              <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 600 }}>
                                {m.concern_type}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.message_text}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span className="badge badge-info" style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                {m.status || 'sent'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View (< 768px) */}
                  <div className="patient-messages-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          background: 'var(--bg, #f8fafc)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 14,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                            {m.created_at ? new Date(m.created_at).toLocaleDateString() : '-'}
                          </span>
                          <span className="badge badge-info" style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                            {m.status || 'sent'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <strong style={{ fontSize: 14, color: 'var(--text)' }}>
                            To: {m.recipient_name || 'Clinic General'}
                          </strong>
                          <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 600 }}>
                            {m.concern_type}
                          </span>
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                          {m.message_text}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notice Dialog Modal */}
        {noticeOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3200,
              padding: 16,
            }}
            onClick={() => setNoticeOpen(false)}
          >
            <div
              style={{
                width: 'min(92vw, 460px)',
                background: 'var(--panel, #ffffff)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                padding: 24,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {notice.toLowerCase().includes('unable') || notice.toLowerCase().includes('failed') ? 'Notice' : 'Inquiry Sent'}
              </h3>
              <div style={{ color: notice.toLowerCase().includes('unable') || notice.toLowerCase().includes('failed') ? 'var(--danger)' : 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>
                {notice}
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn secondary" onClick={() => setNoticeOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientMessages;

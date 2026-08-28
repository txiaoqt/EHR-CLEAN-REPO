import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';

const Help = () => {
  const { user } = useAuth();
  const isDoctor = (user?.role || '').toLowerCase() === 'physician';
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [expandedGuide, setExpandedGuide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activePatientId, setActivePatientId] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [msgNotice, setMsgNotice] = useState('');

  const toggleFaq = (index) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const toggleGuide = (index) => {
    setExpandedGuide(expandedGuide === index ? null : index);
  };

  const faqs = [
    {
      question: "How to reset my password?",
      answer: "To reset your password, click on your profile in the top right corner, select 'Settings', then choose 'Change Password'. Follow the instructions to set a new password."
    },
    {
      question: "What if I encounter an error?",
      answer: "If you encounter an error, first try refreshing the page. If the problem persists, take a screen capture and submit it to support@tupclinic.edu.ph with a description of what you were doing when the error occurred."
    },
    {
      question: "How to export patient data?",
      answer: "Patient data can be exported through the Reports page. Navigate to 'Reports', select your date range and criteria, then click 'Export CSV' or 'Export PDF' to download the patient data."
    },
    {
      question: "Who can access my patient records?",
      answer: "Patient records are only accessible to authorized medical staff (Physicians, Nurses) and administrators. All access is logged in the audit logs for privacy and security compliance."
    }
  ];

  const guides = [
    {
      title: "How to register a patient",
      content: "Visit the Patients page on the sidebar to register a patient. Click 'Register Patient', enter the patient details, and save the record."
    },
    {
      title: "How to record vitals",
      content: "Go to Encounters → Create New Encounter → choose a patient → record vitals. Save as draft or finalize the entry."
    },
    {
      title: "How to use the inventory",
      content: "Navigate to Inventory → Add Stock to increase items, or edit existing items by searching and updating their details."
    },
    {
      title: "How to generate reports",
      content: "Go to Reports → enter date range → click Run. Reports can be exported as CSV or PDF after generating."
    }
  ];

  const loadMessages = async () => {
    if (!isDoctor) return;
    const { data } = await supabase
      .from('patient_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    const rows = data || [];
    setMessages(rows);
    if (!activePatientId && rows.length > 0) setActivePatientId(rows[0].patient_id);
  };

  useEffect(() => {
    loadMessages();
  }, [isDoctor]);

  const threads = useMemo(() => {
    const map = new Map();
    for (const row of messages) {
      if (!map.has(row.patient_id)) map.set(row.patient_id, []);
      map.get(row.patient_id).push(row);
    }
    return Array.from(map.entries()).map(([patientId, rows]) => ({
      patientId,
      patientName: rows[0]?.patient_name || patientId,
      count: rows.length,
    }));
  }, [messages]);

  const activeThread = useMemo(() => {
    return messages
      .filter((m) => m.patient_id === activePatientId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages, activePatientId]);

  const sendReply = async () => {
    if (!isDoctor) {
      setMsgNotice('Only physicians can access and reply to patient messages.');
      return;
    }
    if (!activePatientId || !reply.trim()) {
      setMsgNotice('Reply cannot be empty.');
      return;
    }
    setSending(true);
    setMsgNotice('');
    const targetName = activeThread[0]?.patient_name || activePatientId;
    const { error } = await supabase.from('patient_messages').insert([{
      patient_id: activePatientId,
      patient_name: targetName,
      sender_role: (user?.role || 'physician').toLowerCase(),
      sender_name: user?.name || 'Clinic Staff',
      recipient_name: targetName,
      concern_type: activeThread[0]?.concern_type || 'General clinic inquiry',
      message_text: reply.trim(),
      status: 'sent',
    }]);
    if (error) {
      setMsgNotice(`Unable to send reply: ${error.message}`);
      setSending(false);
      return;
    }
    setReply('');
    setMsgNotice('Reply sent.');
    await loadMessages();
    setSending(false);
  };

  return (
    <main className="main">
      <div className="page">
        {/* 1. Page Header: Clean and focused */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Help, Support & Training</h1>
            <div className="page-header-subtitle">
              Staff knowledge base, clinical workflows, patient communication channel, and technical support.
            </div>
          </div>
        </div>

        {/* 2. Main Content Grid */}
        <div className="help-main-grid">
          {/* FAQ Card */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Frequently Asked Questions</h3>
                <span className="card-subtitle">Common questions regarding system usage</span>
              </div>
              <span className="badge badge-info">Knowledge Base</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      textAlign: 'left',
                      border: 'none',
                      background: expandedFaq === index ? 'var(--grey-100)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: 'var(--text)',
                    }}
                  >
                    <span>{faq.question}</span>
                    <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 700 }}>
                      {expandedFaq === index ? '−' : '+'}
                    </span>
                  </button>

                  {expandedFaq === index && (
                    <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55, borderTop: '1px solid var(--border-subtle)', background: '#ffffff' }}>
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Standard Operating Guides Card */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Standard Operating Guides</h3>
                <span className="card-subtitle">Step-by-step procedures for clinic staff</span>
              </div>
              <span className="badge badge-purple">Workflows</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guides.map((guide, index) => (
                <div
                  key={index}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    overflow: 'hidden'
                  }}
                >
                  <button
                    onClick={() => toggleGuide(index)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      textAlign: 'left',
                      border: 'none',
                      background: expandedGuide === index ? 'var(--grey-100)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: 'var(--text)',
                    }}
                  >
                    <span>{guide.title}</span>
                    <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 700 }}>
                      {expandedGuide === index ? '−' : '+'}
                    </span>
                  </button>

                  {expandedGuide === index && (
                    <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55, borderTop: '1px solid var(--border-subtle)', background: '#ffffff' }}>
                      {guide.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Technical Support & Campus Clinic Helpdesk */}
          <div className="card" style={{ gridColumn: '1 / -1', padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Technical Support & Campus Clinic Helpdesk</h3>
                <span className="card-subtitle">Official IT and clinic support channels</span>
              </div>
              <span className="badge badge-success">● Support Available</span>
            </div>

            <div className="help-support-grid">
              <div style={{ padding: '12px 16px', background: 'var(--grey-100)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Clinic Hotline</div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--color-primary)', marginTop: 4 }}>(+63) 253 013 001</div>
              </div>

              <div style={{ padding: '12px 16px', background: 'var(--grey-100)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Clinic Operational Hours</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginTop: 4 }}>Monday – Friday • 8:00 AM – 5:00 PM</div>
              </div>

              <div style={{ padding: '12px 16px', background: 'var(--grey-100)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email Support</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginTop: 4 }}>support@tupclinic.edu.ph</div>
              </div>
            </div>
          </div>

          {/* Patient Portal Messages & Inquiries */}
          <div className="card" style={{ gridColumn: '1 / -1', padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Patient Portal Messages & Inquiries</h3>
                <span className="card-subtitle">{isDoctor ? 'Direct inquiries sent by registered students via portal' : 'Physician-only communication triage'}</span>
              </div>
              <span className="badge badge-neutral">Inquiries</span>
            </div>

            {!isDoctor ? (
              <div style={{ padding: '24px 20px', textAlign: 'center', background: 'var(--grey-50, #f8fafc)', borderRadius: 10, border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: 13 }}>
                Direct student message replies are restricted to licensed clinic physicians.
              </div>
            ) : threads.length === 0 ? (
              <div style={{
                padding: '36px 20px',
                textAlign: 'center',
                background: 'var(--grey-50, #f8fafc)',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  No active inquiries
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.5 }}>
                  New patient messages sent via the student portal will appear here.
                </div>
              </div>
            ) : (
              <div className="help-messages-grid">
                {/* Threads list */}
                <div style={{ borderRight: '1px solid var(--border-subtle)', maxHeight: 380, overflowY: 'auto', background: 'var(--grey-50, #f8fafc)' }}>
                  {threads.map((t) => (
                    <button
                      key={t.patientId}
                      onClick={() => setActivePatientId(t.patientId)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: activePatientId === t.patientId ? '#ffffff' : 'transparent',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'background 0.12s'
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5 }}>{t.patientName}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{t.patientId} • {t.count} msg(s)</div>
                    </button>
                  ))}
                </div>

                {/* Messages log */}
                <div style={{ padding: 18, display: 'flex', flexDirection: 'column', minHeight: 380 }}>
                  <div style={{ flex: 1, maxHeight: 240, overflowY: 'auto', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeThread.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30, fontSize: 13 }}>Select a patient thread on the left to view message history.</div>
                    ) : activeThread.map((m) => (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 600 }}>
                          {new Date(m.created_at).toLocaleString()} • {m.sender_name || m.sender_role} • {m.concern_type || 'General Inquiry'}
                        </div>
                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--grey-100)', color: 'var(--text)', fontSize: 13, lineHeight: 1.5, border: '1px solid var(--border-subtle)' }}>
                          {m.message_text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <textarea
                      className="input"
                      style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type clinical reply to patient..."
                    />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                      {msgNotice && (
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: msgNotice.includes('Unable') ? 'var(--danger)' : '#059669' }}>
                          {msgNotice}
                        </span>
                      )}
                      <button className="btn small" onClick={sendReply} disabled={sending || !activePatientId || !reply.trim()}>
                        {sending ? 'Sending…' : 'Send Clinical Reply'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default Help;

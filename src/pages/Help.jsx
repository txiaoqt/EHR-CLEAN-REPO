// src/pages/Help.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { MessagesIcon, SearchIcon, SendIcon, ChevronLeftIcon } from '../components/icons/Icons.jsx';

// Date/time formatting helpers
const formatMessageTime = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatInboxDate = (isoString) => {
  if (!isoString) return '';
  const msgDate = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const timeStr = msgDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  if (msgDate.toDateString() === today.toDateString()) {
    return `Today · ${timeStr}`;
  }
  if (msgDate.toDateString() === yesterday.toDateString()) {
    return `Yesterday · ${timeStr}`;
  }
  return `${msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
};

const getDateDividerLabel = (isoString) => {
  if (!isoString) return '';
  const msgDate = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (msgDate.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (msgDate.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const Help = () => {
  const { user } = useAuth();
  const isDoctor = (user?.role || '').toLowerCase() === 'physician';
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [expandedGuide, setExpandedGuide] = useState(null);

  // Messaging state
  const [messages, setMessages] = useState([]);
  const [activePatientId, setActivePatientId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [msgNotice, setMsgNotice] = useState('');
  const [mobileViewingChat, setMobileViewingChat] = useState(false);

  const chatScrollRef = useRef(null);

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

  // Initial load of patient messages for staff
  const loadMessages = async () => {
    if (!isDoctor) return;
    try {
      const { data, error } = await supabase
        .from('patient_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!error && data) {
        setMessages(data);
        if (!activePatientId && data.length > 0) {
          setActivePatientId(data[0].patient_id);
        }
      }
    } catch (err) {
      console.warn('Staff load messages error:', err);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [isDoctor]);

  // Set up Supabase Realtime subscription for live incoming student messages
  useEffect(() => {
    if (!isDoctor) return;

    const channel = supabase
      .channel('patient_messages_staff_stream')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patient_messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
            // If the incoming message belongs to active thread, scroll chat
            if (payload.new.patient_id === activePatientId) {
              setTimeout(() => {
                if (chatScrollRef.current) {
                  chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                }
              }, 100);
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? payload.new : m))
            );
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id === payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isDoctor, activePatientId]);

  // Group messages into distinct conversation threads
  const threads = useMemo(() => {
    const map = new Map();
    for (const row of messages) {
      if (!map.has(row.patient_id)) {
        map.set(row.patient_id, []);
      }
      map.get(row.patient_id).push(row);
    }

    const threadList = Array.from(map.entries()).map(([patientId, rows]) => {
      // rows are sorted newest first
      const latestMsg = rows[0];
      const patientName = rows.find((r) => r.patient_name)?.patient_name || patientId;
      return {
        patientId,
        patientName,
        count: rows.length,
        latestMessage: latestMsg?.message_text || '',
        latestDate: latestMsg?.created_at,
        latestConcernType: latestMsg?.concern_type || 'General clinic inquiry',
        latestSenderRole: latestMsg?.sender_role || 'patient',
      };
    });

    // Sort threads so the most recent conversation is always at the top
    threadList.sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

    return threadList;
  }, [messages]);

  // Filter threads by search query (student name or ID)
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase().trim();
    return threads.filter(
      (t) =>
        t.patientName.toLowerCase().includes(q) ||
        t.patientId.toLowerCase().includes(q) ||
        t.latestMessage.toLowerCase().includes(q)
    );
  }, [threads, searchQuery]);

  // Active conversation message stream, sorted chronologically (oldest to newest)
  const activeThreadMessages = useMemo(() => {
    return messages
      .filter((m) => m.patient_id === activePatientId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages, activePatientId]);

  // Active conversation metadata
  const activeThreadMeta = useMemo(() => {
    return threads.find((t) => t.patientId === activePatientId) || null;
  }, [threads, activePatientId]);

  // Scroll to bottom when active conversation changes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activePatientId, activeThreadMessages.length]);

  // Group messages by date for date dividers
  const groupedActiveMessages = useMemo(() => {
    const groups = [];
    let currentDate = null;
    let currentGroup = [];

    activeThreadMessages.forEach((msg) => {
      const dateLabel = getDateDividerLabel(msg.created_at);
      if (dateLabel !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: currentGroup });
        }
        currentDate = dateLabel;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  }, [activeThreadMessages]);

  // Send reply as clinician
  const sendReply = async (e) => {
    if (e) e.preventDefault();
    if (!isDoctor) {
      setMsgNotice('Only physicians can access and reply to patient messages.');
      return;
    }
    if (!activePatientId || !reply.trim() || sending) {
      return;
    }

    setSending(true);
    setMsgNotice('');
    const textToSend = reply.trim();
    const targetName = activeThreadMeta?.patientName || activePatientId;
    const category = activeThreadMeta?.latestConcernType || 'General clinic inquiry';

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;

      const { data, error } = await supabase
        .from('patient_messages')
        .insert([
          {
            patient_id: activePatientId,
            auth_user_id: authUid,
            patient_name: targetName,
            sender_role: (user?.role || 'physician').toLowerCase(),
            sender_name: user?.name || 'Dr. Rivera (Physician)',
            recipient_name: targetName,
            concern_type: category,
            message_text: textToSend,
            status: 'sent',
          },
        ])
        .select();

      if (error) throw error;

      // Optimistic append if not received via realtime
      if (data?.[0]) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data[0].id)) return prev;
          return [data[0], ...prev];
        });
      }

      setReply('');
      setMsgNotice('Reply sent.');
      setTimeout(() => setMsgNotice(''), 3000);

      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
    } catch (err) {
      console.error('Send clinical reply error:', err);
      setMsgNotice('Unable to send reply right now. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  return (
    <main className="main">
      <div className="page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* 1. Page Header */}
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
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {expandedFaq === index ? '−' : '+'}
                    </span>
                  </button>
                  {expandedFaq === index && (
                    <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--panel)', borderTop: '1px solid var(--border-subtle)' }}>
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Guide Card */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Clinical User Guides</h3>
                <span className="card-subtitle">Step-by-step procedures for clinic staff</span>
              </div>
              <span className="badge badge-success">Procedures</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guides.map((guide, index) => (
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
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {expandedGuide === index ? '−' : '+'}
                    </span>
                  </button>
                  {expandedGuide === index && (
                    <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--panel)', borderTop: '1px solid var(--border-subtle)' }}>
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
              <div style={{ padding: '12px 16px', background: 'var(--surface-raised)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Clinic Hotline</div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--color-primary)', marginTop: 4 }}>(+63) 253 013 001</div>
              </div>

              <div style={{ padding: '12px 16px', background: 'var(--surface-raised)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Clinic Operational Hours</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginTop: 4 }}>Monday – Friday • 8:00 AM – 5:00 PM</div>
              </div>

              <div style={{ padding: '12px 16px', background: 'var(--surface-raised)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email Support</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginTop: 4 }}>support@tupclinic.edu.ph</div>
              </div>
            </div>
          </div>

          {/* Patient Portal Messages & Inquiries: MODERN TWO-PANEL WORKSPACE */}
          <div className="card" style={{ gridColumn: '1 / -1', padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 16 }}>Patient Portal Messages & Inquiries</h3>
                <span className="card-subtitle">
                  {isDoctor
                    ? 'Realtime communication workspace for student inquiries and clinical follow-ups'
                    : 'Physician-only communication triage'}
                </span>
              </div>
              <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                {threads.length} {threads.length === 1 ? 'Conversation' : 'Conversations'}
              </span>
            </div>

            {!isDoctor ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', background: 'var(--surface-raised)', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13.5 }}>
                Direct student message replies are restricted to licensed clinic physicians.
              </div>
            ) : threads.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  background: 'var(--surface-raised)',
                  borderRadius: 12,
                  border: '1px dashed var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <MessagesIcon size={22} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  No active conversations
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.5 }}>
                  New patient inquiries submitted via the Student Portal will appear here in realtime.
                </div>
              </div>
            ) : (
              <div className="tup-staff-messenger">
                {/* LEFT PANEL: Conversation List / Inbox */}
                <div className={`tup-staff-inbox-panel ${mobileViewingChat ? 'hidden-mobile' : ''}`}>
                  <div className="tup-staff-inbox-header">
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      Conversations ({threads.length})
                    </div>
                    <div className="tup-staff-inbox-search">
                      <SearchIcon size={14} className="tup-staff-inbox-search-icon" />
                      <input
                        type="text"
                        placeholder="Search student or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="tup-staff-inbox-list">
                    {filteredThreads.length === 0 ? (
                      <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        No matching conversations
                      </div>
                    ) : (
                      filteredThreads.map((t) => {
                        const isActive = activePatientId === t.patientId;
                        return (
                          <button
                            key={t.patientId}
                            className={`tup-staff-inbox-item ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              setActivePatientId(t.patientId);
                              setMobileViewingChat(true);
                            }}
                          >
                            <div className="tup-messenger-avatar tup-avatar-student" style={{ width: 36, height: 36, fontSize: 13 }}>
                              {t.patientName.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.patientName}
                                </div>
                                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {formatInboxDate(t.latestDate).split(' · ')[0]}
                                </span>
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                                {t.patientId}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-secondary, var(--text))',
                                  marginTop: 3,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  opacity: 0.88,
                                }}
                              >
                                {t.latestSenderRole === 'physician' ? 'Dr. Rivera: ' : ''}{t.latestMessage}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* RIGHT PANEL: Active Conversation */}
                <div className={`tup-staff-chat-panel ${!mobileViewingChat ? 'hidden-mobile' : ''}`}>
                  {/* Header */}
                  <div className="tup-messenger-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="tup-staff-mobile-back"
                        onClick={() => setMobileViewingChat(false)}
                        aria-label="Back to conversations"
                      >
                        <ChevronLeftIcon size={16} />
                        <span>Inbox</span>
                      </button>

                      <div className="tup-messenger-avatar tup-avatar-student">
                        {activeThreadMeta?.patientName?.charAt(0).toUpperCase() || 'P'}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {activeThreadMeta?.patientName || activePatientId}
                          <span className="badge badge-info" style={{ fontSize: 10.5, fontWeight: 600 }}>
                            Student / Patient
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <span>ID: {activePatientId}</span>
                          <span>•</span>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                            {activeThreadMeta?.latestConcernType || 'General clinic inquiry'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages Stream */}
                  <div ref={chatScrollRef} className="tup-chat-messages-area">
                    {activeThreadMessages.length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
                        Select a patient thread on the left to view message history.
                      </div>
                    ) : (
                      groupedActiveMessages.map((group, gIdx) => (
                        <React.Fragment key={group.date || gIdx}>
                          <div className="tup-chat-date-divider">
                            <span>{group.date}</span>
                          </div>

                          {group.messages.map((m) => {
                            const isPatient = m.sender_role === 'patient';
                            // STAFF VIEW:
                            // Incoming Student message -> ALIGNED LEFT (incoming)
                            // Outgoing Staff reply -> ALIGNED RIGHT (outgoing)
                            return (
                              <div
                                key={m.id}
                                className={`tup-chat-message-row ${isPatient ? 'incoming' : 'outgoing'}`}
                              >
                                <div className="tup-chat-sender-label">
                                  <span>{isPatient ? (m.patient_name || m.sender_name || 'Student') : (m.sender_name || 'Dr. Rivera (Physician)')}</span>
                                  <span style={{ fontSize: 10, opacity: 0.75 }}>
                                    {isPatient ? '(Patient)' : '(Clinician)'}
                                  </span>
                                </div>

                                <div className={`tup-chat-bubble ${isPatient ? 'incoming' : 'outgoing'}`}>
                                  {m.message_text}
                                </div>

                                <div className="tup-chat-time">
                                  <span>{formatMessageTime(m.created_at)}</span>
                                  {!isPatient && (
                                    <span style={{ fontSize: 10, opacity: 0.8 }}>• {m.status || 'sent'}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))
                    )}
                  </div>

                  {/* Staff Composer */}
                  <form className="tup-chat-composer" onSubmit={sendReply}>
                    <textarea
                      className="tup-chat-input"
                      rows={1}
                      placeholder="Type clinical reply to patient... (Enter to send, Shift+Enter for newline)"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={sending || !activePatientId}
                      aria-label="Clinical reply input"
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {msgNotice && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: msgNotice.includes('Unable') ? 'var(--danger)' : '#059669' }}>
                          {msgNotice}
                        </span>
                      )}
                      <button
                        type="submit"
                        className="tup-chat-send-btn"
                        disabled={sending || !activePatientId || !reply.trim()}
                        aria-label="Send clinical reply"
                      >
                        <SendIcon size={16} />
                        <span>{sending ? 'Sending...' : 'Send Clinical Reply'}</span>
                      </button>
                    </div>
                  </form>
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

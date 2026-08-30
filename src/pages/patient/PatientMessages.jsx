// src/pages/patient/PatientMessages.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { MessagesIcon, SendIcon, PlusIcon, CloseIcon } from '../../components/icons/Icons.jsx';

const CONCERN_TYPES = [
  'General clinic inquiry',
  'Appointment concern',
  'Follow-up question',
  'Medical inquiry',
  'Dental inquiry',
];

// Date and Time Helper Utilities
const formatMessageTime = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
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

const PatientMessages = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [physicians, setPhysicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [composerText, setComposerText] = useState('');

  // New Inquiry Modal State
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    recipient_name: '',
    concern_type: CONCERN_TYPES[0],
    message_text: '',
  });

  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

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
    return () => {
      mounted = false;
    };
  }, []);

  // Initial load of student messages
  const loadMessages = async () => {
    if (!user?.patient_id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('patient_messages')
        .select('*')
        .eq('patient_id', user.patient_id)
        .order('created_at', { ascending: true });

      if (!error) {
        setMessages(data || []);
      }
    } catch (err) {
      console.warn('Load messages error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [user?.patient_id]);

  // Scroll to bottom when messages finish loading or update
  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [loading]);

  // Set up Supabase Realtime subscription for live student messages
  useEffect(() => {
    if (!user?.patient_id) return;

    const channel = supabase
      .channel(`patient_messages_student_${user.patient_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patient_messages',
          filter: `patient_id=eq.${user.patient_id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              // Deduplicate if already present locally
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
            setTimeout(() => scrollToBottom('smooth'), 100);
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
  }, [user?.patient_id]);

  // Derive conversation partner name and active category
  const activePartner = useMemo(() => {
    if (messages.length === 0) return 'Clinic Personnel (General)';
    const staffMsg = [...messages].reverse().find((m) => m.sender_role !== 'patient');
    if (staffMsg?.sender_name) return staffMsg.sender_name;
    const latestMsg = messages[messages.length - 1];
    return latestMsg?.recipient_name || 'Clinic Personnel (General)';
  }, [messages]);

  const activeConcernType = useMemo(() => {
    if (messages.length === 0) return 'General clinic inquiry';
    const latest = messages[messages.length - 1];
    return latest?.concern_type || 'General clinic inquiry';
  }, [messages]);

  // Group messages by date for date dividers
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDate = null;
    let currentGroup = [];

    messages.forEach((msg) => {
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
  }, [messages]);

  // Send message from chat composer
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!composerText.trim() || !user?.patient_id || sending) return;

    setSending(true);
    const textToSend = composerText.trim();

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;

      const { data, error } = await supabase
        .from('patient_messages')
        .insert([
          {
            patient_id: user.patient_id,
            auth_user_id: authUid,
            patient_name: user?.name || null,
            sender_role: 'patient',
            sender_name: user?.name || 'Student',
            recipient_name: activePartner,
            concern_type: activeConcernType,
            message_text: textToSend,
            status: 'sent',
          },
        ])
        .select();

      if (error) throw error;

      // Optimistic append if not already received by realtime
      if (data?.[0]) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data[0].id)) return prev;
          return [...prev, data[0]];
        });
      }

      setComposerText('');
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (err) {
      console.error('Send message error:', err);
      setNotice('Unable to send your message right now. Please try again later.');
      setNoticeOpen(true);
    } finally {
      setSending(false);
    }
  };

  // Send message from New Inquiry Modal
  const handleSendNewInquiry = async (e) => {
    e.preventDefault();
    if (!inquiryForm.message_text.trim() || !user?.patient_id || sending) return;

    setSending(true);
    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;

      const { data, error } = await supabase
        .from('patient_messages')
        .insert([
          {
            patient_id: user.patient_id,
            auth_user_id: authUid,
            patient_name: user?.name || null,
            sender_role: 'patient',
            sender_name: user?.name || 'Student',
            recipient_name: inquiryForm.recipient_name || 'Clinic Personnel (General)',
            concern_type: inquiryForm.concern_type,
            message_text: inquiryForm.message_text.trim(),
            status: 'sent',
          },
        ])
        .select();

      if (error) throw error;

      if (data?.[0]) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data[0].id)) return prev;
          return [...prev, data[0]];
        });
      }

      setInquiryModalOpen(false);
      setInquiryForm({
        recipient_name: '',
        concern_type: CONCERN_TYPES[0],
        message_text: '',
      });
      setNotice('Your inquiry has been sent to clinic personnel. You will receive advice or assistance shortly.');
      setNoticeOpen(true);
      setTimeout(() => scrollToBottom('smooth'), 100);
    } catch (err) {
      console.error('Send inquiry error:', err);
      setNotice('Unable to send your inquiry right now. Please try again later.');
      setNoticeOpen(true);
    } finally {
      setSending(false);
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <main className="main">
      <section className="page patient-messages-page" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Messages</h1>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13.5 }}>
              Direct non-emergency inquiries and follow-ups with university clinic personnel.
            </div>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => setInquiryModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '8px 16px', fontSize: 13.5 }}
          >
            <PlusIcon size={16} />
            Start New Inquiry
          </button>
        </div>

        {/* Clinical Advisory Banner */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 14 }}>ℹ</span>
          <span>
            <strong style={{ color: 'var(--text)' }}>Clinical Notice:</strong> This messaging interface is intended for non-emergency inquiries, appointment questions, and routine follow-ups. In case of medical emergencies, please proceed directly to the university clinic or nearest emergency room.
          </span>
        </div>

        {/* Modern Messenger Interface Card */}
        <div className="tup-messenger-container">
          {/* Messenger Card Header */}
          <div className="tup-messenger-header">
            <div className="tup-messenger-recipient-info">
              <div className="tup-messenger-avatar tup-avatar-clinic">
                <MessagesIcon size={18} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {activePartner}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', marginTop: 1 }}>
                  <span className="tup-status-dot" />
                  Available / Clinic Staff
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11.5, fontWeight: 600 }}>
                {activeConcernType}
              </span>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => setInquiryModalOpen(true)}
                style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Start a new inquiry thread"
              >
                <PlusIcon size={13} />
                New Inquiry
              </button>
            </div>
          </div>

          {/* Messages Stream Container */}
          <div className="tup-chat-messages-area">
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13.5 }}>
                Loading conversation history...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <MessagesIcon size={26} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  No conversations yet
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 360, lineHeight: 1.5, marginBottom: 16 }}>
                  Send a non-emergency inquiry or follow-up question to university clinic personnel to get started.
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setInquiryModalOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <PlusIcon size={16} />
                  Start New Inquiry
                </button>
              </div>
            ) : (
              <>
                {groupedMessages.map((group, gIdx) => (
                  <React.Fragment key={group.date || gIdx}>
                    {/* Date Divider */}
                    <div className="tup-chat-date-divider">
                      <span>{group.date}</span>
                    </div>

                    {/* Messages in this date group */}
                    {group.messages.map((msg) => {
                      const isStudent = msg.sender_role === 'patient';
                      return (
                        <div
                          key={msg.id}
                          className={`tup-chat-message-row ${isStudent ? 'outgoing' : 'incoming'}`}
                        >
                          {/* Sender Label for incoming staff messages */}
                          {!isStudent && (
                            <div className="tup-chat-sender-label">
                              <span>{msg.sender_name || 'Clinic Personnel'}</span>
                              <span style={{ fontSize: 10, opacity: 0.75, textTransform: 'capitalize' }}>
                                ({msg.sender_role || 'Staff'})
                              </span>
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div className={`tup-chat-bubble ${isStudent ? 'outgoing' : 'incoming'}`}>
                            {msg.message_text}
                          </div>

                          {/* Timestamp underneath */}
                          <div className="tup-chat-time">
                            <span>{formatMessageTime(msg.created_at)}</span>
                            {isStudent && (
                              <span style={{ fontSize: 10, opacity: 0.8 }}>• {msg.status || 'sent'}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
                <div ref={messagesEndRef} style={{ height: 1 }} />
              </>
            )}
          </div>

          {/* Bottom Pinned Chat Composer */}
          <form className="tup-chat-composer" onSubmit={handleSendMessage}>
            <textarea
              ref={textareaRef}
              className="tup-chat-input"
              rows={1}
              placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              aria-label="Message content input"
            />
            <button
              type="submit"
              className="tup-chat-send-btn"
              disabled={sending || !composerText.trim()}
              aria-label="Send message"
            >
              <SendIcon size={16} />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
        </div>

        {/* Start New Inquiry Modal Dialog */}
        {inquiryModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0, 0, 0, 0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3200,
              padding: 16,
              backdropFilter: 'blur(2px)',
            }}
            onClick={() => setInquiryModalOpen(false)}
          >
            <div
              style={{
                width: 'min(94vw, 520px)',
                background: 'var(--panel)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '16px 22px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                    Start New Inquiry
                  </h3>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    Direct inquiry to university clinic personnel
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInquiryModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    borderRadius: 6,
                  }}
                  aria-label="Close dialog"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              {/* Modal Form Body */}
              <form onSubmit={handleSendNewInquiry}>
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                      Recipient
                    </label>
                    <select
                      className="input"
                      style={{ width: '100%' }}
                      value={inquiryForm.recipient_name}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, recipient_name: e.target.value }))}
                    >
                      <option value="">Clinic Personnel (General)</option>
                      {physicians.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                      Concern Category *
                    </label>
                    <select
                      className="input"
                      style={{ width: '100%' }}
                      value={inquiryForm.concern_type}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, concern_type: e.target.value }))}
                      required
                    >
                      {CONCERN_TYPES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                      Initial Message *
                    </label>
                    <textarea
                      className="input"
                      style={{ width: '100%', minHeight: 120, lineHeight: 1.4 }}
                      placeholder="Describe your inquiry, follow-up, or question in detail..."
                      value={inquiryForm.message_text}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, message_text: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div
                  style={{
                    padding: '14px 22px',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--surface-raised)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setInquiryModalOpen(false)}
                    disabled={sending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={sending || !inquiryForm.message_text.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <SendIcon size={15} />
                    {sending ? 'Sending Inquiry...' : 'Send Inquiry'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Friendly Notice Dialog Modal */}
        {noticeOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0, 0, 0, 0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3300,
              padding: 16,
            }}
            onClick={() => setNoticeOpen(false)}
          >
            <div
              style={{
                width: 'min(92vw, 440px)',
                background: 'var(--panel)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                padding: 22,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                {notice.toLowerCase().includes('unable') || notice.toLowerCase().includes('failed') ? 'Notice' : 'Inquiry Sent'}
              </h3>
              <div style={{ color: notice.toLowerCase().includes('unable') || notice.toLowerCase().includes('failed') ? 'var(--danger)' : 'var(--text)', fontSize: 13.5, lineHeight: 1.5 }}>
                {notice}
              </div>
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
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

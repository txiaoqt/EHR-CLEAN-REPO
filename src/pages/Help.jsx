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
  const userRole = (user?.role || '').toLowerCase();
  const isStaff = ['physician', 'nurse', 'admin'].includes(userRole);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [expandedGuide, setExpandedGuide] = useState(null);

  // Messaging state (Conversation-Driven)
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
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

  // 1. Load Conversations for this clinician/staff
  const loadConversations = async () => {
    if (!isStaff) return;
    try {
      setLoadingConversations(true);
      let query = supabase
        .from('patient_message_conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (userRole !== 'admin') {
        const staffAdminId = user?.id;
        const staffAuthId = user?.auth_user_id;

        if (staffAdminId && staffAuthId) {
          query = query.or(`recipient_auth_user_id.eq.${staffAuthId},recipient_staff_id.eq.${staffAdminId},recipient_staff_id.is.null`);
        } else if (staffAdminId) {
          query = query.or(`recipient_staff_id.eq.${staffAdminId},recipient_staff_id.is.null`);
        }
      }

      const { data, error } = await query;

      if (!error && data) {
        setConversations(data);
        if (!activeConversationId && data.length > 0) {
          setActiveConversationId(data[0].id);
        }
      } else if (error?.code === 'PGRST205') {
        // Fallback: Read from patient_messages if table not yet provisioned on cloud
        const { data: rawMsgs } = await supabase
          .from('patient_messages')
          .select('*')
          .order('created_at', { ascending: false });

        if (rawMsgs) {
          const threadMap = new Map();
          rawMsgs.forEach((msg) => {
            const isAddressedToStaff =
              userRole === 'admin' ||
              !msg.recipient_name ||
              msg.recipient_name === 'Clinic Personnel (General)' ||
              msg.recipient_name.toLowerCase().includes(user?.name?.toLowerCase() || '') ||
              (userRole === 'physician' && msg.recipient_name.toLowerCase().includes('rivera')) ||
              (userRole === 'nurse' && msg.recipient_name.toLowerCase().includes('santos'));

            if (isAddressedToStaff) {
              const key = msg.conversation_id || `${msg.patient_id}_${msg.recipient_name || 'Clinic'}_${msg.concern_type}`;
              if (!threadMap.has(key)) {
                threadMap.set(key, {
                  id: key,
                  patient_id: msg.patient_id,
                  patient_name: msg.patient_name || 'Patient',
                  recipient_name: msg.recipient_name || 'Clinic Personnel (General)',
                  concern_type: msg.concern_type || 'General clinic inquiry',
                  status: 'open',
                  updated_at: msg.created_at,
                  isFallback: true,
                });
              }
            }
          });
          const threadList = Array.from(threadMap.values());
          setConversations(threadList);
          if (!activeConversationId && threadList.length > 0) {
            setActiveConversationId(threadList[0].id);
          }
        }
      }
    } catch (err) {
      console.warn('Staff load conversations error:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [isStaff, userRole, user?.id, user?.auth_user_id]);

  // Active conversation record
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  // 2. Load messages for active conversation
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let mounted = true;
    const loadConversationMessages = async () => {
      try {
        setLoadingMessages(true);
        let { data, error } = await supabase
          .from('patient_messages')
          .select('*')
          .eq('conversation_id', activeConversationId)
          .order('created_at', { ascending: true });

        if ((!data || data.length === 0) && activeConversation?.isFallback) {
          const { data: fallbackData } = await supabase
            .from('patient_messages')
            .select('*')
            .eq('patient_id', activeConversation.patient_id)
            .eq('concern_type', activeConversation.concern_type)
            .order('created_at', { ascending: true });

          data = fallbackData || [];
        }

        if (mounted && data) {
          setMessages(data);
          setTimeout(() => {
            if (chatScrollRef.current) {
              chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
            }
          }, 50);
        }
      } catch (err) {
        console.warn('Staff load messages error:', err);
      } finally {
        if (mounted) setLoadingMessages(false);
      }
    };

    loadConversationMessages();
    return () => {
      mounted = false;
    };
  }, [activeConversationId, activeConversation?.isFallback, activeConversation?.patient_id, activeConversation?.concern_type]);

  // 3. Supabase Realtime for conversation updates and message streaming
  useEffect(() => {
    if (!isStaff) return;

    const channel = supabase
      .channel('patient_messages_staff_workspace')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patient_message_conversations',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setConversations((prev) => {
              if (prev.some((c) => c.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setConversations((prev) => {
              const updated = prev.map((c) => (c.id === payload.new.id ? payload.new : c));
              return updated.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
          } else if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patient_messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new;

            const msgMatchesActive =
              (newMsg.conversation_id && newMsg.conversation_id === activeConversationId) ||
              (activeConversation?.isFallback &&
                newMsg.patient_id === activeConversation.patient_id &&
                newMsg.concern_type === activeConversation.concern_type);

            // Only append to active message stream if conversation matches
            if (msgMatchesActive) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              setTimeout(() => {
                if (chatScrollRef.current) {
                  chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                }
              }, 100);
            }

            // Move the messaged conversation to the top of the inbox
            setConversations((prev) => {
              const targetKey = newMsg.conversation_id || `${newMsg.patient_id}_${newMsg.recipient_name || 'Clinic'}_${newMsg.concern_type}`;
              const exists = prev.find((c) => c.id === targetKey || c.id === newMsg.conversation_id);
              if (exists) {
                const updated = prev.map((c) =>
                  (c.id === targetKey || c.id === newMsg.conversation_id) ? { ...c, updated_at: newMsg.created_at } : c
                );
                return updated.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isStaff, activeConversationId, activeConversation]);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        (c.patient_name || '').toLowerCase().includes(q) ||
        (c.patient_id || '').toLowerCase().includes(q) ||
        (c.concern_type || '').toLowerCase().includes(q) ||
        (c.recipient_name || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  // Group active conversation messages by date
  const groupedActiveMessages = useMemo(() => {
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

  // Handle staff clinical reply
  const handleSendReply = async (e) => {
    if (e) e.preventDefault();
    if (!reply.trim() || !activeConversationId || sending) return;

    setSending(true);
    setMsgNotice('');
    const textToSend = reply.trim();

    try {
      // 1. Try atomic send_patient_message RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('send_patient_message', {
        p_conversation_id: activeConversationId,
        p_message_text: textToSend,
      });

      if (rpcError) {
        // Fallback: Direct insert
        const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;
        const staffRole = userRole || 'physician';
        const staffName = user?.name || (staffRole === 'physician' ? 'Dr. Rivera' : 'Nurse Santos');

        const insertPayload = {
          patient_id: activeConversation?.patient_id,
          auth_user_id: authUid,
          patient_name: activeConversation?.patient_name || 'Student',
          sender_role: staffRole,
          sender_name: staffName,
          recipient_name: activeConversation?.patient_name || 'Student',
          concern_type: activeConversation?.concern_type || 'General clinic inquiry',
          message_text: textToSend,
          status: 'sent',
        };

        if (!activeConversation?.isFallback) {
          insertPayload.conversation_id = activeConversationId;
        }

        const { data: directData, error: directError } = await supabase
          .from('patient_messages')
          .insert([insertPayload])
          .select();

        if (directError) throw directError;

        if (directData?.[0]) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === directData[0].id)) return prev;
            return [...prev, directData[0]];
          });
        }
      }

      setReply('');
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
    } catch (err) {
      console.error('Send staff reply error:', err);
      setMsgNotice('Unable to send reply right now. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="main">
      <section className="page help-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
            Help & Patient Communications
          </h1>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13.5 }}>
            Frequently asked questions, clinical guides, and real-time patient inquiry triage.
          </div>
        </div>

        {/* Patient Messages Workspace for Medical Staff */}
        {isStaff && (
          <div style={{ marginBottom: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                  Patient Inquiries & Messaging Workspace
                </h2>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                  Direct incoming consultation threads and follow-ups from student patients.
                </div>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: 11.5, fontWeight: 600 }}>
                ● Realtime Connected
              </span>
            </div>

            {loadingConversations ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13.5 }}>
                Loading conversation workspace...
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13.5 }}>
                <MessagesIcon size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>No patient inquiries found</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>When patients submit inquiries addressed to you or general triage, they will appear here live.</div>
              </div>
            ) : (
              <div className="tup-staff-messenger">
                {/* Left Panel: Conversation Inbox List */}
                <div className={`tup-staff-inbox-panel ${mobileViewingChat ? 'hidden-mobile' : ''}`}>
                  <div className="tup-staff-inbox-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                        Inquiries ({conversations.length})
                      </span>
                    </div>
                    <div className="tup-staff-inbox-search">
                      <SearchIcon size={14} className="tup-staff-inbox-search-icon" />
                      <input
                        type="text"
                        placeholder="Search student or category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="tup-staff-inbox-list">
                    {filteredConversations.length === 0 ? (
                      <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        No matching inquiries
                      </div>
                    ) : (
                      filteredConversations.map((c) => {
                        const isActive = activeConversationId === c.id;
                        return (
                          <button
                            key={c.id}
                            className={`tup-staff-inbox-item ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              setActiveConversationId(c.id);
                              setMobileViewingChat(true);
                            }}
                          >
                            <div className="tup-messenger-avatar tup-avatar-student" style={{ width: 36, height: 36, fontSize: 13 }}>
                              {(c.patient_name || 'P').charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.patient_name || 'Patient'}
                                </div>
                                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {formatInboxDate(c.updated_at).split(' · ')[0]}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {c.patient_id} · <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{c.concern_type}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>To: {c.recipient_name}</span>
                                <span className={`badge ${c.status === 'open' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: 9.5, padding: '1px 5px' }}>
                                  {c.status}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel: Active Conversation Chat */}
                <div className={`tup-staff-chat-panel ${!mobileViewingChat ? 'hidden-mobile' : ''}`}>
                  {/* Chat Header */}
                  <div className="tup-messenger-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="tup-staff-mobile-back"
                        onClick={() => setMobileViewingChat(false)}
                      >
                        <ChevronLeftIcon size={16} />
                        <span>Inbox</span>
                      </button>

                      <div className="tup-messenger-avatar tup-avatar-student">
                        {(activeConversation?.patient_name || 'P').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                          {activeConversation?.patient_name || 'Patient'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>ID: {activeConversation?.patient_id}</span>
                          <span>•</span>
                          <span>Addressed: {activeConversation?.recipient_name}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-neutral" style={{ fontSize: 11.5, fontWeight: 600 }}>
                        {activeConversation?.concern_type}
                      </span>
                    </div>
                  </div>

                  {/* Messages Stream */}
                  <div ref={chatScrollRef} className="tup-chat-messages-area">
                    {loadingMessages ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13.5 }}>
                        Loading message thread...
                      </div>
                    ) : messages.length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13.5 }}>
                        No messages in this conversation.
                      </div>
                    ) : (
                      groupedActiveMessages.map((group, gIdx) => (
                        <React.Fragment key={group.date || gIdx}>
                          <div className="tup-chat-date-divider">
                            <span>{group.date}</span>
                          </div>

                          {group.messages.map((msg) => {
                            const isPatient = msg.sender_role === 'patient';
                            return (
                              <div
                                key={msg.id}
                                className={`tup-chat-message-row ${isPatient ? 'incoming' : 'outgoing'}`}
                              >
                                <div className="tup-chat-sender-label">
                                  <span>{msg.sender_name || (isPatient ? 'Student' : 'Clinician')}</span>
                                  <span style={{ fontSize: 10, opacity: 0.75, textTransform: 'capitalize' }}>
                                    ({msg.sender_role})
                                  </span>
                                </div>

                                <div className={`tup-chat-bubble ${isPatient ? 'incoming' : 'outgoing'}`}>
                                  {msg.message_text}
                                </div>

                                <div className="tup-chat-time">
                                  <span>{formatMessageTime(msg.created_at)}</span>
                                  {!isPatient && (
                                    <span style={{ fontSize: 10, opacity: 0.8 }}>• {msg.status || 'sent'}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))
                    )}
                  </div>

                  {/* Staff Reply Composer */}
                  {msgNotice && (
                    <div style={{ padding: '6px 16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: 12 }}>
                      {msgNotice}
                    </div>
                  )}
                  <form className="tup-chat-composer" onSubmit={handleSendReply}>
                    <textarea
                      className="tup-chat-input"
                      rows={1}
                      placeholder="Type clinical reply... (Enter to send, Shift+Enter for newline)"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      disabled={sending || !activeConversationId}
                    />
                    <button
                      type="submit"
                      className="tup-chat-send-btn"
                      disabled={sending || !reply.trim() || !activeConversationId}
                    >
                      <SendIcon size={16} />
                      <span>{sending ? 'Sending...' : 'Reply'}</span>
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Technical Architecture Notice */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 24,
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--muted)'
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4, fontSize: 14 }}>
            System Architecture Overview
          </div>
          <div>
            The TUP Manila Clinic Management System uses a partitioned conversation model with Supabase Realtime synchronization, PostgreSQL Row-Level Security, role-based access control (RBAC), and immutable audit trails for compliance with health records security standards.
          </div>
        </div>

        {/* User Guides */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Quick User Guides
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {guides.map((g, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGuide(idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: 14
                  }}
                >
                  <span>{g.title}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 16 }}>
                    {expandedGuide === idx ? '−' : '+'}
                  </span>
                </button>
                {expandedGuide === idx && (
                  <div
                    style={{
                      padding: '0 18px 14px 18px',
                      color: 'var(--muted)',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      borderTop: '1px solid var(--border-subtle)'
                    }}
                  >
                    {g.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map((f, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: 14
                  }}
                >
                  <span>{f.question}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 16 }}>
                    {expandedFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {expandedFaq === idx && (
                  <div
                    style={{
                      padding: '0 18px 14px 18px',
                      color: 'var(--muted)',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      borderTop: '1px solid var(--border-subtle)'
                    }}
                  >
                    {f.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Help;

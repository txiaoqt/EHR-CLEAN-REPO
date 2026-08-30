// src/pages/patient/PatientMessages.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { MessagesIcon, SearchIcon, SendIcon, PlusIcon, CloseIcon, ChevronLeftIcon } from '../../components/icons/Icons.jsx';

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

const PatientMessages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileViewingChat, setMobileViewingChat] = useState(false);

  // New Inquiry Modal State
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    recipient_staff_id: '',
    recipient_name: 'Clinic Personnel (General)',
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

  // 1. Load registered staff from safe staff_directory view
  useEffect(() => {
    let mounted = true;
    const loadStaff = async () => {
      try {
        const { data, error } = await supabase
          .from('staff_directory')
          .select('id, auth_user_id, name, role')
          .in('role', ['physician', 'nurse', 'admin'])
          .order('name');

        if (!error && mounted && data) {
          setStaffList(data);
        }
      } catch (err) {
        console.warn('Load staff error:', err);
      }
    };
    loadStaff();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Load conversations for this student
  const loadConversations = async () => {
    if (!user?.patient_id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('patient_message_conversations')
        .select('*')
        .eq('patient_id', user.patient_id)
        .order('updated_at', { ascending: false });

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
          .eq('patient_id', user.patient_id)
          .order('created_at', { ascending: false });

        if (rawMsgs) {
          const threadMap = new Map();
          rawMsgs.forEach((msg) => {
            const key = msg.conversation_id || `${msg.patient_id}_${msg.recipient_name || 'Clinic'}_${msg.concern_type}`;
            if (!threadMap.has(key)) {
              threadMap.set(key, {
                id: key,
                patient_id: msg.patient_id,
                patient_name: msg.patient_name || user.name,
                recipient_name: msg.recipient_name || 'Clinic Personnel (General)',
                concern_type: msg.concern_type || 'General clinic inquiry',
                status: 'open',
                updated_at: msg.created_at,
                isFallback: true,
              });
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
      console.warn('Load conversations error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [user?.patient_id]);

  // Active conversation record
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  // 3. Load messages for the currently active conversation only
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let mounted = true;
    const loadConversationMessages = async () => {
      try {
        setMessagesLoading(true);
        let { data, error } = await supabase
          .from('patient_messages')
          .select('*')
          .eq('conversation_id', activeConversationId)
          .order('created_at', { ascending: true });

        if ((!data || data.length === 0) && activeConversation?.isFallback) {
          const { data: fallbackData } = await supabase
            .from('patient_messages')
            .select('*')
            .eq('patient_id', user.patient_id)
            .eq('concern_type', activeConversation.concern_type)
            .order('created_at', { ascending: true });

          data = fallbackData || [];
        }

        if (mounted && data) {
          setMessages(data);
          setTimeout(() => scrollToBottom('auto'), 50);
        }
      } catch (err) {
        console.warn('Load conversation messages error:', err);
      } finally {
        if (mounted) setMessagesLoading(false);
      }
    };

    loadConversationMessages();
    return () => {
      mounted = false;
    };
  }, [activeConversationId, activeConversation?.isFallback, user?.patient_id, activeConversation?.concern_type]);

  // 4. Set up Supabase Realtime subscription for conversation-isolated events
  useEffect(() => {
    if (!user?.patient_id) return;

    // Realtime for Conversations (Inbox updates)
    const convChannel = supabase
      .channel(`patient_conversations_${user.patient_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patient_message_conversations',
          filter: `patient_id=eq.${user.patient_id}`,
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
      .subscribe();

    // Realtime for Messages (Live conversation messaging)
    const msgChannel = supabase
      .channel(`patient_messages_${user.patient_id}`)
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
            const newMsg = payload.new;
            // ONLY append into active message list if it belongs to the currently active conversation
            const msgMatchesActive =
              (newMsg.conversation_id && newMsg.conversation_id === activeConversationId) ||
              (activeConversation?.isFallback &&
                newMsg.concern_type === activeConversation.concern_type &&
                newMsg.recipient_name === activeConversation.recipient_name);

            if (msgMatchesActive) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              setTimeout(() => scrollToBottom('smooth'), 100);
            }

            // Update conversation list updated_at & order
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
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.conversation_id === activeConversationId) {
              setMessages((prev) =>
                prev.map((m) => (m.id === payload.new.id ? payload.new : m))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [user?.patient_id, activeConversationId, activeConversation]);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        (c.recipient_name || '').toLowerCase().includes(q) ||
        (c.concern_type || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  // Group active conversation messages by date
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

  // Send message in existing conversation
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!composerText.trim() || !activeConversationId || sending) return;

    setSending(true);
    const textToSend = composerText.trim();

    try {
      // 1. Try atomic send_patient_message RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('send_patient_message', {
        p_conversation_id: activeConversationId,
        p_message_text: textToSend,
      });

      if (rpcError) {
        // Fallback to direct verified insert if RPC unavailable
        const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;
        const insertPayload = {
          patient_id: user.patient_id,
          auth_user_id: authUid,
          patient_name: user?.name || 'Student',
          sender_role: 'patient',
          sender_name: user?.name || 'Student',
          recipient_name: activeConversation?.recipient_name || 'Clinic Personnel (General)',
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

  // Send message from Start New Inquiry Modal (Creates NEW conversation)
  const handleSendNewInquiry = async (e) => {
    e.preventDefault();
    if (!inquiryForm.message_text.trim() || !user?.patient_id || sending) return;

    setSending(true);
    try {
      const staffTarget = staffList.find((s) => s.id === inquiryForm.recipient_staff_id);
      const recipientName = staffTarget?.name || 'Clinic Personnel (General)';
      const recipientStaffId = staffTarget?.id || null;

      // 1. Try atomic create_patient_inquiry RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_patient_inquiry', {
        p_recipient_staff_id: recipientStaffId,
        p_concern_type: inquiryForm.concern_type,
        p_message_text: inquiryForm.message_text.trim(),
        p_recipient_name: recipientName,
      });

      let newConvId = null;

      if (!rpcError && rpcData?.conversation_id) {
        newConvId = rpcData.conversation_id;
      } else {
        // Fallback: Try insert into patient_message_conversations
        const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;

        const { data: convData, error: convError } = await supabase
          .from('patient_message_conversations')
          .insert([
            {
              patient_id: user.patient_id,
              patient_name: user?.name || 'Student',
              recipient_staff_id: recipientStaffId,
              recipient_auth_user_id: staffTarget?.auth_user_id || null,
              recipient_name: recipientName,
              recipient_role: staffTarget?.role || 'clinic',
              concern_type: inquiryForm.concern_type,
              status: 'open',
            },
          ])
          .select();

        if (!convError && convData?.[0]?.id) {
          newConvId = convData[0].id;
          await supabase.from('patient_messages').insert([
            {
              conversation_id: newConvId,
              patient_id: user.patient_id,
              auth_user_id: authUid,
              patient_name: user?.name || 'Student',
              sender_role: 'patient',
              sender_name: user?.name || 'Student',
              recipient_name: recipientName,
              concern_type: inquiryForm.concern_type,
              message_text: inquiryForm.message_text.trim(),
              status: 'sent',
            },
          ]);
        } else {
          // Direct insert into patient_messages
          const { data: msgData, error: msgError } = await supabase
            .from('patient_messages')
            .insert([
              {
                patient_id: user.patient_id,
                auth_user_id: authUid,
                patient_name: user?.name || 'Student',
                sender_role: 'patient',
                sender_name: user?.name || 'Student',
                recipient_name: recipientName,
                concern_type: inquiryForm.concern_type,
                message_text: inquiryForm.message_text.trim(),
                status: 'sent',
              },
            ])
            .select();

          if (msgError) throw msgError;
          newConvId = `${user.patient_id}_${recipientName}_${inquiryForm.concern_type}`;
        }
      }

      await loadConversations();
      if (newConvId) {
        setActiveConversationId(newConvId);
        setMobileViewingChat(true);
      }

      setInquiryModalOpen(false);
      setInquiryForm({
        recipient_staff_id: '',
        recipient_name: 'Clinic Personnel (General)',
        concern_type: CONCERN_TYPES[0],
        message_text: '',
      });
      setNotice('Your new inquiry has been initiated with clinic personnel.');
      setNoticeOpen(true);
    } catch (err) {
      console.error('Send inquiry error:', err);
      setNotice('Unable to start inquiry right now. Please try again later.');
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
      <section className="page patient-messages-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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

        {/* Two-Panel Messenger Workspace */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '380px', color: 'var(--muted)', fontSize: 14 }}>
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          /* Empty State */
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'var(--panel)',
              borderRadius: 14,
              border: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <MessagesIcon size={26} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              No conversations yet
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 380, lineHeight: 1.5, marginBottom: 18 }}>
              Send a new inquiry to clinic personnel to start a direct consultation thread.
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
          <div className="tup-two-panel-messenger">
            {/* LEFT PANEL: Conversation List */}
            <div className={`tup-inbox-panel ${mobileViewingChat ? 'hidden-mobile' : ''}`}>
              <div className="tup-inbox-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    Conversations ({conversations.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setInquiryModalOpen(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 4, display: 'flex' }}
                    title="New Inquiry"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
                <div className="tup-inbox-search">
                  <SearchIcon size={14} className="tup-inbox-search-icon" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="tup-inbox-list">
                {filteredConversations.length === 0 ? (
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                    No matching conversations
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isActive = activeConversationId === c.id;
                    return (
                      <button
                        key={c.id}
                        className={`tup-inbox-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setActiveConversationId(c.id);
                          setMobileViewingChat(true);
                        }}
                      >
                        <div className="tup-messenger-avatar tup-avatar-clinic" style={{ width: 36, height: 36, fontSize: 13 }}>
                          <MessagesIcon size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.recipient_name}
                            </div>
                            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatInboxDate(c.updated_at).split(' · ')[0]}
                            </span>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-primary)', fontWeight: 600, marginTop: 1 }}>
                            {c.concern_type}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                            <span className={`badge ${c.status === 'open' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: 10, padding: '1px 6px', textTransform: 'capitalize' }}>
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

            {/* RIGHT PANEL: Active Conversation Stream */}
            <div className={`tup-chat-panel ${!mobileViewingChat ? 'hidden-mobile' : ''}`}>
              {/* Header */}
              <div className="tup-messenger-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="tup-mobile-back"
                    onClick={() => setMobileViewingChat(false)}
                    aria-label="Back to conversations"
                  >
                    <ChevronLeftIcon size={16} />
                    <span>Inbox</span>
                  </button>

                  <div className="tup-messenger-avatar tup-avatar-clinic">
                    <MessagesIcon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {activeConversation?.recipient_name || 'Clinic Personnel (General)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', marginTop: 1, gap: 6 }}>
                      <span className="tup-status-dot" />
                      <span>Available / Clinic Staff</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-neutral" style={{ fontSize: 11.5, fontWeight: 600 }}>
                    {activeConversation?.concern_type || 'General clinic inquiry'}
                  </span>
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => setInquiryModalOpen(true)}
                    style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <PlusIcon size={13} />
                    New Inquiry
                  </button>
                </div>
              </div>

              {/* Message History for this specific conversation */}
              <div className="tup-chat-messages-area">
                {messagesLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13.5 }}>
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13.5 }}>
                    No messages in this inquiry thread yet.
                  </div>
                ) : (
                  <>
                    {groupedMessages.map((group, gIdx) => (
                      <React.Fragment key={group.date || gIdx}>
                        <div className="tup-chat-date-divider">
                          <span>{group.date}</span>
                        </div>

                        {group.messages.map((msg) => {
                          const isStudent = msg.sender_role === 'patient';
                          return (
                            <div
                              key={msg.id}
                              className={`tup-chat-message-row ${isStudent ? 'outgoing' : 'incoming'}`}
                            >
                              {!isStudent && (
                                <div className="tup-chat-sender-label">
                                  <span>{msg.sender_name || 'Clinic Personnel'}</span>
                                  <span style={{ fontSize: 10, opacity: 0.75, textTransform: 'capitalize' }}>
                                    ({msg.sender_role || 'Staff'})
                                  </span>
                                </div>
                              )}

                              <div className={`tup-chat-bubble ${isStudent ? 'outgoing' : 'incoming'}`}>
                                {msg.message_text}
                              </div>

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

              {/* Bottom Composer */}
              <form className="tup-chat-composer" onSubmit={handleSendMessage}>
                <textarea
                  ref={textareaRef}
                  className="tup-chat-input"
                  rows={1}
                  placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending || !activeConversationId}
                  aria-label="Message content input"
                />
                <button
                  type="submit"
                  className="tup-chat-send-btn"
                  disabled={sending || !composerText.trim() || !activeConversationId}
                  aria-label="Send message"
                >
                  <SendIcon size={16} />
                  <span>{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

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
                    Creates an independent consultation thread with clinic personnel
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
                      Recipient Clinician / Staff *
                    </label>
                    <select
                      className="input"
                      style={{ width: '100%' }}
                      value={inquiryForm.recipient_staff_id}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, recipient_staff_id: e.target.value }))}
                    >
                      <option value="">Clinic Personnel (General)</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role.charAt(0).toUpperCase() + s.role.slice(1)})
                        </option>
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
                    {sending ? 'Initiating Inquiry...' : 'Send Inquiry'}
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

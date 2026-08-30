// src/pages/StaffPatientMessages.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { MessagesIcon, SearchIcon, SendIcon, ChevronLeftIcon, CheckIcon, CloseIcon } from '../components/icons/Icons.jsx';
import avatarPlaceholder from '../assets/images/avatar-placeholder.jpg';

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
  return `${msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${timeStr}`;
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

const StaffPatientMessages = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase();
  const isStaff = ['physician', 'nurse', 'admin'].includes(userRole);

  // Tabs: 'active' (Open) vs 'history' (Resolved)
  const [activeTab, setActiveTab] = useState('active');

  // Conversations and Active Chat
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgNotice, setMsgNotice] = useState('');
  const [mobileViewingChat, setMobileViewingChat] = useState(false);

  // Resolve Confirmation Modal State
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const chatScrollRef = useRef(null);

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
      } else if (error?.code === 'PGRST205') {
        // Fallback: Read from patient_messages if table not yet provisioned on remote DB
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
          setConversations(Array.from(threadMap.values()));
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

  const [patientAvatarMap, setPatientAvatarMap] = useState({});

  // Load real profile photos for students in conversations
  useEffect(() => {
    const patientIds = [...new Set(conversations.map((c) => c.patient_id).filter(Boolean))];
    if (patientIds.length === 0) return;

    let mounted = true;
    const loadPatientAvatars = async () => {
      try {
        // 1. Authoritative profile photo from patient_profiles
        const { data: profiles } = await supabase
          .from('patient_profiles')
          .select('patient_id, avatar_url')
          .in('patient_id', patientIds);

        // 2. Fallback avatar from users table
        const { data: userAvatars } = await supabase
          .from('users')
          .select('patient_id, avatar')
          .in('patient_id', patientIds);

        if (mounted) {
          const map = {};
          userAvatars?.forEach((u) => {
            if (u.patient_id && u.avatar) map[u.patient_id] = u.avatar;
          });
          profiles?.forEach((p) => {
            if (p.patient_id && p.avatar_url) map[p.patient_id] = p.avatar_url;
          });
          setPatientAvatarMap((prev) => ({ ...prev, ...map }));
        }
      } catch (err) {
        console.warn('Staff load patient avatars error:', err);
      }
    };

    loadPatientAvatars();
    return () => {
      mounted = false;
    };
  }, [conversations]);

  const getPatientAvatar = (patientId) => {
    return (patientId && patientAvatarMap[patientId]) || avatarPlaceholder;
  };

  // Split conversations into Active (open) and History (resolved/closed)
  const openConversations = useMemo(() => {
    return conversations.filter((c) => (c.status || 'open').toLowerCase() === 'open');
  }, [conversations]);

  const historyConversations = useMemo(() => {
    return conversations.filter((c) => (c.status || 'open').toLowerCase() !== 'open');
  }, [conversations]);

  // Current tab list of conversations
  const currentTabConversations = useMemo(() => {
    return activeTab === 'active' ? openConversations : historyConversations;
  }, [activeTab, openConversations, historyConversations]);

  // Auto-select first conversation in tab when switching or on load
  useEffect(() => {
    if (currentTabConversations.length > 0) {
      const exists = currentTabConversations.some((c) => c.id === activeConversationId);
      if (!exists) {
        setActiveConversationId(currentTabConversations[0].id);
      }
    } else {
      setActiveConversationId(null);
    }
  }, [activeTab, currentTabConversations, activeConversationId]);

  // Active conversation record
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const isCurrentConversationResolved = (activeConversation?.status || 'open').toLowerCase() !== 'open';

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
      .channel('patient_messages_staff_workspace_isolated')
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

  // Filter current tab conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return currentTabConversations;
    const q = searchQuery.toLowerCase().trim();
    return currentTabConversations.filter(
      (c) =>
        (c.patient_name || '').toLowerCase().includes(q) ||
        (c.patient_id || '').toLowerCase().includes(q) ||
        (c.concern_type || '').toLowerCase().includes(q) ||
        (c.recipient_name || '').toLowerCase().includes(q)
    );
  }, [currentTabConversations, searchQuery]);

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
    if (!reply.trim() || !activeConversationId || sending || isCurrentConversationResolved) return;

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

  // Handle Resolve Conversation Action
  const handleResolveConversation = async () => {
    if (!activeConversationId || resolving) return;

    setResolving(true);
    try {
      if (!activeConversation?.isFallback) {
        const { error } = await supabase
          .from('patient_message_conversations')
          .update({ status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', activeConversationId);

        if (error) throw error;
      }

      // Optimistically update local state
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId ? { ...c, status: 'resolved', updated_at: new Date().toISOString() } : c
        )
      );

      setResolveModalOpen(false);
    } catch (err) {
      console.error('Resolve conversation error:', err);
      setMsgNotice('Failed to resolve inquiry. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  return (
    <main className="main">
      <section className="page patient-messages-staff-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
              Patient Messages
            </h1>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13.5 }}>
              Manage incoming student inquiries, clinical follow-ups, and consultation threads.
            </div>
          </div>
          <span className="badge badge-neutral" style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #10b981)' }} />
            Realtime Connected
          </span>
        </div>

        {/* Tab Navigation: Active Inquiries vs History */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'active' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('active')}
            style={{ fontWeight: 600, fontSize: 13.5, padding: '7px 16px', borderRadius: 8 }}
          >
            Active Inquiries ({openConversations.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'history' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('history')}
            style={{ fontWeight: 600, fontSize: 13.5, padding: '7px 16px', borderRadius: 8 }}
          >
            History / Resolved ({historyConversations.length})
          </button>
        </div>

        {/* Messaging Workspace */}
        {loadingConversations ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '360px', background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13.5 }}>
            Loading conversations...
          </div>
        ) : currentTabConversations.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--panel)', borderRadius: 14, border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: 13.5 }}>
            <MessagesIcon size={36} style={{ opacity: 0.5, marginBottom: 10 }} />
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
              {activeTab === 'active' ? 'No active inquiries' : 'No resolved inquiry history'}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {activeTab === 'active'
                ? 'When patients send new messages or inquiries, they will appear here live.'
                : 'Conversations resolved by medical personnel will be archived here for reference.'}
            </div>
          </div>
        ) : (
          <div className="tup-two-panel-messenger">
            {/* Left Panel: Conversation Inbox List */}
            <div className={`tup-inbox-panel ${mobileViewingChat ? 'hidden-mobile' : ''}`}>
              <div className="tup-inbox-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                    {activeTab === 'active' ? 'Active Inquiries' : 'Resolved Inquiries'} ({currentTabConversations.length})
                  </span>
                </div>
                <div className="tup-inbox-search">
                  <SearchIcon size={14} className="tup-inbox-search-icon" />
                  <input
                    type="text"
                    placeholder="Search student or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="tup-inbox-list">
                {filteredConversations.length === 0 ? (
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                    No matching inquiries
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isActive = activeConversationId === c.id;
                    const isResolved = (c.status || 'open').toLowerCase() !== 'open';
                    return (
                      <button
                        key={c.id}
                        className={`tup-inbox-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setActiveConversationId(c.id);
                          setMobileViewingChat(true);
                        }}
                      >
                        <img
                          src={getPatientAvatar(c.patient_id)}
                          alt={c.patient_name || 'Patient'}
                          className="tup-messenger-avatar tup-avatar-student"
                          style={{ width: 36, height: 36 }}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = avatarPlaceholder;
                          }}
                        />
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
                            <span className={`badge ${!isResolved ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: 9.5, padding: '1px 6px', textTransform: 'capitalize' }}>
                              {c.status || 'open'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Panel: Active Conversation Chat Stream */}
            <div className={`tup-chat-panel ${!mobileViewingChat ? 'hidden-mobile' : ''}`}>
              {/* Chat Header */}
              <div className="tup-messenger-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="tup-mobile-back"
                    onClick={() => setMobileViewingChat(false)}
                  >
                    <ChevronLeftIcon size={16} />
                    <span>{activeTab === 'active' ? 'Inbox' : 'History'}</span>
                  </button>

                  <img
                    src={getPatientAvatar(activeConversation?.patient_id)}
                    alt={activeConversation?.patient_name || 'Patient'}
                    className="tup-messenger-avatar tup-avatar-student"
                    style={{ width: 40, height: 40 }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = avatarPlaceholder;
                    }}
                  />
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="badge badge-neutral" style={{ fontSize: 11.5, fontWeight: 600 }}>
                    {activeConversation?.concern_type}
                  </span>

                  {/* Resolve Inquiry Action Button */}
                  {!isCurrentConversationResolved ? (
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => setResolveModalOpen(true)}
                      style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                      title="Mark inquiry as resolved and move to history"
                    >
                      <CheckIcon size={14} />
                      <span>Resolve</span>
                    </button>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                      ✓ Resolved
                    </span>
                  )}
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

              {/* Composer for Active, or Read-Only Banner for Resolved */}
              {isCurrentConversationResolved ? (
                <div
                  style={{
                    padding: '14px 20px',
                    background: 'var(--surface-raised)',
                    borderTop: '1px solid var(--border)',
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                  <span>
                    This consultation inquiry has been marked as <strong>Resolved</strong>. Complete historical messages are archived.
                  </span>
                </div>
              ) : (
                <>
                  {msgNotice && (
                    <div style={{ padding: '6px 16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: 12 }}>
                      {msgNotice}
                    </div>
                  )}
                  <form className="tup-chat-composer" onSubmit={handleSendReply}>
                    <textarea
                      className="tup-chat-input"
                      rows={1}
                      placeholder="Type your message..."
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
                </>
              )}
            </div>
          </div>
        )}

        {/* Resolve Confirmation Modal Dialog */}
        {resolveModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0, 0, 0, 0.65))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3500,
              padding: 16,
              backdropFilter: 'blur(2px)',
            }}
            onClick={() => setResolveModalOpen(false)}
          >
            <div
              style={{
                width: 'min(92vw, 440px)',
                background: 'var(--panel)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                padding: 24,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                  Resolve this inquiry?
                </h3>
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <p style={{ margin: '0 0 20px 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                Once resolved, this consultation thread with <strong>{activeConversation?.patient_name}</strong> will be moved to <strong>History</strong> and will no longer appear in your active inquiries. All message records remain safely preserved.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setResolveModalOpen(false)}
                  disabled={resolving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleResolveConversation}
                  disabled={resolving}
                  style={{ background: '#10b981', borderColor: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <CheckIcon size={16} />
                  <span>{resolving ? 'Resolving...' : 'Resolve Inquiry'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default StaffPatientMessages;

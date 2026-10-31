// src/pages/StaffPatientMessages.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { MessagesIcon, SearchIcon, SendIcon, ChevronLeftIcon, CheckIcon, CloseIcon, PlusIcon } from '../components/icons/Icons.jsx';
import MessageAttachment from '../components/MessageAttachment.jsx';
import MessageReactions from '../components/MessageReactions.jsx';
import {
  uploadMessageAttachment,
  deleteMessageAttachments,
  validateAttachmentFile,
  formatFileSize,
  RESOLVED_PHOTO_NOTICE,
} from '../utils/messageAttachments.js';
import avatarPlaceholder from '../assets/images/avatar-placeholder.jpg';
import { emailEnabled } from '../utils.js';

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
  const isStaff = ['physician', 'nurse', 'dentist', 'admin'].includes(userRole);

  // Tabs: 'active' (Open) vs 'history' (Resolved)
  const [activeTab, setActiveTab] = useState('active');

  // Conversations and Active Chat
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  // messageId -> [{ id, emoji, reactor_auth_user_id, reactor_name }]
  const [reactions, setReactions] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  // Photo attached to the next reply.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const photoInputRef = useRef(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgNotice, setMsgNotice] = useState('');
  const [mobileViewingChat, setMobileViewingChat] = useState(false);

  // Resolve Confirmation Modal State
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
                if (prev.some((m) => m.id === payload.new.id)) return prev;
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_message_reactions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const r = payload.new;
            setReactions((prev) =>
              (prev[r.message_id] || []).some((x) => x.id === r.id)
                ? prev
                : { ...prev, [r.message_id]: [...(prev[r.message_id] || []), r] }
            );
          } else if (payload.eventType === 'DELETE') {
            const r = payload.old;
            setReactions((prev) => ({
              ...prev,
              [r.message_id]: (prev[r.message_id] || []).filter((x) => x.id !== r.id),
            }));
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

  // ---- Reactions -----------------------------------------------------------
  // Fetched for whichever messages are on screen, so a long history is not
  // pulled down just to draw a few chips.
  const reactionMessageKey = useMemo(
    () => messages.map((m) => m.id).filter(Boolean).join(','),
    [messages]
  );

  useEffect(() => {
    const ids = reactionMessageKey ? reactionMessageKey.split(',') : [];
    if (ids.length === 0) { setReactions({}); return undefined; }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('patient_message_reactions')
        .select('id, message_id, emoji, reactor_auth_user_id, reactor_name')
        .in('message_id', ids);
      if (cancelled || error) return;

      const map = {};
      for (const r of data || []) (map[r.message_id] ||= []).push(r);
      setReactions(map);
    })();

    return () => { cancelled = true; };
  }, [reactionMessageKey]);

  // Tapping the same emoji twice removes it, which is what a chat expects.
  const toggleReaction = async (messageId, emoji) => {
    // A resolved inquiry is a closed record. The database enforces this too —
    // this guard just avoids a pointless round-trip.
    if (isCurrentConversationResolved) return;

    const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id;
    if (!authUid) return;

    const mine = (reactions[messageId] || []).find(
      (r) => r.emoji === emoji && r.reactor_auth_user_id === authUid
    );

    if (mine) {
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter((r) => r.id !== mine.id),
      }));
      await supabase.from('patient_message_reactions').delete().eq('id', mine.id);
      return;
    }

    const optimistic = {
      id: `pending-${Date.now()}`,
      message_id: messageId,
      emoji,
      reactor_auth_user_id: authUid,
      reactor_name: user?.name || null,
    };
    setReactions((prev) => ({ ...prev, [messageId]: [...(prev[messageId] || []), optimistic] }));

    const { data } = await supabase
      .from('patient_message_reactions')
      .insert([{
        message_id: messageId,
        emoji,
        reactor_auth_user_id: authUid,
        reactor_name: user?.name || null,
        reactor_role: userRole || 'physician',
      }])
      .select();

    if (data?.[0]) {
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] || []).map((r) => (r.id === optimistic.id ? data[0] : r)),
      }));
    }
  };

  // Handle staff clinical reply
  const handleSendReply = async (e) => {
    if (e) e.preventDefault();
    const textToSend = reply.trim();
    const hasPhoto = Boolean(pendingPhoto);
    if ((!textToSend && !hasPhoto) || !activeConversationId || sending || isCurrentConversationResolved) return;

    setSending(true);
    setMsgNotice('');
    setPhotoError('');

    try {
      // Upload the photo first: a failed upload must not leave a message that
      // claims an attachment it does not have.
      let attachmentFields = {};
      if (hasPhoto) {
        attachmentFields = await uploadMessageAttachment(pendingPhoto, activeConversationId);
      }

      // The send RPC takes no attachment parameters, so a message carrying a
      // photo is written directly.
      let rpcError = null;
      if (!hasPhoto) {
        const { error } = await supabase.rpc('send_patient_message', {
          p_conversation_id: activeConversationId,
          p_message_text: textToSend,
        });
        rpcError = error;
      }

      if (rpcError || hasPhoto) {
        // Direct insert (also the fallback when the RPC is unavailable)
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
          ...attachmentFields,
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

      // Asynchronously trigger direct inquiry / message alert notification (evaluates patient_settings preferences)
      try {
        // Settings → Notifications can turn email off.
        if (emailEnabled()) {
        const staffRole = userRole || 'physician';
        const staffName = user?.name || (staffRole === 'physician' ? 'Dr. Rivera' : 'Nurse Santos');
        supabase.functions.invoke('send-patient-notification', {
          body: {
            type: 'message_reply',
            patient_id: activeConversation?.patient_id,
            message_data: {
              patient_name: activeConversation?.patient_name || 'Student',
              sender_name: staffName,
              sender_role: staffRole.charAt(0).toUpperCase() + staffRole.slice(1),
              concern_type: activeConversation?.concern_type || 'General clinic inquiry',
              message_preview: textToSend.length > 200 ? `${textToSend.slice(0, 200)}...` : textToSend,
              conversation_id: activeConversationId,
            },
          },
        }).catch((fnErr) => {
          console.warn('Edge function message notification error (non-blocking):', fnErr);
        });
        }
      } catch (invokeErr) {
        console.warn('Error initiating message alert notification:', invokeErr);
      }

      setReply('');
      setPendingPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
    } catch (err) {
      console.error('Send staff reply error:', err);
      // Surface a photo problem against the photo, not as a generic send failure.
      const message = err?.message || '';
      if (/photo|file type|limit|upload/i.test(message)) {
        setPhotoError(message);
      } else {
        setMsgNotice('Unable to send reply right now. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  // Handle Resolve Conversation Action
  const handleResolveConversation = async () => {
    if (!activeConversationId || resolving) return;

    setResolving(true);
    try {
      // Remove any photographs in this thread BEFORE closing it. The bucket is
      // private and clinical photos should not outlive the inquiry, so this
      // happens on resolve rather than being left behind.
      const attachmentMessages = messages.filter(
        (m) => m.conversation_id === activeConversationId && m.attachment_path
      );
      const paths = attachmentMessages.map((m) => m.attachment_path);

      let removalFailed = false;
      if (paths.length > 0) {
        const { removed, failed } = await deleteMessageAttachments(paths);
        removalFailed = failed.length > 0;

        // Clear the path on each row and record that it is gone, so the thread
        // can say so instead of showing a broken image.
        //
        // This goes through a SECURITY DEFINER RPC: patient_messages has no
        // UPDATE policy (messages are immutable), so a direct update was
        // silently rejected and the path was never cleared.
        const removedSet = new Set(removed);
        const bookkeeping = await Promise.all(
          attachmentMessages
            .filter((m) => removedSet.has(m.attachment_path))
            .map((m) => supabase.rpc('clear_message_attachment', { p_message_id: m.id }))
        );

        // A failed bookkeeping write leaves the thread showing "no longer
        // available" instead of the notice, so treat it as a failed removal.
        if (bookkeeping.some((r) => r.error || r.data === false)) {
          removalFailed = true;
        }

        setMessages((prev) =>
          prev.map((m) =>
            removedSet.has(m.attachment_path)
              ? { ...m, attachment_path: null, attachment_removed_at: new Date().toISOString() }
              : m
          )
        );
      }

      if (!activeConversation?.isFallback) {
        const { error } = await supabase
          .from('patient_message_conversations')
          .update({ status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', activeConversationId);

        if (error) throw error;
      }

      // Post the notice into the thread so both sides can see what happened.
      // Only when a photo was actually removed — otherwise the line would be a
      // claim about nothing.
      if (paths.length > 0 && !removalFailed) {
        const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;
        const noticeRow = {
          patient_id: activeConversation?.patient_id,
          auth_user_id: authUid,
          patient_name: activeConversation?.patient_name || 'Student',
          sender_role: 'system',
          sender_name: 'Clinic System',
          recipient_name: activeConversation?.patient_name || 'Student',
          concern_type: activeConversation?.concern_type || 'General clinic inquiry',
          message_text: RESOLVED_PHOTO_NOTICE,
          status: 'sent',
        };
        if (!activeConversation?.isFallback) noticeRow.conversation_id = activeConversationId;

        const { data: noticeData } = await supabase
          .from('patient_messages')
          .insert([noticeRow])
          .select();

        if (noticeData?.[0]) {
          setMessages((prev) =>
            prev.some((m) => m.id === noticeData[0].id) ? prev : [...prev, noticeData[0]]
          );
        }
      }

      // Optimistically update local state
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId ? { ...c, status: 'resolved', updated_at: new Date().toISOString() } : c
        )
      );

      setResolveModalOpen(false);
      if (removalFailed) {
        setMsgNotice('Inquiry resolved, but a photo could not be removed. Please try again.');
      }
    } catch (err) {
      console.error('Resolve conversation error:', err);
      setMsgNotice('Failed to resolve inquiry. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  // Delete a resolved inquiry.
  //
  // Photos go first: a plpgsql function cannot remove a Storage object, so if
  // the files cannot be cleared the whole deletion is aborted rather than
  // leaving a clinical photo orphaned in storage with no record pointing at it.
  const handleDeleteConversation = async () => {
    if (!activeConversationId || deleting || !isCurrentConversationResolved) return;

    setDeleting(true);
    setMsgNotice('');

    try {
      const paths = messages
        .filter((m) => m.conversation_id === activeConversationId && m.attachment_path)
        .map((m) => m.attachment_path);

      if (paths.length > 0) {
        const { failed } = await deleteMessageAttachments(paths);
        if (failed.length > 0) {
          setMsgNotice('The photos in this inquiry could not be removed, so it was not deleted. Please try again.');
          setDeleteModalOpen(false);
          return;
        }
      }

      const { data, error } = await supabase.rpc('delete_resolved_conversation', {
        p_conversation_id: activeConversationId,
      });
      if (error) throw error;

      // RLS-blocked writes report success with nothing done, so confirm the RPC
      // actually deleted rather than trusting the absence of an error.
      if (data !== true) {
        setMsgNotice('This inquiry could not be deleted.');
        setDeleteModalOpen(false);
        return;
      }

      setConversations((prev) => prev.filter((c) => c.id !== activeConversationId));
      setMessages([]);
      setReactions({});
      setActiveConversationId(null);
      setDeleteModalOpen(false);
    } catch (err) {
      console.error('Delete conversation error:', err);
      setMsgNotice(
        /open inquiry/i.test(err?.message || '')
          ? 'An open inquiry must be resolved before it can be deleted.'
          : 'Could not delete this inquiry. Please try again.'
      );
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="main">
      <section className="page patient-messages-staff-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div className="page-header-title-block">
            <h1 className="page-header-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>
              Patient Messages
            </h1>
            <p className="page-header-subtitle" style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
              Manage incoming student inquiries, clinical follow-ups, and consultation threads.
            </p>
          </div>
          <div className="page-header-actions">
            <span className="badge badge-neutral" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #10b981)' }} />
              Realtime Connected
            </span>
          </div>
        </div>

        {/* Tab Navigation: Active Inquiries vs History */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'active' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('active')}
            style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', padding: '7px 16px', borderRadius: 8 }}
          >
            Active Inquiries ({openConversations.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'history' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('history')}
            style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', padding: '7px 16px', borderRadius: 8 }}
          >
            History / Resolved ({historyConversations.length})
          </button>
        </div>

        {/* Messaging Workspace */}
        {loadingConversations ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '360px', background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
            Loading conversations...
          </div>
        ) : currentTabConversations.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--panel)', borderRadius: 14, border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
            <MessagesIcon size={36} style={{ opacity: 0.5, marginBottom: 10 }} />
            <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)', color: 'var(--text)' }}>
              {activeTab === 'active' ? 'No active inquiries' : 'No resolved inquiry history'}
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
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
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
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
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
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
                            <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.patient_name || 'Patient'}
                            </div>
                            <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatInboxDate(c.updated_at).split(' · ')[0]}
                            </span>
                          </div>
                          <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>
                            {c.patient_id} · <span style={{ color: 'var(--color-primary-text, #fda4af)', fontWeight: 'var(--font-weight-semibold)' }}>{c.concern_type}</span>
                          </div>
                          <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>To: {c.recipient_name}</span>
                            <span className={`badge ${!isResolved ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: 'var(--font-size-2xs)', padding: '1px 6px', textTransform: 'capitalize' }}>
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
                    className="tup-mobile-back tup-staff-mobile-back"
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
                    <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                      {activeConversation?.patient_name || 'Patient'}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>ID: {activeConversation?.patient_id}</span>
                      <span>•</span>
                      <span>Addressed: {activeConversation?.recipient_name}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="badge badge-neutral" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                    {activeConversation?.concern_type}
                  </span>

                  {/* Resolve Inquiry Action Button */}
                  {!isCurrentConversationResolved ? (
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => setResolveModalOpen(true)}
                      style={{ fontSize: 'var(--font-size-xs)', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success, #10b981)', borderColor: 'var(--border)' }}
                      title="Mark inquiry as resolved and move to history"
                    >
                      <span>Resolve</span>
                    </button>
                  ) : (
                    <>
                      <span className="badge badge-neutral" style={{ fontSize: 'var(--font-size-2xs)', padding: '3px 8px', background: 'var(--color-emerald-bg)', color: 'var(--success, #10b981)' }}>
                        Resolved
                      </span>
                      {/* Only a closed inquiry can be deleted. */}
                      <button
                        type="button"
                        className="btn small secondary"
                        onClick={() => setDeleteModalOpen(true)}
                        disabled={deleting}
                        style={{ fontSize: 'var(--font-size-xs)', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--danger)', borderColor: 'var(--border)' }}
                        title="Delete this resolved inquiry and its messages"
                      >
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages Stream */}
              <div ref={chatScrollRef} className="tup-chat-messages-area">
                {loadingMessages ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
                    Loading message thread...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
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
                              <span style={{ fontSize: 'var(--font-size-2xs)', opacity: 0.75, textTransform: 'capitalize' }}>
                                ({msg.sender_role})
                              </span>
                            </div>

                            {/* A photo-only message has no text, so no bubble is
                                drawn — otherwise an empty blue box sits above
                                the image. */}
                            {msg.message_text ? (
                              <div className={`tup-chat-bubble ${isPatient ? 'incoming' : 'outgoing'}`}>
                                {msg.message_text}
                              </div>
                            ) : null}

                            {(msg.attachment_path || msg.attachment_removed_at) && (
                              <MessageAttachment
                                path={msg.attachment_path}
                                name={msg.attachment_name}
                                removedAt={msg.attachment_removed_at}
                              />
                            )}

                            <MessageReactions
                              reactions={reactions[msg.id] || []}
                              currentUserId={user?.auth_user_id}
                              onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                              align={isPatient ? 'left' : 'right'}
                              disabled={isCurrentConversationResolved}
                            />

                            <div className="tup-chat-time">
                              <span>{formatMessageTime(msg.created_at)}</span>
                              {!isPatient && (
                                <span style={{ fontSize: 'var(--font-size-2xs)', opacity: 0.8 }}>• {msg.status || 'sent'}</span>
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
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: 'var(--success, #10b981)', fontWeight: 'var(--font-weight-bold)' }}>•</span>
                  <span>
                    This consultation inquiry has been marked as <strong>Resolved</strong>. Complete historical messages are archived.
                  </span>
                </div>
              ) : (
                <>
                  {msgNotice && (
                    <div style={{ padding: '6px 16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: 'var(--font-size-xs)' }}>
                      {msgNotice}
                    </div>
                  )}
                  <div>
                    {pendingPhoto && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', padding: '6px 10px', borderRadius: 10, background: 'var(--surface-raised)', border: '1px solid var(--border)', fontSize: 'var(--font-size-xs)' }}>
                        <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{pendingPhoto.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(pendingPhoto.size)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingPhoto(null);
                            setPhotoError('');
                            if (photoInputRef.current) photoInputRef.current.value = '';
                          }}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}
                          aria-label="Remove the attached photo"
                        >
                          <CloseIcon size={14} />
                        </button>
                      </div>
                    )}

                    {photoError && (
                      <div role="alert" style={{ margin: '0 0 8px', padding: '6px 10px', borderRadius: 10, background: 'var(--color-rose-bg)', color: 'var(--color-rose-text)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                        {photoError}
                      </div>
                    )}

                    <form className="tup-chat-composer" onSubmit={handleSendReply}>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setPhotoError('');
                          setPendingPhoto(file);
                          const problem = validateAttachmentFile(file);
                          if (problem) setPhotoError(problem);
                        }}
                      />
                      <button
                        type="button"
                        className="tup-chat-send-btn"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={sending || !activeConversationId || isCurrentConversationResolved}
                        title="Attach a photo for assessment"
                        aria-label="Attach a photo"
                      >
                        <PlusIcon size={16} />
                        <span>Photo</span>
                      </button>
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
                        disabled={sending || (!reply.trim() && !pendingPhoto) || !activeConversationId || Boolean(photoError)}
                      >
                        <SendIcon size={16} />
                        <span>{sending ? 'Sending...' : 'Reply'}</span>
                      </button>
                    </form>
                  </div>
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
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
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

              <p style={{ margin: '0 0 20px 0', fontSize: 'var(--font-size-base)', color: 'var(--muted)', lineHeight: 1.5 }}>
                Once resolved, this consultation thread with <strong>{activeConversation?.patient_name}</strong> will be moved to <strong>History</strong> and will no longer appear in your active inquiries. The message records are preserved, but <strong>any photos sent in this thread will be permanently deleted</strong>.
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
                  style={{ background: 'var(--success, #10b981)', borderColor: 'var(--success, #10b981)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span>{resolving ? 'Resolving...' : 'Resolve Inquiry'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal Dialog */}
        {deleteModalOpen && (
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
            onClick={() => { if (!deleting) setDeleteModalOpen(false); }}
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
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                  Delete this inquiry?
                </h3>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deleting}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                  aria-label="Close"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <p style={{ margin: '0 0 20px 0', fontSize: 'var(--font-size-base)', color: 'var(--muted)', lineHeight: 1.5 }}>
                This permanently removes the resolved inquiry with <strong>{activeConversation?.patient_name}</strong>, including <strong>every message in the thread</strong>. This cannot be undone.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleDeleteConversation}
                  disabled={deleting}
                  style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                >
                  <span>{deleting ? 'Deleting...' : 'Delete Inquiry'}</span>
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

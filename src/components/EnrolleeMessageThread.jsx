import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import EmptyState from './EmptyState.jsx';
import { AlertIcon, MessagesIcon, SendIcon } from './icons/Icons.jsx';

const dateDividerLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Live messaging thread between an enrollee and TUP Clinic nurse/physician staff.
 *
 * Shared by:
 *  - `src/pages/enrollee/EnrolleeMessages.jsx` (`viewer="enrollee"`)
 *  - `src/pages/EnrolleeReview.jsx` staff review panel (`viewer="staff"`)
 */
const EnrolleeMessageThread = ({
  enrolleeId,
  enrolleeName = 'Applicant',
  viewer = 'enrollee',
  compact = false,
  onUnreadChange = null,
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const listRef = useRef(null);

  const markRead = useCallback(
    async (rows) => {
      if (!enrolleeId || !rows?.length) return;
      try {
        if (viewer === 'enrollee') {
          const unreadStaffIds = rows
            .filter((m) => m.sender_role !== 'enrollee' && !m.read_by_enrollee)
            .map((m) => m.id);
          if (unreadStaffIds.length) {
            await supabase
              .from('enrollee_messages')
              .update({ read_by_enrollee: true })
              .in('id', unreadStaffIds);
          }
        } else {
          const unreadEnrolleeIds = rows
            .filter((m) => m.sender_role === 'enrollee' && !m.read_by_staff)
            .map((m) => m.id);
          if (unreadEnrolleeIds.length) {
            await supabase
              .from('enrollee_messages')
              .update({ read_by_staff: true })
              .in('id', unreadEnrolleeIds);
            if (onUnreadChange) onUnreadChange();
          }
        }
      } catch (_) {
        // non-critical
      }
    },
    [enrolleeId, onUnreadChange, viewer]
  );

  const load = useCallback(async () => {
    if (!enrolleeId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('enrollee_messages')
        .select('id, enrollee_id, sender_role, sender_name, body, read_by_staff, read_by_enrollee, created_at')
        .eq('enrollee_id', enrolleeId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const list = data || [];
      setMessages(list);
      markRead(list);
    } catch (err) {
      console.warn('Could not load enrollee messages:', err);
    } finally {
      setLoading(false);
    }
  }, [enrolleeId, markRead]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enrolleeId) return undefined;
    const channel = supabase
      .channel(`enrollee-messages-${enrolleeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enrollee_messages',
          filter: `enrollee_id=eq.${enrolleeId}`,
        },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enrolleeId, load]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !enrolleeId || sending) return;
    setSending(true);
    setErrorMsg('');

    try {
      const role = (user?.role || '').toLowerCase();
      const senderRole =
        viewer === 'enrollee'
          ? 'enrollee'
          : ['nurse', 'physician', 'admin'].includes(role)
            ? role
            : 'nurse';
      const senderName =
        user?.name || (viewer === 'enrollee' ? enrolleeName : 'TUP Clinic Staff');

      const { error } = await supabase.from('enrollee_messages').insert({
        enrollee_id: enrolleeId,
        sender_role: senderRole,
        sender_name: senderName,
        body: text,
        read_by_enrollee: viewer === 'enrollee',
        read_by_staff: viewer !== 'enrollee',
      });

      if (error) throw error;

      setDraft('');
      await load();
    } catch (err) {
      console.error('Send enrollee message error:', err);
      setErrorMsg(err?.message || 'Could not send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const roleBadgeLabel = (role) => {
    if (role === 'physician') return 'Physician';
    if (role === 'nurse') return 'Clinic Nurse';
    if (role === 'admin') return 'Clinic Staff';
    return 'Enrollee';
  };

  return (
    <div className={`enrollee-message-thread${compact ? ' is-compact' : ''}`}>
      {errorMsg && (
        <div role="alert" className="enrollee-thread-error">
          <AlertIcon size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      <div
        ref={listRef}
        className="tup-chat-messages-area enrollee-thread-messages"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={loading}
        tabIndex={0}
      >
        {loading ? (
          <div className="enrollee-thread-placeholder">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <EmptyState
            compact={compact}
            icon={MessagesIcon}
            title="No messages yet"
            description={
              viewer === 'enrollee'
                ? 'Ask the clinic about your certificate or record form.'
                : 'Send a message about the applicant’s certificate or record form.'
            }
          />
        ) : messages.map((msg, index) => {
            const isMine =
              viewer === 'enrollee'
                ? msg.sender_role === 'enrollee'
                : msg.sender_role !== 'enrollee';
            const direction = isMine ? 'outgoing' : 'incoming';
            const startsDay = index === 0
              || new Date(messages[index - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
            return (
              <React.Fragment key={msg.id}>
                {startsDay && <div className="tup-chat-date-divider"><span>{dateDividerLabel(msg.created_at)}</span></div>}
                <div className={`tup-chat-message-row ${direction}`}>
                  {!isMine && (
                    <div className="tup-chat-sender-label">
                      <span>{msg.sender_name || (viewer === 'staff' ? enrolleeName : 'Clinic staff')}</span>
                      {viewer === 'enrollee' && <span className="enrollee-thread-role">({roleBadgeLabel(msg.sender_role)})</span>}
                    </div>
                  )}
                  <div className={`tup-chat-bubble ${direction}`}>{msg.body}</div>
                  <time className="tup-chat-time" dateTime={msg.created_at} title={new Date(msg.created_at).toLocaleString()}>
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </React.Fragment>
            );
          })}
      </div>

      <form className="tup-chat-composer enrollee-thread-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea
          className="input tup-chat-input"
          rows={2}
          placeholder="Write a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label={viewer === 'enrollee' ? 'Message to TUP Clinic' : `Message to ${enrolleeName}`}
        />
        <button
          type="submit"
          className="tup-chat-send-btn"
          disabled={sending || !draft.trim()}
        >
          <SendIcon size={15} />
          <span>{sending ? 'Sending…' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
};

export default EnrolleeMessageThread;

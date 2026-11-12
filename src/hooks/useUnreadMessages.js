import { useCallback, useEffect, useId, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import useVisibleRefresh from './useVisibleRefresh.js';

const READ_EVENT = 'tup:messages-read';

// Marks a thread read for the signed-in side and tells every unread badge to refresh.
export const markConversationRead = async (conversationId) => {
  if (!conversationId) return;
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  if (error) console.warn('Could not mark the conversation read:', error.message);
  window.dispatchEvent(new Event(READ_EVENT));
};

// Unread messages for the signed-in user: patient and staff inquiries, or an
// enrollee's messages from the clinic. Refreshes on new messages, on focus, and
// when a thread is read anywhere in this tab.
export default function useUnreadMessages(role, enabled = true) {
  const [byConversation, setByConversation] = useState({});
  const [total, setTotal] = useState(0);
  const channelId = useId();
  const isEnrollee = role === 'enrollee';

  const load = useCallback(async () => {
    if (!enabled) return;
    if (isEnrollee) {
      const { count, error } = await supabase.from('enrollee_messages')
        .select('id', { count: 'exact', head: true })
        .neq('sender_role', 'enrollee').eq('read_by_enrollee', false);
      if (!error) setTotal(count || 0);
      return;
    }
    const { data, error } = await supabase.rpc('my_unread_message_counts');
    if (error) return;
    const map = Object.fromEntries((data || []).map((row) => [row.conversation_id, Number(row.unread)]));
    setByConversation(map);
    setTotal(Object.values(map).reduce((sum, n) => sum + n, 0));
  }, [enabled, isEnrollee]);

  useEffect(() => {
    if (!enabled) { setByConversation({}); setTotal(0); return undefined; }
    load();
    window.addEventListener(READ_EVENT, load);
    const table = isEnrollee ? 'enrollee_messages' : 'patient_messages';
    const channel = supabase.channel(`unread-${table}-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, load)
      .subscribe();
    return () => { window.removeEventListener(READ_EVENT, load); supabase.removeChannel(channel); };
  }, [enabled, isEnrollee, load, channelId]);

  useVisibleRefresh(load, enabled, 30000);
  return { total, byConversation, refresh: load };
}

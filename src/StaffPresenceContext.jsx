import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { supabase } from './supabaseClient.js';
import { registerStaffPresenceStop } from './utils/staffPresenceLifecycle.js';

const StaffPresenceContext = createContext(null);
const EMPTY = [];
const STAFF_ROLES = ['physician', 'nurse', 'admin'];
const TOPIC_PREFIX = 'clinic-staff-presence:';

export const useStaffPresence = () => {
  const value = useContext(StaffPresenceContext);
  if (!value) throw new Error('useStaffPresence must be used inside StaffPresenceProvider');
  return value;
};

export const StaffPresenceProvider = ({ children }) => {
  const { session, user, isAuthenticated, loading, initializing, isPasswordRecoverySession } = useAuth();
  const authId = session?.user?.id || null;
  const enabled = Boolean(
    isAuthenticated && authId && !loading && !initializing &&
    !isPasswordRecoverySession && user?.active !== false &&
    (!user?.auth_user_id || user.auth_user_id === authId)
  );
  const isStaff = enabled && STAFF_ROLES.includes((user?.role || '').toLowerCase());
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine !== false);
  const [directory, setDirectory] = useState(null);
  const [presence, setPresence] = useState(null);
  const [published, setPublished] = useState(null);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const refreshRef = useRef(null);
  const refreshStaff = useCallback((options = {}) => {
    if (options.retryPresence) setConnectionRevision((value) => value + 1);
    return refreshRef.current?.();
  }, []);
  const staffList = enabled && directory?.owner === authId ? directory.staff : EMPTY;
  const directoryReady = enabled && directory?.owner === authId && directory.ready && !directory.error;
  const rosterKey = [...new Set(staffList.map((staff) => staff.auth_user_id).filter(Boolean))].sort().join('|');

  useEffect(() => {
    let active = true;
    let pending = false;
    let controller = null;
    if (!enabled) {
      setDirectory(null);
      refreshRef.current = null;
      return;
    }
    setNetworkOnline(navigator.onLine !== false);
    setDirectory({ owner: authId, staff: [], ready: false, error: null });
    const refresh = async () => {
      if (!active || pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const { data, error } = await supabase.from('staff_directory')
          .select('id, auth_user_id, name, role, avatar, department, active')
          .in('role', STAFF_ROLES).order('name').abortSignal(controller.signal);
        if (error) throw error;
        if (active) setDirectory({ owner: authId,
          staff: (data || []).filter((staff) => staff.active !== false && staff.auth_user_id),
          ready: true, error: null });
      } catch {
        if (active) setDirectory((previous) => ({
          owner: authId, staff: previous?.owner === authId ? previous.staff : [],
          ready: true, error: 'Staff availability is unavailable. Please try again.',
        }));
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    };
    refreshRef.current = refresh;
    void refresh();
    // This refreshes profile/eligibility changes. Online status itself comes
    // from Presence sync/leave events, not polling or the directory's active flag.
    const interval = setInterval(refresh, 60000);
    const focus = () => { void refresh(); };
    const online = () => { setNetworkOnline(true); void refresh(); };
    const offline = () => setNetworkOnline(false);
    window.addEventListener('focus', focus);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(interval);
      refreshRef.current = null;
      window.removeEventListener('focus', focus);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [enabled, authId]);

  useEffect(() => {
    let active = true;
    let stopping = false;
    const channels = [];
    let ownChannel = null;
    setPresence({ owner: authId, records: {} });
    setPublished({ owner: authId, ready: false, failed: false });
    if (!enabled || !networkOnline || !rosterKey) return;
    const connectionKey = crypto.randomUUID();
    const update = (staffAuthId, record) => {
      if (active) setPresence((previous) => ({
        owner: authId,
        records: { ...(previous?.owner === authId ? previous.records : {}), [staffAuthId]: record },
      }));
    };
    for (const staffAuthId of rosterKey.split('|')) {
      // A separate private topic binds a publisher to its verified Auth ID.
      // Students subscribe read-only; payloads cannot impersonate another staff.
      const channel = supabase.channel(TOPIC_PREFIX + staffAuthId, {
        config: { private: true, presence: { key: connectionKey } },
      });
      channels.push(channel);
      const publisher = isStaff && staffAuthId === authId;
      if (publisher) ownChannel = channel;
      channel.on('presence', { event: 'sync' }, () => {
        const online = Object.values(channel.presenceState())
          .some((connections) => Array.isArray(connections) && connections.length > 0);
        update(staffAuthId, { state: online ? 'online' : 'offline' });
      }).subscribe(async (status) => {
        if (!active || stopping) return;
        if (status === 'SUBSCRIBED' && publisher) {
          try {
            const result = await channel.track({ connected: true });
            if (active && !stopping) setPublished({ owner: authId, ready: result === 'ok', failed: result !== 'ok' });
          } catch {
            if (active && !stopping) setPublished({ owner: authId, ready: false, failed: true });
          }
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          update(staffAuthId, { state: 'unavailable' });
          if (publisher) setPublished({ owner: authId, ready: false, failed: true });
        }
      });
    }

    const stop = async () => {
      if (stopping) return;
      stopping = true;
      if (active) setPublished({ owner: authId, ready: false, failed: true });
      if (ownChannel) {
        // Explicit logout waits briefly for untrack while the JWT still exists.
        await ownChannel.untrack({ timeout: 1500 }).catch(() => {});
      }
    };
    const unregister = isStaff ? registerStaffPresenceStop(stop) : () => {};
    const pagehide = () => { void stop(); };
    const pageshow = (event) => {
      if (event.persisted) setConnectionRevision((value) => value + 1);
    };
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    return () => {
      active = false;
      unregister();
      void stop();
      channels.forEach((channel) => { void supabase.removeChannel(channel); });
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
    };
  }, [enabled, authId, rosterKey, isStaff, networkOnline, connectionRevision]);

  const statusForAuthId = useCallback((staffAuthId) => {
    if (!enabled || !directoryReady || !networkOnline) return 'unavailable';
    if (!staffList.some((staff) => staff.auth_user_id === staffAuthId)) return 'offline';
    return presence?.owner === authId ? presence.records[staffAuthId]?.state || 'checking' : 'checking';
  }, [enabled, directoryReady, networkOnline, staffList, presence, authId]);

  const findConversationStaff = useCallback((conversation) => {
    if (!conversation) return null;
    if (conversation.recipient_staff_id || conversation.recipient_auth_user_id) {
      return staffList.find((staff) =>
        staff.id === conversation.recipient_staff_id || staff.auth_user_id === conversation.recipient_auth_user_id
      ) || null;
    }
    // Legacy conversations only: exact, unique name matching avoids guessing
    // another clinician based on a partial name or a hardcoded role.
    const name = (conversation.recipient_name || '').trim().toLowerCase();
    const matches = staffList.filter((staff) => staff.name?.trim().toLowerCase() === name);
    return matches.length === 1 ? matches[0] : null;
  }, [staffList]);

  const conversationStatus = useCallback((conversation) => {
    if (!conversation) return 'unavailable';
    const staff = findConversationStaff(conversation);
    if (staff) return statusForAuthId(staff.auth_user_id);
    if (!directoryReady || !networkOnline) return 'unavailable';
    if (!conversation.recipient_staff_id && !conversation.recipient_auth_user_id &&
      (!conversation.recipient_name || conversation.recipient_name === 'Clinic Personnel (General)')) return 'general';
    return 'offline';
  }, [findConversationStaff, statusForAuthId, directoryReady, networkOnline]);

  const onlineStaff = useMemo(() => staffList.filter((staff) =>
    statusForAuthId(staff.auth_user_id) === 'online'
  ), [staffList, statusForAuthId]);
  const checking = enabled && (!directory?.ready || staffList.some((staff) =>
    statusForAuthId(staff.auth_user_id) === 'checking'
  ));
  const availabilityUnavailable = !networkOnline || Boolean(directory?.error) || staffList.some((staff) =>
    statusForAuthId(staff.auth_user_id) === 'unavailable'
  );
  let selfStatus = 'checking';
  if (!networkOnline || published?.owner === authId && published.failed) selfStatus = 'offline';
  else if (published?.owner === authId && published.ready) selfStatus = statusForAuthId(authId);
  else if (directory?.error) selfStatus = 'offline';

  return (
    <StaffPresenceContext.Provider value={{
      staffList, onlineStaff, checking, availabilityUnavailable,
      statusForAuthId, findConversationStaff, conversationStatus, selfStatus, refreshStaff,
    }}>
      {children}
    </StaffPresenceContext.Provider>
  );
};

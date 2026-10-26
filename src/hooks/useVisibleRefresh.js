import { useEffect, useRef } from 'react';

// Auth changes are not published as public-table Realtime events. Re-query the
// authorized RPC while visible, including changes made in the Supabase dashboard.
export default function useVisibleRefresh(refresh, enabled = true, interval = 15000) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => { if (document.visibilityState !== 'hidden') latest.current(); };
    const timer = window.setInterval(update, interval);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled, interval]);
}

// filename: src/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import { stopStaffPresence } from './utils/staffPresenceLifecycle.js';
import {
  DEPLOY_SURFACE,
  IS_ADMIN_SURFACE,
  IS_USER_SURFACE,
  isRoleCompatibleWithSurface,
} from './deploySurface.js';

// Re-exported so existing importers keep working; the rule itself now lives in
// one place, because writing it out per call site is what let four of them drift
// out of step with each other.
export { isRoleCompatibleWithSurface };

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const sessionUserId = useRef(null);
  // OTP verification creates a session before registration finishes. Keep that
  // temporary session on the signup form until registration has completed.
  const [registrationInProgress, setRegistrationInProgress] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ehr_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !isRoleCompatibleWithSurface(parsed.role)) {
        localStorage.removeItem('ehr_user');
        localStorage.removeItem('authUser');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
  // Fast path: If cached user exists, do not block page rendering
  const [loading, setLoading] = useState(() => {
    try {
      return !localStorage.getItem('ehr_user');
    } catch {
      return true;
    }
  });
  // Supabase session readiness gate: true until getSession() has resolved.
  // This is NOT based on localStorage — it represents whether the Supabase
  // client internally has a restored auth session/JWT.
  const [initializing, setInitializing] = useState(true);

  // Cross-tab recovery synchronization helpers (non-sensitive state marker)
  const RECOVERY_STORAGE_KEY = 'ehr_recovery_active';
  const RECOVERY_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  const checkCrossTabRecoveryActive = () => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.active === true && typeof parsed.timestamp === 'number') {
        if (Date.now() - parsed.timestamp < RECOVERY_MAX_AGE_MS) {
          return true;
        }
      }
      localStorage.removeItem(RECOVERY_STORAGE_KEY);
    } catch (_) {}
    return false;
  };

  const setCrossTabRecoveryActive = (active) => {
    if (typeof window === 'undefined') return;
    try {
      if (active) {
        localStorage.setItem(
          RECOVERY_STORAGE_KEY,
          JSON.stringify({ active: true, timestamp: Date.now() })
        );
      } else {
        localStorage.removeItem(RECOVERY_STORAGE_KEY);
      }
    } catch (_) {}
  };

  const [isPasswordRecoverySession, setIsPasswordRecoverySessionState] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        setCrossTabRecoveryActive(true);
        return true;
      }
      return checkCrossTabRecoveryActive();
    }
    return false;
  });

  const setIsPasswordRecoverySession = useCallback((val) => {
    const active = Boolean(val);
    setIsPasswordRecoverySessionState(active);
    setCrossTabRecoveryActive(active);
    try {
      const channel = new BroadcastChannel('ehr_auth_channel');
      channel.postMessage({ type: 'RECOVERY_STATE_CHANGED', active });
      channel.close();
    } catch (_) {}
  }, []);

  // Listen for storage events & broadcast channel to sync recovery state across tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (e) => {
      if (e.key === RECOVERY_STORAGE_KEY) {
        const active = checkCrossTabRecoveryActive();
        setIsPasswordRecoverySessionState(active);
      }
    };
    window.addEventListener('storage', handleStorage);

    let channel;
    try {
      channel = new BroadcastChannel('ehr_auth_channel');
      channel.onmessage = (event) => {
        if (event?.data?.type === 'RECOVERY_STATE_CHANGED') {
          setIsPasswordRecoverySessionState(Boolean(event.data.active));
        }
      };
    } catch (_) {}

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    };
  }, []);

  // Identity is resolved by the database, including suspension and invitation
  // setup status. Cached roles and user-editable Auth metadata grant no access.
  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser) return null;
    const { data, error } = await supabase.rpc('get_my_portal_identity');
    if (error) {
      console.warn('[Auth] Could not verify account access:', error.code);
      return null;
    }
    return data;
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: Never keep loading/initializing blocked for more than 3s
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setLoading(false);
        setInitializing(false);
      }
    }, 3000);

    // 1. Initialize session from Supabase
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initSession }, error }) => {
        clearTimeout(timeoutId);
        if (!mounted) return;
        if (error) console.warn('[AUTH] Error retrieving session:', error);
        setSession(initSession);
        sessionUserId.current = initSession?.user?.id || null;

        if (initSession?.user) {
          const profile = await fetchUserProfile(initSession.user);
          if (mounted && sessionUserId.current === initSession.user.id) {
            if (profile && isRoleCompatibleWithSurface(profile.role) && profile.active !== false) {
              setUser(profile);
              try {
                localStorage.setItem('ehr_user', JSON.stringify(profile));
                localStorage.setItem('authUser', JSON.stringify(profile));
              } catch (_) {}
            } else {
              // Incompatible role on this portal surface — sign out and clear
              setUser(null);
              try {
                localStorage.removeItem('ehr_user');
                localStorage.removeItem('authUser');
              } catch (_) {}
              supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            }
          }
        } else {
          // No active Supabase session — clear cached user so we don't show
          // a stale authenticated state with no valid JWT
          setUser(null);
          try {
            localStorage.removeItem('ehr_user');
            localStorage.removeItem('authUser');
          } catch (_) {}
        }
        if (mounted) {
          setLoading(false);
          setInitializing(false);
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.warn('[AUTH] getSession error:', err);
        if (mounted) {
          setLoading(false);
          setInitializing(false);
        }
      });

    // 2. Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!mounted) return;
      sessionUserId.current = currentSession?.user?.id || null;
      setSession(currentSession);

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoverySession(true);
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] SIGNED_OUT received');
        if (mounted) {
          setIsPasswordRecoverySession(false);
          setUser(null);
          setSession(null);
          try {
            localStorage.removeItem('ehr_user');
            localStorage.removeItem('authUser');
            localStorage.removeItem('user');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('session');
            sessionStorage.clear();
          } catch (_) {}
        }
      } else if (currentSession?.user) {
        // Avoid re-fetching profile if user already exists with matching ID
        setUser((prevUser) => {
          if (
            prevUser &&
            (prevUser.auth_user_id === currentSession.user.id || prevUser.email === currentSession.user.email)
          ) {
            return prevUser;
          }
          fetchUserProfile(currentSession.user).then((profile) => {
            if (mounted && profile && sessionUserId.current === currentSession.user.id) {
              if (isRoleCompatibleWithSurface(profile.role) && profile.active !== false) {
                setUser(profile);
                try {
                  localStorage.setItem('ehr_user', JSON.stringify(profile));
                  localStorage.setItem('authUser', JSON.stringify(profile));
                } catch (_) {}
              } else {
                // Incompatible role on this surface — do NOT set user
                setUser(null);
                try {
                  localStorage.removeItem('ehr_user');
                  localStorage.removeItem('authUser');
                } catch (_) {}
              }
            }
          });
          return prevUser;
        });
      }
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [fetchUserProfile]);

  const clearPasswordRecoveryState = useCallback(() => {
    setIsPasswordRecoverySession(false);
  }, []);

  const login = (profile) => {
    if (!profile || !isRoleCompatibleWithSurface(profile.role)) {
      console.warn('[Auth] Rejected login: profile role incompatible with surface', { role: profile?.role, DEPLOY_SURFACE });
      return;
    }
    // A delayed sign-in handler must not restore a profile after the user has
    // declined the policy gate and signed out, or signed in as someone else.
    if (profile.auth_user_id && profile.auth_user_id !== sessionUserId.current) return;
    setUser(profile);
    try {
      localStorage.setItem('ehr_user', JSON.stringify(profile));
      localStorage.setItem('authUser', JSON.stringify(profile));
    } catch (_) {}
  };

  const logout = useCallback(async (options) => {
    console.log('[Auth] Sign out started');
    sessionUserId.current = null;
    try {
      await stopStaffPresence();
      const { error } = await supabase.auth.signOut({ scope: options?.scope === 'local' ? 'local' : 'global' });
      if (error) {
        console.warn('[Auth] Sign out error:', error);
      } else {
        console.log('[Auth] Sign out result: success');
      }
    } catch (e) {
      console.warn('[Auth] Sign out exception:', e);
    } finally {
      setIsPasswordRecoverySession(false);
      setUser(null);
      setSession(null);
      try {
        localStorage.removeItem('ehr_user');
        localStorage.removeItem('authUser');
        localStorage.removeItem('user');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('session');
        sessionStorage.clear();
      } catch (_) {}
    }
  }, [setIsPasswordRecoverySession]);

  // Backend policies revoke access immediately. This refresh also updates an
  // already-open portal when an administrator suspends an account or changes its role.
  useEffect(() => {
    if (!session?.user?.id || !user || registrationInProgress) return;
    let mounted = true;
    let pending = false;
    const refreshAccess = async () => {
      if (pending) return;
      pending = true;
      try {
        const { data, error } = await supabase.rpc('get_my_portal_identity');
        if (!mounted || error) return;
        if (!data || data.active === false || !isRoleCompatibleWithSurface(data.role)) {
          await logout({ scope: 'local' });
        } else {
          setUser(data);
          try { localStorage.setItem('ehr_user', JSON.stringify(data)); localStorage.setItem('authUser', JSON.stringify(data)); } catch (_) {}
        }
      } finally { pending = false; }
    };
    const interval = setInterval(refreshAccess, 30000);
    window.addEventListener('focus', refreshAccess);
    return () => { mounted = false; clearInterval(interval); window.removeEventListener('focus', refreshAccess); };
  }, [session?.user?.id, Boolean(user), registrationInProgress, logout]);

  const updateUser = (partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...(partial || {}) };
      try {
        localStorage.setItem('ehr_user', JSON.stringify(next));
        localStorage.setItem('authUser', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        initializing,
        registrationInProgress,
        setRegistrationInProgress,
        isPasswordRecoverySession,
        setIsPasswordRecoverySession,
        clearPasswordRecoveryState,
        login,
        logout,
        updateUser,
        fetchUserProfile,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

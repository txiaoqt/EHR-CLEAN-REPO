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

  // Helper to fetch user profile from public.admins (staff) or public.users (patients)
  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser) return null;
    try {
      // 1. Check public.admins first for Staff accounts (admin, physician, nurse)
      try {
        const { data: adminData } = await supabase
          .from('admins')
          .select('id, name, email, avatar, role, auth_user_id, active, locked_until, department, clearance_level')
          .or(`auth_user_id.eq.${authUser.id},email.ilike.${authUser.email}`)
          .limit(1)
          .maybeSingle();

        if (adminData) {
          const role = (adminData.role || '').toLowerCase();
          if (['admin', 'physician', 'nurse'].includes(role)) {
            // Background link auth_user_id if not set
            if (!adminData.auth_user_id) {
              supabase
                .from('admins')
                .update({ auth_user_id: authUser.id })
                .eq('id', adminData.id)
                .then(() => {})
                .catch(() => {});
            }

            return {
              id: adminData.id,
              auth_user_id: adminData.auth_user_id || authUser.id,
              name: adminData.name || authUser.user_metadata?.name || authUser.email,
              email: adminData.email || authUser.email,
              avatar: adminData.avatar || null,
              role,
              patient_id: null,
              active: adminData.active !== false,
              locked_until: adminData.locked_until || null,
              department: adminData.department || null,
              clearance_level: adminData.clearance_level || null,
            };
          }
        }
      } catch (adminErr) {
        console.warn('Error querying admins table:', adminErr);
      }

      // 2. Check public.users for Patient accounts
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('id, name, email, avatar, role, patient_id, auth_user_id, active, locked_until')
          .or(`auth_user_id.eq.${authUser.id},email.ilike.${authUser.email}`)
          .limit(1)
          .maybeSingle();

        if (userData) {
          // Background link auth_user_id if not set
          if (!userData.auth_user_id) {
            supabase
              .from('users')
              .update({ auth_user_id: authUser.id })
              .eq('id', userData.id)
              .then(() => {})
              .catch(() => {});
          }

          let resolvedAvatar = userData.avatar || null;
          if (!resolvedAvatar && userData.patient_id) {
            try {
              const { data: ppData } = await supabase
                .from('patient_profiles')
                .select('avatar_url')
                .eq('patient_id', userData.patient_id)
                .maybeSingle();
              if (ppData?.avatar_url) resolvedAvatar = ppData.avatar_url;
            } catch (_) {}
          }

          return {
            id: userData.id,
            auth_user_id: userData.auth_user_id || authUser.id,
            name: userData.name || authUser.user_metadata?.name || authUser.email,
            email: userData.email || authUser.email,
            avatar: resolvedAvatar,
            role: 'patient',
            patient_id: userData.patient_id || null,
            active: userData.active !== false,
            locked_until: userData.locked_until || null,
          };
        }
      } catch (userErr) {
        console.warn('Error querying users table:', userErr);
      }

      // 3. Check public.enrollees — an applicant who has no TUP account yet.
      //
      // Checked after users and before the metadata fallback, because an
      // enrollee is deliberately not in either of the other tables:
      // sync_public_user_from_auth skips an unrecognised role, so signing up
      // with role 'enrollee' creates no patient row. This is what makes that
      // account usable without making it look like a patient.
      try {
        const { data: enrolleeData } = await supabase
          .from('enrollees')
          .select('id, auth_user_id, first_name, middle_name, surname, suffix, personal_email, applicant_id, status, tup_email, elevated_student_id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();

        if (enrolleeData) {
          const fullName = [
            enrolleeData.first_name,
            enrolleeData.middle_name,
            enrolleeData.surname,
            enrolleeData.suffix,
          ]
            .filter(Boolean)
            .join(' ');
          const isElevated = enrolleeData.status === 'elevated';

          return {
            id: enrolleeData.id,
            auth_user_id: enrolleeData.auth_user_id || authUser.id,
            name: fullName || authUser.email,
            email: enrolleeData.personal_email || authUser.email,
            avatar: null,
            role: 'enrollee',
            enrollee_status: enrolleeData.status || 'enrollee',
            elevated: isElevated,
            tup_email: enrolleeData.tup_email || null,
            elevated_student_id: enrolleeData.elevated_student_id || null,
            applicant_id: enrolleeData.applicant_id || null,
            patient_id: null,
            // An elevated enrollee account is retired; they sign in with their
            // official @tup.edu.ph student account from then on.
            active: !isElevated,
            locked_until: null,
          };
        }
      } catch (enrolleeErr) {
        // A failure here must not block sign-in: the enrollee may simply not
        // have completed registration yet, and the next step tells them so.
        console.warn('Error querying enrollees table:', enrolleeErr);
      }

      // 4. Fallback: Check metadata if explicitly a patient (NEVER default to nurse!)
      const metaRole = (authUser.user_metadata?.role || '').toLowerCase();
      if (metaRole === 'patient') {
        return {
          id: authUser.id,
          auth_user_id: authUser.id,
          name: authUser.user_metadata?.name || authUser.email,
          email: authUser.email,
          avatar: null,
          role: 'patient',
          patient_id: authUser.user_metadata?.patient_id || null,
          active: true,
          locked_until: null,
        };
      }

      // Signed up as an enrollee but no record yet: the OTP was confirmed and
      // the registration RPC has not completed. Recognising this is better than
      // returning null, which would sign them out with no explanation — instead
      // the portal can tell them their registration is unfinished.
      if (metaRole === 'enrollee') {
        return {
          id: authUser.id,
          auth_user_id: authUser.id,
          name: authUser.user_metadata?.name || authUser.email,
          email: authUser.email,
          avatar: null,
          role: 'enrollee',
          enrollee_status: 'incomplete',
          first_name: authUser.user_metadata?.first_name || null,
          middle_name: authUser.user_metadata?.middle_name || null,
          surname: authUser.user_metadata?.surname || null,
          suffix: authUser.user_metadata?.suffix || null,
          date_of_birth: authUser.user_metadata?.date_of_birth || null,
          applicant_id: authUser.user_metadata?.applicant_id || null,
          patient_id: null,
          active: true,
          locked_until: null,
        };
      }

      // Unknown or missing role — fail safely without granting staff access
      return null;
    } catch (err) {
      console.warn('Error fetching user profile:', err);
      return null;
    }
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
          if (mounted && profile && sessionUserId.current === initSession.user.id) {
            if (isRoleCompatibleWithSurface(profile.role) && profile.active !== false) {
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
              if (!isRoleCompatibleWithSurface(profile.role)) {
                supabase.auth.signOut().catch(() => {});
              }
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

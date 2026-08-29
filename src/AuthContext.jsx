// filename: src/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ehr_user');
      return raw ? JSON.parse(raw) : null;
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

          return {
            id: userData.id,
            auth_user_id: userData.auth_user_id || authUser.id,
            name: userData.name || authUser.user_metadata?.name || authUser.email,
            email: userData.email || authUser.email,
            avatar: userData.avatar || null,
            role: 'patient',
            patient_id: userData.patient_id || null,
            active: userData.active !== false,
            locked_until: userData.locked_until || null,
          };
        }
      } catch (userErr) {
        console.warn('Error querying users table:', userErr);
      }

      // 3. Fallback: Check metadata if explicitly a patient (NEVER default to nurse!)
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

        if (initSession?.user) {
          const profile = await fetchUserProfile(initSession.user);
          if (mounted && profile) {
            setUser(profile);
            try {
              localStorage.setItem('ehr_user', JSON.stringify(profile));
              localStorage.setItem('authUser', JSON.stringify(profile));
            } catch (_) {}
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
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);

      if (event === 'SIGNED_OUT') {
        console.log('[Auth] SIGNED_OUT received');
        if (mounted) {
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
            if (mounted && profile) {
              setUser(profile);
              try {
                localStorage.setItem('ehr_user', JSON.stringify(profile));
                localStorage.setItem('authUser', JSON.stringify(profile));
              } catch (_) {}
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

  const login = (profile) => {
    setUser(profile);
    try {
      localStorage.setItem('ehr_user', JSON.stringify(profile));
      localStorage.setItem('authUser', JSON.stringify(profile));
    } catch (_) {}
  };

  const logout = async () => {
    console.log('[Auth] Sign out started');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('[Auth] Sign out error:', error);
      } else {
        console.log('[Auth] Sign out result: success');
      }
    } catch (e) {
      console.warn('[Auth] Sign out exception:', e);
    } finally {
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
  };

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

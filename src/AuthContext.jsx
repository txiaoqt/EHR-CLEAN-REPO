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

  // Helper to fetch user profile from public.users using Supabase Auth User
  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser) return null;
    try {
      // Fast single query by auth_user_id or email
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, avatar, role, patient_id, auth_user_id, active, locked_until')
        .or(`auth_user_id.eq.${authUser.id},email.ilike.${authUser.email}`)
        .limit(1)
        .maybeSingle();

      if (data) {
        const profile = {
          id: data.id,
          auth_user_id: data.auth_user_id || authUser.id,
          name: data.name || authUser.user_metadata?.name || authUser.email,
          email: data.email || authUser.email,
          avatar: data.avatar || null,
          role: (data.role || 'nurse').toLowerCase(),
          patient_id: data.patient_id || null,
          active: data.active !== false,
          locked_until: data.locked_until || null
        };

        // Link auth_user_id in background if not set
        if (!data.auth_user_id) {
          supabase
            .from('users')
            .update({ auth_user_id: authUser.id })
            .eq('id', data.id)
            .then(() => {})
            .catch(() => {});
        }

        return profile;
      }

      // Fallback: Derive baseline profile from auth user metadata
      return {
        id: authUser.id,
        auth_user_id: authUser.id,
        name: authUser.user_metadata?.name || authUser.email,
        email: authUser.email,
        avatar: null,
        role: (authUser.user_metadata?.role || 'nurse').toLowerCase(),
        patient_id: authUser.user_metadata?.patient_id || null,
        active: true,
        locked_until: null
      };
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
    supabase.auth.getSession().then(async ({ data: { session: initSession }, error }) => {
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
    }).catch((err) => {
      clearTimeout(timeoutId);
      console.warn('[AUTH] getSession error:', err);
      if (mounted) {
        setLoading(false);
        setInitializing(false);
      }
    });

    // 2. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
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
          if (prevUser && (prevUser.auth_user_id === currentSession.user.id || prevUser.email === currentSession.user.email)) {
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
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

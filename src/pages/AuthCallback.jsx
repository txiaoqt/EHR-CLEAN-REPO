// src/pages/AuthCallback.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

const DEPLOY_SURFACE = (import.meta.env.VITE_DEPLOY_SURFACE || 'admin').toLowerCase();
const IS_USER_SURFACE = DEPLOY_SURFACE === 'user';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { isAuthenticated, initializing, isPasswordRecoverySession, user } = useAuth();

  useEffect(() => {
    let mounted = true;

    const processAuthHandoff = async () => {
      // 1. If AuthContext has already recognized a password recovery session, route immediately to /reset-password
      if (isPasswordRecoverySession) {
        navigate('/reset-password', { replace: true });
        return;
      }

      // 2. Check URL for candidate recovery tokens (PKCE code or implicit hash tokens)
      const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const search = typeof window !== 'undefined' ? window.location.search || '' : '';
      const isRecoveryCandidate =
        hash.includes('type=recovery') ||
        search.includes('type=recovery') ||
        hash.includes('access_token=') ||
        search.includes('code=');

      if (isRecoveryCandidate) {
        // Forward to /reset-password preserving query and hash parameters so Supabase Auth can process them
        navigate(`/reset-password${search}${hash}`, { replace: true });
        return;
      }

      // 3. Wait until auth initialization has finished
      if (initializing) return;

      // 4. If normal authenticated user, route to surface home
      if (isAuthenticated) {
        const role = (user?.role || '').toLowerCase();
        const surfaceHome = IS_USER_SURFACE
          ? '/patient/dashboard'
          : (role === 'patient' ? '/patient/dashboard' : '/dashboard');
        navigate(surfaceHome, { replace: true });
        return;
      }

      // 5. Unauthenticated fallback -> Login
      navigate('/login', { replace: true });
    };

    processAuthHandoff();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, initializing, isPasswordRecoverySession, user, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <img
        src={tupehrlogo}
        alt="TUP Clinic Logo"
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.8)',
          marginBottom: 16,
          background: '#fff',
        }}
      />
      <div style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>
        Verifying Authentication
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>
        Please wait while we establish your secure session…
      </div>
    </div>
  );
};

export default AuthCallback;

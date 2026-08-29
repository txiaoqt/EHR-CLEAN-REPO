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
  const { isAuthenticated, initializing, isPasswordRecoverySession, setIsPasswordRecoverySession, user } = useAuth();

  useEffect(() => {
    let mounted = true;

    const processAuthHandoff = async () => {
      // 1. If AuthContext has already recognized a password recovery session, route immediately to /reset-password
      if (isPasswordRecoverySession) {
        navigate('/reset-password', { replace: true });
        return;
      }

      // 2. Parse URL parameters from search query and hash
      const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search || '' : '');
      const rawHash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const hashParams = new URLSearchParams(rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);

      const code = searchParams.get('code') || hashParams.get('code');
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      const type = searchParams.get('type') || hashParams.get('type');
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

      const isRecoveryRequest =
        type === 'recovery' ||
        rawHash.includes('type=recovery') ||
        searchParams.toString().includes('type=recovery') ||
        (code && type === 'recovery') ||
        (tokenHash && type === 'recovery');

      // 3. If recovery flow is detected, establish session and mark recovery state
      if (isRecoveryRequest) {
        try {
          if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error && data?.session) {
              if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
              if (mounted) navigate('/reset-password', { replace: true });
              return;
            }
          } else if (tokenHash) {
            const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
            if (!error && data?.session) {
              if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
              if (mounted) navigate('/reset-password', { replace: true });
              return;
            }
          } else if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (!error && data?.session) {
              if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
              if (mounted) navigate('/reset-password', { replace: true });
              return;
            }
          }
        } catch (err) {
          console.warn('[AuthCallback] Recovery establishment error:', err);
        }

        // Forward candidate tokens to /reset-password if active establishment is still ongoing
        if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
        if (mounted) navigate('/reset-password', { replace: true });
        return;
      }

      // 4. Wait until auth initialization has finished for standard logins
      if (initializing) return;

      // 5. If normal authenticated user, route to surface home
      if (isAuthenticated) {
        const role = (user?.role || '').toLowerCase();
        const surfaceHome = IS_USER_SURFACE
          ? '/patient/dashboard'
          : (role === 'patient' ? '/patient/dashboard' : '/dashboard');
        navigate(surfaceHome, { replace: true });
        return;
      }

      // 6. Unauthenticated fallback -> Login
      navigate('/login', { replace: true });
    };

    processAuthHandoff();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, initializing, isPasswordRecoverySession, setIsPasswordRecoverySession, user, navigate]);

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

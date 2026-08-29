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
      // 1. If AuthContext has already recognized an active password recovery session with valid Supabase session
      if (isPasswordRecoverySession) {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          if (mounted) navigate('/reset-password', { replace: true });
          return;
        }
      }

      // 2. Parse URL parameters from search query and hash
      const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search || '' : '');
      const rawHash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const hashParams = new URLSearchParams(rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);

      const error = searchParams.get('error') || hashParams.get('error');
      const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
      const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');

      const code = searchParams.get('code') || hashParams.get('code');
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      const type = searchParams.get('type') || hashParams.get('type');
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

      const isRecoveryRequest =
        type === 'recovery' ||
        rawHash.includes('type=recovery') ||
        searchParams.toString().includes('type=recovery') ||
        errorCode === 'otp_expired' ||
        (errorDescription && /expired|invalid|recovery|otp/i.test(errorDescription));

      // 3. If an explicit recovery error is present in URL (e.g. otp_expired from Supabase)
      if (error || errorCode === 'otp_expired' || (isRecoveryRequest && (error || errorCode))) {
        console.warn('[AuthCallback] Password recovery link expired or invalid.');
        if (mounted) navigate('/reset-password?error=expired', { replace: true });
        return;
      }

      // 4. If candidate recovery credentials are provided, attempt active session establishment
      if (code) {
        try {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError && data?.session) {
            if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
            if (mounted) navigate('/reset-password', { replace: true });
            return;
          }
        } catch (_) {
          console.warn('[AuthCallback] Recovery code exchange failed.');
        }
        // Code failed to exchange (expired / already consumed / invalid)
        if (mounted) navigate('/reset-password?error=expired', { replace: true });
        return;
      }

      if (tokenHash && isRecoveryRequest) {
        try {
          const { data, error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (!otpError && data?.session) {
            if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
            if (mounted) navigate('/reset-password', { replace: true });
            return;
          }
        } catch (_) {
          console.warn('[AuthCallback] Recovery OTP verification failed.');
        }
        if (mounted) navigate('/reset-password?error=expired', { replace: true });
        return;
      }

      if (accessToken && refreshToken && isRecoveryRequest) {
        try {
          const { data, error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!sessionError && data?.session) {
            if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
            if (mounted) navigate('/reset-password', { replace: true });
            return;
          }
        } catch (_) {
          console.warn('[AuthCallback] Recovery token setSession failed.');
        }
        if (mounted) navigate('/reset-password?error=expired', { replace: true });
        return;
      }

      if (isRecoveryRequest) {
        if (mounted) navigate('/reset-password?error=expired', { replace: true });
        return;
      }

      // 5. Wait until auth initialization has finished for standard logins
      if (initializing) return;

      // 6. If normal authenticated user, route to surface home
      if (isAuthenticated) {
        const role = (user?.role || '').toLowerCase();
        const surfaceHome = IS_USER_SURFACE
          ? '/patient/dashboard'
          : (role === 'patient' ? '/patient/dashboard' : '/dashboard');
        navigate(surfaceHome, { replace: true });
        return;
      }

      // 7. Unauthenticated fallback -> Login
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

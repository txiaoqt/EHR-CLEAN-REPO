// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import { EyeIcon, EyeOffIcon } from '../components/icons/Icons.jsx';
import bg1Image from '../assets/images/bg1.jpg';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { isPasswordRecoverySession, setIsPasswordRecoverySession, clearPasswordRecoveryState } = useAuth();

  // Explicit Recovery State Model: 'checking' | 'valid' | 'invalid' | 'success'
  const [recoveryState, setRecoveryState] = useState(() => (isPasswordRecoverySession ? 'valid' : 'checking'));
  const recoveryCompletedRef = React.useRef(false);

  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmNewPass, setShowConfirmNewPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOpen, setMsgOpen] = useState(false);

  // Authoritative Supabase Auth Recovery Verification (following Y-TRACE architecture)
  useEffect(() => {
    let mounted = true;

    // Terminal state protection: If password update has already succeeded, do not re-evaluate or mark invalid
    if (recoveryCompletedRef.current || recoveryState === 'success') {
      return;
    }

    const establishRecoverySession = async () => {
      if (recoveryCompletedRef.current || !mounted) return;

      // 1. Parse URL parameters from both search and hash
      const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search || '' : '');
      const rawHash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const hashParams = new URLSearchParams(rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);

      const urlError = searchParams.get('error') || hashParams.get('error');
      const urlErrorCode = searchParams.get('error_code') || hashParams.get('error_code');

      // If an explicit error is present (e.g. otp_expired or error=expired)
      if (urlError || urlErrorCode === 'otp_expired') {
        if (mounted && !recoveryCompletedRef.current) setRecoveryState('invalid');
        return;
      }

      // 2. If AuthContext already verified recovery session with valid Supabase session
      if (isPasswordRecoverySession) {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          if (mounted && !recoveryCompletedRef.current) setRecoveryState('valid');
          return;
        }
      }

      const code = searchParams.get('code') || hashParams.get('code');
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      const type = searchParams.get('type') || hashParams.get('type');
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

      // 3. Actively establish session based on provided credential format (Y-TRACE pattern)
      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data?.session) {
            if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
            if (mounted && !recoveryCompletedRef.current) setRecoveryState('valid');
            return;
          }
        } else if (tokenHash && type === 'recovery') {
          const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (!error && data?.session) {
            if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
            if (mounted && !recoveryCompletedRef.current) setRecoveryState('valid');
            return;
          }
        } else if (accessToken && refreshToken && type === 'recovery') {
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!error && data?.session) {
            if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
            if (mounted && !recoveryCompletedRef.current) setRecoveryState('valid');
            return;
          }
        }
      } catch (err) {
        console.warn('Recovery session establishment error:', err);
      }

      // 4. Check active Supabase session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isPasswordRecoverySession) {
          if (mounted && !recoveryCompletedRef.current) setRecoveryState('valid');
          return;
        }
      } catch (_) {}

      // 5. If no recovery credentials succeeded, mark as invalid unless already completed
      if (mounted && !recoveryCompletedRef.current) {
        setRecoveryState((prev) => (prev === 'success' ? 'success' : 'invalid'));
      }
    };

    // Listen for authoritative PASSWORD_RECOVERY event
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || recoveryCompletedRef.current) return;
      if (event === 'PASSWORD_RECOVERY') {
        if (setIsPasswordRecoverySession) setIsPasswordRecoverySession(true);
        setRecoveryState('valid');
      }
    });

    establishRecoverySession();

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, [isPasswordRecoverySession, setIsPasswordRecoverySession, recoveryState]);

  useEffect(() => {
    if (msg) setMsgOpen(true);
  }, [msg]);

  // Validation rules
  const passwordsMatch = newPass && confirmNewPass && newPass === confirmNewPass;
  const isLengthValid = newPass.length >= 6;
  const isSubmitDisabled =
    loading ||
    !newPass.trim() ||
    !confirmNewPass.trim() ||
    !passwordsMatch ||
    !isLengthValid;

  const handleUpdatePassword = async (e) => {
    if (e) e.preventDefault();
    if (recoveryState !== 'valid') return;

    if (!newPass || !confirmNewPass) {
      setMsg('Please enter and confirm your new password.');
      return;
    }
    if (newPass !== confirmNewPass) {
      setMsg('Passwords do not match.');
      return;
    }
    if (newPass.length < 6) {
      setMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setMsg('');

    try {
      // 1. Authoritative password update via Supabase Auth
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;

      // 2. Mark recovery as permanently completed in this session
      recoveryCompletedRef.current = true;
      setRecoveryState('success');
      setMsg('Password updated successfully.');

      // 3. Sign out the temporary recovery session
      await supabase.auth.signOut().catch(() => {});

      // 4. Clear recovery state across all tabs
      clearPasswordRecoveryState();
    } catch (err) {
      console.error('Password reset error:', err);
      setMsg(err.message || 'Unable to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    clearPasswordRecoveryState();
    navigate('/login');
  };

  const authInputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '10px',
    padding: '10px 14px',
    color: '#333333',
    background: '#ffffff',
    outline: 'none',
    fontSize: '13.5px',
    transition: 'all 0.2s ease',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `url(${bg1Image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      {/* Background Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          zIndex: 1,
        }}
      />

      {/* Main Glassmorphic Card Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: '440px',
          background: '#931b1b',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          color: '#ffffff',
          padding: '32px 28px',
          boxSizing: 'border-box',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        {/* Header Branding */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          <img
            src={tupehrlogo}
            alt="TUP Clinic Logo"
            style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
              marginBottom: 10,
              background: '#fff',
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            TUP Manila Clinic
          </h1>
          <div style={{ fontSize: 12.5, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2, fontWeight: 500 }}>
            Patient Portal · Password Recovery
          </div>
        </div>

        {/* State 1: Checking Verification */}
        {recoveryState === 'checking' && (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
            Verifying password reset authorization…
          </div>
        )}

        {/* State 2: Successful Password Reset */}
        {recoveryState === 'success' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: 22, fontWeight: 800, fontFamily: '"Merriweather", serif' }}>
              Password Updated
            </h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255, 255, 255, 0.92)', lineHeight: 1.5, margin: '0 0 24px 0' }}>
              Your password has been successfully updated. You may now log in to the Patient Portal with your new credentials.
            </p>
            <button
              type="button"
              onClick={handleBackToLogin}
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#931b1b',
                fontWeight: 700,
                padding: '11px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                boxShadow: '0 6px 14px rgba(0,0,0,0.12)',
                transition: 'all 0.15s ease',
              }}
            >
              Continue to Login
            </button>
          </div>
        )}

        {/* State 3: Invalid or Expired Recovery Context */}
        {recoveryState === 'invalid' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: 20, fontWeight: 800, fontFamily: '"Merriweather", serif' }}>
              Password Reset Link Expired
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.92)', lineHeight: 1.5, margin: '0 0 22px 0' }}>
              This password reset link has expired or is no longer valid. Please request a new password reset email to continue.
            </p>
            <button
              type="button"
              onClick={handleBackToLogin}
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#931b1b',
                fontWeight: 700,
                padding: '11px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                boxShadow: '0 6px 14px rgba(0,0,0,0.12)',
                transition: 'all 0.15s ease',
              }}
            >
              Back to Login
            </button>
          </div>
        )}

        {/* State 4: Valid Password Recovery Form */}
        {recoveryState === 'valid' && (
          <form onSubmit={handleUpdatePassword}>
            <h2
              style={{
                textAlign: 'center',
                margin: '0 0 6px 0',
                fontSize: 22,
                fontWeight: 800,
                fontFamily: '"Merriweather", serif',
              }}
            >
              Reset Password
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', textAlign: 'center', margin: '0 0 18px 0' }}>
              Enter your new password below.
            </p>

            {/* New Password Field */}
            <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="new-password" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>
                New Password
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  id="new-password"
                  className="input"
                  style={{ ...authInputStyle, paddingRight: 40 }}
                  type={showNewPass ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showNewPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowNewPass(!showNewPass)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    padding: 4,
                  }}
                >
                  {showNewPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password Field */}
            <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="confirm-new-password" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>
                Confirm New Password
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  id="confirm-new-password"
                  className="input"
                  style={{ ...authInputStyle, paddingRight: 40 }}
                  type={showConfirmNewPass ? 'text' : 'password'}
                  placeholder="Re-type new password"
                  autoComplete="new-password"
                  value={confirmNewPass}
                  onChange={(e) => setConfirmNewPass(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showConfirmNewPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowConfirmNewPass(!showConfirmNewPass)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    padding: 4,
                  }}
                >
                  {showConfirmNewPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
              {newPass && confirmNewPass && !passwordsMatch && (
                <div style={{ color: '#fed7d7', fontSize: 11.5, marginTop: 2 }}>
                  Passwords do not match.
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="btn"
                disabled={isSubmitDisabled}
                style={{
                  width: '100%',
                  background: isSubmitDisabled ? 'rgba(255,255,255,0.35)' : '#ffffff',
                  color: isSubmitDisabled ? 'rgba(255,255,255,0.75)' : '#931b1b',
                  fontWeight: 700,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  boxShadow: isSubmitDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.12)',
                  transition: 'all 0.15s ease',
                }}
              >
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
            </div>

            {/* Back to Login */}
            <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
              <button
                type="button"
                onClick={handleBackToLogin}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 13,
                }}
              >
                Back to Login
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Global Message / Error Modal */}
      {msgOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3200,
            padding: 16,
          }}
          onClick={() => setMsgOpen(false)}
        >
          <div
            style={{
              width: 'min(92vw, 440px)',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid var(--border, #e2e8f0)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              padding: 24,
              color: '#1e293b',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {msg.toLowerCase().includes('success') ? 'Success' : 'Notice'}
            </h3>
            <div style={{ color: msg.toLowerCase().includes('error') || msg.toLowerCase().includes('unable') ? '#dc2626' : '#334155', fontSize: 14, lineHeight: 1.5 }}>
              {msg}
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn secondary"
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: '#f1f5f9',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                }}
                onClick={() => setMsgOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResetPassword;

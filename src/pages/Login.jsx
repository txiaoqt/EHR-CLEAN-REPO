// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { logAudit } from '../utils.js';
import {
  getClinicHoursMessage,
  getLockoutMessage,
  isWithinClinicHours,
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
} from './loginSecurity.js';
import { EyeIcon, EyeOffIcon } from '../components/icons/Icons.jsx';
import bg1Image from '../assets/images/bg1.jpg';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';
import {
  ALLOWED_USER_EMAIL_DOMAIN,
  STUDENT_ID_REGEX,
  isValidTupEmail,
  isValidStudentId,
} from '../utils/authValidation.js';

export { ALLOWED_USER_EMAIL_DOMAIN, STUDENT_ID_REGEX, isValidTupEmail, isValidStudentId };

const DEPLOY_SURFACE = (import.meta.env.VITE_DEPLOY_SURFACE || 'admin').toLowerCase();
const IS_ADMIN_SURFACE = DEPLOY_SURFACE === 'admin';
const IS_USER_SURFACE = DEPLOY_SURFACE === 'user';

const USER_TEST_ACCOUNT = {
  email: 'patient.test@tup.edu.ph',
  password: 'UserTest@123',
  profile: {
    id: 'hardcoded-patient-user',
    name: 'Test Patient',
    email: 'patient.test@tup.edu.ph',
    avatar: null,
    role: 'patient',
    patient_id: 'TUPM-23-5030',
  },
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, fetchUserProfile, isPasswordRecoverySession } = useAuth();
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));

  // Authentication Mode: 'login' | 'signup' | 'forgot'
  const [authMode, setAuthMode] = useState('login');

  // Login State
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Sign-up State
  const [signupData, setSignupData] = useState({
    studentId: '',
    fullName: '',
    year: '1',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // OTP Verification State
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpEmail, setOtpEmail] = useState('');

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Global Feedback & Loading State
  const [msg, setMsg] = useState('');
  const [msgOpen, setMsgOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Handle Password Recovery Session (following Y-TRACE SignIn architecture)
  useEffect(() => {
    if (isPasswordRecoverySession) {
      navigate('/reset-password', { replace: true });
      return;
    }

    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        navigate(`/reset-password${search}${hash}`, { replace: true });
      }
    }
  }, [isPasswordRecoverySession, navigate]);

  // Cooldown Countdown Timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Window Resize Listener
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Location Session Message
  useEffect(() => {
    const sessionMessage = location?.state?.sessionMessage;
    if (sessionMessage) setMsg(sessionMessage);
  }, [location]);

  // Open Message Modal on message set
  useEffect(() => {
    if (msg) setMsgOpen(true);
  }, [msg]);

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------

  const handleLogin = async () => {
    if (!email || !pass) {
      setMsg('Please enter email and password');
      return;
    }

    if (!isWithinClinicHours()) {
      setMsg(getClinicHoursMessage());
      return;
    }

    setLoading(true);
    setMsg('');

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Hardcoded user-surface account for quick QA/testing without signup.
      if (
        IS_USER_SURFACE &&
        normalizedEmail === USER_TEST_ACCOUNT.email &&
        pass === USER_TEST_ACCOUNT.password
      ) {
        login(USER_TEST_ACCOUNT.profile);
        navigate('/patient/dashboard');
        return;
      }

      // Check lockout status before attempting sign in if RPC is available
      try {
        const { data: lockStatus } = await supabase.rpc('get_login_lockout_status', { p_email: normalizedEmail });
        if (lockStatus && lockStatus.length > 0 && lockStatus[0].is_locked) {
          setMsg(getLockoutMessage(lockStatus[0].locked_until, new Date()));
          setLoading(false);
          return;
        }
      } catch (_) {}

      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: pass,
      });

      if (authError) {
        console.warn('Authentication error:', authError.message);
        try {
          const { data: lockData } = await supabase.rpc('register_failed_login', {
            p_email: normalizedEmail,
            p_lock_after: MAX_FAILED_ATTEMPTS,
            p_lock_minutes: LOCKOUT_MINUTES,
          });
          if (lockData && lockData.length > 0 && lockData[0].is_locked) {
            setMsg(getLockoutMessage(lockData[0].locked_until, new Date()));
            setLoading(false);
            return;
          }
        } catch (_) {}

        try {
          await logAudit('LOGIN_FAILED', `Failed login attempt for ${normalizedEmail}`, normalizedEmail);
        } catch (_) {}

        setMsg('Invalid email or password');
        return;
      }

      if (!authData?.user) {
        setMsg('Invalid email or password');
        return;
      }

      const authUser = authData.user;

      // 2. Load user profile from public.admins (staff) or public.users (patients)
      const profile = await fetchUserProfile(authUser);

      if (!profile) {
        setMsg('User profile not found. Please contact an administrator.');
        await supabase.auth.signOut();
        return;
      }

      if (profile.active === false) {
        setMsg('Your account has been deactivated. Please contact an administrator.');
        await supabase.auth.signOut();
        return;
      }

      const userRole = (profile.role || '').toLowerCase();

      // Surface compatibility check
      if (IS_ADMIN_SURFACE && userRole === 'patient') {
        setMsg('Patient accounts are not allowed on this portal.');
        await supabase.auth.signOut();
        return;
      }
      if (IS_USER_SURFACE && userRole !== 'patient') {
        setMsg('Only patient accounts can log in on this portal.');
        await supabase.auth.signOut();
        return;
      }

      // 3. Clear failed login lockout counters on success
      try {
        await supabase.rpc('clear_login_lockout', { p_email: normalizedEmail, p_touch_last_login: true });
      } catch (_) {
        try {
          const targetTable = userRole === 'patient' ? 'users' : 'admins';
          await supabase
            .from(targetTable)
            .update({
              failed_login_attempts: 0,
              locked_until: null,
              last_failed_login_at: null,
              last_login_at: new Date().toISOString(),
            })
            .eq('id', profile.id);
        } catch (__) {}
      }

      // 4. Record audit log
      try {
        await logAudit('LOGIN_SUCCESS', `User ${profile.name || normalizedEmail} logged in as ${userRole}`, profile.name || normalizedEmail);
      } catch (_) {}

      // 5. Update AuthContext & navigate
      login(profile);
      navigate(userRole === 'patient' ? '/patient/dashboard' : '/dashboard');
    } catch (e) {
      console.error('Login error:', e);
      setMsg('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    const targetEmail = signupData.email.trim().toLowerCase();
    if (!targetEmail) {
      setMsg('Please enter your official TUP email address.');
      return;
    }
    if (!isValidTupEmail(targetEmail)) {
      setMsg('Please use your official TUP email address ending in @tup.edu.ph.');
      return;
    }
    if (otpSending || otpCooldown > 0) return;

    setOtpSending(true);
    setMsg('');
    try {
      // 1. Sign up with Supabase Auth to trigger OTP verification email
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: targetEmail,
        password: signupData.password || 'TupPatientTempPass@2026',
        options: {
          data: {
            name: signupData.fullName.trim() || 'Patient',
            role: 'patient',
            patient_id: signupData.studentId.trim().toUpperCase() || targetEmail.split('@')[0],
          },
        },
      });

      if (authErr) {
        if (authErr.message?.toLowerCase().includes('already registered')) {
          const { error: resendErr } = await supabase.auth.resend({
            type: 'signup',
            email: targetEmail,
          });
          if (resendErr) throw resendErr;
        } else {
          throw authErr;
        }
      }

      setOtpSent(true);
      setOtpEmail(targetEmail);
      setOtpCooldown(60);
      setMsg('Verification code sent. Check your TUP email.');
    } catch (err) {
      console.error('Send OTP error:', err);
      setMsg(err.message || 'Unable to send the verification code. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handlePatientSignup = async () => {
    const payload = {
      studentId: signupData.studentId.trim().toUpperCase(),
      fullName: signupData.fullName.trim(),
      year: Number(signupData.year || 1),
      email: signupData.email.trim().toLowerCase(),
      password: signupData.password,
      confirmPassword: signupData.confirmPassword,
      otp: otpCode.trim(),
    };

    if (!payload.studentId || !payload.fullName || !payload.email || !payload.password || !payload.confirmPassword) {
      setMsg('Please fill in all required fields.');
      return;
    }
    if (!isValidStudentId(payload.studentId)) {
      setMsg('Please enter a valid Student ID in format TUPM-YY-XXXX (e.g. TUPM-23-5030).');
      return;
    }
    if (!isValidTupEmail(payload.email)) {
      setMsg('Please use your official TUP email address ending in @tup.edu.ph.');
      return;
    }
    if (payload.password !== payload.confirmPassword) {
      setMsg('Passwords do not match.');
      return;
    }
    if (payload.password.length < 6) {
      setMsg('Password must be at least 6 characters.');
      return;
    }
    if (!payload.otp) {
      setMsg('Please enter the verification code sent to your email.');
      return;
    }

    setLoading(true);
    setMsg('');
    try {
      // 1. Verify OTP with Supabase Auth
      let authUserId = null;
      const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
        email: payload.email,
        token: payload.otp,
        type: 'signup',
      });

      if (verifyErr) {
        // Fallback retry with type: 'email'
        const { data: retryData, error: retryErr } = await supabase.auth.verifyOtp({
          email: payload.email,
          token: payload.otp,
          type: 'email',
        });
        if (retryErr) {
          console.warn('OTP Verification error:', verifyErr.message);
          setMsg('The verification code is incorrect or has expired. Please try again.');
          setLoading(false);
          return;
        }
        authUserId = retryData?.user?.id;
      } else {
        authUserId = verifyData?.user?.id;
      }

      if (!authUserId) {
        authUserId = (await supabase.auth.getUser())?.data?.user?.id;
      }

      // 2. Execute atomic patient registration RPC
      let rpcSucceeded = false;
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('complete_patient_registration', {
          p_student_id: payload.studentId,
          p_name: payload.fullName,
          p_year: payload.year,
        });
        if (!rpcErr && rpcData?.success) {
          rpcSucceeded = true;
        } else if (rpcErr) {
          console.warn('complete_patient_registration RPC fallback:', rpcErr.message);
        }
      } catch (rpcEx) {
        console.warn('RPC invocation notice:', rpcEx);
      }

      // 3. Fallback / Direct multi-table persistence guarantee
      if (!rpcSucceeded) {
        // Ensure student master record exists
        await supabase
          .from('students')
          .upsert([{ id: payload.studentId, name: payload.fullName, year: payload.year }], { onConflict: 'id' });

        // Ensure patient master record exists
        await supabase
          .from('patients')
          .upsert([{ id: payload.studentId, name: payload.fullName, year: payload.year, sensitivity_level: 'normal' }], { onConflict: 'id' });

        // Upsert public.users application account (strictly role = 'patient')
        await supabase
          .from('users')
          .upsert(
            [
              {
                auth_user_id: authUserId,
                name: payload.fullName,
                email: payload.email,
                role: 'patient',
                active: true,
                patient_id: payload.studentId,
                student_id: payload.studentId,
              },
            ],
            { onConflict: 'email' }
          );

        // Upsert public.patient_profiles extended record
        try {
          await supabase
            .from('patient_profiles')
            .upsert(
              [
                {
                  patient_id: payload.studentId,
                  user_id: authUserId,
                  student_id: payload.studentId,
                  full_name: payload.fullName,
                  email: payload.email,
                  year: payload.year,
                },
              ],
              { onConflict: 'patient_id' }
            );
        } catch (_) {}
      }

      setMsg('Account created and verified successfully! You can now log in.');
      setAuthMode('login');
      setEmail(payload.email);
      setPass('');
      setOtpSent(false);
      setOtpCode('');
      setSignupData({
        studentId: '',
        fullName: '',
        year: '1',
        email: '',
        password: '',
        confirmPassword: '',
      });
    } catch (e) {
      console.error(e);
      setMsg(`Registration failed: ${e.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    if (e) e.preventDefault();
    const targetEmail = forgotEmail.trim().toLowerCase();
    if (!targetEmail) {
      setMsg('Please enter your official TUP email address.');
      return;
    }
    if (!isValidTupEmail(targetEmail)) {
      setMsg('Please use your official TUP email address ending in @tup.edu.ph.');
      return;
    }

    setForgotLoading(true);
    setMsg('');
    try {
      const resetUrl = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: resetUrl,
      });
      if (error) throw error;
      setMsg('Password reset instructions have been sent to your TUP email.');
    } catch (err) {
      console.error('Password reset error:', err);
      setMsg(err.message || 'Unable to send password reset email. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // -------------------------------------------------------------
  // VALIDATION & DISABLED STATE DERIVATIONS
  // -------------------------------------------------------------

  const isLoginDisabled = loading || !email.trim() || !pass;

  const isStudentIdValid = isValidStudentId(signupData.studentId);
  const showStudentIdError = signupData.studentId.length > 0 && !isStudentIdValid;

  const isSignupEmailValid = isValidTupEmail(signupData.email);
  const showSignupEmailError = signupData.email.length > 0 && !isSignupEmailValid;

  const isSendDisabled = otpSending || otpCooldown > 0 || !isSignupEmailValid;

  const passwordsMatch =
    signupData.password &&
    signupData.confirmPassword &&
    signupData.password === signupData.confirmPassword;

  const isSignupDisabled =
    loading ||
    !isStudentIdValid ||
    !signupData.fullName.trim() ||
    !signupData.year ||
    !isSignupEmailValid ||
    !signupData.password ||
    signupData.password.length < 6 ||
    !passwordsMatch ||
    !otpSent ||
    !otpCode.trim();

  const isForgotDisabled = forgotLoading || !isValidTupEmail(forgotEmail);

  // Responsive breakpoints
  const isMobile = vw <= 768;
  const isTablet = vw > 768 && vw <= 1100;

  const authInputStyle = {
    background: 'rgba(255,255,255,0.94)',
    border: 'none',
    padding: '11px 12px',
    borderRadius: 10,
    fontSize: 14,
    color: '#111',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.04)',
  };

  return (
    <main
      className="login-page-main"
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundImage: `url(${bg1Image})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundColor: '#f6f7f8',
        filter: 'brightness(0.98)',
        fontFamily: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Outer shell */}
      <div
        id="login-screen"
        style={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* Two-column layout */}
        <div
          className="wrap"
          style={{
            width: '100%',
            maxWidth: 1360,
            margin: '0 auto',
            display: 'flex',
            gap: isTablet ? 36 : 64,
            padding: isTablet ? '32px 40px' : '48px 64px',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '100vh',
            boxSizing: 'border-box',
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          {/* HERO (left) */}
          <div
            className="hero"
            aria-hidden="false"
            style={{
              flex: 1,
              maxWidth: 720,
              minWidth: 0,
              padding: '16px 0',
              boxSizing: 'border-box',
              display: isMobile ? 'none' : 'block',
            }}
          >
            <div className="brand-row" style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 12 }}>
              <img
                src={tupehrlogo}
                alt="TUP EHR Logo"
                className="brand-logo"
                style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'contain', padding: 4, flexShrink: 0 }}
              />
              <div>
                {IS_USER_SURFACE ? (
                  <h1
                    style={{
                      margin: 0,
                      fontSize: isTablet ? 26 : 32,
                      lineHeight: 1.15,
                      fontWeight: 900,
                      fontFamily: `"Merriweather", serif`,
                      color: '#111',
                      letterSpacing: '-0.4px',
                    }}
                  >
                    TUP Manila Clinic Online Patient Portal
                  </h1>
                ) : (
                  <h1
                    style={{
                      margin: 0,
                      fontSize: isTablet ? 26 : 32,
                      lineHeight: 1.15,
                      fontWeight: 900,
                      fontFamily: `"Merriweather", serif`,
                      color: '#111',
                      letterSpacing: '-0.4px',
                    }}
                  >
                    Technological University of the
                    <br />
                    Philippines (TUP) Manila – Clinic
                  </h1>
                )}
              </div>
            </div>

            <p
              className="lead"
              style={{
                marginTop: 20,
                color: 'rgba(51,51,51,1)',
                maxWidth: 680,
                fontSize: isTablet ? 14.5 : 16,
                lineHeight: 1.8,
                fontWeight: 400,
                opacity: 0.95,
                textAlign: 'left',
              }}
            >
              {IS_USER_SURFACE
                ? 'The TUP Manila Clinic Online Patient Portal helps students, faculty, staff, and authorized TUP personnel access clinic services online. Users can book same-day or future appointments, view clinic visit history, and send non-emergency messages to doctors or clinic staff. The portal is built to make clinic coordination faster, easier, and more convenient for the whole TUP community.'
                : `TUP-M Electronic Health Records System is a streamlined, modern electronic health record platform designed to support efficient, accurate, and student-centered clinical care. It centralizes patient information, simplifies consultation documentation, improves workflow for clinicians, and ensures secure, role-based access to medical records — all tailored to the needs of the Technological University of the Philippines community.`}
            </p>

            <div
              className="tagline"
              style={{
                marginTop: 20,
                fontStyle: 'italic',
                color: '#444',
                fontSize: 14.5,
                textAlign: 'left',
                width: '100%',
              }}
            >
              “Where records don’t get lost—just students.”
            </div>
          </div>

          {/* AUTH CARD (right) */}
          <div
            className="login-wrap"
            aria-hidden="false"
            style={{
              flexShrink: 0,
              width: isTablet ? 380 : 440,
              maxWidth: '100%',
              display: 'flex',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            <form
              className="login-card"
              onSubmit={(e) => {
                e.preventDefault();
                if (IS_USER_SURFACE) {
                  if (authMode === 'signup') handlePatientSignup();
                  else if (authMode === 'forgot') handleForgotPassword();
                  else if (authMode === 'update_password') handleUpdatePassword();
                  else handleLogin();
                } else {
                  handleLogin();
                }
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(180deg, #931b1b, #b92a2a)',
                color: '#fff',
                padding: '32px 28px',
                borderRadius: 24,
                boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
                boxSizing: 'border-box',
              }}
            >
              {/* ========================================================= */}
              {/* 1. SIGNUP VIEW (USER SURFACE ONLY)                       */}
              {/* Visual Order: ID -> Name -> Year -> Email (Send) -> OTP -> Password -> Confirm */}
              {/* ========================================================= */}
              {IS_USER_SURFACE && authMode === 'signup' && (
                <>
                  <h2
                    id="login-title"
                    style={{
                      textAlign: 'center',
                      margin: '0 0 16px 0',
                      fontSize: 24,
                      fontWeight: 800,
                      fontFamily: `"Merriweather", serif`,
                    }}
                  >
                    Create Account
                  </h2>

                  {/* 1. Student ID */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-student-id" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Student ID</label>
                    <input
                      id="signup-student-id"
                      className="input"
                      style={authInputStyle}
                      placeholder="TUPM-23-5030"
                      value={signupData.studentId}
                      onChange={(e) => setSignupData((p) => ({ ...p, studentId: e.target.value.toUpperCase() }))}
                    />
                    {showStudentIdError && (
                      <div style={{ color: '#fed7d7', fontSize: 11.5, marginTop: 2 }}>
                        Format must be TUPM-YY-XXXX (e.g. TUPM-23-5030).
                      </div>
                    )}
                  </div>

                  {/* 2. Full Name */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-full-name" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Full Name</label>
                    <input
                      id="signup-full-name"
                      className="input"
                      style={authInputStyle}
                      placeholder="Full legal name"
                      value={signupData.fullName}
                      onChange={(e) => setSignupData((p) => ({ ...p, fullName: e.target.value }))}
                    />
                  </div>

                  {/* 3. Year */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-year" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Year</label>
                    <select
                      id="signup-year"
                      className="input"
                      style={{ ...authInputStyle, cursor: 'pointer' }}
                      value={signupData.year}
                      onChange={(e) => setSignupData((p) => ({ ...p, year: e.target.value }))}
                    >
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                      <option value="5">5th Year</option>
                    </select>
                  </div>

                  {/* 4. Email with Send/Resend Button */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-email" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Email</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        id="signup-email"
                        className="input"
                        style={{ ...authInputStyle, flex: 1 }}
                        type="email"
                        placeholder="student@tup.edu.ph"
                        value={signupData.email}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSignupData((p) => ({ ...p, email: val }));
                          if (otpSent && otpEmail && val.trim().toLowerCase() !== otpEmail) {
                            setOtpSent(false);
                            setOtpCode('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={isSendDisabled}
                        onClick={handleSendOtp}
                        style={{
                          background: isSendDisabled ? 'rgba(255,255,255,0.35)' : '#fff',
                          color: isSendDisabled ? 'rgba(255,255,255,0.75)' : '#931b1b',
                          fontWeight: 700,
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: 'none',
                          cursor: isSendDisabled ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          boxShadow: isSendDisabled ? 'none' : '0 2px 6px rgba(0,0,0,0.1)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {otpSending ? 'Sending…' : otpCooldown > 0 ? `Resend (${otpCooldown}s)` : otpSent ? 'Resend' : 'Send'}
                      </button>
                    </div>
                    {showSignupEmailError && (
                      <div style={{ color: '#fed7d7', fontSize: 11.5, marginTop: 2, lineHeight: 1.35 }}>
                        Please use your official TUP email address ending in @tup.edu.ph.
                      </div>
                    )}
                    {otpSent && (
                      <div style={{ color: '#c6f6d5', fontSize: 11.5, marginTop: 2, fontWeight: 600 }}>
                        Verification code sent. Check your TUP email.
                      </div>
                    )}
                  </div>

                  {/* 5. Verification Code (OTP) Field — DIRECTLY BENEATH EMAIL */}
                  {otpSent && (
                    <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-otp" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Verification Code</label>
                      <input
                        id="signup-otp"
                        className="input"
                        style={authInputStyle}
                        type="text"
                        placeholder="Enter 6-digit code from email"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        autoComplete="one-time-code"
                      />
                    </div>
                  )}

                  {/* 6. Password with Eye Toggle */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-password" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Password</label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        id="signup-password"
                        className="input"
                        style={{ ...authInputStyle, paddingRight: 40 }}
                        type={showSignupPass ? 'text' : 'password'}
                        placeholder="At least 6 characters"
                        value={signupData.password}
                        onChange={(e) => setSignupData((p) => ({ ...p, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        aria-label={showSignupPass ? 'Hide password' : 'Show password'}
                        onClick={() => setShowSignupPass(!showSignupPass)}
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
                        {showSignupPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* 7. Confirm Password with Eye Toggle */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-confirm-password" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Confirm Password</label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        id="signup-confirm-password"
                        className="input"
                        style={{ ...authInputStyle, paddingRight: 40 }}
                        type={showConfirmPass ? 'text' : 'password'}
                        placeholder="Re-type password"
                        value={signupData.confirmPassword}
                        onChange={(e) => setSignupData((p) => ({ ...p, confirmPassword: e.target.value }))}
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
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
                        {showConfirmPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                    {signupData.password && signupData.confirmPassword && !passwordsMatch && (
                      <div style={{ color: '#fed7d7', fontSize: 11.5, marginTop: 2 }}>
                        Passwords do not match.
                      </div>
                    )}
                  </div>

                  <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button
                      type="submit"
                      className="btn"
                      disabled={isSignupDisabled}
                      style={{
                        width: '100%',
                        background: isSignupDisabled ? 'rgba(255,255,255,0.35)' : '#fff',
                        color: isSignupDisabled ? 'rgba(255,255,255,0.75)' : '#931b1b',
                        fontWeight: 700,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: isSignupDisabled ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        boxShadow: isSignupDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.08)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {loading ? 'Creating Account…' : 'Create Account'}
                    </button>
                  </div>

                  <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setMsg('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        fontWeight: 700,
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 13,
                      }}
                    >
                      Log in
                    </button>
                  </div>
                </>
              )}

              {/* ========================================================= */}
              {/* 2. FORGOT PASSWORD VIEW (USER SURFACE ONLY)               */}
              {/* ========================================================= */}
              {IS_USER_SURFACE && authMode === 'forgot' && (
                <>
                  <h2
                    id="login-title"
                    style={{
                      textAlign: 'center',
                      margin: '0 0 12px 0',
                      fontSize: 24,
                      fontWeight: 800,
                      fontFamily: `"Merriweather", serif`,
                    }}
                  >
                    Reset Password
                  </h2>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', textAlign: 'center', margin: '0 0 16px 0', lineHeight: 1.45 }}>
                    Enter your official TUP email address to receive password recovery instructions.
                  </p>

                  <div className="field" style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="forgot-email" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>TUP Email</label>
                    <input
                      id="forgot-email"
                      className="input"
                      style={authInputStyle}
                      type="email"
                      placeholder="student@tup.edu.ph"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                    {forgotEmail.length > 0 && !isValidTupEmail(forgotEmail) && (
                      <div style={{ color: '#fed7d7', fontSize: 11.5, marginTop: 2 }}>
                        Please use your official TUP email address ending in @tup.edu.ph.
                      </div>
                    )}
                  </div>

                  <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button
                      type="submit"
                      className="btn"
                      disabled={isForgotDisabled}
                      style={{
                        width: '100%',
                        background: isForgotDisabled ? 'rgba(255,255,255,0.35)' : '#fff',
                        color: isForgotDisabled ? 'rgba(255,255,255,0.75)' : '#931b1b',
                        fontWeight: 700,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: isForgotDisabled ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        boxShadow: isForgotDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.08)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {forgotLoading ? 'Sending Instructions…' : 'Send Reset Instructions'}
                    </button>
                  </div>

                  <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
                    Remember your password?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setMsg('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        fontWeight: 700,
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 13,
                      }}
                    >
                      Log in
                    </button>
                  </div>
                </>
              )}

              {/* ========================================================= */}
              {/* 3. LOGIN VIEW (DEFAULT FOR USER & ALWAYS FOR STAFF)       */}
              {/* ========================================================= */}
              {authMode === 'login' && (
                <>
                  <h2
                    id="login-title"
                    style={{
                      textAlign: 'center',
                      margin: '0 0 16px 0',
                      fontSize: 26,
                      fontWeight: 800,
                      fontFamily: `"Merriweather", serif`,
                    }}
                  >
                    {IS_USER_SURFACE ? 'Patient Log In' : 'Staff Log In'}
                  </h2>

                  {/* Email Field */}
                  <div className="field" style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="email" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Email</label>
                    <input
                      id="email"
                      className="input"
                      type="email"
                      placeholder={IS_USER_SURFACE ? 'you@tup.edu.ph' : 'staff@tupclinic.local'}
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={authInputStyle}
                    />
                  </div>

                  {/* Password Header with Forgot Password above input (User Surface) */}
                  <div className="field" style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label htmlFor="password" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Password</label>
                      {IS_USER_SURFACE && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('forgot');
                            setForgotEmail(email);
                            setMsg('');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.92)',
                            fontSize: 12,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            padding: 0,
                          }}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    {/* Password input with embedded Eye toggle */}
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        id="password"
                        className="input"
                        type={showLoginPass ? 'text' : 'password'}
                        placeholder="Password"
                        autoComplete="current-password"
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
                        style={{ ...authInputStyle, paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        aria-label={showLoginPass ? 'Hide password' : 'Show password'}
                        onClick={() => setShowLoginPass(!showLoginPass)}
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
                        {showLoginPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 }}>
                    <button
                      id="loginBtn"
                      type="submit"
                      className="btn"
                      disabled={isLoginDisabled}
                      style={{
                        width: '100%',
                        background: isLoginDisabled ? 'rgba(255,255,255,0.35)' : '#fff',
                        color: isLoginDisabled ? 'rgba(255,255,255,0.75)' : '#931b1b',
                        fontWeight: 700,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: isLoginDisabled ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        boxShadow: isLoginDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.08)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {loading ? 'Signing in…' : 'Log In'}
                    </button>
                  </div>

                  {/* Create Account Link (User Surface Only) */}
                  {IS_USER_SURFACE && (
                    <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
                      Don't have an account?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('signup');
                          setMsg('');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 13,
                        }}
                      >
                        Create one
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="footer-note" style={{ marginTop: 16, color: 'rgba(255,255,255,0.92)', textAlign: 'center', fontSize: 12.5 }}>
                © Technological University of the Philippines
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Global Message Modal Dialog */}
      {msgOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3200,
            padding: 14,
          }}
          onClick={() => setMsgOpen(false)}
        >
          <div
            style={{
              width: 'min(92vw, 520px)',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 18px 38px rgba(0,0,0,0.18)',
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#111' }}>Notice</div>
            <div
              style={{
                color:
                  msg.toLowerCase().includes('failed') ||
                  msg.toLowerCase().includes('invalid') ||
                  msg.toLowerCase().includes('incorrect') ||
                  msg.toLowerCase().includes('error') ||
                  msg.toLowerCase().includes('deactivated') ||
                  msg.toLowerCase().includes('not allowed')
                    ? 'var(--danger)'
                    : '#111',
                lineHeight: 1.45,
                fontSize: 14,
              }}
            >
              {msg}
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setMsgOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Login;

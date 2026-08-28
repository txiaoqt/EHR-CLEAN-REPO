// src/pages/Login.jsx
import React, { useState } from 'react';
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
import bg1Image from '../assets/images/bg1.jpg';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

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
    patient_id: 'TEST-USER-0001',
  },
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, fetchUserProfile } = useAuth();
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const [msgOpen, setMsgOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupMode, setSignupMode] = useState(false);
  const [signupData, setSignupData] = useState({
    studentId: '',
    fullName: '',
    year: '1',
    email: '',
    password: '',
    confirmPassword: '',
  });

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
      } catch (_) {
        // Continue if RPC is not deployed yet
      }

      // 1. Authenticate with Supabase Auth (validates password securely)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: pass,
      });

      if (authError) {
        console.warn('Authentication error:', authError.message);
        // Track failed attempt via security lockout RPC if available
        try {
          const { data: lockData } = await supabase.rpc('register_failed_login', {
            p_email: normalizedEmail,
            p_lock_after: MAX_FAILED_ATTEMPTS,
            p_lock_minutes: LOCKOUT_MINUTES
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

      // 2. Load user profile from public.users via fetchUserProfile
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
          await supabase
            .from('users')
            .update({ failed_login_attempts: 0, locked_until: null, last_failed_login_at: null, last_login_at: new Date().toISOString() })
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

  const handlePatientSignup = async () => {
    const payload = {
      studentId: signupData.studentId.trim(),
      fullName: signupData.fullName.trim(),
      year: Number(signupData.year || 1),
      email: signupData.email.trim().toLowerCase(),
      password: signupData.password,
      confirmPassword: signupData.confirmPassword,
    };

    if (!payload.studentId || !payload.fullName || !payload.email || !payload.password) {
      setMsg('Please fill in all required fields.');
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

    setLoading(true);
    setMsg('');
    try {
      // 1. Sign up with Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: {
            name: payload.fullName,
            role: 'patient',
            patient_id: payload.studentId,
          }
        }
      });
      if (authErr) throw authErr;

      const authUserId = authData?.user?.id;

      // 2. Ensure student & patient records exist
      const { error: studentErr } = await supabase
        .from('students')
        .upsert([{ id: payload.studentId, name: payload.fullName, year: payload.year }], { onConflict: 'id' });
      if (studentErr) console.warn('Student record error:', studentErr);

      const { error: patientErr } = await supabase
        .from('patients')
        .upsert([{ id: payload.studentId, name: payload.fullName, year: payload.year }], { onConflict: 'id' });
      if (patientErr) console.warn('Patient record error:', patientErr);

      // 3. Upsert public.users profile
      const { error: userErr } = await supabase
        .from('users')
        .upsert([{
          auth_user_id: authUserId,
          name: payload.fullName,
          email: payload.email,
          role: 'patient',
          active: true,
          patient_id: payload.studentId,
        }], { onConflict: 'email' });
      if (userErr) console.warn('Public user profile sync error:', userErr);

      setMsg('Account created successfully! You can now log in.');
      setSignupMode(false);
      setEmail(payload.email);
      setPass('');
    } catch (e) {
      console.error(e);
      setMsg(`Sign-up failed: ${e.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  React.useEffect(() => {
    const sessionMessage = location?.state?.sessionMessage;
    if (sessionMessage) setMsg(sessionMessage);
  }, [location]);

  React.useEffect(() => {
    if (msg) setMsgOpen(true);
  }, [msg]);

  React.useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.04)',
  };

  const tabBaseStyle = {
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    padding: '8px 16px',
    cursor: 'pointer',
    minWidth: 92,
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
      <div id="login-screen" style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
        {/* Two-column layout with balanced spacing */}
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
                  <h1 style={{
                    margin: 0,
                    fontSize: isTablet ? 26 : 32,
                    lineHeight: 1.15,
                    fontWeight: 900,
                    fontFamily: `"Merriweather", serif`,
                    color: '#111',
                    letterSpacing: '-0.4px',
                  }}>
                    TUP Manila Clinic Online Patient Portal
                  </h1>
                ) : (
                <h1 style={{
                  margin: 0,
                  fontSize: isTablet ? 26 : 32,
                  lineHeight: 1.15,
                  fontWeight: 900,
                  fontFamily: `"Merriweather", serif`,
                  color: '#111',
                  letterSpacing: '-0.4px',
                }}>
                  Technological University of the
                  <br />
                  Philippines (TUP) Manila – Clinic
                </h1>
                )}
              </div>
            </div>

            <p className="lead" style={{
              marginTop: 20,
              color: 'rgba(51,51,51,1)',
              maxWidth: 680,
              fontSize: isTablet ? 14.5 : 16,
              lineHeight: 1.8,
              fontWeight: 400,
              opacity: 0.95,
              textAlign: 'left'
            }}>
              {IS_USER_SURFACE ? (
                'The TUP Manila Clinic Online Patient Portal helps students, faculty, staff, and authorized TUP personnel access clinic services online. Users can book same-day or future appointments, view clinic visit history, and send non-emergency messages to doctors or clinic staff. The portal is built to make clinic coordination faster, easier, and more convenient for the whole TUP community.'
              ) : (`
              TUP-M Electronic Health Records System is a streamlined, modern electronic health
              record platform designed to support efficient, accurate, and student-centered
              clinical care. It centralizes patient information, simplifies consultation
              documentation, improves workflow for clinicians, and ensures secure, role-based
              access to medical records — all tailored to the needs of the Technological
              University of the Philippines community.
              `)}
            </p>

            <div
              className="tagline"
              style={{
                marginTop: 20,
                fontStyle: 'italic',
                color: '#444',
                fontSize: 14.5,
                textAlign: 'left',
                width: '100%'
              }}
            >
              “Where records don’t get lost—just students.”
            </div>

          </div>

          {/* LOGIN (right) */}
          <div
            className="login-wrap"
            aria-hidden="false"
            style={{
              flexShrink: 0,
              width: isTablet ? 380 : 420,
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
                if (signupMode && IS_USER_SURFACE) handlePatientSignup();
                else handleLogin();
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
              <h2 id="login-title" style={{
                textAlign: 'center',
                margin: '0 0 16px 0',
                fontSize: 26,
                fontWeight: 800,
                fontFamily: `"Merriweather", serif`
              }}>{IS_USER_SURFACE ? (signupMode ? 'Create Account' : 'Patient Log In') : 'Staff Log In'}</h2>

              {IS_USER_SURFACE && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setSignupMode(false)}
                    disabled={loading}
                    style={{
                      ...tabBaseStyle,
                      background: signupMode ? 'rgba(255,255,255,0.12)' : '#fff',
                      color: signupMode ? '#fce8e8' : '#931b1b',
                    }}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignupMode(true)}
                    disabled={loading}
                    style={{
                      ...tabBaseStyle,
                      background: signupMode ? '#fff' : 'rgba(255,255,255,0.12)',
                      color: signupMode ? '#931b1b' : '#fce8e8',
                    }}
                  >
                    Sign Up
                  </button>
                </div>
              )}

              {signupMode && IS_USER_SURFACE ? (
                <>
                  <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Student ID</label>
                    <input className="input" style={authInputStyle} value={signupData.studentId} onChange={(e) => setSignupData((p) => ({ ...p, studentId: e.target.value }))} />
                  </div>
                  <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Full Name</label>
                    <input className="input" style={authInputStyle} value={signupData.fullName} onChange={(e) => setSignupData((p) => ({ ...p, fullName: e.target.value }))} />
                  </div>
                  <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Year</label>
                    <input className="input" style={authInputStyle} type="number" min="1" max="5" value={signupData.year} onChange={(e) => setSignupData((p) => ({ ...p, year: e.target.value }))} />
                  </div>
                  <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Email</label>
                    <input className="input" style={authInputStyle} type="email" value={signupData.email} onChange={(e) => setSignupData((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Password</label>
                    <input className="input" style={authInputStyle} type="password" value={signupData.password} onChange={(e) => setSignupData((p) => ({ ...p, password: e.target.value }))} />
                  </div>
                  <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Confirm Password</label>
                    <input className="input" style={authInputStyle} type="password" value={signupData.confirmPassword} onChange={(e) => setSignupData((p) => ({ ...p, confirmPassword: e.target.value }))} />
                  </div>
                  <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button type="submit" className="btn" disabled={loading}>
                      {loading ? 'Creating…' : 'Create Account'}
                    </button>
                  </div>
                </>
              ) : (
                <>

              <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="email" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  placeholder="you@tup.edu.ph"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    ...authInputStyle,
                  }}
                />
              </div>

              <div className="field" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="password" style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  style={{
                    ...authInputStyle,
                  }}
                />
              </div>

              <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button
                  id="loginBtn"
                  type="submit"
                  className="btn"
                  disabled={loading}
                  style={{
                    background: '#fff',
                    color: '#931b1b',
                    fontWeight: 700,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 6px 14px rgba(0,0,0,0.08)',
                    fontSize: 14
                  }}
                >
                  {loading ? 'Signing in…' : 'Log In'}
                </button>
              </div>
                </>
              )}

              

              <div className="footer-note" style={{ marginTop: 14, color: 'rgba(255,255,255,0.92)', textAlign: 'center', fontSize: 12.5 }}>
                © Technological University of the Philippines
              </div>
            </form>
          </div>
        </div>
      </div>
      {msgOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3200, padding: 14 }}
          onClick={() => setMsgOpen(false)}
        >
          <div
            style={{ width: 'min(92vw, 520px)', background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 18px 38px rgba(0,0,0,0.18)', padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#111' }}>Login Notice</div>
            <div style={{ color: msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('invalid') ? 'var(--danger)' : '#111', lineHeight: 1.45 }}>{msg}</div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setMsgOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Login;

// src/pages/Login.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import {
  IS_ADMIN_SURFACE,
  isRoleCompatibleWithSurface,
  IS_USER_SURFACE,
  IS_DENTAL_SURFACE,
  accountTableForRole,
  isUserSurfaceRole,
  surfaceHomeForRole,
} from '../deploySurface.js';
import { useAuth } from '../AuthContext.jsx';
import { logAudit } from '../utils.js';
import { composeFullName, toProperName } from '../utils/nameFormat.js';
import PasswordRequirements from '../components/PasswordRequirements.jsx';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, createTemporaryPassword } from '../utils/passwordPolicy.js';
import {
  getClinicHoursMessage,
  getLockoutMessage,
  isWithinClinicHours,
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
} from './loginSecurity.js';
import { EyeIcon, EyeOffIcon } from '../components/icons/Icons.jsx';
import VerificationCodeField from '../components/VerificationCodeField.jsx';
import { PolicyLinks } from '../components/PolicyAgreement.jsx';
import SignupPolicyConsent from '../components/SignupPolicyConsent.jsx';
import useAppPolicy from '../hooks/useAppPolicy.js';
import bg1Image from '../assets/images/bg1.jpg';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';
import {
  ALLOWED_USER_EMAIL_DOMAIN,
  STUDENT_ID_REGEX,
  isValidTupEmail,
  isValidStudentId,
} from '../utils/authValidation.js';

export { ALLOWED_USER_EMAIL_DOMAIN, STUDENT_ID_REGEX, isValidTupEmail, isValidStudentId };


// Degree programmes offered by TUP Manila, grouped by the six colleges the
// University names on its own Academics page.
//
// The list is taken from TUP's admission requirements page
// (ers.tup.edu.ph/aims/applicants/admissionrequirements.php), which sets out the
// programmes college by college, cross-checked against the University's
// estimated-tuition table and its Academics page. The previous list held eight
// programmes from the College of Science alone, so a student from Engineering or
// Industrial Technology could not state their own course.
//
// Grouped with <optgroup> because there are around forty entries — a flat list
// is unusable in a dropdown. The stored value stays the programme name alone, so
// it reads correctly on the Medical Log's DEPT./COURSE column and matches the
// rows already recorded.
const SIGNUP_COURSES = [
  {
    college: 'College of Engineering',
    programs: [
      'BS Civil Engineering',
      'BS Electrical Engineering',
      'BS Electronics Engineering',
      'BS Mechanical Engineering',
    ],
  },
  {
    college: 'College of Science',
    programs: [
      'BS Computer Science',
      'BS Information Technology',
      'BS Information Systems',
      'BS Environmental Science',
      'BS Applied Science major in Laboratory Technology',
    ],
  },
  {
    college: 'College of Industrial Technology',
    programs: [
      'Bachelor of Engineering Technology major in Computer Engineering Technology',
      'Bachelor of Engineering Technology major in Civil Technology',
      'Bachelor of Engineering Technology major in Electrical Technology',
      'Bachelor of Engineering Technology major in Electronics Technology',
      'Bachelor of Engineering Technology major in Electronics and Communications Technology',
      'Bachelor of Engineering Technology major in Instrumentation and Control Technology',
      'Bachelor of Engineering Technology major in Mechanical Technology',
      'Bachelor of Engineering Technology major in Mechatronics Technology',
      'Bachelor of Engineering Technology major in Railway Technology',
      'Bachelor of Engineering Technology major in Mechanical Engineering Technology option in Automotive Technology',
      'Bachelor of Engineering Technology major in Mechanical Engineering Technology option in Foundry Technology',
      'BS Food Technology',
    ],
  },
  {
    college: 'College of Industrial Education',
    programs: [
      'Bachelor of Technical Teacher Education',
      'Bachelor of Technical Vocational Teacher Education',
      'BS Industrial Education major in Art Education',
      'BS Industrial Education major in Computer Education',
      'BS Industrial Education major in Electrical Technology',
      'BS Industrial Education major in Electronics Technology',
      'BS Industrial Education major in Home Economics',
      'BS Industrial Education major in Industrial Arts',
    ],
  },
  {
    college: 'College of Architecture and Fine Arts',
    programs: [
      'BS Architecture',
      'BS Graphics Technology',
      'BS Product Design and Development Technology',
      'Bachelor of Fine Arts',
    ],
  },
  {
    college: 'College of Liberal Arts',
    programs: [
      'BS Entrepreneurial Management',
      'Bachelor of Arts in Management major in Industrial Management',
    ],
  },
];

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout, fetchUserProfile, isPasswordRecoverySession, setRegistrationInProgress } = useAuth();
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));

  // Authentication Mode: 'login' | 'signup' | 'forgot'
  const [authMode, setAuthMode] = useState('login');
  const signupPolicy = useAppPolicy({ enabled: IS_USER_SURFACE && authMode === 'signup' });
  const [signupAgreement, setSignupAgreement] = useState(null);
  const signupPolicyAgreed = Boolean(
    signupPolicy.ready && signupAgreement?.version === signupPolicy.policy?.version &&
    signupAgreement?.accepted_terms && signupAgreement?.accepted_privacy
  );

  // Email whose code was verified but whose registration has not finished. The
  // verified session is kept so a rejected submission can be corrected and sent
  // again without a new code; leaving sign-up must not leave it signed in.
  const verifiedSignupRef = useRef(null);

  useEffect(() => {
    setRegistrationInProgress(IS_USER_SURFACE && authMode === 'signup');
    if (authMode !== 'signup') setSignupAgreement(null);
    return () => {
      setRegistrationInProgress(false);
      if (verifiedSignupRef.current) {
        verifiedSignupRef.current = null;
        logout({ scope: 'local' });
      }
    };
  }, [authMode, setRegistrationInProgress, logout]);

  // Login State
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Sign-up State
  const [signupData, setSignupData] = useState({
    studentId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dateOfBirth: '',
    year: '1',
    sex: '',
    course: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Enrollee sign-up state, kept separate from signupData.
  //
  // An enrollee has no student id, no year, and no TUP email — sharing one
  // object would mean every field needs a branch and the patient path would have
  // to tolerate enrollee blanks. Two shapes are clearer than one that is half
  // valid at any moment.
  const [enrolleeData, setEnrolleeData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dateOfBirth: '',
    applicantId: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  // Which sign-up the visitor is completing. Defaults to the enrolled student
  // path, since that is the one that already existed.
  const [signupKind, setSignupKind] = useState('student');

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

  const requireSignupPolicy = async () => {
    if (!signupPolicyAgreed) {
      setMsg('Please review and agree to both policies before creating an account.');
      return false;
    }
    // An open form must not submit acceptance of an outdated policy version.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await supabase.rpc('get_active_app_policy').abortSignal(controller.signal);
      if (error || data?.version !== signupAgreement.version) throw new Error('Policies changed or are unavailable.');
      return true;
    } catch {
      setSignupAgreement(null);
      signupPolicy.refresh();
      setMsg('Please review the current policies before continuing.');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  // Returns the verified Auth user for `email`, or null when the code is wrong.
  // A session this form already verified is reused, because a code works once.
  const verifySignupCode = async (email) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (verifiedSignupRef.current === email && session?.user?.email?.toLowerCase() === email) {
      return session.user;
    }
    const token = otpCode.trim();
    let { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) ({ data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' }));
    if (error) {
      console.warn('OTP verification error:', error.message);
      return null;
    }
    verifiedSignupRef.current = email;
    return data?.user || (await supabase.auth.getUser())?.data?.user || null;
  };

  const endVerifiedSignup = async () => {
    verifiedSignupRef.current = null;
    await logout({ scope: 'local' });
  };

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
        setMsg(
          profile.elevated
            ? `This enrollee account has been elevated to an enrolled student account. Please sign in with your official TUP email${profile.tup_email ? ` (${profile.tup_email})` : ''}.`
            : profile.access_message || 'Your account has been deactivated. Please contact an administrator.'
        );
        await supabase.auth.signOut();
        return;
      }

      const userRole = (profile.role || '').toLowerCase();

      // Both audiences of this portal: an enrolled student, and an applicant who
      // has signed up but not yet been elevated. The rule lives in deploySurface.js.
      const userSurfaceRole = isUserSurfaceRole(userRole);

      // Surface compatibility check
      if (!isRoleCompatibleWithSurface(userRole)) {
        setMsg('This account belongs to a different portal. Please use the correct sign-in page.');
        await supabase.auth.signOut();
        return;
      }
      if (IS_USER_SURFACE && !userSurfaceRole) {
        setMsg('Only student accounts can log in on this portal.');
        await supabase.auth.signOut();
        return;
      }

      // 3. Clear failed login lockout counters on success
      try {
        await supabase.rpc('clear_login_lockout', { p_email: normalizedEmail, p_touch_last_login: true });
      } catch (_) {
        try {
          const targetTable = accountTableForRole(userRole);
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
      if (profile.staff_setup_required) {
        navigate('/staff/setup');
        return;
      }
      // An enrollee has their own three-page portal, so sending them to
      // /dashboard put an applicant on the staff dashboard.
      navigate(
        userRole === 'enrollee'
          ? '/enrollee/home'
          : userRole === 'patient'
            ? '/patient/dashboard'
            : '/dashboard'
      );
    } catch (e) {
      console.error('Login error:', e);
      setMsg('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!await requireSignupPolicy()) return;
    const targetEmail = signupData.email.trim().toLowerCase();
    const studentId = signupData.studentId.trim().toUpperCase();

    if (!targetEmail) {
      setMsg('Please enter your official TUP email address.');
      return;
    }
    if (!isValidTupEmail(targetEmail)) {
      setMsg('Please use your official TUP email address ending in @tup.edu.ph.');
      return;
    }
    // Required here: the account is provisioned under this ID when the code is
    // sent, so a blank or different ID would not match the one registered.
    if (!isValidStudentId(studentId)) {
      setMsg('Please enter a valid Student ID in format TUPM-YY-XXXX (e.g. TUPM-XX-XXXX).');
      return;
    }
    if (otpSending || otpCooldown > 0) return;

    setOtpSending(true);
    setMsg('');
    const GENERIC_ELIGIBILITY_MSG =
      'If the provided information is eligible for registration, you will receive a verification code by email.';

    try {
      // 1. Sign up with Supabase Auth to trigger OTP verification email (State 1: New Account)
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: targetEmail,
        password: createTemporaryPassword(),
        options: {
          data: {
            name: composeFullName({
              firstName: signupData.firstName,
              middleName: signupData.middleName,
              lastName: signupData.lastName,
            }) || 'Patient',
            role: 'patient',
            policy_agreement: signupAgreement,
            patient_id: studentId,
          },
        },
      });

      if (authErr) {
        const errMsg = (authErr.message || '').toLowerCase();

        // Safe rate limit handling
        if (errMsg.includes('rate limit') || errMsg.includes('too many') || authErr.status === 429) {
          setMsg('Too many requests. Please wait a moment before trying again.');
          setOtpSending(false);
          return;
        }

        // State 2 & 3: Account already exists in Auth
        if (
          errMsg.includes('already registered') ||
          errMsg.includes('already exists') ||
          errMsg.includes('user already registered')
        ) {
          // Attempt resend for unverified account (State 2: Existing Unverified)
          const { error: resendErr } = await supabase.auth.resend({
            type: 'signup',
            email: targetEmail,
          });

          if (resendErr) {
            const resendMsg = (resendErr.message || '').toLowerCase();
            if (resendMsg.includes('rate limit') || resendMsg.includes('too many') || resendErr.status === 429) {
              setMsg('Too many requests. Please wait a moment before trying again.');
              setOtpSending(false);
              return;
            }
            // If already confirmed (State 3: Existing Verified), do not expose error;
            // return the identical generic eligibility response.
          }

          // Return identical outward state and generic message
          setOtpSent(true);
          setOtpEmail(targetEmail);
          setOtpCooldown(60);
          setMsg(GENERIC_ELIGIBILITY_MSG);
          return;
        }

        // Other unexpected errors
        throw authErr;
      }

      // State 1: New Account created & OTP dispatched
      setOtpSent(true);
      setOtpEmail(targetEmail);
      setOtpCooldown(60);
      setMsg(GENERIC_ELIGIBILITY_MSG);
    } catch (err) {
      console.error('Send OTP error:', err);
      const errStr = (err.message || '').toLowerCase();
      if (errStr.includes('rate limit') || errStr.includes('too many') || err?.status === 429) {
        setMsg('Too many requests. Please wait a moment before trying again.');
      } else {
        setMsg('Unable to process registration request. Please check your details and try again.');
      }
    } finally {
      setOtpSending(false);
    }
  };

  /**
   * Sends the verification code to an enrollee's personal address.
   *
   * Mirrors handleSendOtp, including the anti-enumeration behaviour: a brand new
   * account, an existing unverified one and an already-confirmed one all produce
   * the same outward state and the same message, so this cannot be used to probe
   * which addresses are registered.
   *
   * Two deliberate differences from the student path:
   *   - The address is NOT required to be @tup.edu.ph. That requirement is the
   *     whole reason enrollees need their own route.
   *   - The auth metadata carries role: 'enrollee'. sync_public_user_from_auth
   *     routes 'admin'/'physician'/'nurse' to admins and 'patient' or any
   *     @tup.edu.ph address to users, then skips anything else — so this creates
   *     no patient row, which is what keeps an applicant out of the patient
   *     directory until they are elevated.
   */
  const handleEnrolleeSendOtp = async () => {
    if (!await requireSignupPolicy()) return;
    const targetEmail = enrolleeData.email.trim().toLowerCase();
    const firstName = enrolleeData.firstName.trim();
    const lastName = enrolleeData.lastName.trim();

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setMsg('Please enter a valid email address.');
      return;
    }
    // An enrollee holds a personal address. A TUP address already has an account
    // and belongs on the other sign-in.
    if (targetEmail.endsWith('@tup.edu.ph')) {
      setMsg('That is a TUP address. Please use the enrolled student sign-in instead.');
      return;
    }
    if (!firstName || !lastName) {
      setMsg('Please enter your first name and surname.');
      return;
    }
    // Checked here so the applicant is told before a code is mailed, rather than
    // after. The RPC enforces it again — a form check is a courtesy, not a rule.
    if (!enrolleeData.applicantId.trim()) {
      setMsg('Please enter your Applicant ID.');
      return;
    }
    if (!enrolleeData.dateOfBirth) {
      setMsg('Please enter your date of birth.');
      return;
    }
    if (otpSending || otpCooldown > 0) return;

    setOtpSending(true);
    setMsg('');
    const GENERIC_ELIGIBILITY_MSG =
      'If the provided information is eligible for registration, you will receive a verification code by email.';

    try {
      // A throwaway password, because Supabase's signUp refuses to create an
      // account without one — and asking the applicant for a password before
      // their address is verified is the wrong order. Nobody knows this value,
      // so the account cannot be signed into until the applicant replaces it
      // with their own after verifying (see handleEnrolleeSignup). If they never
      // finish, the account stays unreachable rather than half-open.
      const placeholderPassword = createTemporaryPassword();

      const { error: authErr } = await supabase.auth.signUp({
        email: targetEmail,
        password: placeholderPassword,
        options: {
          data: {
            name: composeFullName({
              firstName,
              middleName: enrolleeData.middleName,
              lastName,
            }) || 'Enrollee',
            role: 'enrollee',
            policy_agreement: signupAgreement,
            first_name: firstName,
            middle_name: enrolleeData.middleName.trim() || null,
            surname: lastName,
            suffix: enrolleeData.suffix.trim() || null,
            date_of_birth: enrolleeData.dateOfBirth,
            applicant_id: enrolleeData.applicantId.trim().toUpperCase(),
          },
        },
      });

      if (authErr) {
        const errMsg = (authErr.message || '').toLowerCase();
        if (errMsg.includes('rate limit') || errMsg.includes('too many') || authErr.status === 429) {
          setMsg('Too many requests. Please wait a moment before trying again.');
          setOtpSending(false);
          return;
        }
        if (
          errMsg.includes('already registered') ||
          errMsg.includes('already exists') ||
          errMsg.includes('user already registered')
        ) {
          // Same handling as the student path: try a resend for an unverified
          // account, and either way return the identical generic response.
          const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: targetEmail });
          if (resendErr) {
            const resendMsg = (resendErr.message || '').toLowerCase();
            if (resendMsg.includes('rate limit') || resendMsg.includes('too many') || resendErr.status === 429) {
              setMsg('Too many requests. Please wait a moment before trying again.');
              setOtpSending(false);
              return;
            }
          }
          setOtpSent(true);
          setOtpEmail(targetEmail);
          setOtpCooldown(60);
          setMsg(GENERIC_ELIGIBILITY_MSG);
          return;
        }
        throw authErr;
      }

      setOtpSent(true);
      setOtpEmail(targetEmail);
      setOtpCooldown(60);
      setMsg(GENERIC_ELIGIBILITY_MSG);
    } catch (err) {
      console.error('Enrollee send OTP error:', err);
      const errStr = (err.message || '').toLowerCase();
      if (errStr.includes('rate limit') || errStr.includes('too many') || err?.status === 429) {
        setMsg('Too many requests. Please wait a moment before trying again.');
      } else {
        setMsg('Unable to process registration request. Please check your details and try again.');
      }
    } finally {
      setOtpSending(false);
    }
  };

  /**
   * Confirms the code and writes the enrollee record.
   *
   * The RPC checks email_confirmed_at, so a code that was never confirmed cannot
   * produce a record even if this is reached some other way.
   */
  const handleEnrolleeSignup = async () => {
    if (!await requireSignupPolicy()) return;
    const email = enrolleeData.email.trim().toLowerCase();

    // The password is chosen here, after the code was sent, so it is validated
    // here rather than before the address was ever contacted.
    if (!isPasswordValid(enrolleeData.password)) {
      setMsg(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (enrolleeData.password !== enrolleeData.confirmPassword) {
      setMsg('The two passwords do not match.');
      return;
    }

    setLoading(true);
    setMsg('');
    try {
      const verifiedUser = await verifySignupCode(email);
      if (!verifiedUser) {
        setMsg('The verification code is incorrect or has expired. Please try again.');
        setLoading(false);
        return;
      }

      const verifiedRole = (verifiedUser?.user_metadata?.role || '').toLowerCase();
      if (verifiedRole && verifiedRole !== 'enrollee') {
        // The code signed in an existing account; it must not stay signed in.
        await endVerifiedSignup();
        setMsg('This email is already linked to another account. Please sign in with that account.');
        setLoading(false);
        return;
      }

      // The address is verified, so the applicant's own password can replace the
      // placeholder now. Done before the record is written: an account with the
      // wrong password and a completed record would be worse than neither.
      const { error: passwordErr } = await supabase.auth.updateUser({
        password: enrolleeData.password,
        data: {
          name: composeFullName({
            firstName: enrolleeData.firstName,
            middleName: enrolleeData.middleName,
            lastName: enrolleeData.lastName,
          }) || 'Enrollee',
          role: verifiedRole || 'enrollee',
          first_name: enrolleeData.firstName.trim(),
          middle_name: enrolleeData.middleName.trim() || null,
          surname: enrolleeData.lastName.trim(),
          suffix: enrolleeData.suffix.trim() || null,
          date_of_birth: enrolleeData.dateOfBirth,
          applicant_id: enrolleeData.applicantId.trim().toUpperCase(),
        },
      });
      if (passwordErr) {
        console.warn('Could not set the enrollee password:', passwordErr.message);
        setMsg('Your password could not be saved. Please try again.');
        setLoading(false);
        return;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('complete_enrollee_registration', {
        p_first_name: enrolleeData.firstName.trim(),
        p_middle_name: enrolleeData.middleName.trim() || null,
        p_surname: enrolleeData.lastName.trim(),
        p_suffix: enrolleeData.suffix.trim() || null,
        p_date_of_birth: enrolleeData.dateOfBirth || null,
        // Sent as-is: the RPC rejects a blank one rather than storing null, so
        // the rule lives in the database instead of only in this form.
        p_applicant_id: enrolleeData.applicantId.trim(),
      });

      if (rpcErr || !rpcData?.success) {
        setMsg(rpcData?.error || 'Unable to complete registration. Please check your information and try again.');
        setLoading(false);
        return;
      }

      // Verification is a temporary signup session, not the first portal login.
      await endVerifiedSignup();
      setEmail(email);
      setPass('');
      setMsg('Registration complete. Sign in to review and accept the portal policies.');
      setAuthMode('login');
    } catch (err) {
      console.error('Enrollee signup error:', err);
      setMsg('Unable to complete registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSignup = async () => {
    if (!await requireSignupPolicy()) return;
    // Composed from the PSA-style name parts and normalized before storing.
    const fullName = composeFullName({
      firstName: signupData.firstName,
      middleName: signupData.middleName,
      lastName: signupData.lastName,
      suffix: signupData.suffix,
    });

    const payload = {
      studentId: signupData.studentId.trim().toUpperCase(),
      fullName,
      year: Number(signupData.year || 1),
      dateOfBirth: signupData.dateOfBirth || null,
      sex: signupData.sex,
      course: signupData.course,
      email: signupData.email.trim().toLowerCase(),
      password: signupData.password,
      confirmPassword: signupData.confirmPassword,
      otp: otpCode.trim(),
    };

    if (!payload.studentId || !payload.fullName || !payload.email || !payload.password || !payload.confirmPassword) {
      setMsg('Please fill in all required fields.');
      return;
    }
    if (!payload.dateOfBirth) {
      setMsg('Please enter your date of birth.');
      return;
    }
    if (!payload.sex || !payload.course) {
      setMsg('Please select your sex and degree program.');
      return;
    }
    if (!isValidStudentId(payload.studentId)) {
      setMsg('Please enter a valid Student ID in format TUPM-YY-XXXX (e.g. TUPM-XX-XXXX).');
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
    if (!isPasswordValid(payload.password)) {
      setMsg(PASSWORD_POLICY_MESSAGE);
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
      if (!await verifySignupCode(payload.email)) {
        setMsg('The verification code is incorrect or has expired. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Execute atomic patient registration RPC (CREATE ONLY, NO OVERWRITE).
      // Runs before the password is set: until registration succeeds the
      // account keeps its unknown placeholder password, so a rejected
      // registration never leaves a working sign-in behind.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('complete_patient_registration', {
        p_student_id: payload.studentId,
        p_name: payload.fullName,
        p_year: payload.year,
        p_date_of_birth: payload.dateOfBirth,
      });

      if (rpcErr || !rpcData?.success) {
        if (rpcErr) console.warn('Patient registration error:', rpcErr.code, rpcErr.message);
        setMsg(rpcData?.error || 'Unable to complete registration. Please check your information or contact clinic support.');
        setLoading(false);
        return;
      }

      // Replace the random OTP-only password with the password chosen here.
      const { error: passwordError } = await supabase.auth.updateUser({ password: payload.password });
      if (passwordError) {
        setMsg(passwordError.message || 'Could not save your password. Please try again.');
        setLoading(false);
        return;
      }

      // Store the Medical Log demographics (SEX and DEPT./COURSE) on the profile
      // the RPC just created. Kept out of complete_patient_registration — a
      // 184-line SECURITY DEFINER function — so extending it cannot disturb the
      // anti-overwrite logic. The patient owns this row, so RLS permits it.
      const { error: profileErr } = await supabase
        .from('patient_profiles')
        .update({ sex: payload.sex || null, course: payload.course || null })
        .eq('patient_id', payload.studentId);
      if (profileErr) console.warn('Could not store sex/course on the patient profile:', profileErr.message);

      await endVerifiedSignup();
      setMsg('Account created and verified. Sign in to review and accept the portal policies.');
      setAuthMode('login');
      setEmail(payload.email);
      setPass('');
      setOtpSent(false);
      setOtpCode('');
      setSignupData({
        studentId: '',
        firstName: '',
        middleName: '',
        lastName: '',
        suffix: '',
        dateOfBirth: '',
        year: '1',
        sex: '',
        course: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
    } catch (e) {
      console.error('Registration error:', e);
      setMsg('Unable to complete registration. Please check your information or contact clinic support.');
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
      setMsg('Unable to send password reset email. Please try again.');
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

  // What Send still needs, in form order. The same list disables the button and
  // is shown beneath it, so a disabled Send always says why.
  const sendMissing = (signupKind === 'student'
    ? [!isStudentIdValid && 'a valid Student ID', !isSignupEmailValid && 'your TUP email']
    : [
        !enrolleeData.applicantId.trim() && 'your Applicant ID',
        (!enrolleeData.firstName.trim() || !enrolleeData.lastName.trim()) && 'your first and last name',
        !enrolleeData.dateOfBirth && 'your date of birth',
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enrolleeData.email) && 'a valid email',
      ]
  ).concat(!signupPolicyAgreed && 'agreement to both policies').filter(Boolean);
  const isSendDisabled = otpSending || otpCooldown > 0 || sendMissing.length > 0;
  const sendMissingHint = !otpSent && sendMissing.length > 0 && (
    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--font-size-xs)', marginTop: 2, lineHeight: 1.35 }}>
      To send the code, add {sendMissing.length > 1 ? `${sendMissing.slice(0, -1).join(', ')} and ${sendMissing.at(-1)}` : sendMissing[0]}.
    </div>
  );

  const passwordsMatch =
    signupData.password &&
    signupData.confirmPassword &&
    signupData.password === signupData.confirmPassword;

  const isSignupDisabled =
    loading ||
    !isStudentIdValid ||
    !signupData.firstName.trim() ||
    !signupData.lastName.trim() ||
    !signupData.year ||
    !signupData.sex ||
    !signupData.course ||
    !isSignupEmailValid ||
    !signupData.password ||
    !isPasswordValid(signupData.password) ||
    !passwordsMatch ||
    !otpSent ||
    !otpCode.trim();

  // The enrollee form asks for different things, so it needs its own rule. The
  // shared button used the student derivation, which meant it was permanently
  // disabled on the enrollee tab — every student field is empty there.
  const isEnrolleeSignupDisabled =
    loading ||
    !otpSent ||
    !otpCode.trim() ||
    !enrolleeData.password ||
    !isPasswordValid(enrolleeData.password) ||
    enrolleeData.password !== enrolleeData.confirmPassword;

  const submitDisabled = !signupPolicyAgreed || (signupKind === 'enrollee' ? isEnrolleeSignupDisabled : isSignupDisabled);

  const isForgotDisabled = forgotLoading || !isValidTupEmail(forgotEmail);

  // Responsive breakpoints
  const isMobile = vw < 600;
  const isTabletPortrait = vw >= 600 && vw < 900;
  const isTabletLandscape = vw >= 900 && vw < 1024;
  const isTablet = isTabletPortrait || isTabletLandscape;
  const isSingleColumn = vw < 900;

  const authInputStyle = {
    background: 'rgba(255,255,255,0.94)',
    border: 'none',
    padding: isMobile ? '10px 12px' : '11px 12px',
    borderRadius: isMobile ? 8 : 10,
    fontSize: 'var(--font-size-base)',
    color: '#111',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.04)',
  };

  // The form opens immediately. Agreement is requested inside the form, before
  // sending a code, because that action starts account creation with Auth.
  const signupConsent = (
    <SignupPolicyConsent policy={signupPolicy.policy} ready={signupPolicy.ready}
      checking={signupPolicy.checking} error={signupPolicy.error}
      checked={signupPolicyAgreed} busy={loading || otpSending}
      onRetry={signupPolicy.refresh} onChange={(checked) => {
        setSignupAgreement(checked && signupPolicy.ready ? {
          version: signupPolicy.policy.version,
          accepted_terms: true,
          accepted_privacy: true,
        } : null);
      }} />
  );

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
        backgroundAttachment: isMobile ? 'scroll' : 'fixed',
        backgroundColor: '#f6f7f8',
        filter: 'brightness(0.98)',
        fontFamily: `"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        position: 'relative',
        padding: isSingleColumn ? '20px 0' : 0,
      }}
    >
      {/* Outer shell */}
      <div
        id="login-screen"
        style={{
          width: '100%',
          minHeight: isSingleColumn ? 'auto' : '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* Two-column layout on desktop/tablet-landscape; single-column on mobile/tablet-portrait */}
        <div
          className="wrap"
          style={{
            width: '100%',
            maxWidth: isTabletLandscape ? 1040 : 1360,
            margin: '0 auto',
            display: 'flex',
            gap: isTabletLandscape ? 36 : 64,
            padding: isMobile
              ? '20px 16px'
              : isTabletPortrait
              ? '36px 24px'
              : isTabletLandscape
              ? '32px 36px'
              : '48px 64px',
            alignItems: 'center',
            justifyContent: isSingleColumn ? 'center' : 'space-between',
            minHeight: isSingleColumn ? 'auto' : '100vh',
            boxSizing: 'border-box',
            flexDirection: isSingleColumn ? 'column' : 'row',
          }}
        >
          {/* HERO (left - hidden in single-column mobile/tablet-portrait) */}
          <div
            className="hero"
            aria-hidden="false"
            style={{
              flex: 1,
              maxWidth: isTabletLandscape ? 520 : 720,
              minWidth: 0,
              padding: '16px 0',
              boxSizing: 'border-box',
              display: isSingleColumn ? 'none' : 'block',
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
                      fontSize: isTabletLandscape ? 'var(--font-size-page-title)' : 'var(--font-size-4xl)',
                      lineHeight: 1.15,
                      fontWeight: 'var(--font-weight-extrabold)',
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
                      fontSize: isTabletLandscape ? 'var(--font-size-page-title)' : 'var(--font-size-4xl)',
                      lineHeight: 1.15,
                      fontWeight: 'var(--font-weight-extrabold)',
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
                fontSize: isTabletLandscape ? 'var(--font-size-base)' : 'var(--font-size-md)',
                lineHeight: 1.8,
                fontWeight: 'var(--font-weight-normal)',
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
                fontSize: 'var(--font-size-base)',
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
              width: isMobile
                ? 'min(100%, 420px)'
                : isTabletPortrait
                ? 'min(100%, 520px)'
                : isTabletLandscape
                ? 420
                : 440,
              maxWidth: '100%',
              display: 'flex',
              justifyContent: 'center',
              boxSizing: 'border-box',
              margin: isSingleColumn ? 'auto 0' : 0,
            }}
          >
            <form
              className="login-card"
              onSubmit={(e) => {
                e.preventDefault();
                if (IS_USER_SURFACE) {
                  if (authMode === 'signup') {
                    if (signupKind === 'enrollee') handleEnrolleeSignup();
                    else handlePatientSignup();
                  }
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
                padding: isMobile
                  ? '24px 18px'
                  : isTabletPortrait
                  ? '32px 28px'
                  : isTabletLandscape
                  ? '28px 24px'
                  : '32px 28px',
                borderRadius: isMobile ? 18 : isTabletLandscape ? 20 : 24,
                boxShadow: isMobile ? '0 12px 36px rgba(0,0,0,0.18)' : '0 20px 50px rgba(0,0,0,0.18)',
                boxSizing: 'border-box',
              }}
            >
              {/* Mobile / Tablet Portrait Brand Header */}
              {isSingleColumn && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
                  <img
                    src={tupehrlogo}
                    alt="TUP Clinic Logo"
                    style={{
                      width: isMobile ? 54 : 64,
                      height: isMobile ? 54 : 64,
                      borderRadius: '50%',
                      objectFit: 'contain',
                      background: '#fff',
                      border: '2px solid rgba(255, 255, 255, 0.85)',
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
                      marginBottom: 8,
                    }}
                  />
                  <div
                    style={{
                      fontSize: isMobile ? 'var(--font-size-base)' : 'var(--font-size-md)',
                      fontWeight: 'var(--font-weight-extrabold)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'center',
                      color: '#ffffff',
                    }}
                  >
                    TUP Manila Clinic
                  </div>
                  <div style={{ fontSize: isMobile ? 'var(--font-size-2xs)' : 'var(--font-size-xs)', color: 'rgba(255, 255, 255, 0.85)', marginTop: 2, fontWeight: 'var(--font-weight-medium)' }}>
                    {IS_USER_SURFACE ? 'Online Patient Portal' : IS_DENTAL_SURFACE ? 'Dental Clinic Portal' : 'Clinic Staff Portal'}
                  </div>
                </div>
              )}
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
                      fontSize: isMobile ? 'var(--font-size-xl)' : 'var(--font-size-2xl)',
                      fontWeight: 'var(--font-weight-extrabold)',
                      fontFamily: `"Merriweather", serif`,
                    }}
                  >
                    Create Account
                  </h2>
                  {/* Which kind of account. An enrollee has no TUP address and no
                      student number yet, so the two sign-ups ask for different
                      things and cannot share one form. */}
                  <div
                    role="radiogroup"
                    aria-label="Type of account"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 6,
                      padding: 4,
                      margin: '0 0 16px 0',
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      borderRadius: 10,
                    }}
                  >
                    {[
                      { id: 'student', label: 'Enrolled Student' },
                      { id: 'enrollee', label: 'Enrollee' },
                    ].map(({ id, label }) => {
                      const active = signupKind === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setSignupKind(id);
                            // The two paths share the OTP state, so switching
                            // mid-flow must clear it or a code sent for one
                            // address would appear valid for the other.
                            setOtpSent(false);
                            setOtpEmail('');
                            setOtpCode('');
                            setMsg('');
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '10px 10px',
                            background: active ? 'rgba(255,255,255,0.92)' : 'transparent',
                            border: 'none',
                            borderRadius: 7,
                            color: active ? '#8C1515' : 'rgba(255,255,255,0.92)',
                            fontFamily: 'inherit',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 'var(--font-weight-bold)',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease, color 0.15s ease',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {signupKind === 'enrollee' && (
                    <>
                      {/* Same order as the student form: the ID first, then the
                          name, suffix and date of birth. The Applicant ID is
                          required: it ties this account to an admissions record. */}
                      <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label htmlFor="enrollee-applicant-id" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>
                          Applicant ID
                        </label>
                        <input
                          id="enrollee-applicant-id"
                          className="input"
                          style={authInputStyle}
                          placeholder="e.g. 2526A34660"
                          value={enrolleeData.applicantId}
                          onChange={(e) => setEnrolleeData((p) => ({ ...p, applicantId: e.target.value.toUpperCase() }))}
                        />
                      </div>

                      <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label htmlFor="enrollee-first-name" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>First Name</label>
                        <input
                          id="enrollee-first-name"
                          className="input"
                          style={authInputStyle}
                          placeholder="e.g. Juan"
                          value={enrolleeData.firstName}
                          onChange={(e) => setEnrolleeData((p) => ({ ...p, firstName: e.target.value }))}
                          onBlur={() => setEnrolleeData((p) => ({ ...p, firstName: toProperName(p.firstName) }))}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0' }}>
                        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <label htmlFor="enrollee-middle-name" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>
                            Middle Name <span style={{ fontWeight: 'var(--font-weight-normal)', opacity: 0.75 }}>(optional)</span>
                          </label>
                          <input
                            id="enrollee-middle-name"
                            className="input"
                            style={authInputStyle}
                            placeholder="e.g. Santos"
                            value={enrolleeData.middleName}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, middleName: e.target.value }))}
                            onBlur={() => setEnrolleeData((p) => ({ ...p, middleName: toProperName(p.middleName) }))}
                          />
                        </div>
                        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <label htmlFor="enrollee-surname" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Last Name</label>
                          <input
                            id="enrollee-surname"
                            className="input"
                            style={authInputStyle}
                            placeholder="e.g. Dela Cruz"
                            value={enrolleeData.lastName}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, lastName: e.target.value }))}
                            onBlur={() => setEnrolleeData((p) => ({ ...p, lastName: toProperName(p.lastName) }))}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0' }}>
                        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <label htmlFor="enrollee-suffix" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>
                            Suffix <span style={{ fontWeight: 'var(--font-weight-normal)', opacity: 0.75 }}>(optional)</span>
                          </label>
                          <input
                            id="enrollee-suffix"
                            className="input"
                            style={authInputStyle}
                            placeholder="e.g. Jr., III"
                            value={enrolleeData.suffix}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, suffix: e.target.value }))}
                          />
                        </div>
                        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <label htmlFor="enrollee-dob" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Date of Birth</label>
                          <input
                            id="enrollee-dob"
                            type="date"
                            className="input"
                            style={authInputStyle}
                            value={enrolleeData.dateOfBirth}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, dateOfBirth: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0' }}>
                        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <label htmlFor="enrollee-password" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Password</label>
                          <input
                            id="enrollee-password"
                            className="input"
                            style={authInputStyle}
                            type="password"
                            placeholder="At least 8 characters"
                            minLength={PASSWORD_MIN_LENGTH}
                            maxLength={PASSWORD_MAX_LENGTH}
                            aria-describedby="enrollee-password-requirements"
                            value={enrolleeData.password}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, password: e.target.value }))}
                            autoComplete="new-password"
                          />
                        </div>
                        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <label htmlFor="enrollee-confirm" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Confirm Password</label>
                          <input
                            id="enrollee-confirm"
                            className="input"
                            style={authInputStyle}
                            type="password"
                            placeholder="Re-type password"
                            value={enrolleeData.confirmPassword}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, confirmPassword: e.target.value }))}
                            autoComplete="new-password"
                          />
                        </div>
                        <PasswordRequirements id="enrollee-password-requirements" password={enrolleeData.password} inverse />
                      </div>

                      {signupConsent}

                      {/* Send comes last, after everything it requires, so a
                          disabled button never waits on a field further down. */}
                      <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label htmlFor="enrollee-email" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Personal Email</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                          <input
                            id="enrollee-email"
                            className="input"
                            style={{ ...authInputStyle, flex: 1, minWidth: 0 }}
                            type="email"
                            placeholder="e.g. juan.delacruz@gmail.com"
                            value={enrolleeData.email}
                            onChange={(e) => setEnrolleeData((p) => ({ ...p, email: e.target.value.trim().toLowerCase() }))}
                          />
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={handleEnrolleeSendOtp}
                            disabled={isSendDisabled}
                            style={{
                              padding: '0 14px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              boxShadow: 'none',
                            }}
                          >
                            {otpSending ? 'Sending…' : otpCooldown > 0 ? `Resend (${otpCooldown}s)` : otpSent ? 'Resend' : 'Send'}
                          </button>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-2xs)', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
                          Any personal address works. Your TUP email comes later, once you are enrolled.
                        </div>
                        {sendMissingHint}
                        {otpSent && (
                          <div style={{ color: '#c6f6d5', fontSize: 'var(--font-size-xs)', marginTop: 2, fontWeight: 'var(--font-weight-semibold)' }}>
                            If the provided information is eligible for registration, you will receive a verification code by email.
                          </div>
                        )}
                      </div>

                      {otpSent && (
                        <VerificationCodeField
                          id="enrollee-otp"
                          value={otpCode}
                          onChange={setOtpCode}
                          sentTo={otpEmail || enrolleeData.email}
                          inputStyle={authInputStyle}
                        />
                      )}

                    </>
                  )}

                  {signupKind === 'student' && (
                  <>
                  {/* 1. Student ID */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-student-id" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Student ID</label>
                    <input
                      id="signup-student-id"
                      className="input"
                      style={authInputStyle}
                      placeholder="e.g. TUPM-XX-XXXX"
                      value={signupData.studentId}
                      onChange={(e) => setSignupData((p) => ({ ...p, studentId: e.target.value.toUpperCase() }))}
                      disabled={otpSent}
                    />
                    {showStudentIdError && (
                      <div style={{ color: '#fed7d7', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                        Format must be TUPM-YY-XXXX (e.g. TUPM-XX-XXXX).
                      </div>
                    )}
                  </div>

                  {/* 2. Name — PSA registration layout: First / Middle / Last.
                      Normalised to Proper Case on blur so no record is stored
                      SHOUTED or all-lowercase. */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-first-name" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>First Name</label>
                    <input
                      id="signup-first-name"
                      className="input"
                      style={authInputStyle}
                      placeholder="e.g. Juan"
                      value={signupData.firstName}
                      onChange={(e) => setSignupData((p) => ({ ...p, firstName: e.target.value }))}
                      onBlur={() => setSignupData((p) => ({ ...p, firstName: toProperName(p.firstName) }))}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0' }}>
                    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-middle-name" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>
                        Middle Name <span style={{ fontWeight: 'var(--font-weight-normal)', opacity: 0.75 }}>(optional)</span>
                      </label>
                      <input
                        id="signup-middle-name"
                        className="input"
                        style={authInputStyle}
                        placeholder="e.g. Santos"
                        value={signupData.middleName}
                        onChange={(e) => setSignupData((p) => ({ ...p, middleName: e.target.value }))}
                        onBlur={() => setSignupData((p) => ({ ...p, middleName: toProperName(p.middleName) }))}
                      />
                    </div>

                    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-last-name" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Last Name</label>
                      <input
                        id="signup-last-name"
                        className="input"
                        style={authInputStyle}
                        placeholder="e.g. Dela Cruz"
                        value={signupData.lastName}
                        onChange={(e) => setSignupData((p) => ({ ...p, lastName: e.target.value }))}
                        onBlur={() => setSignupData((p) => ({ ...p, lastName: toProperName(p.lastName) }))}
                      />
                    </div>
                  </div>

                  {/* 3. Suffix and date of birth. The suffix is optional and
                      rare, so it shares a row rather than taking one of its
                      own — the same pairing the enrollee form uses. */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0' }}>
                    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-suffix" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>
                        Suffix <span style={{ fontWeight: 'var(--font-weight-normal)', opacity: 0.75 }}>(optional)</span>
                      </label>
                      <input
                        id="signup-suffix"
                        className="input"
                        style={authInputStyle}
                        placeholder="e.g. Jr., III"
                        value={signupData.suffix}
                        onChange={(e) => setSignupData((p) => ({ ...p, suffix: e.target.value }))}
                      />
                    </div>

                    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-dob" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Date of Birth</label>
                      <input
                        id="signup-dob"
                        type="date"
                        className="input"
                        style={authInputStyle}
                        value={signupData.dateOfBirth}
                        onChange={(e) => setSignupData((p) => ({ ...p, dateOfBirth: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* 4. Year */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-year" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Year</label>
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

                  {/* 3b. Sex + Degree Program — the Medical Log prints both, so
                      they are captured at account creation. */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0' }}>
                    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-sex" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Sex</label>
                      <select
                        id="signup-sex"
                        className="input"
                        style={{ ...authInputStyle, cursor: 'pointer' }}
                        value={signupData.sex}
                        onChange={(e) => setSignupData((p) => ({ ...p, sex: e.target.value }))}
                        required
                      >
                        <option value="">Select…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>

                    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="signup-course" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Degree Program</label>
                      <select
                        id="signup-course"
                        className="input"
                        style={{ ...authInputStyle, cursor: 'pointer' }}
                        value={signupData.course}
                        onChange={(e) => setSignupData((p) => ({ ...p, course: e.target.value }))}
                        required
                      >
                        <option value="">Select…</option>
                        {SIGNUP_COURSES.map(({ college, programs }) => (
                          <optgroup key={college} label={college}>
                            {programs.map((c) => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 6. Password with Eye Toggle */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-password" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Password</label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        id="signup-password"
                        className="input"
                        style={{ ...authInputStyle, paddingRight: 40 }}
                        type={showSignupPass ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        minLength={PASSWORD_MIN_LENGTH}
                        maxLength={PASSWORD_MAX_LENGTH}
                        autoComplete="new-password"
                        aria-describedby="student-password-requirements"
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

                  <PasswordRequirements id="student-password-requirements" password={signupData.password} inverse />

                  {/* 7. Confirm Password with Eye Toggle */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-confirm-password" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Confirm Password</label>
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
                      <div style={{ color: '#fed7d7', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                        Passwords do not match.
                      </div>
                    )}
                  </div>
                  {signupConsent}

                  {/* 8. Email with Send/Resend Button — last, after everything Send requires */}
                  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="signup-email" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Email</label>
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
                          fontWeight: 'var(--font-weight-bold)',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: 'none',
                          cursor: isSendDisabled ? 'not-allowed' : 'pointer',
                          fontSize: 'var(--font-size-sm)',
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
                      <div style={{ color: '#fed7d7', fontSize: 'var(--font-size-xs)', marginTop: 2, lineHeight: 1.35 }}>
                        Please use your official TUP email address ending in @tup.edu.ph.
                      </div>
                    )}
                    {sendMissingHint}
                    {otpSent && (
                      <div style={{ color: '#c6f6d5', fontSize: 'var(--font-size-xs)', marginTop: 2, fontWeight: 'var(--font-weight-semibold)' }}>
                        If the provided information is eligible for registration, you will receive a verification code by email.
                      </div>
                    )}
                  </div>

                  {/* 9. Verification Code (OTP) Field — DIRECTLY BENEATH EMAIL */}
                  {otpSent && (
                    <VerificationCodeField
                      id="signup-otp"
                      value={otpCode}
                      onChange={setOtpCode}
                      sentTo={otpEmail || signupData.email}
                      inputStyle={authInputStyle}
                    />
                  )}

                </>
              )}

              {/* Shared by both paths. These used to sit inside the student
                  branch, so the enrollee form had no submit button at all —
                  the form simply ended after Confirm Password. */}
              <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={submitDisabled}
                  style={{
                    width: '100%',
                    background: submitDisabled ? 'rgba(255,255,255,0.35)' : '#fff',
                    color: submitDisabled ? 'rgba(255,255,255,0.75)' : '#931b1b',
                    fontWeight: 'var(--font-weight-bold)',
                    padding: '11px 14px',
                    minHeight: 44,
                    borderRadius: isMobile ? 8 : 10,
                    border: 'none',
                    cursor: submitDisabled ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--font-size-base)',
                    boxShadow: submitDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.08)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {loading ? 'Creating Account…' : 'Create Account'}
                </button>
              </div>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.92)' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={async () => {
                    await logout({ scope: 'local' });
                    setAuthMode('login');
                    setMsg('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 'var(--font-weight-bold)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 'var(--font-size-sm)',
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
                      fontSize: isMobile ? 'var(--font-size-xl)' : 'var(--font-size-2xl)',
                      fontWeight: 'var(--font-weight-extrabold)',
                      fontFamily: `"Merriweather", serif`,
                    }}
                  >
                    Reset Password
                  </h2>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.9)', textAlign: 'center', margin: '0 0 16px 0', lineHeight: 1.45 }}>
                    Enter your official TUP email address to receive password recovery instructions.
                  </p>

                  <div className="field" style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="forgot-email" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>TUP Email</label>
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
                      <div style={{ color: '#fed7d7', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
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
                        fontWeight: 'var(--font-weight-bold)',
                        padding: '11px 14px',
                        minHeight: 44,
                        borderRadius: isMobile ? 8 : 10,
                        border: 'none',
                        cursor: isForgotDisabled ? 'not-allowed' : 'pointer',
                        fontSize: 'var(--font-size-base)',
                        boxShadow: isForgotDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.08)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {forgotLoading ? 'Sending Instructions…' : 'Send Reset Instructions'}
                    </button>
                  </div>

                  <div style={{ marginTop: 16, textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.92)' }}>
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
                        fontWeight: 'var(--font-weight-bold)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 'var(--font-size-sm)',
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
                      fontSize: isMobile ? 'var(--font-size-xl)' : isTabletLandscape ? 'var(--font-size-2xl)' : 'var(--font-size-page-title)',
                      fontWeight: 'var(--font-weight-extrabold)',
                      fontFamily: `"Merriweather", serif`,
                    }}
                  >
                    {IS_USER_SURFACE ? 'Student Log In' : IS_DENTAL_SURFACE ? 'Dentist Log In' : 'Staff Log In'}
                  </h2>

                  {/* Email Field */}
                  <div className="field" style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="email" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Email</label>
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
                      <label htmlFor="password" style={{ fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.95)', fontWeight: 'var(--font-weight-semibold)' }}>Password</label>
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
                            fontSize: 'var(--font-size-xs)',
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
                        fontWeight: 'var(--font-weight-bold)',
                        padding: '11px 14px',
                        minHeight: 44,
                        borderRadius: isMobile ? 8 : 10,
                        border: 'none',
                        cursor: isLoginDisabled ? 'not-allowed' : 'pointer',
                        fontSize: 'var(--font-size-base)',
                        boxShadow: isLoginDisabled ? 'none' : '0 6px 14px rgba(0,0,0,0.08)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {loading ? 'Signing in…' : 'Log In'}
                    </button>
                  </div>

                  {/* Create Account Link (User Surface Only) */}
                  {IS_USER_SURFACE && (
                    <div style={{ marginTop: 18, textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.92)' }}>
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
                          fontWeight: 'var(--font-weight-bold)',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        Create Account
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="footer-note" style={{ marginTop: 16, color: 'rgba(255,255,255,0.92)', textAlign: 'center', fontSize: isMobile ? 'var(--font-size-2xs)' : 'var(--font-size-xs)', lineHeight: 1.4 }}>
                © Technological University of the Philippines
              </div>
              <PolicyLinks className="policy-links-on-login" />
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
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', marginBottom: 8, color: '#111' }}>Notice</div>
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
                fontSize: 'var(--font-size-base)',
              }}
            >
              {msg}
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn secondary"
                style={{
                  background: '#ffffff',
                  color: '#172033',
                  border: '1px solid var(--border, #cbd5e1)',
                  fontWeight: 'var(--font-weight-semibold)',
                  fontSize: 'var(--font-size-sm)',
                  padding: '8px 18px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                }}
                onClick={() => setMsgOpen(false)}
              >
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

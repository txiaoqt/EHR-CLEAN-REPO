import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { isValidStudentId, isValidTupEmail } from '../utils/authValidation.js';
import { AlertIcon, CheckIcon } from './icons/Icons.jsx';
import PasswordRequirements from './PasswordRequirements.jsx';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, createTemporaryPassword } from '../utils/passwordPolicy.js';

/**
 * Elevates an enrollee account into an enrolled student/patient account after
 * certificate approval and verification of their official TUP email and ID.
 *
 * Flow:
 *  1. While signed in as the enrollee, `begin_enrollee_elevation` records the
 *     pending @tup.edu.ph email and TUPM Student ID on the enrollee row.
 *  2. A 6-digit verification code is sent to the @tup.edu.ph mailbox.
 *  3. Once verified via `verifyOtp`, the new password is saved and
 *     `complete_enrollee_elevation` creates the student/patient records,
 *     transfers the completed Patient Record Form, moves submitted medical
 *     certificates into Archive Files, and retires the personal Gmail account.
 */
const EnrolleeElevationCard = ({ locked = false }) => {
  const { user, login, fetchUserProfile } = useAuth();
  const navigate = useNavigate();

  const [studentId, setStudentId] = useState('');
  const [tupEmail, setTupEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('error');
  const [certificateLoading, setCertificateLoading] = useState(true);
  const [certificateCheckFailed, setCertificateCheckFailed] = useState(false);
  const [hasApprovedCertificate, setHasApprovedCertificate] = useState(false);

  const loadCertificateApproval = useCallback(async () => {
    if (!user?.id) {
      setHasApprovedCertificate(false);
      setCertificateLoading(false);
      return;
    }

    setCertificateLoading(true);
    try {
      const { data, error } = await supabase
        .from('enrollee_documents')
        .select('status')
        .eq('enrollee_id', user.id)
        .neq('status', 'draft');
      if (error) throw error;
      setHasApprovedCertificate((data || []).some((document) => document.status === 'approved'));
      setCertificateCheckFailed(false);
    } catch (error) {
      console.warn('Could not check medical certificate approval:', error);
      setHasApprovedCertificate(false);
      setCertificateCheckFailed(true);
    } finally {
      setCertificateLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCertificateApproval();
  }, [loadCertificateApproval]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`enrollee-elevation-approval-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'enrollee_documents',
        filter: `enrollee_id=eq.${user.id}`,
      }, () => loadCertificateApproval())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadCertificateApproval, user?.id]);

  useEffect(() => {
    if (otpCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const handleSendCode = async () => {
    setMessage('');
    if (certificateLoading || certificateCheckFailed || !hasApprovedCertificate) {
      setTone('error');
      setMessage(certificateCheckFailed
        ? 'We could not confirm your certificate approval. Refresh the page and try again.'
        : 'The clinic must approve at least one medical certificate before you can begin elevation.');
      return;
    }
    const cleanId = studentId.trim().toUpperCase();
    const cleanEmail = tupEmail.trim().toLowerCase();

    if (!isValidStudentId(cleanId)) {
      setTone('error');
      setMessage('Enter your official Student ID in TUPM-YY-XXXX format (e.g. TUPM-26-1234).');
      return;
    }
    if (!isValidTupEmail(cleanEmail)) {
      setTone('error');
      setMessage('Enter your official TUP email ending in @tup.edu.ph.');
      return;
    }
    if (otpSending || otpCooldown > 0) return;

    setOtpSending(true);
    try {
      // Step 1: Record the pending elevation on the enrollee row while still
      // authenticated under the enrollee's session.
      const { data: beginData, error: beginErr } = await supabase.rpc('begin_enrollee_elevation', {
        p_tup_email: cleanEmail,
        p_student_id: cleanId,
        // New enrollee accounts always start at first year. Keep this fixed
        // even if a client tampers with the display control.
        p_year: 1,
      });

      if (beginErr || !beginData?.success) {
        setTone('error');
        setMessage(beginData?.error || beginErr?.message || 'Could not start elevation.');
        return;
      }

      // Step 2: Send the 6-digit verification code to the @tup.edu.ph address.
      const placeholderPassword = createTemporaryPassword();
      const { error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: placeholderPassword,
        options: {
          data: {
            name: user?.name || 'Student',
            role: 'patient',
          },
        },
      });

      if (authErr) {
        const lower = (authErr.message || '').toLowerCase();
        if (lower.includes('rate limit') || lower.includes('too many') || authErr.status === 429) {
          setTone('error');
          setMessage('Too many requests. Please wait a moment before trying again.');
          return;
        }
        if (
          lower.includes('already registered') ||
          lower.includes('already exists') ||
          lower.includes('user already registered')
        ) {
          const { error: resendErr } = await supabase.auth.resend({
            type: 'signup',
            email: cleanEmail,
          });
          if (resendErr) {
            const resendMsg = (resendErr.message || '').toLowerCase();
            if (resendMsg.includes('rate limit') || resendMsg.includes('too many') || resendErr.status === 429) {
              setTone('error');
              setMessage('Too many requests. Please wait a moment before trying again.');
              return;
            }
          }
        } else {
          throw authErr;
        }
      }

      setOtpSent(true);
      setOtpCooldown(60);
      setTone('success');
      setMessage(`Verification code sent to ${cleanEmail}.`);
    } catch (err) {
      console.error('Elevation send OTP error:', err);
      setTone('error');
      setMessage(err?.message || 'Could not send verification code. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleElevate = async () => {
    setMessage('');
    if (certificateLoading || certificateCheckFailed || !hasApprovedCertificate) {
      setTone('error');
      setMessage(certificateCheckFailed
        ? 'We could not confirm your certificate approval. Refresh the page and try again.'
        : 'The clinic must approve at least one medical certificate before you can elevate your account.');
      return;
    }
    const cleanEmail = tupEmail.trim().toLowerCase();
    const cleanCode = otpCode.trim();
    const enrolleeId = user?.id;

    if (cleanCode.length !== 6) {
      setTone('error');
      setMessage('Enter the 6-digit verification code sent to your TUP email.');
      return;
    }
    if (!isPasswordValid(password)) {
      setTone('error');
      setMessage(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setTone('error');
      setMessage('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'signup',
      });

      if (verifyErr) {
        const { error: retryErr } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanCode,
          type: 'email',
        });
        if (retryErr) {
          setTone('error');
          setMessage('The verification code is incorrect or has expired.');
          return;
        }
      }

      const { error: passwordErr } = await supabase.auth.updateUser({ password });
      if (passwordErr) {
        setTone('error');
        setMessage(passwordErr.message || 'Could not set your password. Please try again.');
        return;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('complete_enrollee_elevation', {
        p_enrollee_id: enrolleeId || null,
      });

      if (rpcErr || !rpcData?.success) {
        setTone('error');
        const errorMessage = rpcData?.error || rpcErr?.message || '';
        setMessage(errorMessage.toLowerCase().includes('certificate')
          ? 'The clinic must approve at least one medical certificate before you can elevate your account.'
          : errorMessage || 'Could not complete account elevation.');
        return;
      }

      const { data: sessionData } = await supabase.auth.getUser();
      if (sessionData?.user && fetchUserProfile) {
        const nextProfile = await fetchUserProfile(sessionData.user);
        if (nextProfile) {
          login(nextProfile);
          navigate('/patient/dashboard', { replace: true });
          return;
        }
      }

      setTone('success');
      setMessage('Your account has been elevated to an enrolled student account. Redirecting…');
      setTimeout(() => navigate('/patient/dashboard', { replace: true }), 800);
    } catch (err) {
      console.error('Elevation error:', err);
      setTone('error');
      setMessage(err?.message || 'Could not elevate your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card settings-card" style={{ marginTop: 20 }}>
      <header className="settings-card-head">
        <h2>Already enrolled with a TUP email?</h2>
        <p>
          After the clinic approves at least one medical certificate, verify your official{' '}
          <strong>@tup.edu.ph</strong> email and enter your <strong>TUPM-YY-XXXX</strong> Student ID
          to elevate your account. Your clinic record and submitted certificates will be carried
          over and archived automatically.
        </p>
      </header>

      <div
        role="status"
        className="record-form-message"
        style={{
          marginTop: 0,
          marginBottom: 18,
          background: hasApprovedCertificate ? 'var(--color-emerald-bg)' : 'var(--surface-raised)',
          color: hasApprovedCertificate ? 'var(--color-emerald-text)' : 'var(--text)',
        }}
      >
        {hasApprovedCertificate ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
        <span>
          {certificateLoading
            ? 'Checking medical certificate approval…'
            : certificateCheckFailed
              ? 'Could not verify your certificate status. Refresh this page to try again.'
              : hasApprovedCertificate
                ? 'Medical certificate approved. You can continue with TUP email verification.'
                : 'Account elevation unlocks after the clinic approves at least one submitted medical certificate.'}
        </span>
      </div>

      {message && (
        <div
          role="status"
          className="record-form-message"
          style={{
            background: tone === 'success' ? 'var(--color-emerald-bg)' : 'var(--color-rose-bg)',
            color: tone === 'success' ? 'var(--color-emerald-text)' : 'var(--color-rose-text)',
          }}
        >
          {tone === 'success' ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
          <span>{message}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0 16px',
        }}
      >
        <div className="settings-field">
          <label htmlFor="elevate-student-id">Official Student ID</label>
          <input
            id="elevate-student-id"
            className="input"
            placeholder="e.g. TUPM-26-1234"
            disabled={locked || otpSent || submitting}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
          />
        </div>

        <div className="settings-field">
          <label htmlFor="elevate-year">Year Level</label>
          <input
            id="elevate-year"
            className="input"
            value="1st Year"
            readOnly
            aria-readonly="true"
            title="New enrollee accounts start at 1st Year."
          />
          <div className="settings-row-note" style={{ marginTop: 6 }}>
            New enrollee accounts start at 1st Year.
          </div>
        </div>

        <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="elevate-tup-email">Official TUP Email</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <input
              id="elevate-tup-email"
              className="input"
              type="email"
              style={{ flex: '1 1 240px' }}
              placeholder="e.g. juan.delacruz@tup.edu.ph"
              disabled={locked || submitting}
              value={tupEmail}
              onChange={(e) => {
                const next = e.target.value.trim().toLowerCase();
                setTupEmail(next);
                if (otpSent) {
                  setOtpSent(false);
                  setOtpCode('');
                }
              }}
            />
            <button
              type="button"
              className="btn secondary"
              disabled={locked || certificateLoading || certificateCheckFailed || !hasApprovedCertificate || otpSending || otpCooldown > 0 || !tupEmail.trim() || !studentId.trim()}
              onClick={handleSendCode}
            >
              {otpSending
                ? 'Sending…'
                : otpCooldown > 0
                  ? `Resend (${otpCooldown}s)`
                  : otpSent
                    ? 'Resend code'
                    : 'Send 6-digit code'}
            </button>
          </div>
          {locked && (
            <div className="settings-row-note" style={{ marginTop: 6 }}>
              Complete your clinic record form on the Profile page before elevating your account.
            </div>
          )}
        </div>

        {otpSent && (
          <>
            <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="elevate-otp-code">6-Digit Verification Code</label>
              <input
                id="elevate-otp-code"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Enter 6-digit code from your @tup.edu.ph email"
                style={{ letterSpacing: '0.25em', textAlign: 'center', maxWidth: 280 }}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>

            <div className="settings-field">
              <label htmlFor="elevate-password">New Student Portal Password</label>
              <input
                id="elevate-password"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                aria-describedby="elevation-password-requirements"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="settings-field">
              <label htmlFor="elevate-confirm-password">Confirm Password</label>
              <input
                id="elevate-confirm-password"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="Re-type password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <PasswordRequirements id="elevation-password-requirements" password={password} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={
                  submitting ||
                  certificateLoading ||
                  certificateCheckFailed ||
                  !hasApprovedCertificate ||
                  otpCode.trim().length !== 6 ||
                  !password ||
                  !isPasswordValid(password) ||
                  password !== confirmPassword
                }
                onClick={handleElevate}
              >
                {submitting ? 'Elevating account…' : 'Elevate to Enrolled Student'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EnrolleeElevationCard;

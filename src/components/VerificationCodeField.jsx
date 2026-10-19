import React from 'react';

/**
 * The six-digit email verification code input.
 *
 * Shared by the enrolled-student and enrollee sign-up paths. They are the same
 * step of the same flow, so a code field that looks or behaves differently
 * depending on which tab you are on is a defect rather than a variation — and
 * two copies would drift the moment either is touched. One component makes that
 * impossible.
 *
 * Digits only, capped at six; centred and letter-spaced so a code reads as a
 * code rather than as a word; `inputMode="numeric"` for a number pad on mobile;
 * and `one-time-code` so the phone or mail client can offer it directly.
 */
const VerificationCodeField = ({ id, value, onChange, sentTo, inputStyle }) => (
  <div className="field" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
    <label
      htmlFor={id}
      style={{
        fontSize: 'var(--font-size-sm)',
        color: 'rgba(255,255,255,0.95)',
        fontWeight: 'var(--font-weight-semibold)',
      }}
    >
      Verification Code
    </label>
    <input
      id={id}
      className="input"
      style={{ ...inputStyle, letterSpacing: '0.3em', textAlign: 'center' }}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="6-digit code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
    {sentTo && (
      <div style={{ fontSize: 'var(--font-size-2xs)', color: 'rgba(255,255,255,0.7)' }}>
        Sent to {sentTo}
      </div>
    )}
  </div>
);

export default VerificationCodeField;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecordComplete } from '../hooks/useRecordComplete.js';
import { AlertIcon } from './icons/Icons.jsx';

/**
 * Blocks enrollee actions until the clinic record form is complete, and says why.
 *
 * Used by wrapping a handler rather than disabling the control:
 *
 *   const gate = useRecordGate();
 *   <button onClick={gate(() => navigate('/patient/schedule'))}>Book</button>
 *
 * A disabled button tells you nothing. A button that explains what is missing
 * and offers the way to fix it tells you everything — and it keeps the rest of
 * the portal usable, which matters for a student who needs to look something up
 * while their record is outstanding.
 *
 * The dialog is rendered by the calling page via `prompt`, so this stays a hook
 * with no layout of its own.
 */
export const useRecordGate = () => {
  const { loading, complete, subjectType } = useRecordComplete();
  const [prompted, setPrompted] = useState(false);
  const required = subjectType === 'enrollee';

  const prompt = () => setPrompted(true);
  const dismiss = () => setPrompted(false);

  /** Wraps a handler: only enrollees must finish this form before continuing. */
  const gate = (action) => (...args) => {
    // Enrolled students may use the portal without this optional form. While
    // the check is in flight, let the action through rather than blocking them.
    if (!required || loading || complete) return action(...args);
    setPrompted(true);
    return undefined;
  };

  return {
    gate,
    prompt,
    dismiss,
    prompted,
    complete,
    loading,
    // Where "Go to my profile" should point for this role.
    profilePath: subjectType === 'enrollee' ? '/enrollee/profile' : '/patient/profile',
  };
};

/**
 * The prompt itself. Rendered by the page that owns the gate.
 */
export const RecordGatePrompt = ({ open, onClose, profilePath = '/patient/profile' }) => {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div className="record-gate-backdrop" role="presentation" onClick={onClose}>
      <div
        className="record-gate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="record-gate-head">
          <AlertIcon size={18} />
          <h2 id="record-gate-title">Complete your clinic record first</h2>
        </div>
        <p className="record-gate-body">
          The clinic needs your medical history and contact details before you can do this. It takes
          a few minutes and you can change your answers later.
        </p>
        <div className="record-gate-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              navigate(profilePath);
            }}
          >
            Go to my profile
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * The banner for a page's header area — shown while the record is outstanding.
 */
export const RecordIncompleteBanner = ({ onOpen, className = '' }) => {
  const { loading, complete, subjectType } = useRecordComplete();
  if (loading || complete || !subjectType) return null;

  const isEnrollee = subjectType === 'enrollee';

  return (
    <div
      className={`settings-callout patient-clinic-record-notice${className ? ` ${className}` : ''}`}
      role={isEnrollee ? 'alert' : 'status'}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 0, marginBottom: 0 }}
    >
      <AlertIcon size={16} />
      <div>
        <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginBottom: 4 }}>
          {isEnrollee ? 'Clinic record required' : 'Clinic record form (optional)'}
        </div>
        <div>
          {isEnrollee
            ? 'The clinic needs your medical history and contact details before it can accept your medical certificate.'
            : 'The clinic already has your student information. Add your health details here if you would like; this form will not limit portal access.'}
        </div>
        {onOpen && (
          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={onOpen}>
            {isEnrollee ? 'Complete required form' : 'Add health details'}
          </button>
        )}
      </div>
    </div>
  );
};

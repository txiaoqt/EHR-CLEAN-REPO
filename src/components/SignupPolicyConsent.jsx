import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PolicyDocument } from './PolicyAgreement.jsx';
import { CloseIcon } from './icons/Icons.jsx';

const SignupPolicyReader = ({ initialTab, policy, checking, error, onRetry, onClose }) => {
  const [tab, setTab] = useState(initialTab);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} className="signup-policy-reader"
      aria-labelledby={id + '-title'} aria-describedby={id + '-description'}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="signup-policy-reader-header">
        <div>
          <h2 ref={titleRef} id={id + '-title'} tabIndex={-1}>
            {tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </h2>
          <p id={id + '-description'}>
            {policy ? `Version ${policy.version} · Effective ${policy.effective_date}` : 'TUP Manila Clinic portal policies'}
          </p>
        </div>
        <button type="button" className="modal-close-btn" aria-label="Close policies" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </header>
      <div className="policy-tabs" role="tablist" aria-label="Policies">
        {[['privacy', 'Privacy Policy'], ['terms', 'Terms of Service']].map(([value, label]) => (
          <button key={value} id={id + '-' + value} type="button" role="tab"
            aria-selected={tab === value} aria-controls={id + '-content'}
            tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'privacy' : event.key === 'End' ? 'terms'
                  : tab === 'privacy' ? 'terms' : 'privacy';
                setTab(next);
                document.getElementById(id + '-' + next)?.focus();
              }
            }}>{label}</button>
        ))}
      </div>
      <div key={tab} className="policy-reading-area" id={id + '-content'} role="tabpanel"
        tabIndex={0} aria-labelledby={id + '-' + tab} aria-busy={checking}>
        {checking ? <p role="status">Loading policies…</p> : policy ? (
          <PolicyDocument sections={policy[tab]} />
        ) : <p role="alert">{error || 'The policies could not be loaded. Please retry.'}</p>}
      </div>
      <footer className="signup-policy-reader-footer">
        {error && <button type="button" className="btn secondary" disabled={checking} onClick={onRetry}>Retry</button>}
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </footer>
    </dialog>, document.body
  );
};

export default function SignupPolicyConsent({ policy, ready, checking, error, checked, busy, onChange, onRetry }) {
  const [reading, setReading] = useState(null);
  const id = useId();

  return (
    <>
      <div className="signup-policy-consent">
        <div className="signup-policy-choice">
          <input id={id + '-check'} type="checkbox" required checked={checked}
            aria-labelledby={id + '-label'} aria-describedby={id + '-hint'}
            disabled={busy || !ready} onChange={(event) => onChange(event.target.checked)} />
          <div id={id + '-label'}>
            <label htmlFor={id + '-check'}>I acknowledge the</label>{' '}
            <button type="button" onClick={() => setReading('privacy')}>Privacy Policy</button>
            {' '}and agree to the{' '}
            <button type="button" onClick={() => setReading('terms')}>Terms of Service</button>.
          </div>
        </div>
        <p className="signup-policy-hint" id={id + '-hint'}>
          {checking ? 'Loading policies…' : 'Required before verification and account creation.'}
        </p>
        {error && <div className="signup-policy-load-error" role="alert">
          <p>The policies could not be loaded. Your form details are kept here.</p>
          <button type="button" onClick={onRetry} disabled={checking || busy}>Retry loading policies</button>
        </div>}
      </div>
      {reading && <SignupPolicyReader initialTab={reading} policy={policy} checking={checking}
        error={error} onRetry={onRetry} onClose={() => setReading(null)} />}
    </>
  );
}

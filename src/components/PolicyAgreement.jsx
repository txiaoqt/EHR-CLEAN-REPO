import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';
import '../styles/policies.css';

export const policySectionId = (type, index) => `policy-${type}-section-${index + 1}`;

export const PolicyDocument = ({ sections = [], sectionPrefix }) => (
  <div className="policy-document">
    {sections.map((section, index) => (
      <section key={section.heading} id={sectionPrefix ? policySectionId(sectionPrefix, index) : undefined}>
        <h3 id={sectionPrefix ? policySectionId(sectionPrefix, index) + '-heading' : undefined}
          tabIndex={sectionPrefix ? -1 : undefined}>{section.heading}</h3>
        {(section.paragraphs || []).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.items?.length > 0 && (
          <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
        )}
      </section>
    ))}
  </div>
);

export const PolicyLinks = ({ className = '' }) => {
  const location = useLocation();
  // Keep the auth screen mounted in memory while reading. Form values, including
  // passwords, are never copied into history state or browser storage.
  const state = location.pathname === '/login' ? { policyBackgroundLocation: location } : undefined;
  return (
    <nav className={'policy-links ' + className} aria-label="Legal policies">
      <Link to="/privacy" state={state}>Privacy Policy</Link>
      <Link to="/terms" state={state}>Terms of Service</Link>
    </nav>
  );
};

// The protected application is not mounted behind this dialog. Only the
// document scrolls; checkboxes and both actions stay visible at every size.
export default function PolicyAgreement({
  policy, checking, error, saving = false, mode = 'portal',
  onAccept, onDecline, onRetry,
}) {
  const id = useId();
  const dialog = useRef(null);
  const title = useRef(null);
  const [tab, setTab] = useState('terms');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const signup = mode === 'signup';
  const busy = saving || leaving;

  useEffect(() => {
    setAcceptedTerms(false);
    setAcceptedPrivacy(false);
    setTab('terms');
    title.current?.focus();
  }, [policy?.version]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const decline = async () => {
    if (busy) return;
    setLeaving(true);
    try { await onDecline(); } finally { setLeaving(false); }
  };

  const trapFocus = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault(); // Leaving requires the explicit, labeled action.
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = [...dialog.current.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), a[href], [tabindex="0"]')];
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="policy-gate">
      <section ref={dialog} className="policy-agreement" role="dialog" aria-modal="true"
        aria-labelledby={id + '-title'} aria-describedby={id + '-description'} onKeyDown={trapFocus}>
        <header className="policy-agreement-header">
          <img src={tupehrlogo} alt="TUP Clinic" width="42" height="42" />
          <div>
            <h1 ref={title} tabIndex={-1} id={id + '-title'}>Review our policies</h1>
            <p id={id + '-description'}>
              {signup ? 'Before creating your account, review both policies and confirm below.'
                : 'Before entering the portal, review both policies and confirm below.'}
            </p>
          </div>
        </header>

        <div className="policy-tabs" role="tablist" aria-label="Policies">
          {[['terms', 'Terms of Service'], ['privacy', 'Privacy Policy']].map(([value, label]) => (
            <button key={value} id={id + '-' + value} role="tab" type="button"
              aria-selected={tab === value} aria-controls={id + '-content'}
              tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === 'Home' ? 'terms' : event.key === 'End' ? 'privacy'
                    : tab === 'terms' ? 'privacy' : 'terms';
                  setTab(next);
                  document.getElementById(id + '-' + next)?.focus();
                }
              }}>{label}</button>
          ))}
        </div>

        <div key={tab} className="policy-reading-area" role="tabpanel" tabIndex={0}
          id={id + '-content'} aria-labelledby={id + '-' + tab} aria-busy={checking}>
          {checking ? <p role="status">Loading policies…</p> : policy ? (
            <>
              <p className="policy-version">Version {policy.version} · Effective {policy.effective_date}</p>
              <PolicyDocument sections={policy[tab]} />
            </>
          ) : <p>The policies are temporarily unavailable. Retry to continue.</p>}
        </div>

        <footer className="policy-agreement-footer">
          <label className="policy-check" htmlFor={id + '-privacy-check'}>
            <input id={id + '-privacy-check'} type="checkbox" required checked={acceptedPrivacy}
              disabled={busy || checking || !policy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} />
            <span>I have read and acknowledge the Privacy Policy.</span>
          </label>
          <label className="policy-check" htmlFor={id + '-terms-check'}>
            <input id={id + '-terms-check'} type="checkbox" required checked={acceptedTerms}
              disabled={busy || checking || !policy} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>I have read and agree to the Terms of Service.</span>
          </label>
          <p className="policy-choice-note">Optional health details remain optional. You can leave without agreeing.</p>
          {error && <p className="policy-error" role="alert">{error}</p>}
          <div className="policy-actions">
            <button type="button" className="btn" onClick={decline} disabled={busy}>
              {leaving ? 'Leaving…' : signup ? 'Back to sign in' : 'Decline and sign out'}
            </button>
            {error && !policy && <button type="button" className="btn" onClick={onRetry} disabled={checking || busy}>Retry</button>}
            <button type="button" className="btn primary" disabled={checking || !policy || busy || !acceptedTerms || !acceptedPrivacy}
              onClick={() => {
                if (acceptedTerms && acceptedPrivacy && !busy && !checking && policy) {
                  void onAccept({ acceptedTerms, acceptedPrivacy });
                }
              }}>
              {saving ? 'Saving…' : signup ? 'Continue to signup' : 'Accept and Continue'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

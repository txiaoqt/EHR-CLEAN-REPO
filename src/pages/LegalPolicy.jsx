import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAppPolicy from '../hooks/useAppPolicy.js';
import { PolicyDocument, policySectionId } from '../components/PolicyAgreement.jsx';
import { ArrowUpIcon, ChevronLeftIcon } from '../components/icons/Icons.jsx';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

const POLICY_TABS = [['privacy', 'Privacy Policy'], ['terms', 'Terms of Service']];
const EMPTY_SECTIONS = [];

const focusSection = (sectionId) => {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  document.getElementById(sectionId + '-heading')?.focus({ preventScroll: true });
};

export default function LegalPolicy({ type }) {
  const { policy, checking, error, refresh } = useAppPolicy({ enabled: true });
  const location = useLocation();
  const navigate = useNavigate();
  const id = useId();
  const page = useRef(null);
  const title = useRef(null);
  const readingArea = useRef(null);
  const tabButtons = useRef({});
  const previousType = useRef(null);
  const [activeSection, setActiveSection] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const heading = type === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
  const sections = policy?.[type] || EMPTY_SECTIONS;
  const returningToForm = location.state?.policyBackgroundLocation?.pathname === '/login';

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = heading + ' | TUP Clinic';
    return () => { document.title = previous; };
  }, [heading]);

  useEffect(() => {
    if (!location.hash) {
      const target = previousType.current ? readingArea.current : page.current;
      target?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    previousType.current = type;
  }, [type]);

  useEffect(() => {
    if (!checking && policy && location.hash.startsWith(`#policy-${type}-section-`)) {
      focusSection(location.hash.slice(1));
    }
  }, [location.hash, type, policy, checking]);

  useEffect(() => {
    if (!sections.length) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = policySectionId(type, 0);
      sections.forEach((_, index) => {
        const sectionId = policySectionId(type, index);
        if (document.getElementById(sectionId)?.getBoundingClientRect().top <= 128) current = sectionId;
      });
      const bounds = page.current?.getBoundingClientRect();
      if (bounds && bounds.bottom <= window.innerHeight + 2) current = policySectionId(type, sections.length - 1);
      setActiveSection(current);
      setShowBackToTop(Boolean(bounds && bounds.top < -320));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    // Capture also covers browsers that scroll the body instead of the viewport.
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [sections, type]);

  const switchTab = (next) => {
    if (next === type) return;
    setActiveSection('');
    navigate(next === 'privacy' ? '/privacy' : '/terms', { replace: true, state: location.state });
  };

  const jumpToSection = (sectionId) => {
    if (!sectionId) return;
    // Tab/section changes replace this reading visit, keeping Back useful.
    navigate({ pathname: location.pathname, hash: '#' + sectionId }, { replace: true, state: location.state });
    focusSection(sectionId);
  };

  const backToTop = () => {
    navigate(location.pathname, { replace: true, state: location.state });
    page.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    title.current?.focus({ preventScroll: true });
  };

  const returnToPortal = (event) => {
    if (!returningToForm || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(-1);
  };

  const effectiveDate = policy?.effective_date
    ? new Date(policy.effective_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <main ref={page} className="policy-public-page">
      <header className="policy-public-header">
        <div className="policy-page-container policy-public-header-inner">
          <div className="policy-public-brand">
            <img src={tupehrlogo} alt="" width="40" height="40" />
            <div><strong>TUP CLINIC</strong><span>Manila · Patient Portal</span></div>
          </div>
          <Link to="/login" onClick={returnToPortal} className="policy-portal-link">
            <ChevronLeftIcon size={16} /> Back to portal
          </Link>
        </div>
      </header>

      <section className="policy-page-intro" aria-labelledby={id + '-title'}>
        <div className="policy-page-container">
          <h1 ref={title} tabIndex={-1} id={id + '-title'}>Legal policies</h1>
          <p>Understand how the TUP Manila Clinic portal handles your information and the terms for using its services.</p>
        </div>
      </section>

      <div className="policy-page-container policy-page-content">
        <div className="policy-page-tabs" role="tablist" aria-label="Legal policies">
          {POLICY_TABS.map(([value, label]) => (
            <button key={value} ref={(element) => { tabButtons.current[value] = element; }}
              type="button" role="tab" id={id + '-' + value + '-tab'}
              aria-selected={type === value} aria-controls={id + '-panel'}
              tabIndex={type === value ? 0 : -1} onClick={() => switchTab(value)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 'privacy' : event.key === 'End' ? 'terms'
                  : type === 'privacy' ? 'terms' : 'privacy';
                switchTab(next);
                tabButtons.current[next]?.focus();
              }}>{label}</button>
          ))}
        </div>

        <div ref={readingArea} className="policy-page-reading-layout" id={id + '-panel'}
          role="tabpanel" aria-labelledby={id + '-' + type + '-tab'} aria-busy={checking} tabIndex={0}>
          {checking ? (
            <div className="policy-page-state" role="status"><h2>Loading policies…</h2><p>The current policies will appear here shortly.</p></div>
          ) : error || !policy ? (
            <div className="policy-page-state" role="alert">
              <h2>We could not load the policies</h2>
              <p>{error || 'Please try again to view the current policies.'}</p>
              <button type="button" className="btn primary" onClick={refresh}>Retry</button>
            </div>
          ) : (
            <>
              <aside className="policy-page-sidebar">
                <nav className="policy-section-navigation" aria-label={heading + ' sections'}>
                  <h2>Go to section</h2>
                  <label className="policy-mobile-section-picker" htmlFor={id + '-section-picker'}>
                    <span className="sr-only">Choose a section in the {heading}</span>
                    <select id={id + '-section-picker'} value={activeSection || policySectionId(type, 0)}
                      onChange={(event) => jumpToSection(event.target.value)}>
                      {sections.map((section, index) => (
                        <option key={section.heading} value={policySectionId(type, index)}>{section.heading}</option>
                      ))}
                    </select>
                  </label>
                  <ol className="policy-section-list">
                    {sections.map((section, index) => {
                      const sectionId = policySectionId(type, index);
                      return (
                        <li key={section.heading}>
                          <a href={'#' + sectionId} aria-current={activeSection === sectionId ? 'location' : undefined}
                            onClick={(event) => {
                              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                              event.preventDefault();
                              jumpToSection(sectionId);
                            }}>{section.heading}</a>
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              </aside>

              <article className="policy-page-article" aria-labelledby={id + '-document-title'}>
                <header className="policy-page-document-header">
                  <h2 id={id + '-document-title'}>{heading}</h2>
                  <p className="policy-version">Version {policy.version}<span aria-hidden="true"> · </span>
                    Effective <time dateTime={policy.effective_date}>{effectiveDate}</time>
                  </p>
                </header>
                <PolicyDocument sections={sections} sectionPrefix={type} />
                <footer className="policy-source-note">
                  <p>Privacy resources: <a href="https://privacy.gov.ph/the-right-to-be-informed/" target="_blank" rel="noopener noreferrer">National Privacy Commission</a>.</p>
                  <p>Clinic contact: <a href="https://www.tup.edu.ph/page/contact-us" target="_blank" rel="noopener noreferrer">TUP official directory</a>.</p>
                </footer>
              </article>
            </>
          )}
        </div>
      </div>

      {showBackToTop && <button type="button" className="policy-back-to-top" onClick={backToTop}>
        <ArrowUpIcon size={16} /> Back to top
      </button>}
    </main>
  );
}

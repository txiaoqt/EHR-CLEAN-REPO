import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { useRecordComplete } from '../../hooks/useRecordComplete.js';
import EnrolleeDocumentUpload from '../../components/EnrolleeDocumentUpload.jsx';
import EnrolleeElevationCard from '../../components/EnrolleeElevationCard.jsx';
import { AlertIcon } from '../../components/icons/Icons.jsx';

/**
 * The enrollee's home — one thing to do, and its status.
 *
 * Deliberately sparse. An enrollee can submit a medical certificate and nothing
 * else, so the page is built around that single action rather than a dashboard
 * of destinations they cannot use.
 *
 * The upload is locked until the clinic record form is submitted. It is shown
 * locked rather than hidden: an applicant should be able to see what is waiting
 * for them and why, not be met with an absence.
 */
const EnrolleeHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, complete } = useRecordComplete();
  const firstName = (user?.name || '').split(' ')[0] || 'there';

  const locked = !loading && !complete;

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Welcome, {firstName}</h1>
            <div className="page-header-subtitle">
              Save your medical certificate as a draft, then submit it when you are ready. You can
              add multiple files and follow each review decision here.
            </div>
          </div>
        </div>

        {locked && (
          <div
            className="settings-callout"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              marginTop: 0,
              marginBottom: 20,
              borderColor: 'var(--color-rose-text)',
            }}
          >
            <AlertIcon size={16} />
            <div>
              <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginBottom: 4 }}>
                Complete your clinic record first
              </div>
              <div>
                The clinic needs your medical history and contact details before it can accept a
                certificate.
              </div>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => navigate('/enrollee/profile')}
              >
                Go to Profile
              </button>
            </div>
          </div>
        )}

        <div className="card settings-card" style={{ marginBottom: 20 }}>
          <header className="settings-card-head">
            <h2>Medical certificate</h2>
            <p>Choose one or more clear photos or PDFs, up to 10 MB each. Files are not uploaded until you save or submit them.</p>
          </header>

          <EnrolleeDocumentUpload locked={locked} />
        </div>

        <EnrolleeElevationCard locked={locked} />
      </div>
    </main>
  );
};

export default EnrolleeHome;

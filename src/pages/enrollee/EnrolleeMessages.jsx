import React from 'react';
import { useAuth } from '../../AuthContext.jsx';
import EnrolleeMessageThread from '../../components/EnrolleeMessageThread.jsx';

/**
 * Messages between an enrollee and the TUP Clinic (nurse / physician staff).
 *
 * Separate from patient messaging because an enrollee does not yet hold a
 * TUPM-YY-XXXX patient_id until elevation.
 */
const EnrolleeMessages = () => {
  const { user } = useAuth();

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Messages</h1>
            <div className="page-header-subtitle">
              Ask the TUP Clinic nurse or physician about your medical certificate or enrolment
              record.
            </div>
          </div>
        </div>

        <div className="card settings-card">
          <header className="settings-card-head">
            <h2>Clinic conversation</h2>
            <p>
              Messages here go directly to TUP Clinic nurses and physicians reviewing enrollee
              submissions.
            </p>
          </header>

          <EnrolleeMessageThread
            enrolleeId={user?.id}
            enrolleeName={user?.name || 'Applicant'}
            viewer="enrollee"
          />
        </div>
      </div>
    </main>
  );
};

export default EnrolleeMessages;

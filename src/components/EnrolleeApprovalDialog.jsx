import React, { useEffect, useId, useRef, useState } from 'react';
import { CloseIcon } from './icons/Icons.jsx';

const EnrolleeApprovalDialog = ({ documents, applicantName, busy, progress, onConfirm, onCancel }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const dialogRef = useRef(null);
  const acknowledgementRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const multiple = documents.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    acknowledgementRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  const cancel = () => { if (!busy) onCancel(); };
  const confirm = (event) => {
    event.preventDefault();
    if (acknowledged && !busy) onConfirm(true);
  };

  return (
    <dialog
      ref={dialogRef}
      className="enrollee-approval-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); cancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget) cancel(); }}
    >
      <form className="enrollee-approval-panel" onSubmit={confirm}>
        <div className="enrollee-approval-heading">
          <h2 id={titleId}>{multiple ? 'Approve selected documents?' : 'Approve this document?'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Cancel approval" disabled={busy} onClick={cancel}>
            <CloseIcon size={18} />
          </button>
        </div>
        <p id={descriptionId} className="enrollee-approval-description">
          {multiple ? 'These decisions' : 'This decision'} will be visible to {applicantName || 'the applicant'}.
          {' '}Confirm you have reviewed {multiple ? 'all the files listed below' : 'the file listed below'}.
        </p>
        <div className="enrollee-approval-files">
          <h3>{documents.length} document{multiple ? 's' : ''} for approval</h3>
          <ul>
            {documents.map((document) => <li key={document.id}>{document.file_name}</li>)}
          </ul>
        </div>
        <label className="enrollee-approval-acknowledgement">
          <input
            ref={acknowledgementRef}
            type="checkbox"
            className="enrollee-review-checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>I have reviewed {multiple ? 'each listed document' : 'the listed document'} and acknowledge this approval.</span>
        </label>
        {busy && (
          <p className="enrollee-approval-progress" role="status">
            {progress ? `Approving ${progress.current} of ${progress.total} documents…` : 'Saving approval…'}
          </p>
        )}
        <div className="enrollee-approval-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={cancel}>Cancel</button>
          <button type="submit" className="btn" disabled={!acknowledged || busy}>
            {busy ? 'Approving…' : multiple ? `Approve ${documents.length} documents` : 'Approve document'}
          </button>
        </div>
      </form>
    </dialog>
  );
};

export default EnrolleeApprovalDialog;

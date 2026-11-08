import React, { useEffect, useRef } from 'react';

const formatDate = (value) => (value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  : '—');

// A last look at the details before the account is created, so a typo in a name
// or ID is caught before it is stored.
export default function SignupReviewDialog({ rows, note, onEdit, onConfirm }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="signup-review-dialog"
      aria-labelledby="signup-review-title"
      aria-describedby="signup-review-description"
      onCancel={(event) => { event.preventDefault(); onEdit(); }}
    >
      <h2 id="signup-review-title">Review your details</h2>
      <p id="signup-review-description">
        Check that everything is spelled correctly. {note}
      </p>
      <dl>
        {rows.map(([label, value, kind]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{kind === 'date' ? formatDate(value) : (value || '—')}</dd>
          </div>
        ))}
      </dl>
      <div className="signup-review-actions">
        <button type="button" className="btn secondary" onClick={onEdit}>Edit Details</button>
        <button type="button" className="btn" onClick={onConfirm} autoFocus>Confirm &amp; Create Account</button>
      </div>
    </dialog>
  );
}

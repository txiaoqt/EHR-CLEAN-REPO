import React, { useEffect, useRef, useState } from 'react';

// Sign-out confirmation shared by every portal. It stays open showing
// "Signing out…" until the sign-out finishes, so the click has visible feedback.
export default function SignOutDialog({ message = 'Are you sure you want to sign out?', onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <dialog
      ref={dialogRef}
      className="idle-logout-dialog"
      aria-labelledby="sign-out-title"
      aria-describedby="sign-out-description"
      aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    >
      <h2 id="sign-out-title">Sign Out?</h2>
      <p id="sign-out-description">{busy ? 'Signing you out…' : message}</p>
      <div className="idle-logout-actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn danger" onClick={confirm} disabled={busy} autoFocus>
          {busy ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </dialog>
  );
}

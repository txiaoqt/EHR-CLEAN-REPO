import React, { useEffect, useRef, useState } from 'react';

// Modal confirmation that stays open showing busyLabel until onConfirm settles,
// so a slow network call still gives the click visible feedback.
export default function ConfirmDialog({
  title, message, busyMessage = message, confirmLabel, busyLabel = confirmLabel,
  cancelLabel = 'Cancel', danger = false, onCancel, onConfirm,
}) {
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
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    >
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-description">{busy ? busyMessage : message}</p>
      <div className="idle-logout-actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button type="button" className={danger ? 'btn danger' : 'btn'} onClick={confirm} disabled={busy} autoFocus>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

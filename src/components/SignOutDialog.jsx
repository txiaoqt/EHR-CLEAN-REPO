import React from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';

// Sign-out confirmation shared by every portal.
export default function SignOutDialog({ message = 'Are you sure you want to sign out?', onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      title="Sign Out?"
      message={message}
      busyMessage="Signing you out…"
      confirmLabel="Sign Out"
      busyLabel="Signing out…"
      danger
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

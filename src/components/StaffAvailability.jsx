import React from 'react';
import '../styles/staffPresence.css';

const LABELS = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Checking…',
  unavailable: 'Status unavailable',
  general: 'Shared clinic inbox',
};

export default function StaffAvailability({ status = 'unavailable', live = false }) {
  return (
    <span className="staff-availability" data-status={status} aria-live={live ? 'polite' : undefined}>
      <span className="staff-availability-dot" aria-hidden="true" />
      <span>{LABELS[status] || LABELS.unavailable}</span>
    </span>
  );
}

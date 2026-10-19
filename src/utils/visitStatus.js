const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

// Appointment rows can be linked to an encounter from the same date. Their
// completion must follow the appointment itself so a scheduled booking cannot
// inherit a completed status from another visit. Standalone encounters use
// their own clinical status.
export const isVisitCompleted = (visit) => {
  if (!visit) return false;

  const source = normalizeStatus(visit.visit_source);
  if (source === 'appointment' || visit.appointment_id) {
    return normalizeStatus(visit.appointment_status) === 'completed';
  }
  if (source === 'encounter') {
    return normalizeStatus(visit.encounter_status) === 'completed';
  }

  if (visit.appointment_status != null) {
    return normalizeStatus(visit.appointment_status) === 'completed';
  }
  return normalizeStatus(visit.encounter_status) === 'completed';
};

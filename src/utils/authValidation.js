// src/utils/authValidation.js

export const ALLOWED_USER_EMAIL_DOMAIN = '@tup.edu.ph';

export const STUDENT_ID_REGEX = /^TUPM-[0-9]{2}-[0-9]{4}$/;
// TUPM + date of birth as MMDDYY + '-' + 3-digit employee number, e.g. TUPM120172-001.
export const FACULTY_ID_REGEX = /^TUPM[0-9]{6}-[0-9]{3}$/;

export const isValidTupEmail = (val) => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed.endsWith(ALLOWED_USER_EMAIL_DOMAIN) &&
    trimmed.length > ALLOWED_USER_EMAIL_DOMAIN.length &&
    /^[^\s@]+@tup\.edu\.ph$/.test(trimmed)
  );
};

// TUP issues firstname.lastname@ to students and firstname_lastname@ to faculty.
export const isStudentTupEmail = (val) => isValidTupEmail(val) && /^[^\s@_]+\.[^\s@_]+@/.test(val.trim().toLowerCase());
export const isFacultyTupEmail = (val) => isValidTupEmail(val) && /^[^\s@.]+_[^\s@.]+@/.test(val.trim().toLowerCase());

export const isValidStudentId = (val) => {
  if (!val || typeof val !== 'string') return false;
  return STUDENT_ID_REGEX.test(val.trim().toUpperCase());
};

export const isValidFacultyId = (val) => {
  if (!val || typeof val !== 'string') return false;
  return FACULTY_ID_REGEX.test(val.trim().toUpperCase());
};

// 'student' or 'faculty', from the ID format alone (the same rule as patients.patient_type).
export const patientTypeOf = (id) => (String(id || '').toUpperCase().startsWith('TUPM-') ? 'student' : 'faculty');

export default {
  ALLOWED_USER_EMAIL_DOMAIN,
  STUDENT_ID_REGEX,
  FACULTY_ID_REGEX,
  isValidTupEmail,
  isStudentTupEmail,
  isFacultyTupEmail,
  isValidStudentId,
  isValidFacultyId,
  patientTypeOf,
};

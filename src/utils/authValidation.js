// src/utils/authValidation.js

export const ALLOWED_USER_EMAIL_DOMAIN = '@tup.edu.ph';

export const STUDENT_ID_REGEX = /^TUPM-[0-9]{2}-[0-9]{4}$/;

export const isValidTupEmail = (val) => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed.endsWith(ALLOWED_USER_EMAIL_DOMAIN) &&
    trimmed.length > ALLOWED_USER_EMAIL_DOMAIN.length &&
    /^[^\s@]+@tup\.edu\.ph$/.test(trimmed)
  );
};

export const isValidStudentId = (val) => {
  if (!val || typeof val !== 'string') return false;
  return STUDENT_ID_REGEX.test(val.trim().toUpperCase());
};

export default {
  ALLOWED_USER_EMAIL_DOMAIN,
  STUDENT_ID_REGEX,
  isValidTupEmail,
  isValidStudentId,
};

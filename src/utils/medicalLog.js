// src/utils/medicalLog.js
//
// Shared vocabulary for the Medical Log. The paper form has very little room
// per cell, so it prints SEX as M/F and DEPT./COURSE as an acronym. Both the
// on-screen grid and the export use these, so they can never disagree.

export const COURSE_ACRONYMS = {
  'BS Computer Science': 'BSCS',
  'BS Information Technology': 'BSIT',
  'BS Information Systems': 'BSIS',
  'BS Mathematics': 'BSMath',
  'BS Biology': 'BSBio',
  'BS Chemistry': 'BSChem',
  'BS Food Technology': 'BSFT',
  'BS Environmental Science': 'BSES',
};

/** 'BS Computer Science' -> 'BSCS'. Unknown values pass through unchanged. */
export const courseAcronym = (course) => {
  if (!course) return '';
  return COURSE_ACRONYMS[course] || course;
};

/** 'Male' -> 'M', 'Female' -> 'F' — the form prints single letters. */
export const sexAbbrev = (sex) => {
  if (!sex) return '';
  const s = String(sex).trim().toLowerCase();
  if (s === 'male' || s === 'm') return 'M';
  if (s === 'female' || s === 'f') return 'F';
  return String(sex).charAt(0).toUpperCase();
};

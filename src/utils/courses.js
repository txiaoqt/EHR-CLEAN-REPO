/**
 * Degree programmes offered by TUP Manila, grouped by the six colleges the
 * University names on its own Academics page.
 *
 * Taken from TUP's admission requirements page
 * (ers.tup.edu.ph/aims/applicants/admissionrequirements.php), which sets out the
 * programmes college by college, cross-checked against the University's
 * estimated-tuition table and its Academics page.
 *
 * Shared by the sign-up form and the clinic record form. Two copies would drift,
 * and a student who picked a programme at sign-up would then find it missing from
 * the list on their own record.
 */
export const COURSE_GROUPS = [
  {
    college: 'College of Engineering',
    programs: [
      'BS Civil Engineering',
      'BS Electrical Engineering',
      'BS Electronics Engineering',
      'BS Mechanical Engineering',
    ],
  },
  {
    college: 'College of Science',
    programs: [
      'BS Computer Science',
      'BS Information Technology',
      'BS Information Systems',
      'BS Environmental Science',
      'BS Applied Science major in Laboratory Technology',
    ],
  },
  {
    college: 'College of Industrial Technology',
    programs: [
      'Bachelor of Engineering Technology major in Computer Engineering Technology',
      'Bachelor of Engineering Technology major in Civil Technology',
      'Bachelor of Engineering Technology major in Electrical Technology',
      'Bachelor of Engineering Technology major in Electronics Technology',
      'Bachelor of Engineering Technology major in Electronics and Communications Technology',
      'Bachelor of Engineering Technology major in Instrumentation and Control Technology',
      'Bachelor of Engineering Technology major in Mechanical Technology',
      'Bachelor of Engineering Technology major in Mechatronics Technology',
      'Bachelor of Engineering Technology major in Railway Technology',
      'Bachelor of Engineering Technology major in Mechanical Engineering Technology option in Automotive Technology',
      'Bachelor of Engineering Technology major in Mechanical Engineering Technology option in Foundry Technology',
      'BS Food Technology',
    ],
  },
  {
    college: 'College of Industrial Education',
    programs: [
      'Bachelor of Technical Teacher Education',
      'Bachelor of Technical Vocational Teacher Education',
      'BS Industrial Education major in Art Education',
      'BS Industrial Education major in Computer Education',
      'BS Industrial Education major in Electrical Technology',
      'BS Industrial Education major in Electronics Technology',
      'BS Industrial Education major in Home Economics',
      'BS Industrial Education major in Industrial Arts',
    ],
  },
  {
    college: 'College of Architecture and Fine Arts',
    programs: [
      'BS Architecture',
      'BS Graphics Technology',
      'BS Product Design and Development Technology',
      'Bachelor of Fine Arts',
    ],
  },
  {
    college: 'College of Liberal Arts',
    programs: [
      'BS Entrepreneurial Management',
      'Bachelor of Arts in Management major in Industrial Management',
    ],
  },
];

/** Every programme as one flat list, for validation and lookups. */
export const ALL_PROGRAMS = COURSE_GROUPS.flatMap((g) => g.programs);

/**
 * A Philippine mobile number: eleven digits, beginning 09.
 *
 * Deliberately shape-only. It cannot tell a real number from a made-up one, and
 * it does not try — the clinic calls the number, which is the real check.
 */
export const PH_PHONE_REGEX = /^09\d{9}$/;

/** Digits only, so a pasted number with spaces or dashes still reads cleanly. */
export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Converts common Philippine mobile formats to the local 09XXXXXXXXX form.
 * Other values are returned unchanged so invalid legacy data stays visible for
 * correction instead of being silently rewritten into a different number.
 */
export const normalizePhMobile = (value) => {
  const raw = String(value ?? '').trim();
  const digits = digitsOnly(raw);

  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  if (PH_PHONE_REGEX.test(digits)) return digits;
  return raw;
};

/** Keeps a phone entry to eleven local-format digits while it is being typed. */
export const limitPhone = (value) => digitsOnly(normalizePhMobile(value)).slice(0, 11);

export const isValidPhMobile = (value) => PH_PHONE_REGEX.test(digitsOnly(normalizePhMobile(value)));

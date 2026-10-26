export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{};'\"\\|<>?,./`~";
export const PASSWORD_POLICY_MESSAGE = 'Use 8–128 characters, including at least one uppercase letter, one number and one special character (e.g. ! @ #).';

export const AUTH_PASSWORD_CONFIG = {
  password_min_length: PASSWORD_MIN_LENGTH,
  password_required_characters: `ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:${PASSWORD_SPECIAL_CHARACTERS}`,
};

export function passwordCriteria(value) {
  const password = typeof value === 'string' ? value : '';
  return [
    { id: 'length', label: 'At least 8 characters', valid: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH },
    { id: 'uppercase', label: 'One uppercase letter (A–Z)', valid: /[A-Z]/.test(password) },
    { id: 'number', label: 'One number (0–9)', valid: /[0-9]/.test(password) },
    { id: 'special', label: 'One special character (! @ #)', valid: [...password].some(character => PASSWORD_SPECIAL_CHARACTERS.includes(character)) },
  ];
}

export const isPasswordValid = (value) => passwordCriteria(value).every(rule => rule.valid);
export const createTemporaryPassword = () => `${crypto.randomUUID()}Aa1!`;

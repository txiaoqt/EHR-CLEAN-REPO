// src/utils/nameFormat.js
//
// Name normalisation for the clinic register.
//
// Records must not carry SHOUTED or all-lowercase names, so every name is
// reduced to Proper Case before it is stored. Plain title-casing is not enough
// for Filipino names, which use lowercase particles ("Maria dela Cruz") and
// suffixes ("Juan Santos III"), so both are handled.

// Lowercase unless they are the first word of the name.
const LOWERCASE_PARTICLES = new Set([
  'de', 'del', 'dela', 'delas', 'dels', 'der', 'den',
  'van', 'von', 'vin', 'da', 'das',
  'la', 'las', 'lo', 'los', 'le', 'les',
  'san', 'santa', 'sto', 'sta',
  'bin', 'binti', 'al',
]);

// Kept uppercase: generational suffixes and their punctuation.
const ROMAN_SUFFIX = /^(i{1,3}|iv|v|vi{0,3}|ix|x)$/;

/** 'EMIEL JOHN' -> 'Emiel John', 'maria dela cruz' -> 'Maria dela Cruz' */
export const toProperName = (value) => {
  if (value == null) return '';
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word, wordIndex) => {
      if (!word) return word;

      // Handle hyphenated and apostrophed parts individually:
      // "santos-reyes" -> "Santos-Reyes", "o'brien" -> "O'Brien".
      return word
        .split(/([-'’])/)
        .map((part, partIndex) => {
          if (!part || /^[-'’]$/.test(part)) return part;

          if (partIndex === 0 && wordIndex > 0 && LOWERCASE_PARTICLES.has(part)) {
            return part;
          }
          if (ROMAN_SUFFIX.test(part)) {
            return part.toUpperCase();
          }
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('');
    })
    .join(' ');
};

/**
 * Builds the single display name the database stores, PSA-style:
 * "First Middle Last" — or "First Last" when no middle name is given.
 * An initial-style middle name is kept as typed ("G." -> "G.").
 */
export const composeFullName = ({ firstName = '', middleName = '', lastName = '' }) => {
  const parts = [toProperName(firstName), toProperName(middleName), toProperName(lastName)]
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.join(' ');
};

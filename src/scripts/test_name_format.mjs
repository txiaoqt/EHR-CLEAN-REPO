import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' PERSONAL NAME FORMATTING');
console.log('='.repeat(80));

const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

// Evaluate the shipped module rather than a copy of it.
const src = read('src/utils/nameFormat.js').replace(/export const /g, 'const ');
const sandbox = new Function(`${src}\nreturn { toProperName, composeFullName };`)();
const { toProperName, composeFullName } = sandbox;

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 1] Shouted and lowercase input is corrected');
// -----------------------------------------------------------------------------
const casing = [
  ['EMIEL JOHN', 'Emiel John'],
  ['EMIEL JOHN ESTABAYA', 'Emiel John Estabaya'],
  ['emiel john estabaya', 'Emiel John Estabaya'],
  ['jenny molina', 'Jenny Molina'],
  ['JENNY MOLINA', 'Jenny Molina'],
];
for (const [input, expected] of casing) {
  assert.strictEqual(toProperName(input), expected, `${JSON.stringify(input)} -> ${JSON.stringify(expected)}`);
}
console.log(`  ✓ PASS: ${casing.length} shouted/lowercase names normalised`);

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Filipino name conventions');
// -----------------------------------------------------------------------------
const filipino = [
  // Lowercase particles, unless they open the name.
  ['maria dela cruz', 'Maria dela Cruz'],
  ['MARIA DELA CRUZ', 'Maria dela Cruz'],
  ['juan del rosario', 'Juan del Rosario'],
  ['de la cruz', 'De la Cruz'],
  ['juan de la cruz', 'Juan de la Cruz'],
  // Generational suffixes stay uppercase.
  ['juan santos iii', 'Juan Santos III'],
  ['juan santos jr', 'Juan Santos Jr'],
  // Hyphens and apostrophes.
  ['SANTOS-REYES', 'Santos-Reyes'],
  ["O'BRIEN", "O'Brien"],
];
for (const [input, expected] of filipino) {
  assert.strictEqual(toProperName(input), expected, `${JSON.stringify(input)} -> ${JSON.stringify(expected)}`);
}
console.log(`  ✓ PASS: ${filipino.length} particle / suffix / punctuation cases`);

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Already-correct names are left alone');
// -----------------------------------------------------------------------------
const stable = [
  'Eurich Angel Lynn G. Aquino',
  'Angel Keith Carbon',
  'Stephen John Blanco Bartolini',
  'Cyre Abijah Ronn Morales',
];
for (const name of stable) {
  assert.strictEqual(toProperName(name), name, `${JSON.stringify(name)} is unchanged`);
}
console.log(`  ✓ PASS: ${stable.length} correctly-cased names pass through untouched`);

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Whitespace and empties');
// -----------------------------------------------------------------------------
assert.strictEqual(toProperName('  extra   spaces  '), 'Extra Spaces');
assert.strictEqual(toProperName(''), '');
assert.strictEqual(toProperName('   '), '');
assert.strictEqual(toProperName(null), '');
assert.strictEqual(toProperName(undefined), '');
console.log('  ✓ PASS: collapsed whitespace, empty and null handled');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] PSA-style name composition');
// -----------------------------------------------------------------------------
assert.strictEqual(
  composeFullName({ firstName: 'EMIEL', middleName: 'john', lastName: 'ESTABAYA' }),
  'Emiel John Estabaya'
);
assert.strictEqual(
  composeFullName({ firstName: 'EMIEL JOHN', middleName: '', lastName: 'ESTABAYA' }),
  'Emiel John Estabaya',
  'middle name is optional'
);
assert.strictEqual(
  composeFullName({ firstName: 'Angel Keith', middleName: 'C.', lastName: 'Carbon' }),
  'Angel Keith C. Carbon',
  'an initial-style middle name is kept'
);
console.log('  ✓ PASS: First / Middle (optional) / Last composes correctly');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Registration form uses the parts, not one field');
// -----------------------------------------------------------------------------
const login = read('src/pages/Login.jsx');
assert(!/signupData\.fullName/.test(login), 'the single Full Name field is gone');
for (const field of ['signup-first-name', 'signup-middle-name', 'signup-last-name']) {
  assert(login.includes(field), `${field} exists`);
}
assert(login.includes('toProperName'), 'fields normalise on blur');
assert(login.includes('composeFullName'), 'the stored name is composed from the parts');
assert(/Middle Name[\s\S]{0,200}optional/.test(login), 'middle name is marked optional');
console.log('  ✓ PASS: First / Middle (optional) / Last Name with on-blur normalisation');

// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] SQL counterpart exists and agrees');
// -----------------------------------------------------------------------------
const sql = read('supabase/migrations/20261017230000_normalize_person_name_casing.sql');
assert(/CREATE OR REPLACE FUNCTION public\.proper_name/.test(sql), 'proper_name() is defined');
for (const particle of ['dela', 'del', 'van', 'la']) {
  assert(sql.includes(`'${particle}'`), `particle "${particle}" handled in SQL`);
}
assert(/i\{1,3\}\|iv\|v/.test(sql), 'Roman-numeral suffixes kept uppercase in SQL');
assert(/UPDATE public\.patients/.test(sql) && /UPDATE public\.patient_profiles/.test(sql), 'existing rows are corrected');
console.log('  ✓ PASS: SQL proper_name() mirrors the JS formatter');

console.log('\n' + '='.repeat(80));
console.log(' ALL NAME FORMATTING TESTS PASSED (100%)');
console.log('='.repeat(80));

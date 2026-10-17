import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' ADMIN + PATIENT (PC VIEWPORT) TYPOGRAPHY & COLOR STANDARDIZATION AUDIT');
console.log('='.repeat(80));

const adminFiles = [
  'src/pages/Dashboard.jsx',
  'src/pages/Appointments.jsx',
  'src/pages/Patients.jsx',
  'src/pages/Encounter.jsx',
  'src/pages/MedicalLog.jsx',
  'src/pages/Reports.jsx',
  'src/pages/Inventory.jsx',
  'src/pages/Events.jsx',
  'src/pages/StaffPatientMessages.jsx',
  'src/pages/Help.jsx',
  'src/pages/Settings.jsx',
  'src/pages/MyProfile.jsx',
  'src/pages/PatientProfile.jsx'
];

const patientFiles = [
  'src/pages/patient/PatientDashboard.jsx',
  'src/pages/patient/PatientEvents.jsx',
  'src/pages/patient/PatientSchedule.jsx',
  'src/pages/patient/PatientMessages.jsx',
  'src/pages/patient/PatientRecords.jsx',
  'src/pages/patient/PatientProfilePortal.jsx',
  'src/pages/patient/PatientSettings.jsx',
  'src/pages/patient/AppointmentBookingFlow.jsx'
];

const portalFiles = [...adminFiles, ...patientFiles];

const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

// -----------------------------------------------------------------------------
// [TEST GROUP 1] Page Header Typography Standardization
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 1] Page Header Typography Standardization');

for (const rel of adminFiles) {
  const content = read(rel);
  assert(content.includes('page-header'), `${rel} includes 'page-header' container`);
  assert(content.includes('page-header-title'), `${rel} defines standardized 'page-header-title' class`);
  console.log(`  ✓ PASS: ${rel} includes standardized page-header and page-header-title`);
}

// -----------------------------------------------------------------------------
// [TEST GROUP 2] PC / Desktop 14px Body Baseline
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] PC / Desktop 14px Body Baseline');

const variables = read('src/styles/variables.css');
assert(
  /@media\s*\(min-width:\s*1024px\)\s*\{[\s\S]*?--font-size-base:\s*14px/.test(variables),
  'variables.css defines a >=1024px typography baseline with a 14px body size'
);
assert(
  /--font-size-2xs:\s*11px/.test(variables) && /--font-size-page-title:\s*26px/.test(variables),
  'variables.css steps the rest of the desktop scale from the 14px baseline'
);

// The three desktop densities must stay meaningfully apart, or the preference
// would silently do nothing.
const desktopBase = [...variables.matchAll(/--font-size-base:\s*(\d+)px/g)].map((m) => Number(m[1]));
assert(
  desktopBase.includes(12) && desktopBase.includes(14) && desktopBase.includes(15),
  `compact / normal / comfortable remain distinct (bases: ${[...new Set(desktopBase)].sort((a, b) => a - b).join(', ')})`
);
// The staff portal runs compact, matched to the reference admin's used sizes:
// a 12px working size (their `text-xs`), 14px for emphasis (their `text-sm`).
//
// The density variants are declared TWICE — once for mobile/tablet, once inside
// `@media (min-width: 1024px)`. The desktop block comes second and wins above
// 1024px, so that is the one the staff portal actually renders; read it via
// lastIndexOf, not indexOf.
const compactAt = variables.lastIndexOf('html[data-density="compact"],');
const comfortableAt = variables.indexOf('html[data-density="comfortable"],', compactAt);
const compactBlock = variables.slice(compactAt, comfortableAt);
assert(compactBlock.length > 0, 'the desktop compact block was located');
assert(
  /--font-size-base:\s*12px/.test(compactBlock),
  'compact renders its working text at 12px, matching the reference admin'
);
assert(
  /--font-size-md:\s*14px/.test(compactBlock),
  'compact steps to 14px for emphasis, as the reference does'
);
console.log('  ✓ PASS: Desktop (>=1024px) typography baseline is a 14px body scale');

// -----------------------------------------------------------------------------
// [TEST GROUP 3] Zero Raw / Sub-11px Font Sizes in Portal UI
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Zero Raw / Sub-11px Font Sizes in Portal UI');

// Reports.jsx keeps numeric point sizes for its jsPDF autoTable export config,
// which cannot resolve CSS custom properties.
const RAW_NUMERIC_ALLOWLIST = ['src/pages/Reports.jsx'];

const sub11Regex = /(fontSize\s*:\s*(?:[1-9]|10)(?:\.0+)?(?=[,\s;}])|font-size\s*:\s*(?:[1-9]|10)px)/gi;
const rawNumericRegex = /(fontSize\s*:\s*\d+(?:\.\d+)?(?=[,\s;}])|font-size\s*:\s*\d+px)/gi;

const sub11Violations = [];
const rawNumericViolations = [];

for (const rel of portalFiles) {
  const content = read(rel);
  const sub11 = content.match(sub11Regex);
  if (sub11) sub11Violations.push({ file: rel, matches: sub11 });

  if (!RAW_NUMERIC_ALLOWLIST.includes(rel)) {
    const raw = content.match(rawNumericRegex);
    if (raw) rawNumericViolations.push({ file: rel, matches: raw });
  }
}

assert.strictEqual(
  sub11Violations.length,
  0,
  `Found sub-11px font sizes: ${JSON.stringify(sub11Violations, null, 2)}`
);
console.log('  ✓ PASS: Zero sub-11px font sizes detected in portal UI (11px floor preserved)');

assert.strictEqual(
  rawNumericViolations.length,
  0,
  `Found raw numeric font sizes outside of design tokens: ${JSON.stringify(rawNumericViolations, null, 2)}`
);
console.log('  ✓ PASS: All portal font sizes resolve through design tokens (no raw px)');

// -----------------------------------------------------------------------------
// [TEST GROUP 4] Zero Fractional Font Sizes
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Zero Fractional Font Sizes');

const fractionalRegex = /(fontSize\s*:\s*['"`]?\d+\.\d+|font-size\s*:\s*\d+\.\d+px)/gi;
const fractionalViolations = [];

for (const rel of portalFiles) {
  const matches = read(rel).match(fractionalRegex);
  if (matches) fractionalViolations.push({ file: rel, matches });
}

assert.strictEqual(
  fractionalViolations.length,
  0,
  `Found fractional font sizes: ${JSON.stringify(fractionalViolations, null, 2)}`
);
console.log('  ✓ PASS: Zero fractional font sizes detected across all portal pages');

// -----------------------------------------------------------------------------
// [TEST GROUP 5] Font Weight & Text Color Tokens Standardized
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Font Weight & Text Color Tokens Standardized');

for (const token of ['normal', 'medium', 'semibold', 'bold', 'extrabold']) {
  assert(
    variables.includes(`--font-weight-${token}:`),
    `variables.css defines --font-weight-${token}`
  );
}
assert(
  variables.includes('--text-on-primary:'),
  'variables.css defines the --text-on-primary role'
);

const weightTokenUse = portalFiles.reduce(
  (acc, rel) => acc + (read(rel).match(/var\(--font-weight-/g) || []).length,
  0
);
assert(weightTokenUse > 100, `Font weights are tokenized across the portal (found ${weightTokenUse} uses)`);

const rawWeightViolations = [];
for (const rel of portalFiles) {
  const matches = read(rel).match(/fontWeight\s*:\s*\d+(?=[,\s;}])/gi);
  if (matches) rawWeightViolations.push({ file: rel, matches });
}
assert.strictEqual(
  rawWeightViolations.length,
  0,
  `Found raw numeric font weights: ${JSON.stringify(rawWeightViolations, null, 2)}`
);
console.log(`  ✓ PASS: Font weight scale tokenized and consistently applied (${weightTokenUse} token uses)`);

// -----------------------------------------------------------------------------
// [TEST GROUP 6] PC/Desktop Exclusivity Safeguard
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] PC/Desktop Exclusivity Safeguard');

const appContent = read('src/App.jsx');
assert(
  appContent.includes('PCAccessRequired') &&
  appContent.includes('useStaffDeviceCheck') &&
  appContent.includes('isStaffProtected'),
  'App.jsx enforces PC/Desktop exclusivity safeguard for the Staff Portal'
);
console.log('  ✓ PASS: Staff Portal PC/Desktop access safeguard strictly enforced');

// -----------------------------------------------------------------------------
// [TEST GROUP 7] Patient preferences do not leak into the staff portal
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] Patient preferences do not leak into the staff portal');

// Text density is a patient-portal preference. One localStorage key was read on
// BOTH surfaces, so a patient choosing "compact" restyled the staff portal — and
// logging out did not undo it, because the stored key outlives the session.
//
// The staff portal pins its density rather than reading the patient preference.
// It currently runs NORMAL (a 14px desktop baseline).
assert(
  /if \(!IS_USER_SURFACE\) \{\s*\n\s*document\.documentElement\.setAttribute\('data-density', 'normal'\)/.test(appContent),
  'the staff portal pins normal instead of reading the patient preference'
);
assert(
  /if \(!IS_USER_SURFACE\)[\s\S]{0,300}return undefined;/.test(appContent),
  'the density change listener is not registered on the staff surface either'
);
// Proximity is not control flow: the stored read sits close to the staff branch
// in the source, but only AFTER its early return. Assert the ordering.
const staffBranchAt = appContent.indexOf('if (!IS_USER_SURFACE)');
const storedReadAt = appContent.indexOf("localStorage.getItem('tup-clinic-density')");
assert(
  staffBranchAt !== -1 && storedReadAt > staffBranchAt &&
    appContent.slice(staffBranchAt, storedReadAt).includes('return undefined;'),
  'the staff branch returns before the stored preference is ever read'
);

const patientSettingsContent = read('src/pages/patient/PatientSettings.jsx');
assert(
  /const IS_DENSITY_SURFACE = DENSITY_SURFACE === 'user'/.test(patientSettingsContent),
  'the patient settings helper is gated to the patient surface'
);
assert(
  /if \(!IS_DENSITY_SURFACE\) return;/.test(patientSettingsContent),
  'it refuses to touch the document anywhere else'
);

// Nothing else may set the attribute, or the gate could be bypassed.
const densityWriters = (appContent.match(/setAttribute\('data-density'/g) || []).length
  + (patientSettingsContent.match(/setAttribute\('data-density'/g) || []).length;
assert(
  densityWriters === 4,
  `density is written only in the two gated places (${densityWriters} writers)`
);
console.log('  ✓ PASS: text density is scoped to the patient surface');

// -----------------------------------------------------------------------------
// [TEST GROUP 8] One font family, and it is actually available
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] The font family matches the reference admin');

// The reference admin (lydorg) is dominated by `font-segoe` — "Segoe UI",
// system-ui, sans-serif — a SYSTEM font, so nothing is fetched and it works
// offline. This stack used to lead with 'Inter', which was never loaded
// anywhere, so the browser silently fell through to system-ui regardless.
assert(
  /--font-sans:\s*"Segoe UI",\s*system-ui/.test(variables),
  'the app font stack leads with Segoe UI, as the reference does'
);
assert(
  !/--font-sans:\s*'Inter'/.test(variables),
  'it no longer leads with a font that is never loaded'
);

// Nothing in the project loads a webfont, so a leading webfont name would be a
// dead entry. Confirm that is still true — if a font is ever added, this test
// should be revisited deliberately.
//
// Match the RULE, not the words: the comment above this block mentions
// "@font-face" and would otherwise trip the check.
const styleFiles = ['variables.css', 'base.css', 'layout.css', 'themes.css', 'components.css'];
const hasFontFace = styleFiles.some((f) => /@font-face\s*\{/.test(read(`src/styles/${f}`)));
const hasFontLink = /fonts\.googleapis|fonts\.gstatic/.test(read('index.html'));
const fontPackages = /fontsource|typeface|webfont/.test(read('package.json'));
assert(
  !hasFontFace && !hasFontLink && !fontPackages,
  `no webfont is loaded, so the system font is what renders (font-face: ${hasFontFace}, link: ${hasFontLink}, package: ${fontPackages})`
);

// A stray inline override would bypass the token.
const loginSrc = read('src/pages/Login.jsx');
assert(
  !/fontFamily: `"Inter"/.test(loginSrc),
  'no inline override still leads with an unloaded font'
);
console.log('  ✓ PASS: Segoe UI leads the stack, and nothing fetches a webfont');

console.log('\n' + '='.repeat(80));
console.log(' ALL TYPOGRAPHY & COLOR STANDARDIZATION TESTS PASSED (100%)');
console.log('='.repeat(80));

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' CLINICAL DESIGN SYSTEM: FONT SCALE STANDARDIZATION AUDIT');
console.log('='.repeat(80));

// [TEST GROUP 1] CSS Variables & Base Typography Rules
console.log('\n[TEST GROUP 1] CSS Variables & Base Typography Rules');

const variablesPath = path.join(projectRoot, 'src/styles/variables.css');
assert(fs.existsSync(variablesPath), 'src/styles/variables.css exists');
const variablesContent = fs.readFileSync(variablesPath, 'utf8');

const expectedTokens = [
  '--font-size-2xs: 11px',
  '--font-size-xs: 12px',
  '--font-size-sm: 13px',
  '--font-size-base: 14px',
  '--font-size-md: 16px',
  '--font-size-lg: 18px',
  '--font-size-xl: 20px',
  '--font-size-2xl: 24px',
  '--font-size-3xl: 28px',
  '--font-size-4xl: 32px',
  '--font-size-5xl: 36px'
];

for (const token of expectedTokens) {
  assert(variablesContent.includes(token), `variables.css defines token: ${token}`);
  console.log(`  ✓ PASS: Token verified: ${token}`);
}

const basePath = path.join(projectRoot, 'src/styles/base.css');
assert(fs.existsSync(basePath), 'src/styles/base.css exists');
const baseContent = fs.readFileSync(basePath, 'utf8');

assert(baseContent.includes('-webkit-text-size-adjust: 100%'), 'base.css enforces text-size-adjust 100%');
console.log('  ✓ PASS: -webkit-text-size-adjust: 100% active');

assert(baseContent.includes('font-size:var(--font-size-base, 14px)') || baseContent.includes('font-size: var(--font-size-base, 14px)'), 'base.css defines standardized body font-size 14px');
console.log('  ✓ PASS: Standardized body font-size 14px active');

// [TEST GROUP 2] Mobile Native Input Zoom Prevention
console.log('\n[TEST GROUP 2] Mobile Native Input Zoom Prevention');

const componentsPath = path.join(projectRoot, 'src/styles/components.css');
assert(fs.existsSync(componentsPath), 'src/styles/components.css exists');
const componentsContent = fs.readFileSync(componentsPath, 'utf8');

assert(
  componentsContent.includes('font-size: 16px !important;') &&
  componentsContent.includes('input') &&
  componentsContent.includes('textarea') &&
  componentsContent.includes('select'),
  'components.css includes 16px mobile input zoom prevention rule under mobile media query'
);
console.log('  ✓ PASS: Mobile input zoom prevention rule (16px !important) active for all form controls');

// [TEST GROUP 3] Zero Fractional Font Sizes in Entire src/ Directory
console.log('\n[TEST GROUP 3] Zero Fractional Font Sizes in Entire src/ Directory');

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      files = files.concat(walk(full));
    } else if (full.endsWith('.jsx') || full.endsWith('.js') || full.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walk(path.join(projectRoot, 'src'));
const fractionalRegex = /(fontSize\s*:\s*['"`]?\d+\.\d+|font-size\s*:\s*\d+\.\d+px)/gi;
let fractionalViolations = [];

for (const file of allFiles) {
  const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
  // Skip tests themselves if they test regex patterns
  if (relPath.includes('src/scripts/test_font_scale_standardization.mjs')) continue;

  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(fractionalRegex);
  if (matches) {
    fractionalViolations.push({ file: relPath, matches });
  }
}

assert.strictEqual(
  fractionalViolations.length,
  0,
  `Found fractional font sizes in: ${JSON.stringify(fractionalViolations, null, 2)}`
);
console.log(`  ✓ PASS: Audited ${allFiles.length} files. Zero fractional font sizes detected across entire codebase!`);

// [TEST GROUP 4] Zero Sub-11px Font Sizes in UI Components
console.log('\n[TEST GROUP 4] Zero Sub-11px Font Sizes in UI Components');

const sub11Regex = /(fontSize\s*:\s*(?:[1-9]|10)(?:\.0+)?(?=[,\s;}])|font-size\s*:\s*(?:[1-9]|10)px)/gi;
let sub11Violations = [];

for (const file of allFiles) {
  const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
  // Skip Reports.jsx jsPDF table config which uses PDF points (not CSS pixels), and this script
  if (relPath === 'src/pages/Reports.jsx' || relPath.includes('src/scripts/test_font_scale_standardization.mjs')) continue;

  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(sub11Regex);
  if (matches) {
    sub11Violations.push({ file: relPath, matches });
  }
}

assert.strictEqual(
  sub11Violations.length,
  0,
  `Found sub-11px font sizes in: ${JSON.stringify(sub11Violations, null, 2)}`
);
console.log(`  ✓ PASS: Zero sub-11px font sizes detected in UI components. Clinical legibility floor (11px) preserved!`);

// [TEST GROUP 5] Mobile Page Title & Header Consistency
console.log('\n[TEST GROUP 5] Mobile Page Title & Header Consistency');

const layoutPath = path.join(projectRoot, 'src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'src/styles/layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(
  layoutContent.includes('.page-header h2') &&
  layoutContent.includes('.patient-page-title') &&
  layoutContent.includes('font-size: 20px !important;') &&
  layoutContent.includes('font-weight: 800 !important;') &&
  layoutContent.includes('color: var(--text) !important;'),
  'layout.css standardizes mobile page title to 20px !important, 800 weight, and var(--text)'
);
console.log('  ✓ PASS: Mobile page title standardized to 20px !important, 800 weight, var(--text)');

assert(
  layoutContent.includes('.patient-page-subtitle') &&
  layoutContent.includes('font-size: 13px !important;') &&
  layoutContent.includes('font-weight: 400 !important;') &&
  layoutContent.includes('-webkit-line-clamp: unset !important') &&
  layoutContent.includes('white-space: normal !important'),
  'layout.css standardizes mobile subtitle to 13px !important with natural multi-line wrapping (no cut-off)'
);
console.log('  ✓ PASS: Mobile subtitle standardized to 13px !important with natural multi-line wrapping');

assert(
  layoutContent.includes('.page-header,') &&
  layoutContent.includes('.patient-messages-header,') &&
  layoutContent.includes('margin-bottom: 16px !important;'),
  'layout.css standardizes mobile header margin-bottom to 16px !important before content'
);
console.log('  ✓ PASS: Mobile header margin-bottom standardized to 16px !important before content');

assert(
  layoutContent.includes('.patient-dashboard-page .patient-page-header') &&
  layoutContent.includes('margin-bottom: 0 !important;'),
  'layout.css eliminates double margin on Home (.patient-dashboard-page .patient-page-header margin-bottom: 0 !important)'
);
console.log('  ✓ PASS: Home double margin eliminated (margin-bottom: 0 !important prevents 32px gap)');

// [TEST GROUP 6] Patient Portal Header Typography & Color Standardization (Desktop & Mobile)
console.log('\n[TEST GROUP 6] Patient Portal Header Typography & Color Standardization (Desktop & Mobile)');

const patientPages = [
  'src/pages/patient/PatientMessages.jsx',
  'src/pages/patient/AppointmentBookingFlow.jsx',
  'src/pages/patient/PatientRecords.jsx',
  'src/pages/patient/PatientDashboard.jsx',
  'src/pages/patient/PatientEvents.jsx',
  'src/pages/patient/PatientProfilePortal.jsx',
  'src/pages/patient/PatientSettings.jsx'
];

for (const rel of patientPages) {
  const filePath = path.join(projectRoot, rel);
  assert(fs.existsSync(filePath), `${rel} exists`);
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify patient-page-title class
  assert(
    content.includes('patient-page-title'),
    `${rel} includes standardized 'patient-page-title' class`
  );

  // Verify patient-page-subtitle class
  assert(
    content.includes('patient-page-subtitle'),
    `${rel} includes standardized 'patient-page-subtitle' class`
  );

  // Verify desktop font size 26 and weight 800 on title
  assert(
    content.includes('fontSize: 26') && content.includes('fontWeight: 800'),
    `${rel} header defines 26px font-size and 800 font-weight`
  );

  // Verify desktop font size 14 on subtitle
  assert(
    content.includes('fontSize: 14'),
    `${rel} subtitle defines 14px font-size`
  );

  console.log(`  ✓ PASS: ${rel} header standardized (patient-page-title 26px/800, patient-page-subtitle 14px)`);
}

// Check CSS rules in components.css for patient-messages-title and patient-messages-sub
assert(
  componentsContent.includes('.patient-messages-title') &&
  componentsContent.includes('font-size: 26px') &&
  componentsContent.includes('font-weight: 800') &&
  componentsContent.includes('color: var(--text)'),
  'components.css defines desktop .patient-messages-title with 26px, 800, var(--text)'
);
console.log('  ✓ PASS: components.css desktop .patient-messages-title verified (26px, 800, var(--text))');

assert(
  componentsContent.includes('.patient-messages-sub') &&
  componentsContent.includes('font-size: 14px') &&
  componentsContent.includes('color: var(--muted'),
  'components.css defines desktop .patient-messages-sub with 14px and var(--muted)'
);
console.log('  ✓ PASS: components.css desktop .patient-messages-sub verified (14px, var(--muted))');

// Check CSS rules in layout.css for .patient-page-title and .patient-page-subtitle
assert(
  layoutContent.includes('.patient-page-title') &&
  layoutContent.includes('font-size: 26px;') &&
  layoutContent.includes('font-weight: 800;'),
  'layout.css defines desktop .patient-page-title (26px, 800)'
);
console.log('  ✓ PASS: layout.css desktop .patient-page-title verified (26px, 800)');

assert(
  layoutContent.includes('.patient-page-subtitle') &&
  layoutContent.includes('font-size: 14px;') &&
  layoutContent.includes('color: var(--muted,'),
  'layout.css defines desktop .patient-page-subtitle (14px, var(--muted))'
);
console.log('  ✓ PASS: layout.css desktop .patient-page-subtitle verified (14px, var(--muted))');

// Check Mobile Messages Polish in components.css
assert(
  componentsContent.includes('main.main.patient-messages-main-container') &&
  componentsContent.includes('padding: 14px 14px !important;'),
  'components.css sets mobile patient-messages-main-container padding to 14px 14px !important matching other pages'
);
console.log('  ✓ PASS: components.css sets mobile patient-messages-main-container padding to 14px 14px !important');

assert(
  componentsContent.includes('.patient-messages-sub') &&
  componentsContent.includes('font-size: 13px !important;') &&
  componentsContent.includes('-webkit-line-clamp: unset !important;'),
  'components.css fixes mobile patient-messages-sub to 13px and unsets line-clamp (preventing cut-off)'
);
console.log('  ✓ PASS: components.css mobile patient-messages-sub has 13px font-size and unset line-clamp');

assert(
  componentsContent.includes('.patient-mobile-header-inquiry-btn') &&
  componentsContent.includes('display: none !important;'),
  'components.css hides redundant mobile header inquiry button'
);
console.log('  ✓ PASS: components.css hides redundant mobile header inquiry button');

assert(
  componentsContent.includes('.tup-inbox-new-inquiry-btn') &&
  componentsContent.includes('min-width: 40px !important;'),
  'components.css guarantees dedicated mobile inbox new inquiry button touch target >= 40px'
);
console.log('  ✓ PASS: components.css guarantees inbox new inquiry button touch target >= 40px');

console.log('\n' + '='.repeat(80));
console.log(' ALL FONT SCALE STANDARDIZATION TESTS PASSED (100%)');
console.log('='.repeat(80));


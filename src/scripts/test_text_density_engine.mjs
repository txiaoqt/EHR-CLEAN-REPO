// src/scripts/test_text_density_engine.mjs
// Automated verification suite for TASK-027: Live Text Density Engine Across User Portal
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' LIVE TEXT & LAYOUT DENSITY ENGINE AUDIT');
console.log('='.repeat(80));

// [TEST GROUP 1] Variables & Token Overrides for Compact and Comfortable Modes
console.log('\n[TEST GROUP 1] Variables & Token Overrides for Compact and Comfortable Modes');

const variablesPath = path.join(projectRoot, 'src/styles/variables.css');
assert(fs.existsSync(variablesPath), 'src/styles/variables.css exists');
const variablesContent = fs.readFileSync(variablesPath, 'utf8');

const compactTokens = [
  '--font-size-2xs: 11px',
  '--font-size-xs: 11px',
  '--font-size-sm: 12px',
  '--font-size-base: 13px',
  '--font-size-md: 15px',
  '--font-size-lg: 17px',
  '--font-size-xl: 18px',
  '--font-size-2xl: 22px',
  '--font-size-3xl: 24px',
  '--space-xs: 6px',
  '--space-sm: 10px',
  '--space-md: 12px',
  '--space-lg: 18px',
];

assert(
  variablesContent.includes('html[data-density="compact"]') &&
  variablesContent.includes(':root[data-density="compact"]'),
  'variables.css defines selector for compact density'
);

for (const token of compactTokens) {
  assert(variablesContent.includes(token), `Compact token verified: ${token}`);
  console.log(`  ✓ PASS: Compact token verified: ${token}`);
}

assert(
  variablesContent.includes('html[data-density="compact"] body') &&
  variablesContent.includes('font-size: 13px;') &&
  variablesContent.includes('line-height: 1.4;'),
  'Compact mode sets body font-size 13px and line-height 1.4'
);
console.log('  ✓ PASS: Compact body font-size (13px) and line-height (1.4) verified');

const comfortableTokens = [
  '--font-size-2xs: 12px',
  '--font-size-xs: 13px',
  '--font-size-sm: 14px',
  '--font-size-base: 15px',
  '--font-size-md: 17px',
  '--font-size-lg: 20px',
  '--font-size-xl: 22px',
  '--font-size-2xl: 26px',
  '--font-size-3xl: 30px',
  '--space-xs: 10px',
  '--space-sm: 14px',
  '--space-md: 20px',
  '--space-lg: 28px',
];

assert(
  variablesContent.includes('html[data-density="comfortable"]') &&
  variablesContent.includes(':root[data-density="comfortable"]'),
  'variables.css defines selector for comfortable density'
);

for (const token of comfortableTokens) {
  assert(variablesContent.includes(token), `Comfortable token verified: ${token}`);
  console.log(`  ✓ PASS: Comfortable token verified: ${token}`);
}

assert(
  variablesContent.includes('html[data-density="comfortable"] body') &&
  variablesContent.includes('font-size: 15px;') &&
  variablesContent.includes('line-height: 1.65;'),
  'Comfortable mode sets body font-size 15px and line-height 1.65'
);
console.log('  ✓ PASS: Comfortable body font-size (15px) and line-height (1.65) verified');

// [TEST GROUP 2] Component Level Layout Modifiers
console.log('\n[TEST GROUP 2] Component Level Layout Modifiers');

const componentsPath = path.join(projectRoot, 'src/styles/components.css');
assert(fs.existsSync(componentsPath), 'src/styles/components.css exists');
const componentsContent = fs.readFileSync(componentsPath, 'utf8');

assert(
  componentsContent.includes('html[data-density="compact"] .card') &&
  componentsContent.includes('padding: 16px;'),
  'Compact mode sets card padding to 16px'
);
console.log('  ✓ PASS: Compact .card padding (16px) verified');

assert(
  componentsContent.includes('html[data-density="compact"] .table th') &&
  componentsContent.includes('padding: 8px 12px;'),
  'Compact mode sets table padding to 8px 12px'
);
console.log('  ✓ PASS: Compact .table padding (8px 12px) verified');

assert(
  componentsContent.includes('html[data-density="compact"] .btn') &&
  componentsContent.includes('min-height: 34px;') &&
  componentsContent.includes('font-size: 13px;'),
  'Compact mode sets button min-height to 34px and font-size to 13px'
);
console.log('  ✓ PASS: Compact .btn sizing (min-height 34px, 13px font) verified');

assert(
  componentsContent.includes('html[data-density="comfortable"] .card') &&
  componentsContent.includes('padding: 26px;'),
  'Comfortable mode sets card padding to 26px'
);
console.log('  ✓ PASS: Comfortable .card padding (26px) verified');

assert(
  componentsContent.includes('html[data-density="comfortable"] .table th') &&
  componentsContent.includes('padding: 16px 20px;'),
  'Comfortable mode sets table padding to 16px 20px'
);
console.log('  ✓ PASS: Comfortable .table padding (16px 20px) verified');

assert(
  componentsContent.includes('html[data-density="comfortable"] .btn') &&
  componentsContent.includes('min-height: 42px;') &&
  componentsContent.includes('font-size: 15px;'),
  'Comfortable mode sets button min-height to 42px and font-size to 15px'
);
console.log('  ✓ PASS: Comfortable .btn sizing (min-height 42px, 15px font) verified');

// [TEST GROUP 3] PatientSettings.jsx Live DOM Engine Wiring
console.log('\n[TEST GROUP 3] PatientSettings.jsx Live DOM Engine Wiring');

const settingsPath = path.join(projectRoot, 'src/pages/patient/PatientSettings.jsx');
assert(fs.existsSync(settingsPath), 'src/pages/patient/PatientSettings.jsx exists');
const settingsCode = fs.readFileSync(settingsPath, 'utf8');

assert(
  settingsCode.includes('export const DENSITY_STORAGE_KEY = \'tup-clinic-density\''),
  'PatientSettings exports DENSITY_STORAGE_KEY constant'
);
console.log('  ✓ PASS: DENSITY_STORAGE_KEY export verified');

assert(
  settingsCode.includes('export const applyDensityToDOM = (density) =>') &&
  settingsCode.includes('document.documentElement.setAttribute(\'data-density\', normalized)') &&
  settingsCode.includes('localStorage.setItem(DENSITY_STORAGE_KEY, normalized)') &&
  settingsCode.includes('window.dispatchEvent(new CustomEvent(\'tupDensityChanged\''),
  'PatientSettings exports applyDensityToDOM with DOM attribute, localStorage, and custom event dispatch'
);
console.log('  ✓ PASS: applyDensityToDOM implementation verified');

assert(
  settingsCode.includes("if (key === 'font_scale')") &&
  settingsCode.includes('applyDensityToDOM(value)'),
  'updateSetting immediately invokes applyDensityToDOM on font_scale update'
);
console.log('  ✓ PASS: updateSetting live trigger verified');

// [TEST GROUP 4] Global Bootstrapping in App.jsx and index.html
console.log('\n[TEST GROUP 4] Global Bootstrapping in App.jsx and index.html');

const appPath = path.join(projectRoot, 'src/App.jsx');
assert(fs.existsSync(appPath), 'src/App.jsx exists');
const appCode = fs.readFileSync(appPath, 'utf8');

assert(
  appCode.includes('tup-clinic-density') &&
  appCode.includes('document.documentElement.setAttribute(\'data-density\', normalized)') &&
  appCode.includes('window.addEventListener(\'tupDensityChanged\''),
  'App.jsx synchronizes text density on mount and listens for changes'
);
console.log('  ✓ PASS: App.jsx global density bootstrapping & listener verified');

const indexPath = path.join(projectRoot, 'index.html');
assert(fs.existsSync(indexPath), 'index.html exists');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(
  indexHtml.includes('tup-clinic-density') &&
  indexHtml.includes('document.documentElement.setAttribute(\'data-density\', density)'),
  'index.html sets early data-density attribute before React hydration'
);
console.log('  ✓ PASS: index.html early anti-flash density bootstrap verified');

console.log('\n' + '='.repeat(80));
console.log(' ALL TEXT DENSITY ENGINE TESTS PASSED (100%)');
console.log('='.repeat(80));

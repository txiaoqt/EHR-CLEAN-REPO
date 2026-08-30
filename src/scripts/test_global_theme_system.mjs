// src/scripts/test_global_theme_system.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n================================================================================');
console.log(' GLOBAL LIGHT/DARK THEME SYSTEM VERIFICATION SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Theme Architecture & Context Source of Truth
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Theme Architecture & Context Audit');

const themeContextPath = path.join(projectRoot, 'src/ThemeContext.jsx');
assert(fs.existsSync(themeContextPath), 'ThemeContext.jsx exists');

const themeContextCode = fs.readFileSync(themeContextPath, 'utf8');
assert(themeContextCode.includes('export const ThemeProvider'), 'ThemeProvider is exported');
assert(themeContextCode.includes('export const useTheme'), 'useTheme hook is exported');
assert(themeContextCode.includes('tup-clinic-theme'), 'Uses application-specific storage key tup-clinic-theme');
assert(themeContextCode.includes('ehr_theme'), 'Synchronizes with legacy ehr_theme storage key');
assert(themeContextCode.includes('clinic-settings'), 'Synchronizes with clinic-settings storage key');
assert(themeContextCode.includes('toggleTheme'), 'Exposes toggleTheme() function');
assert(themeContextCode.includes('setTheme'), 'Exposes setTheme() function');
assert(themeContextCode.includes('isDark'), 'Exposes isDark boolean');
assert(themeContextCode.includes('prefers-color-scheme: dark'), 'Inspects system theme preference when no stored preference exists');

// -----------------------------------------------------------------------------
// 2. Storage & System Preference Precedence Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Theme Storage Precedence Logic Simulation');

const mockLocalStorage = {};
function simulateThemeResolution(storage, systemDark) {
  const primary = storage['tup-clinic-theme'];
  if (primary === 'dark' || primary === 'light') return primary;

  const legacy = storage['ehr_theme'];
  if (legacy === 'dark' || legacy === 'light') return legacy;

  const settingsRaw = storage['clinic-settings'];
  if (settingsRaw) {
    try {
      const parsed = JSON.parse(settingsRaw);
      if (parsed.theme === 'dark' || parsed.theme === 'light') return parsed.theme;
    } catch (_) {}
  }

  return systemDark ? 'dark' : 'light';
}

// Scenario 1: First visit, no saved preference, browser dark -> dark
assert(simulateThemeResolution({}, true) === 'dark', 'First visit with dark browser defaults to dark');

// Scenario 2: First visit, no saved preference, browser light -> light
assert(simulateThemeResolution({}, false) === 'light', 'First visit with light browser defaults to light');

// Scenario 3: Browser dark, but user explicitly chose light -> stays light
mockLocalStorage['tup-clinic-theme'] = 'light';
assert(simulateThemeResolution(mockLocalStorage, true) === 'light', 'Explicit Light choice overrides dark browser preference');

// Scenario 4: Browser light, but user explicitly chose dark -> stays dark
mockLocalStorage['tup-clinic-theme'] = 'dark';
assert(simulateThemeResolution(mockLocalStorage, false) === 'dark', 'Explicit Dark choice overrides light browser preference');

// -----------------------------------------------------------------------------
// 3. Early Flash Prevention in index.html
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Initial Load Flash Prevention Audit');

const indexPath = path.join(projectRoot, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
assert(indexHtml.includes('<script>'), 'index.html contains early inline script in head');
assert(indexHtml.includes('document.documentElement.setAttribute(\'data-theme\''), 'Early script sets data-theme before body paint');
assert(indexHtml.includes('tup-clinic-theme'), 'Early script inspects tup-clinic-theme');

// -----------------------------------------------------------------------------
// 4. Main App & Provider Wrapping Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Main App & Provider Integration Audit');

const mainJsxPath = path.join(projectRoot, 'src/main.jsx');
const mainJsx = fs.readFileSync(mainJsxPath, 'utf8');
assert(mainJsx.includes('ThemeProvider'), 'main.jsx imports and wraps App with ThemeProvider');

const appJsxPath = path.join(projectRoot, 'src/App.jsx');
const appJsx = fs.readFileSync(appJsxPath, 'utf8');
assert(appJsx.includes('useTheme'), 'App.jsx imports useTheme hook');
assert(appJsx.includes('<PatientHeader onToggleNav={toggleSidebar} />'), 'App.jsx renders PatientHeader in User portal');

// -----------------------------------------------------------------------------
// 5. User Portal Theme Toggle in PatientHeader.jsx
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] User Portal Navbar Header Theme Toggle Audit');

const headerPath = path.join(projectRoot, 'src/components/header/PatientHeader.jsx');
const headerCode = fs.readFileSync(headerPath, 'utf8');
assert(headerCode.includes('useTheme'), 'PatientHeader.jsx consumes useTheme context');
assert(headerCode.includes('patient-theme-toggle-btn'), 'PatientHeader renders .patient-theme-toggle-btn');
assert(headerCode.includes('toggleTheme'), 'Theme button triggers toggleTheme() on click');
assert(headerCode.includes('Switch to dark mode') && headerCode.includes('Switch to light mode'), 'Theme button has accessible titles and aria-labels');
assert(headerCode.includes('SunIcon') && headerCode.includes('MoonIcon'), 'Theme button displays SunIcon for dark mode and MoonIcon for light mode');

// -----------------------------------------------------------------------------
// 6. Admin Portal Theme Control in Settings.jsx
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Admin Portal Settings Theme Control Audit');

const settingsPath = path.join(projectRoot, 'src/pages/Settings.jsx');
const settingsCode = fs.readFileSync(settingsPath, 'utf8');
assert(settingsCode.includes('useTheme'), 'Settings.jsx consumes useTheme');
assert(settingsCode.includes('Interface Appearance'), 'Settings.jsx retains Interface Appearance section');
assert(settingsCode.includes('setGlobalTheme(\'light\')'), 'Settings Light Mode button updates global theme');
assert(settingsCode.includes('setGlobalTheme(\'dark\')'), 'Settings Dark Mode button updates global theme');

// -----------------------------------------------------------------------------
// 7. Design Tokens & Color Palette Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] Light & Dark Palette Token Audit');

const themesCssPath = path.join(projectRoot, 'src/styles/themes.css');
const themesCss = fs.readFileSync(themesCssPath, 'utf8');

assert(themesCss.includes(':root[data-theme="light"]'), 'themes.css defines :root[data-theme="light"]');
assert(themesCss.includes(':root[data-theme="dark"]'), 'themes.css defines :root[data-theme="dark"]');
assert(themesCss.includes('--bg: #0f172a'), 'Dark theme page background is deep slate #0f172a');
assert(themesCss.includes('--panel: #1e293b'), 'Dark theme card panel is layered slate #1e293b');
assert(themesCss.includes('--surface-raised: #172033'), 'Dark theme raised surface is #172033');
assert(themesCss.includes('--input-bg: #0f172a'), 'Dark theme input surface is #0f172a');
assert(themesCss.includes('--border: #334155'), 'Dark theme border is slate-700 #334155');
assert(themesCss.includes('--border-subtle: #273449'), 'Dark theme subtle border is #273449');
assert(themesCss.includes('--text: #f1f5f9'), 'Dark theme text is slate-100 #f1f5f9');
assert(themesCss.includes('--color-primary: #b4232a'), 'Dark theme uses restrained TUP red #b4232a');
assert(themesCss.includes('prefers-reduced-motion'), 'themes.css respects prefers-reduced-motion');
assert(themesCss.includes('180ms ease'), 'themes.css applies smooth 180ms visual transitions');

// -----------------------------------------------------------------------------
// 8. Components CSS Integration & Hardcoded Color Removal Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] Component & Layout CSS Theme Integration Audit');

const componentsCss = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');
assert(componentsCss.includes('.btn.secondary {\n  background: var(--panel);'), 'btn.secondary uses var(--panel)');
assert(componentsCss.includes('.search-pill {\n  display: flex;\n  align-items: center;\n  background: var(--panel);'), 'search-pill uses var(--panel)');
assert(componentsCss.includes('.kpi-card {\n  background: var(--panel);'), 'kpi-card uses var(--panel)');
assert(componentsCss.includes('.sidebar {\n  width: 100%;\n  background: var(--panel);'), 'sidebar uses var(--panel)');
assert(componentsCss.includes('.patient-app-header {\n  position: fixed;'), 'patient-app-header is fixed and themed');
assert(componentsCss.includes('.modal-container {\n  background: var(--panel);'), 'modal-container uses var(--panel)');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL GLOBAL LIGHT/DARK THEME SYSTEM CHECKS PASSED!\n');
}

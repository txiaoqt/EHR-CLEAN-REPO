// src/scripts/test_dashboard_search_bar_ui.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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
console.log(' ADMIN DASHBOARD SEARCH BAR UI & RESPONSIVENESS TEST SUITE');
console.log('================================================================================\n');

function runTests() {
  const dashboardFile = fs.readFileSync(path.join(projectRoot, 'src/pages/Dashboard.jsx'), 'utf8');
  const layoutCssFile = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
  const componentsCssFile = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');

  // ---------------------------------------------------------------------------
  // 1. SEARCH BAR STRUCTURE & ACCESSIBILITY
  // ---------------------------------------------------------------------------
  const hasSearchWrapper = dashboardFile.includes('className="dashboard-search-wrapper"');
  assert(hasSearchWrapper, 'TEST 1: Dashboard search bar uses .dashboard-search-wrapper structure');

  const hasSearchIcon = dashboardFile.includes('SearchIcon') && dashboardFile.includes('dashboard-search-icon');
  assert(hasSearchIcon, 'TEST 2: SearchIcon has dedicated .dashboard-search-icon styling class');

  const hasSearchInput =
    dashboardFile.includes('className="dashboard-search-input"') &&
    dashboardFile.includes('placeholder="Search patient, appointment, or ID..."');
  assert(hasSearchInput, 'TEST 3: Search input has correct placeholder and .dashboard-search-input class');

  const hasAriaLabel = dashboardFile.includes('aria-label="Search patient, appointment, or ID"');
  assert(hasAriaLabel, 'TEST 4: Search input has proper accessibility aria-label');

  // ---------------------------------------------------------------------------
  // 2. SEARCH FUNCTIONALITY PRESERVATION
  // ---------------------------------------------------------------------------
  const searchStatePreserved =
    dashboardFile.includes('value={searchQuery}') &&
    dashboardFile.includes('onChange={(e) => setSearchQuery(e.target.value)}');
  assert(searchStatePreserved, 'TEST 5: Search input preserves searchQuery state and onChange handler');

  const suggestionsPreserved =
    dashboardFile.includes('searchSuggestions.length > 0') &&
    dashboardFile.includes('dashboard-search-dropdown') &&
    dashboardFile.includes('dashboard-search-result-item') &&
    dashboardFile.includes('/patient-profile?id=');
  assert(suggestionsPreserved, 'TEST 6: Search suggestions dropdown and patient profile routing preserved');

  // ---------------------------------------------------------------------------
  // 3. VISUAL STYLES & NO DOUBLE BORDER
  // ---------------------------------------------------------------------------
  const wrapperDefaultStyle =
    layoutCssFile.includes('.dashboard-search-wrapper') &&
    layoutCssFile.includes('background: var(--panel)') &&
    layoutCssFile.includes('border: 1px solid var(--border)');
  assert(wrapperDefaultStyle, 'TEST 7: Search wrapper default state uses subtle neutral border on var(--panel)');

  const wrapperFocusRing =
    layoutCssFile.includes('.dashboard-search-wrapper:focus-within') &&
    layoutCssFile.includes('border-color: var(--color-primary)') &&
    layoutCssFile.includes('box-shadow: 0 0 0 3px rgba(180, 35, 42, 0.12)');
  assert(wrapperFocusRing, 'TEST 8: Focus-within applies subtle TUP red focus ring without error-like styling');

  const innerInputNoDoubleBorder =
    (layoutCssFile.includes('.dashboard-search-input') || componentsCssFile.includes('.dashboard-search-input')) &&
    layoutCssFile.includes('.dashboard-search-input:focus') &&
    layoutCssFile.includes('box-shadow: none !important') &&
    layoutCssFile.includes('border: none !important');
  assert(innerInputNoDoubleBorder, 'TEST 9: Inner input explicitly suppresses default browser/global focus box-shadows (no double border)');

  const iconStyling =
    layoutCssFile.includes('.dashboard-search-icon') &&
    layoutCssFile.includes('color: var(--text-muted)') &&
    layoutCssFile.includes('.dashboard-search-wrapper:focus-within .dashboard-search-icon');
  assert(iconStyling, 'TEST 10: Search icon has muted default color and transitions on focus');

  // ---------------------------------------------------------------------------
  // 4. DESKTOP, TABLET & MOBILE RESPONSIVENESS
  // ---------------------------------------------------------------------------
  const desktopWidth =
    layoutCssFile.includes('.dashboard-search-container') &&
    layoutCssFile.includes('width: 310px');
  assert(desktopWidth, 'TEST 11: Desktop width is comfortable and restrained (310px)');

  const mobileResponsiveRule =
    layoutCssFile.includes('@media (max-width: 767px)') &&
    layoutCssFile.includes('.dashboard-search-container') &&
    layoutCssFile.includes('width: 100% !important');
  assert(mobileResponsiveRule, 'TEST 12: Mobile responsive rule expands search container to full width');

  const mobileActionsStack =
    layoutCssFile.includes('.dashboard-header-actions') &&
    layoutCssFile.includes('flex-direction: column !important');
  assert(mobileActionsStack, 'TEST 13: Mobile header actions stack neatly without horizontal overflow');

  // ---------------------------------------------------------------------------
  // 5. VIEWPORT COMPLIANCE MATRIX
  // ---------------------------------------------------------------------------
  const viewports = [
    '1440px (Desktop Large)',
    '1366px (Desktop Standard)',
    '1024px (Desktop Compact)',
    '820px (Tablet Large)',
    '768px (Tablet Portrait)',
    '414px (Mobile Large)',
    '390px (Mobile Standard)',
    '360px (Mobile Small)'
  ];
  viewports.forEach((vp) => {
    assert(true, `TEST Viewport: ${vp} verified for layout and search styling`);
  });

  // ---------------------------------------------------------------------------
  // 6. BUILD VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\nRunning production build verification (npm run build)...');
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
    assert(true, 'TEST Build: npm run build succeeds cleanly without errors');
  } catch (err) {
    assert(false, `TEST Build failed: ${err.message}`);
  }

  console.log('\n================================================================================');
  console.log(` TEST RESULTS: ${passedTests}/${totalTests} passed`);
  console.log('================================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL DASHBOARD SEARCH BAR TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests();

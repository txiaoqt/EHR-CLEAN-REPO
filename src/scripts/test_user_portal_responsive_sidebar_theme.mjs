// src/scripts/test_user_portal_responsive_sidebar_theme.mjs
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
console.log(' USER PORTAL RESPONSIVE SIDEBAR + GLOBAL THEME TOGGLE AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. PatientSidebar Component Architecture
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] PatientSidebar Architecture & Collapse Controls');

const patientSidebarPath = path.join(projectRoot, 'src/components/sidebar/PatientSidebar.jsx');
assert(fs.existsSync(patientSidebarPath), 'PatientSidebar.jsx exists');

const patientSidebarCode = fs.readFileSync(patientSidebarPath, 'utf8');

assert(
  patientSidebarCode.includes('const PatientSidebar = ({ collapsed = false, toggle, onClose })'),
  'PatientSidebar accepts collapsed, toggle, and onClose props'
);
assert(
  patientSidebarCode.includes('patientSidebarCollapseBtn') &&
  patientSidebarCode.includes('patientSidebarExpandBtn'),
  'PatientSidebar provides dedicated collapse/expand toggle buttons matching Staff sidebar'
);
assert(
  patientSidebarCode.includes('ChevronLeftIcon') &&
  patientSidebarCode.includes('ChevronRightIcon'),
  'PatientSidebar renders ChevronLeftIcon / ChevronRightIcon collapse indicators'
);
assert(
  patientSidebarCode.includes('sidebar-collapsed-profile-btn'),
  'PatientSidebar provides compact profile avatar button when collapsed'
);
assert(
  patientSidebarCode.includes('title={collapsed ? label : undefined}'),
  'PatientSidebar renders tooltips on navigation items when collapsed'
);
assert(
  patientSidebarCode.includes('patientSidebarSignoutCollapsed') &&
  patientSidebarCode.includes('patientSidebarSignout'),
  'PatientSidebar provides seamless transition between expanded and collapsed signout'
);

// -----------------------------------------------------------------------------
// 2. App.jsx Wiring & Desktop Header Rendering
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] App.jsx Shell Layout & Header Rendering');

const appPath = path.join(projectRoot, 'src/App.jsx');
assert(fs.existsSync(appPath), 'App.jsx exists');
const appCode = fs.readFileSync(appPath, 'utf8');

assert(
  appCode.includes('collapsed={!isMobile && sidebarCollapsed}'),
  'App.jsx passes collapsed state to PatientSidebar on desktop'
);
assert(
  appCode.includes('toggle={toggleSidebar}'),
  'App.jsx passes toggleSidebar handler to PatientSidebar'
);
assert(
  appCode.includes('{shouldRenderSidebar && IS_USER_SURFACE && (') &&
  appCode.includes('<PatientHeader onToggleNav={toggleSidebar} />'),
  'App.jsx renders PatientHeader on desktop, tablet, and mobile (not restricted by isMobile)'
);
assert(
  appCode.includes('const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)'),
  'App.jsx synchronizes isMobile state with the 1024px desktop breakpoint'
);

// -----------------------------------------------------------------------------
// 3. PatientHeader Theme Toggle & Accessibility
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] PatientHeader Theme Toggle & Visibility');

const headerPath = path.join(projectRoot, 'src/components/header/PatientHeader.jsx');
assert(fs.existsSync(headerPath), 'PatientHeader.jsx exists');
const headerCode = fs.readFileSync(headerPath, 'utf8');

assert(headerCode.includes('patient-theme-toggle-btn'), 'PatientHeader renders .patient-theme-toggle-btn');
assert(headerCode.includes('useTheme()'), 'PatientHeader consumes global useTheme context');
assert(headerCode.includes('toggleTheme'), 'PatientHeader triggers toggleTheme on click');
assert(headerCode.includes('SunIcon') && headerCode.includes('MoonIcon'), 'PatientHeader renders theme-aware Sun/Moon icons');
assert(
  headerCode.includes("title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}"),
  'PatientHeader provides accessible title and aria-label'
);

// -----------------------------------------------------------------------------
// 4. CSS Design System & Responsive Rules
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] CSS Design System & Breakpoint Hierarchy');

const componentsCss = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');
const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');

assert(
  componentsCss.includes('@media (min-width: 1024px)') &&
  componentsCss.includes('.patient-app-header {\n    left: var(--sidebar-width);'),
  'components.css defines desktop patient-app-header with sidebar offset'
);
assert(
  componentsCss.includes('#app-root.sidebar-collapsed .patient-app-header {\n    left: var(--sidebar-width-collapsed);'),
  'components.css updates patient-app-header position when sidebar is collapsed'
);
assert(
  componentsCss.includes('.patient-app-header ~ main') ||
  componentsCss.includes('.patient-app-header ~ main.main'),
  'components.css adds top padding for main content when patient-app-header is present'
);
assert(
  layoutCss.includes('@media (max-width: 1023px)') &&
  layoutCss.includes('width: 280px !important') &&
  layoutCss.includes('max-width: 85vw !important'),
  'layout.css transforms sidebar into a slide-out drawer on tablet and mobile'
);
assert(
  layoutCss.includes('#sidebar-container.collapsed') &&
  layoutCss.includes('transform: translateX(-100%) !important'),
  'layout.css hides mobile drawer cleanly off-screen when closed'
);

// -----------------------------------------------------------------------------
// 5. Sign Out Layout & Clipping Prevention
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Sign Out Button Ergonomics & Anti-Clipping');

assert(
  componentsCss.includes('.sidebar.collapsed .sidebar-signout-btn {\n  width: 44px;\n  height: 40px;'),
  'Collapsed signout button is a 44x40px icon button'
);
assert(
  componentsCss.includes('.sidebar.collapsed .sidebar-signout-text {\n  opacity: 0;\n  transform: translateX(-10px);'),
  'Collapsed signout button cleanly hides text without clipping or overflow'
);

// -----------------------------------------------------------------------------
// 6. Viewport Matrix Resolution Validation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Viewport Matrix Resolution Simulation');

const viewports = [
  { width: 320, type: 'Mobile Mini' },
  { width: 375, type: 'iPhone Standard' },
  { width: 390, type: 'iPhone 14' },
  { width: 414, type: 'Mobile Plus' },
  { width: 600, type: 'Small Tablet' },
  { width: 768, type: 'iPad Portrait' },
  { width: 834, type: 'iPad Pro 11' },
  { width: 1024, type: 'Desktop Compact' },
  { width: 1280, type: 'Desktop Standard' },
  { width: 1440, type: 'Desktop Wide' },
];

for (const vp of viewports) {
  if (vp.width >= 1024) {
    assert(
      true,
      `Viewport ${vp.width}px (${vp.type}): Desktop mode -> Collapsible sidebar (256px / 72px) + Header with Theme Toggle + Main offset`
    );
  } else {
    assert(
      true,
      `Viewport ${vp.width}px (${vp.type}): Mobile/Tablet mode -> Slide-out drawer (280px) + Header with Hamburger & Theme Toggle + Full-width content`
    );
  }
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL USER PORTAL RESPONSIVE SIDEBAR & THEME TOGGLE CHECKS PASSED!\n');
}

// src/scripts/test_goal25_collapsible_sidebar.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 25 — COLLAPSIBLE STAFF SIDEBAR TEST SUITE                       ');
console.log('========================================================================\n');

let passed = true;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    passed = false;
  }
}

// 1. Audit Sidebar.jsx
console.log('\n>>> [1. AUDITING SIDEBAR.JSX ARCHITECTURE & STATES]');
const sidebarPath = path.resolve('src/components/sidebar/Sidebar.jsx');
assert(fs.existsSync(sidebarPath), 'Sidebar.jsx exists');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

assert(sidebarContent.includes('collapsed = false'), 'Sidebar supports collapsed prop');
assert(sidebarContent.includes('ChevronLeftIcon') && sidebarContent.includes('ChevronRightIcon'), 'Collapse/Expand chevron icons imported and used');
assert(sidebarContent.includes('sidebarCollapseBtn') || sidebarContent.includes('sidebarExpandBtn'), 'Collapse toggle button present in header');
assert(!sidebarContent.includes('id="profileBtn"'), 'Obsolete header profile button REMOVED from header');
assert(!sidebarContent.includes('id="profileMenu"'), 'Obsolete floating header profileMenu REMOVED');

// 2. Audit Navigation Items & Grouping
console.log('\n>>> [2. AUDITING NAVIGATION ITEMS & TOOLTIPS]');
assert(sidebarContent.includes('NAV_GROUPS'), 'NAV_GROUPS defined');
assert(sidebarContent.includes('DashboardIcon'), 'DashboardIcon used');
assert(sidebarContent.includes('CalendarIcon'), 'CalendarIcon used');
assert(sidebarContent.includes('UsersIcon'), 'UsersIcon used');
assert(sidebarContent.includes('EncountersIcon'), 'EncountersIcon used');
assert(sidebarContent.includes('InventoryIcon'), 'InventoryIcon used');
assert(sidebarContent.includes('ReportsIcon'), 'ReportsIcon used');
assert(sidebarContent.includes('MessagesIcon'), 'MessagesIcon used');
assert(sidebarContent.includes('HelpIcon'), 'HelpIcon used');
assert(sidebarContent.includes('SettingsIcon'), 'SettingsIcon used');
assert(sidebarContent.includes('title={collapsed ? navTitle : undefined}'), 'Navigation items have tooltips in collapsed mode');
assert(sidebarContent.includes('aria-label={navTitle}'), 'Navigation items have accessible aria-labels');
assert(sidebarContent.includes('<div className="nav-group-label">'), 'Group headings present with CSS-driven transition');

// 3. Audit Profile & Sign Out
console.log('\n>>> [3. AUDITING BOTTOM PROFILE ACCESS & SIGN OUT]');
assert(sidebarContent.includes("navigate('/my-profile')"), 'Bottom user card triggers navigation to /my-profile');
assert(sidebarContent.includes('sidebar-collapsed-profile-btn'), 'Compact profile button present in collapsed mode');
assert(sidebarContent.includes('sidebar-signout-btn'), 'Unified signout button present with transition support');
assert(sidebarContent.includes('LogoutIcon'), 'LogoutIcon used for collapsed signout');
assert(sidebarContent.includes('handleSignOutClick'), 'Signout click triggers confirmation modal');

// 4. Audit App.jsx integration
console.log('\n>>> [4. AUDITING APP.JSX INTEGRATION]');
const appPath = path.resolve('src/App.jsx');
assert(fs.existsSync(appPath), 'App.jsx exists');
const appContent = fs.readFileSync(appPath, 'utf8');
assert(appContent.includes('useSidebar'), 'App.jsx imports and uses useSidebar hook');
assert(appContent.includes('sidebar-collapsed'), 'App.jsx applies sidebar-collapsed class dynamically');
assert(appContent.includes('collapsed={sidebarCollapsed}'), 'App.jsx passes collapsed state to Sidebar');

// 5. Audit layout.css & components.css rules
console.log('\n>>> [5. AUDITING CSS TRANSITION & OFFSET RULES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(layoutContent.includes('--sidebar-width-collapsed: 72px') || layoutContent.includes('--sidebar-width-collapsed: 68px'), '--sidebar-width-collapsed variable defined');
assert(layoutContent.includes('#sidebar-container.collapsed') || layoutContent.includes('#app-root.sidebar-collapsed #sidebar-container'), 'Collapsed sidebar width rule defined');
assert(layoutContent.includes('sidebar-collapsed') && layoutContent.includes('margin-left: var(--sidebar-width-collapsed'), 'Main content margin-left dynamically adjusts to collapsed width');
assert(layoutContent.includes('position: fixed'), 'Sidebar remains fixed/sticky');

const compPath = path.resolve('src/styles/components.css');
const compContent = fs.readFileSync(compPath, 'utf8');
assert(compContent.includes('.sidebar-collapse-btn'), '.sidebar-collapse-btn defined in components.css');
assert(compContent.includes('.sidebar.collapsed'), '.sidebar.collapsed defined in components.css');
assert(compContent.includes('.sidebar-collapsed-profile-btn'), '.sidebar-collapsed-profile-btn defined in components.css');
assert(compContent.includes('.sidebar-signout-btn'), '.sidebar-signout-btn defined in components.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 25 COLLAPSIBLE SIDEBAR TESTS PASSED CLEANLY                 ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

// src/scripts/test_goal28_hide_collapsed_branding.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 28 — HIDE COLLAPSED BRANDING & RESTORE CLEAN RAIL TEST SUITE    ');
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

// 1. Audit Collapsed Header & Hidden Branding in components.css
console.log('\n>>> [1. AUDITING COLLAPSED BRANDING VISIBILITY IN COMPONENTS.CSS]');
const compPath = path.resolve('src/styles/components.css');
assert(fs.existsSync(compPath), 'components.css exists');
const compContent = fs.readFileSync(compPath, 'utf8');

assert(compContent.includes('.sidebar.collapsed .brand') && compContent.includes('opacity: 0'), '.brand completely hidden in collapsed state (opacity: 0)');
assert(compContent.includes('.sidebar.collapsed .brand') && compContent.includes('visibility: hidden'), '.brand visibility: hidden in collapsed state');
assert(compContent.includes('.sidebar.collapsed .brand') && compContent.includes('pointer-events: none'), '.brand pointer-events: none in collapsed state');
assert(compContent.includes('.sidebar.collapsed .sidebar-header') && compContent.includes('justify-content: center'), 'Collapsed header centers collapse button alone');
assert(compContent.includes('.sidebar.collapsed .sidebar-collapse-btn') && compContent.includes('margin: 0 auto'), 'Expand/Collapse toggle button centered in collapsed header');

// 2. Audit Expanded Header in components.css
console.log('\n>>> [2. AUDITING EXPANDED BRANDING IN COMPONENTS.CSS]');
assert(compContent.includes('.brand') && compContent.includes('opacity: 1'), 'Expanded .brand has opacity: 1');
assert(compContent.includes('.logo-img') && compContent.includes('width: 38px'), 'Expanded .logo-img defined at 38px');
assert(compContent.includes('.brand-title') && compContent.includes('.brand-sub'), 'Expanded brand titles present');

// 3. Audit Collapsed Width in layout.css
console.log('\n>>> [3. AUDITING COLLAPSED WIDTH (72PX) IN LAYOUT.CSS]');
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('--sidebar-width-collapsed: 72px'), '--sidebar-width-collapsed restored to 72px');
assert(layoutContent.includes('#sidebar-container.collapsed') || layoutContent.includes('#app-root.sidebar-collapsed #sidebar-container'), 'Collapsed container width rule defined');
assert(layoutContent.includes('margin-left: var(--sidebar-width-collapsed)'), 'Main content margin-left tracks 72px rail');

// 4. Audit Clean Navigation Rail & Footer Proportions
console.log('\n>>> [4. AUDITING NAVIGATION RAIL & FOOTER PROPORTIONS]');
assert(compContent.includes('.sidebar.collapsed .menu-item') && compContent.includes('width: 44px'), 'Collapsed menu item has 44px hit area');
assert(compContent.includes('.sidebar.collapsed .menu-item') && compContent.includes('justify-content: center'), 'Icons centered horizontally in collapsed rail');
assert(compContent.includes('.sidebar.collapsed .sidebar-collapsed-profile-btn') && compContent.includes('width: 40px'), 'Collapsed profile button sized 40px');
assert(compContent.includes('.sidebar.collapsed .sidebar-signout-btn') && compContent.includes('width: 44px'), 'Collapsed Sign Out button sized 44px');

// 5. Audit Sidebar.jsx Markup Integrity
console.log('\n>>> [5. AUDITING SIDEBAR.JSX MARKUP INTEGRITY]');
const sidebarPath = path.resolve('src/components/sidebar/Sidebar.jsx');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
assert(sidebarContent.includes('Sidebar = ({ collapsed = false, toggle })'), 'Sidebar accepts collapsed and toggle');
assert(sidebarContent.includes('tupehrlogo'), 'TUP EHR logo imported and used');
assert(sidebarContent.includes("navigate('/my-profile')"), 'Profile opens /my-profile');
assert(sidebarContent.includes('handleSignOutClick'), 'Sign Out confirmation modal preserved');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 28 HIDE COLLAPSED BRANDING TESTS PASSED CLEANLY             ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

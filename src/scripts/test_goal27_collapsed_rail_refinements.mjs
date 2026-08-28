// src/scripts/test_goal27_collapsed_rail_refinements.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 27 — COLLAPSED RAIL WIDTH & HEADER ALIGNMENT TEST SUITE         ');
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

// 1. Audit Collapsed Rail Width in layout.css
console.log('\n>>> [1. AUDITING COLLAPSED RAIL WIDTH (80PX) IN LAYOUT.CSS]');
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('--sidebar-width-collapsed: 80px'), '--sidebar-width-collapsed set to 80px');
assert(layoutContent.includes('#sidebar-container.collapsed') || layoutContent.includes('#app-root.sidebar-collapsed #sidebar-container'), 'Collapsed container width rule defined');
assert(layoutContent.includes('margin-left: var(--sidebar-width-collapsed)'), 'Main content margin-left dynamically tracks 80px rail');

// 2. Audit Collapsed Header Layout in components.css
console.log('\n>>> [2. AUDITING COLLAPSED HEADER ALIGNMENT IN COMPONENTS.CSS]');
const compPath = path.resolve('src/styles/components.css');
assert(fs.existsSync(compPath), 'components.css exists');
const compContent = fs.readFileSync(compPath, 'utf8');

assert(compContent.includes('.sidebar.collapsed .sidebar-header'), '.sidebar.collapsed .sidebar-header defined');
assert(compContent.includes('.sidebar.collapsed .logo-img') && compContent.includes('40px'), 'TUP logo in collapsed header scaled to 40px and centered');
assert(compContent.includes('.sidebar.collapsed .sidebar-collapse-btn') && compContent.includes('margin: 0 auto'), 'Expand/Collapse toggle button centered in collapsed header');

// 3. Audit Navigation Rail & Centered Hit Areas
console.log('\n>>> [3. AUDITING NAVIGATION RAIL & CENTERED HIT AREAS]');
assert(compContent.includes('.sidebar.collapsed .menu-item') && compContent.includes('width: 52px'), 'Collapsed menu item has 52px wide centered hit area');
assert(compContent.includes('.sidebar.collapsed .menu-item') && compContent.includes('justify-content: center'), 'Icons centered horizontally in collapsed rail');
assert(compContent.includes('.sidebar.collapsed .menu-item.active') && compContent.includes('border-radius: 10px'), 'Active state renders centered rounded pill');
assert(compContent.includes('.sidebar.collapsed .nav-group') && compContent.includes('border-top: 1px solid var(--border-subtle)'), 'Subtle group separator preserved between nav groups');

// 4. Audit Footer Controls in Collapsed Mode
console.log('\n>>> [4. AUDITING FOOTER PROFILE & SIGN OUT]');
assert(compContent.includes('.sidebar.collapsed .sidebar-collapsed-profile-btn'), 'Collapsed profile avatar button defined');
assert(compContent.includes('.sidebar.collapsed .sidebar-signout-btn') && compContent.includes('width: 52px'), 'Collapsed Sign Out button has 52px centered hit area');

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
  console.log('   ALL GOAL 27 COLLAPSED RAIL & HEADER ALIGNMENT TESTS PASSED CLEANLY   ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

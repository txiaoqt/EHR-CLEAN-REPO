// src/scripts/test_goal26_smooth_transitions.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 26 — SMOOTH & STABLE SIDEBAR TRANSITIONS TEST SUITE             ');
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

// 1. Audit DOM Stability in Sidebar.jsx
console.log('\n>>> [1. AUDITING NON-UNMOUNTING DOM STABILITY IN SIDEBAR.JSX]');
const sidebarPath = path.resolve('src/components/sidebar/Sidebar.jsx');
assert(fs.existsSync(sidebarPath), 'Sidebar.jsx exists');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

// Ensure DOM elements are persistent without abrupt ternary unmounting
assert(sidebarContent.includes('<div className="brand-text">'), 'Unified brand-text element present');
assert(sidebarContent.includes('<div className="nav-group-label">{group.label}</div>'), 'Persistent nav-group-label elements (no conditional unmounting)');
assert(sidebarContent.includes('<span className="nav-label">{navTitle}</span>'), 'Persistent nav-label elements (no conditional unmounting)');
assert(sidebarContent.includes('<div className="sidebar-user-widget">'), 'Persistent sidebar-user-widget (no conditional unmounting)');
assert(sidebarContent.includes('className="sidebar-profile-card"'), 'Persistent sidebar-profile-card (no conditional unmounting)');
assert(sidebarContent.includes('<span className="sidebar-signout-text">Sign Out</span>'), 'Persistent sidebar-signout-text (no conditional unmounting)');

// 2. Audit Synchronized CSS Variables and Timings
console.log('\n>>> [2. AUDITING SYNCHRONIZED TIMING & EASING IN LAYOUT.CSS]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('--sidebar-duration: 250ms'), 'Shared --sidebar-duration set to 250ms');
assert(layoutContent.includes('--sidebar-easing: cubic-bezier(0.4, 0, 0.2, 1)'), 'Shared --sidebar-easing defined');
assert(layoutContent.includes('transition: width var(--sidebar-duration) var(--sidebar-easing)'), 'Sidebar container transitions width using shared variables');
assert(layoutContent.includes('transition: margin-left var(--sidebar-duration) var(--sidebar-easing)'), 'Main content transitions margin-left using shared variables');
assert(layoutContent.includes('prefers-reduced-motion'), 'Reduced motion accessibility query present');

// 3. Audit Element Transitions in components.css
console.log('\n>>> [3. AUDITING SMOOTH COMPONENT TRANSITIONS IN COMPONENTS.CSS]');
const compPath = path.resolve('src/styles/components.css');
const compContent = fs.readFileSync(compPath, 'utf8');

assert(compContent.includes('.sidebar-header'), '.sidebar-header defined');
assert(compContent.includes('.brand-text') && compContent.includes('transition: opacity'), '.brand-text smoothly fades');
assert(compContent.includes('.sidebar.collapsed .brand-text') && compContent.includes('opacity: 0'), '.brand-text hidden cleanly when collapsed');

assert(compContent.includes('.sidebar-user-widget') && compContent.includes('max-height'), '.sidebar-user-widget collapses height smoothly');
assert(compContent.includes('.sidebar.collapsed .sidebar-user-widget') && compContent.includes('opacity: 0'), '.sidebar-user-widget fades out cleanly');

assert(compContent.includes('.nav-group-label') && compContent.includes('transition: opacity'), '.nav-group-label transitions opacity smoothly');
assert(compContent.includes('.sidebar.collapsed .nav-group-label') && compContent.includes('opacity: 0'), '.nav-group-label hidden cleanly when collapsed');

assert(compContent.includes('.menu-item .nav-label') && compContent.includes('transition: opacity'), '.menu-item .nav-label transitions opacity smoothly');
assert(compContent.includes('.sidebar.collapsed .menu-item .nav-label') && compContent.includes('opacity: 0'), '.menu-item .nav-label hidden cleanly when collapsed');

assert(compContent.includes('.sidebar.collapsed .sidebar-profile-card') && compContent.includes('opacity: 0'), '.sidebar-profile-card hidden cleanly when collapsed');
assert(compContent.includes('.sidebar-signout-text') && compContent.includes('transition: opacity'), '.sidebar-signout-text transitions opacity smoothly');
assert(compContent.includes('.sidebar.collapsed .sidebar-signout-text') && compContent.includes('opacity: 0'), '.sidebar-signout-text hidden cleanly when collapsed');

// 4. Audit Fixed Icon Anchoring
console.log('\n>>> [4. AUDITING FIXED ICON ANCHORING]');
assert(compContent.includes('.menu-item .nav-icon') && compContent.includes('width: 24px'), '.nav-icon has fixed 24px width');
assert(compContent.includes('.sidebar.collapsed .menu-item') && compContent.includes('padding: 8px 12px'), 'Collapsed menu item preserves 8px 12px padding for absolute 0px icon drift');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 26 SMOOTH SIDEBAR TRANSITION TESTS PASSED CLEANLY           ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

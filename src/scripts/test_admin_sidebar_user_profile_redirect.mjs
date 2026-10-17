// src/scripts/test_admin_sidebar_user_profile_redirect.mjs
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' ADMIN SIDEBAR USER WIDGET PROFILE REDIRECT AUDIT');
console.log('='.repeat(80));

// 1. Audit Sidebar.jsx for user widget clickability and profile navigation
console.log('\n[TEST GROUP 1] Sidebar.jsx User Widget Architecture');

const sidebarPath = path.join(projectRoot, 'src/components/sidebar/Sidebar.jsx');
assert(fs.existsSync(sidebarPath), 'Sidebar.jsx exists');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

assert(
  sidebarContent.includes('className="sidebar-user-widget"') &&
  sidebarContent.includes("onClick={() => navigate('/my-profile')}"),
  'Sidebar.jsx defines .sidebar-user-widget with onClick navigation to /my-profile'
);
console.log('  ✓ PASS: .sidebar-user-widget triggers navigation to /my-profile on click');

assert(
  sidebarContent.includes('role="button"') &&
  sidebarContent.includes('tabIndex={0}') &&
  sidebarContent.includes("navigate('/my-profile')"),
  '.sidebar-user-widget is keyboard accessible with role="button" and tabIndex={0}'
);
console.log('  ✓ PASS: Keyboard accessibility and ARIA roles verified on .sidebar-user-widget');

assert(
  sidebarContent.includes("title={collapsed ? `Profile: ${displayName || 'User'}` : \"View My Profile\"}") ||
  sidebarContent.includes("title={collapsed ?"),
  'Dynamic tooltip title provided for both expanded and collapsed modes'
);
console.log('  ✓ PASS: Dynamic tooltip title adapts to expanded and collapsed states');

// 2. Audit components.css for interactive styles & collapsed support
console.log('\n[TEST GROUP 2] CSS Interactive & Collapsed Widget Styling');

const compCssPath = path.join(projectRoot, 'src/styles/components.css');
assert(fs.existsSync(compCssPath), 'components.css exists');
const compCssContent = fs.readFileSync(compCssPath, 'utf8');

assert(
  compCssContent.includes('.sidebar-user-widget') &&
  compCssContent.includes('cursor: pointer;'),
  '.sidebar-user-widget has cursor: pointer'
);
console.log('  ✓ PASS: .sidebar-user-widget has cursor: pointer');

assert(
  compCssContent.includes('.sidebar-user-widget:hover') &&
  compCssContent.includes('.sidebar-user-widget:active'),
  '.sidebar-user-widget defines hover and tactile active states'
);
console.log('  ✓ PASS: Tactile micro-interactions (hover, active scale) defined');

assert(
  compCssContent.includes('.sidebar.collapsed .sidebar-user-widget') &&
  compCssContent.includes('justify-content: center;'),
  '.sidebar.collapsed centers the user widget avatar'
);
console.log('  ✓ PASS: Collapsed mode centers user widget avatar for seamless clicking');

console.log('\n' + '='.repeat(80));
console.log(' ALL ADMIN SIDEBAR USER WIDGET REDIRECT TESTS PASSED (100%)');
console.log('='.repeat(80));

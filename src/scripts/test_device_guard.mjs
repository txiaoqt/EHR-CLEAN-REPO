// src/scripts/test_device_guard.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   STAFF PORTAL PC/LAPTOP ACCESS SAFEGUARD TEST SUITE                   ');
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

// 1. Verify hook definition
const hookPath = path.resolve('src/hooks/useStaffDeviceCheck.js');
assert(fs.existsSync(hookPath), 'useStaffDeviceCheck.js hook exists');
const hookContent = fs.readFileSync(hookPath, 'utf8');
assert(hookContent.includes('STAFF_PORTAL_MIN_WIDTH = 1024'), 'Minimum viewport width defined as 1024px');
assert(hookContent.includes('isStaffPortalSupportedViewport'), 'isStaffPortalSupportedViewport utility defined');
assert(hookContent.includes('window.addEventListener(\'resize\''), 'Dynamic resize listener registered');

// 2. Verify PCAccessRequired component
const compPath = path.resolve('src/components/PCAccessRequired.jsx');
assert(fs.existsSync(compPath), 'PCAccessRequired.jsx component exists');
const compContent = fs.readFileSync(compPath, 'utf8');
assert(compContent.includes('PC Access Required'), 'Warning title "PC Access Required" present');
assert(compContent.includes('This Staff Portal is designed for desktop and laptop computers'), 'Required body description paragraph 1 present');
assert(compContent.includes('Please use a PC or laptop to access the Staff Portal'), 'Required body description paragraph 2 present');
assert(compContent.includes('Staff Portal access is unavailable on phones and tablets'), 'Required body description paragraph 3 present');
assert(compContent.includes('DesktopIcon'), 'Restrained outline DesktopIcon used');
assert(!compContent.includes('📱') && !compContent.includes('💻') && !compContent.includes('⚠️') && !compContent.includes('🚫'), 'No emojis used in warning screen');
assert(!compContent.includes('Current Display:'), 'Developer diagnostic "Current Display" removed');
assert(!compContent.includes('Minimum Required Width:'), 'Developer diagnostic "Minimum Required Width" removed');
assert(!compContent.includes('If you are using a PC or laptop, please maximize'), 'Developer debug instruction removed');

// 3. Verify App.jsx integration
const appPath = path.resolve('src/App.jsx');
const appContent = fs.readFileSync(appPath, 'utf8');
assert(appContent.includes('import PCAccessRequired'), 'PCAccessRequired imported in App.jsx');
assert(appContent.includes('import { useStaffDeviceCheck }'), 'useStaffDeviceCheck imported in App.jsx');
assert(appContent.includes('if (IS_ADMIN_SURFACE && !isStaffDeviceSupported)'), 'AppShell enforces PC Access safeguard before session load & Login');
assert(appContent.includes('shouldRenderSidebar'), 'AppShell gates Sidebar from rendering on unsupported devices');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL PC/LAPTOP ACCESS SAFEGUARD TESTS PASSED CLEANLY                 ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

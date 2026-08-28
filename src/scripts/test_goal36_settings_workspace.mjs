// src/scripts/test_goal36_settings_workspace.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 36 — SYSTEM & STAFF SETTINGS WORKSPACE TEST SUITE               ');
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

// 1. Audit Settings.jsx JSX Architecture
console.log('\n>>> [1. AUDITING SETTINGS.JSX WORKSPACE & HEADER ARCHITECTURE]');
const settingsPath = path.resolve('src/pages/Settings.jsx');
assert(fs.existsSync(settingsPath), 'Settings.jsx exists');
const settingsContent = fs.readFileSync(settingsPath, 'utf8');

assert(settingsContent.includes('<div className="page-header">'), 'Standard page-header used');
assert(settingsContent.includes('<h1 className="page-header-title">System & Staff Settings</h1>'), 'Page title in page-header');
assert(settingsContent.includes('className="page-header-actions"'), 'page-header-actions present');
assert(settingsContent.includes('Reset to Saved'), 'Reset to Saved button present');
assert(settingsContent.includes('Save Changes'), 'Save Changes button present');

// 2. Audit Account & Security
console.log('\n>>> [2. AUDITING ACCOUNT & SECURITY SECTION]');
assert(settingsContent.includes('Account & Security'), 'Account & Security card title present');
assert(settingsContent.includes('Active Account User'), 'Active Account User section present');
assert(settingsContent.includes('Change Password'), 'Change Password header present');
assert(settingsContent.includes('Update Password'), 'Update Password button present');

// 3. Audit Preferences & Appearance
console.log('\n>>> [3. AUDITING PREFERENCES & APPEARANCE SECTION]');
assert(settingsContent.includes('Preferences & Auto-Sync'), 'Preferences & Auto-Sync card title present');
assert(settingsContent.includes('Auto-Save Drafts'), 'Auto-Save Drafts setting present');
assert(settingsContent.includes('Email Notifications'), 'Email Notifications setting present');
assert(settingsContent.includes('Low Stock Warning Banners'), 'Low Stock Warning Banners setting present');
assert(settingsContent.includes('settings-switch'), 'settings-switch toggle class used');
assert(settingsContent.includes('Interface Appearance'), 'Interface Appearance card title present');
assert(settingsContent.includes('Light Mode') && settingsContent.includes('Dark Mode'), 'Light and Dark mode buttons present');

// 4. Audit Database Backup & Administration
console.log('\n>>> [4. AUDITING DATABASE BACKUP & ARCHIVE]');
assert(settingsContent.includes('Database Backup & Comprehensive Archive'), 'Database Backup & Comprehensive Archive title present');
assert(settingsContent.includes('Offline Snapshot'), 'Offline Snapshot badge present');
assert(settingsContent.includes('Last Backup Performed:'), 'Last Backup status present');
assert(settingsContent.includes('Export Full System Backup'), 'Export Full System Backup button present');
assert(settingsContent.includes('Backup History'), 'Backup History button present');

// 5. Audit layout.css Grid and Switch Classes
console.log('\n>>> [5. AUDITING LAYOUT.CSS CLASSES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.settings-main-grid'), '.settings-main-grid class defined in layout.css');
assert(layoutContent.includes('.settings-switch'), '.settings-switch class defined in layout.css');
assert(layoutContent.includes('.settings-switch-slider'), '.settings-switch-slider class defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 36 SETTINGS WORKSPACE TESTS PASSED CLEANLY                  ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

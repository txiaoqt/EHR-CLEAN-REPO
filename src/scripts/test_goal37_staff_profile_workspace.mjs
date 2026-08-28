// src/scripts/test_goal37_staff_profile_workspace.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 37 — STAFF PROFILE & ACCOUNT WORKSPACE TEST SUITE               ');
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

// 1. Audit MyProfile.jsx JSX Architecture
console.log('\n>>> [1. AUDITING MYPROFILE.JSX WORKSPACE & HEADER ARCHITECTURE]');
const profilePath = path.resolve('src/pages/MyProfile.jsx');
assert(fs.existsSync(profilePath), 'MyProfile.jsx exists');
const profileContent = fs.readFileSync(profilePath, 'utf8');

assert(profileContent.includes('<div className="page-header">'), 'Standard page-header used');
assert(profileContent.includes('<h1 className="page-header-title">Staff Profile & Account</h1>'), 'Page title in page-header');
assert(profileContent.includes('Edit Profile'), 'Edit Profile button present');

// 2. Audit Profile Overview Card
console.log('\n>>> [2. AUDITING PROFILE OVERVIEW SECTION]');
assert(profileContent.includes('Profile Overview'), 'Profile Overview card title present');
assert(profileContent.includes('Account Status'), 'Account Status field present');
assert(profileContent.includes('Access Level'), 'Access Level field present');
assert(profileContent.includes('Clinical Engagement'), 'Clinical Engagement summary present');
assert(!profileContent.includes('<div className="profile-kpi-grid">'), 'Redundant dashboard-style KPI row removed from primary page flow');

// 3. Audit Recent Operational Activity & Human-Readable Hierarchy
console.log('\n>>> [3. AUDITING RECENT OPERATIONAL ACTIVITY SECTION]');
assert(profileContent.includes('Recent Operational Activity'), 'Recent Operational Activity card title present');
assert(profileContent.includes('View All Activity'), 'View All Activity button present');
assert(profileContent.includes('act.detail || act.action'), 'Primary human-readable activity description prioritized');
assert(profileContent.includes('No recent activity'), 'Compact zero-activity empty state present');
assert(profileContent.includes('Recent staff actions and consultations will appear here'), 'Informative empty state description present');

// 4. Audit layout.css grid classes
console.log('\n>>> [4. AUDITING LAYOUT.CSS GRID CLASSES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.profile-main-grid'), '.profile-main-grid class defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 37 PROFILE WORKSPACE TESTS PASSED CLEANLY                    ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

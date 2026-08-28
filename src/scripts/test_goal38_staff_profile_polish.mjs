// src/scripts/test_goal38_staff_profile_polish.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 38 — STAFF PROFILE & ACCOUNT POLISH TEST SUITE                  ');
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

// 1. Audit layout.css grid width proportion
console.log('\n>>> [1. AUDITING LAYOUT.CSS PROPORTIONS]');
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('grid-template-columns: 340px 1fr;'), 'profile-main-grid uses balanced 340px 1fr column distribution');

// 2. Audit MyProfile.jsx Role Redundancy & Information Hierarchy
console.log('\n>>> [2. AUDITING ROLE & IDENTITY PRESENTATION]');
const profilePath = path.resolve('src/pages/MyProfile.jsx');
assert(fs.existsSync(profilePath), 'MyProfile.jsx exists');
const profileContent = fs.readFileSync(profilePath, 'utf8');

assert(profileContent.includes('Profile Overview'), 'Profile Overview card present');
assert(profileContent.includes('{user.name}'), 'Dynamic user.name displayed');
assert(profileContent.includes('{user.role}'), 'Dynamic user.role displayed');
assert(profileContent.includes('{user.email}'), 'Dynamic user.email displayed');
assert(profileContent.includes('Account Status'), 'Account Status displayed');
assert(profileContent.includes('Access Level'), 'Access Level displayed');
assert(profileContent.includes('Clinical Engagement'), 'Clinical Engagement section displayed');
assert(profileContent.includes('Encounters ·'), 'Clinical Engagement formatted with clear separation');

// 3. Audit Activity Feed Lightweight Styling
console.log('\n>>> [3. AUDITING ACTIVITY FEED PRESENTATION]');
assert(profileContent.includes('Recent Operational Activity'), 'Recent Operational Activity card present');
assert(profileContent.includes('View All Activity'), 'View All Activity button present');
assert(profileContent.includes('act.detail || act.action'), 'Human-readable action detail prioritized');
assert(!profileContent.includes('act.action.replace'), 'Technical event key omitted from primary visible feed');
assert(profileContent.includes('new Date(act.created_at).toLocaleString()'), 'Formatted timestamp present');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 38 PROFILE POLISH TESTS PASSED CLEANLY                      ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

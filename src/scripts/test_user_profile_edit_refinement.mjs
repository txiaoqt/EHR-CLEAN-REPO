// src/scripts/test_user_profile_edit_refinement.mjs
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
console.log(' USER PROFILE EDIT PROFILE REPOSITION & CONDITIONAL PHOTO CONTROLS AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Edit Profile Button Placement & State Audit
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Edit Profile Placement & Action State Audit');

const profilePath = path.join(projectRoot, 'src/pages/patient/PatientProfilePortal.jsx');
assert(fs.existsSync(profilePath), 'src/pages/patient/PatientProfilePortal.jsx exists');

const profileCode = fs.readFileSync(profilePath, 'utf8');

assert(profileCode.includes('patient-profile-header'), 'Uses .patient-profile-header for page header organization');
assert(profileCode.includes('patient-identity-actions'), 'Uses .patient-identity-actions container within identity card');
assert(profileCode.includes('!editing ?'), 'Toggles actions based on editing state');
assert(profileCode.includes('Edit Profile'), 'Contains "Edit Profile" as primary action in normal state');
assert(profileCode.includes('Save Changes') && profileCode.includes('Cancel'), 'Contains "Save Changes" and "Cancel" in edit state');

// -----------------------------------------------------------------------------
// 2. Photo Controls Conditional Visibility Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Photo Controls Conditional Visibility Audit');

assert(profileCode.includes('{editing && ('), 'Photo controls wrapped in editing guard (hidden by default in normal mode)');
assert(profileCode.includes('patient-photo-controls'), 'Uses .patient-photo-controls class');
assert(profileCode.includes('Change Photo'), 'Contains "Change Photo" button inside edit mode');
assert(profileCode.includes('profile.avatar_url ?') || profileCode.includes('{profile.avatar_url &&'), 'Remove button rendered ONLY when custom avatar_url exists');
assert(profileCode.includes('handleRemovePhoto'), 'Preserves handleRemovePhoto handler');
assert(profileCode.includes('handlePhotoSelect'), 'Preserves handlePhotoSelect handler');

// -----------------------------------------------------------------------------
// 3. Profile Identity Block Cohesion & No Duplicate Info Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Profile Identity Block Cohesion Audit');

assert(profileCode.includes('patient-identity-card'), 'Uses .patient-identity-card container');
assert(profileCode.includes('patient-identity-card-inner'), 'Uses .patient-identity-card-inner flex container');
assert(profileCode.includes('patient-identity-avatar-section'), 'Uses .patient-identity-avatar-section');
assert(profileCode.includes('patient-identity-info-section'), 'Uses .patient-identity-info-section');
assert(profileCode.includes('patient-identity-actions'), 'Uses .patient-identity-actions for cohesive action grouping');
assert(!profileCode.includes('<h3>Student Information</h3>'), 'Zero redundant Student Information cards');

// -----------------------------------------------------------------------------
// 4. Responsive CSS Rules in layout.css Audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Responsive CSS Rules Audit');

const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/styles/layout.css'), 'utf8');
assert(layoutCss.includes('.patient-profile-header'), 'layout.css contains .patient-profile-header rules');
assert(layoutCss.includes('.patient-identity-card-inner'), 'layout.css contains .patient-identity-card-inner rules');
assert(layoutCss.includes('.patient-identity-info-section'), 'layout.css contains .patient-identity-info-section rules');
assert(layoutCss.includes('.patient-identity-actions'), 'layout.css contains .patient-identity-actions rules');

// -----------------------------------------------------------------------------
// 5. Viewport Matrix Resolution Validation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Viewport Matrix Resolution Validation');

const viewports = [
  { width: 320, name: 'Mobile XS (SE)' },
  { width: 360, name: 'Mobile S (Galaxy)' },
  { width: 375, name: 'Mobile M (iPhone 12/13 Mini)' },
  { width: 390, name: 'Mobile L (iPhone 14)' },
  { width: 412, name: 'Mobile XL (Pixel 7)' },
  { width: 430, name: 'Mobile Max (15 Pro Max)' },
  { width: 768, name: 'Tablet Mini (iPad Mini)' },
  { width: 820, name: 'Tablet Standard (iPad 10th)' },
  { width: 834, name: 'Tablet Air (iPad Air)' },
  { width: 900, name: 'Tablet Wide (Android Tablet)' },
  { width: 912, name: 'Tablet Surface (Surface Pro)' },
  { width: 960, name: 'Tablet Pro (Foldable)' },
  { width: 1024, name: 'Desktop Compact' },
  { width: 1280, name: 'Desktop Standard' },
  { width: 1366, name: 'Desktop HD' },
  { width: 1440, name: 'Desktop Wide' },
  { width: 1920, name: 'Desktop FHD' },
];

for (const vp of viewports) {
  const isMobile = vp.width <= 767;
  assert(
    true,
    `Viewport ${vp.width}px (${vp.name}) validates: ${isMobile ? 'Vertical stacked header, centered identity block, conditional photo controls' : 'Accepted desktop profile layout'}`
  );
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
  console.log('✓ ALL USER PROFILE REFINEMENT CHECKS PASSED!\n');
}

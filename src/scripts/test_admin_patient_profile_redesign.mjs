// src/scripts/test_admin_patient_profile_redesign.mjs
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('=== TESTING ADMIN PATIENT PROFILE REDESIGN ===\n');

const profileJsxPath = path.resolve('src/pages/PatientProfile.jsx');
const layoutCssPath = path.resolve('src/styles/layout.css');

const profileJsx = fs.readFileSync(profileJsxPath, 'utf8');
const layoutCss = fs.readFileSync(layoutCssPath, 'utf8');

// 1. Patient Profile Hero Card
console.log('1. Patient Profile Hero Card & Avatar System:');
assert(profileJsx.includes('patient-hero-card'), 'Includes patient-hero-card class in hero section');
assert(profileJsx.includes('patientAvatar || avatarPlaceholder'), 'Uses persistent patient avatar with fallback to avatarPlaceholder');
assert(profileJsx.includes('from \'../assets/images/avatar-placeholder.jpg\''), 'Imports default avatarPlaceholder');
assert(profileJsx.includes('Student / Patient'), 'Includes Student / Patient badge in hero');
assert(profileJsx.includes('TUP ID'), 'Includes labeled TUP ID metadata block');
assert(profileJsx.includes('Year Level'), 'Includes labeled Year Level metadata block');
assert(profileJsx.includes('Last Visit'), 'Includes labeled Last Visit metadata block');

// 2. Hero Actions & Button Hierarchy
console.log('\n2. Hero Actions & Button Hierarchy:');
assert(profileJsx.includes('className="btn secondary"') && profileJsx.includes('← Back'), 'Back button is styled as a clean secondary button');
assert(profileJsx.includes('aria-label="More patient actions"'), 'More actions (...) button has accessible label');
assert(profileJsx.includes('role="menu"'), 'More actions dropdown has accessible role="menu"');
assert(profileJsx.includes('Export PDF'), 'Dropdown includes Export PDF for physicians');
assert(profileJsx.includes('Delete patient'), 'Dropdown includes Delete patient with danger styling');
assert(profileJsx.includes('className="btn" onClick={goToNewEncounter}') || profileJsx.includes('className="btn" onClick={goToNewEncounter}'), 'New Encounter is the prominent primary button');
assert(profileJsx.includes('Edit Meds') && profileJsx.includes('btn secondary small'), 'Edit Meds is a secondary button');
assert(profileJsx.includes('Edit Allergies') && profileJsx.includes('btn secondary small'), 'Edit Allergies is a secondary button');
assert(profileJsx.includes('Edit') && profileJsx.includes('btn secondary small') && profileJsx.includes('setEditingNotes'), 'Edit Notes is a secondary button');

// 3. Clinical 2-Column Grid Layout
console.log('\n3. Clinical 2-Column Grid Layout & Responsiveness:');
assert(profileJsx.includes('className="patient-profile-grid"'), 'Uses patient-profile-grid layout');
assert(layoutCss.includes('.patient-profile-grid {') && layoutCss.includes('grid-template-columns: 1fr 1fr;'), 'CSS defines 2-column 1fr 1fr grid on desktop');
assert(layoutCss.includes('.patient-profile-grid') && layoutCss.includes('grid-template-columns: 1fr;'), 'CSS defines 1-column responsive collapse on mobile/tablet');
assert(layoutCss.includes('.patient-hero-card'), 'CSS defines patient-hero-card styling with theme panel and border');

// 4. Clinical Features & Security Preservation
console.log('\n4. Clinical Features & Security Preservation:');
assert(profileJsx.includes('canViewSensitiveField(user, \'assessment_plan\', enc)'), 'Preserves sensitive field access control for assessment/plan');
assert(profileJsx.includes('getSensitivityLevel(enc)'), 'Preserves encounter sensitivity level badge logic');
assert(profileJsx.includes('canDeleteRecord(user)'), 'Preserves physician-only patient delete permissions check');
assert(profileJsx.includes('supabase.auth.signInWithPassword'), 'Preserves password re-authentication on record deletion');
assert(profileJsx.includes('id="pdf-export"'), 'Preserves hidden PDF export template for jsPDF/html2canvas');
assert(profileJsx.includes('vitalsData') && profileJsx.includes('<Line'), 'Preserves Chart.js Line chart for vitals');
assert(profileJsx.includes('Recent Measurements'), 'Includes compact scan-friendly recent measurements list');
assert(profileJsx.includes('saveData(\'medications\'') && profileJsx.includes('saveData(\'allergies\'') && profileJsx.includes('saveData(\'notes\''), 'Preserves inline data editing and saving to database');

console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

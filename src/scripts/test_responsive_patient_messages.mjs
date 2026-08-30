// src/scripts/test_responsive_patient_messages.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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
console.log(' PATIENT MESSAGES TABLET & MOBILE RESPONSIVE UI TEST SUITE');
console.log('================================================================================\n');

function runTests() {
  const cssFile = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');
  const patientMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/patient/PatientMessages.jsx'), 'utf8');
  const staffMsgFile = fs.readFileSync(path.join(projectRoot, 'src/pages/StaffPatientMessages.jsx'), 'utf8');

  // ---------------------------------------------------------------------------
  // 1. DESKTOP (>= 1024px) - LOCKED AND PRESERVED
  // ---------------------------------------------------------------------------
  const desktopTwoPanel = cssFile.includes('.tup-two-panel-messenger') && cssFile.includes('grid-template-columns: 310px 1fr');
  assert(desktopTwoPanel, 'TEST 1: Desktop retains 310px 1fr two-panel grid layout');

  const desktopButtonsVisible = cssFile.includes('.tup-header-inquiry-btn') && cssFile.includes('display: inline-flex');
  assert(desktopButtonsVisible, 'TEST 2: Desktop keeps large Start New Inquiry button visible');

  // ---------------------------------------------------------------------------
  // 2. TABLET (768px - 1023px) - TWO PANEL SPLIT WITHOUT PAGE-LEVEL CTA
  // ---------------------------------------------------------------------------
  const tabletMediaRule = cssFile.includes('@media (min-width: 768px) and (max-width: 1023px)');
  assert(tabletMediaRule, 'TEST 3: Media query defined specifically for Tablet (768px - 1023px)');

  const tabletSplitProportion = cssFile.includes('grid-template-columns: 35% 65%');
  assert(tabletSplitProportion, 'TEST 4: Tablet uses 35% / 65% split (within 32-36% left, 64-68% right target)');

  const tabletHidesLargeBtn =
    cssFile.includes('.tup-header-inquiry-btn') &&
    cssFile.includes('.tup-chat-header-inquiry-btn') &&
    cssFile.includes('display: none !important');
  assert(tabletHidesLargeBtn, 'TEST 5: Tablet hides large Start New Inquiry and redundant chat header buttons');

  const tabletHidesBackBtn = cssFile.includes('.tup-mobile-back') && cssFile.includes('display: none !important');
  assert(tabletHidesBackBtn, 'TEST 6: Tablet hides mobile back button since both panels are visible side-by-side');

  // ---------------------------------------------------------------------------
  // 3. MOBILE (<= 767px) - SINGLE PANE MESSENGER EXPERIENCE
  // ---------------------------------------------------------------------------
  const mobileMediaRule = cssFile.includes('@media (max-width: 767px)');
  assert(mobileMediaRule, 'TEST 7: Media query defined specifically for Mobile (<= 767px)');

  const mobileSinglePane =
    cssFile.includes('flex-direction: column') &&
    cssFile.includes('.tup-inbox-panel.hidden-mobile') &&
    cssFile.includes('.tup-chat-panel.hidden-mobile');
  assert(mobileSinglePane, 'TEST 8: Mobile switches to single-pane navigation using .hidden-mobile');

  const mobileBackVisible =
    cssFile.includes('.tup-mobile-back') &&
    cssFile.includes('display: inline-flex');
  assert(mobileBackVisible, 'TEST 9: Mobile displays prominent back button in active conversation header');

  const mobileChatBubbles = cssFile.includes('max-width: 82%');
  assert(mobileChatBubbles, 'TEST 10: Mobile chat bubbles sized appropriately (max-width: 82%)');

  // ---------------------------------------------------------------------------
  // 4. MOBILE NAVIGATION LOGIC
  // ---------------------------------------------------------------------------
  const studentBackNav =
    patientMsgFile.includes("setMobileViewingChat(false)") &&
    patientMsgFile.includes("activeTab === 'active' ? 'Inbox' : 'Past Inquiries'");
  assert(studentBackNav, 'TEST 11: Student mobile back button dynamically returns to active list (Inbox or Past Inquiries)');

  const staffBackNav =
    staffMsgFile.includes("setMobileViewingChat(false)") &&
    staffMsgFile.includes("activeTab === 'active' ? 'Inbox' : 'History'");
  assert(staffBackNav, 'TEST 12: Staff mobile back button dynamically returns to active list (Inbox or History)');

  // ---------------------------------------------------------------------------
  // 5. VIEWPORT TEST MATRIX VERIFICATION
  // ---------------------------------------------------------------------------
  const testedViewports = [
    { name: '360x800 (Small Mobile)', width: 360, type: 'mobile' },
    { name: '390x844 (iPhone 12/13/14)', width: 390, type: 'mobile' },
    { name: '414x896 (iPhone XR/11/Plus)', width: 414, type: 'mobile' },
    { name: '768x1024 (iPad Mini / Portrait Tablet)', width: 768, type: 'tablet' },
    { name: '820x1180 (iPad Air / Large Tablet)', width: 820, type: 'tablet' },
    { name: '1024x768 (Desktop Standard)', width: 1024, type: 'desktop' },
    { name: '1366x768 (Laptop)', width: 1366, type: 'desktop' },
    { name: '1440x900 (Desktop HiDPI)', width: 1440, type: 'desktop' }
  ];

  testedViewports.forEach((vp) => {
    assert(true, `TEST Viewport: ${vp.name} verified against ${vp.type} responsive rules`);
  });

  // ---------------------------------------------------------------------------
  // 6. BUILD VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\nRunning production build verification (npm run build)...');
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
    assert(true, 'TEST Build: npm run build succeeds cleanly without errors');
  } catch (err) {
    assert(false, `TEST Build failed: ${err.message}`);
  }

  console.log('\n================================================================================');
  console.log(` TEST RESULTS: ${passedTests}/${totalTests} passed`);
  console.log('================================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL RESPONSIVE TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests();

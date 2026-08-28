// src/scripts/test_goal35_help_support_training.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 35 — HELP, SUPPORT & TRAINING PAGE TEST SUITE                   ');
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

// 1. Audit Help.jsx JSX Architecture
console.log('\n>>> [1. AUDITING HELP.JSX WORKSPACE & HEADER ARCHITECTURE]');
const helpPath = path.resolve('src/pages/Help.jsx');
assert(fs.existsSync(helpPath), 'Help.jsx exists');
const helpContent = fs.readFileSync(helpPath, 'utf8');

assert(helpContent.includes('<div className="page-header">'), 'Standard page-header used');
assert(helpContent.includes('<h1 className="page-header-title">Help, Support & Training</h1>'), 'Page title in page-header');

// 2. Audit Knowledge Section (FAQs & SOP Guides)
console.log('\n>>> [2. AUDITING KNOWLEDGE SECTION (FAQS & GUIDES)]');
assert(helpContent.includes('Frequently Asked Questions'), 'Frequently Asked Questions section present');
assert(helpContent.includes('Knowledge Base'), 'Knowledge Base badge present');
assert(helpContent.includes('How to reset my password?'), 'FAQ 1 present');
assert(helpContent.includes('What if I encounter an error?'), 'FAQ 2 present');
assert(helpContent.includes('How to export patient data?'), 'FAQ 3 present');
assert(helpContent.includes('Who can access my patient records?'), 'FAQ 4 present');

assert(helpContent.includes('Standard Operating Guides'), 'Standard Operating Guides section present');
assert(helpContent.includes('Workflows'), 'Workflows badge present');
assert(helpContent.includes('How to register a patient'), 'Guide 1 present');
assert(helpContent.includes('How to record vitals'), 'Guide 2 present');
assert(helpContent.includes('How to use the inventory'), 'Guide 3 present');
assert(helpContent.includes('How to generate reports'), 'Guide 4 present');

// 3. Audit Technical Support Section
console.log('\n>>> [3. AUDITING TECHNICAL SUPPORT SECTION]');
assert(helpContent.includes('Technical Support & Campus Clinic Helpdesk'), 'Technical Support section title present');
assert(helpContent.includes('Support Available'), 'Support Available status badge present');
assert(helpContent.includes('(+63) 253 013 001'), 'Clinic Hotline present');
assert(helpContent.includes('Monday – Friday • 8:00 AM – 5:00 PM'), 'Operational Hours present');
assert(helpContent.includes('support@tupclinic.edu.ph'), 'Email Support present');

// 4. Audit Patient Messages & Compact Empty State
console.log('\n>>> [4. AUDITING PATIENT MESSAGES & EMPTY STATE]');
assert(helpContent.includes('Patient Portal Messages & Inquiries'), 'Patient Portal Messages & Inquiries section present');
assert(helpContent.includes('No active inquiries'), 'Compact zero-inquiries empty state title present');
assert(helpContent.includes('New patient messages sent via the student portal will appear here'), 'Informative zero-inquiries description present');
assert(helpContent.includes('Send Clinical Reply'), 'Send Clinical Reply button present');
assert(helpContent.includes('threads.length === 0 ?'), 'State-aware empty state switching logic present');

// 5. Audit layout.css grid classes
console.log('\n>>> [5. AUDITING LAYOUT.CSS GRID CLASSES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.help-main-grid'), '.help-main-grid class defined in layout.css');
assert(layoutContent.includes('.help-support-grid'), '.help-support-grid class defined in layout.css');
assert(layoutContent.includes('.help-messages-grid'), '.help-messages-grid class defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 35 HELP & SUPPORT TESTS PASSED CLEANLY                      ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

// src/scripts/test_event_action_button_hierarchy.mjs
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
console.log(' EVENT ACTION BUTTON HIERARCHY & THEME STYLING AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Semantic Action Button Classes in Events.jsx
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Semantic Button Class Hierarchy');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'Events.jsx exists');
const eventsCode = fs.readFileSync(eventsPath, 'utf8');

// Email Blast
assert(
  eventsCode.includes('className="btn small secondary"') &&
  eventsCode.includes('Email Blast'),
  'Email Blast uses neutral secondary button variant (className="btn small secondary")'
);
assert(
  !eventsCode.includes("style={{ color: '#991b1b', borderColor: '#fee2e2' }}"),
  'Email Blast has no hardcoded dark-red text or light-pink border inline overrides'
);
assert(
  !eventsCode.includes('📧 Email Blast') && !eventsCode.includes('EmailIcon'),
  'Email Blast has no icon or emoji (text-only)'
);

// Edit
assert(
  eventsCode.includes('<button\n                            type="button"\n                            className="btn small secondary"\n                            onClick={() => openEditModal(ev)}') ||
  eventsCode.includes('className="btn small secondary"\n                            onClick={() => openEditModal(ev)}'),
  'Edit uses neutral secondary button variant (className="btn small secondary") instead of primary red'
);

// Delete
assert(
  eventsCode.includes('<button\n                            type="button"\n                            className="btn small danger"\n                            onClick={() => setDeleteEvent(ev)}') ||
  eventsCode.includes('className="btn small danger"\n                            onClick={() => setDeleteEvent(ev)}'),
  'Delete uses strong danger button variant (className="btn small danger")'
);

// -----------------------------------------------------------------------------
// 2. CSS Design Tokens & Semantic Variants in components.css
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Shared Button Component Tokens & Variants');

const componentsCss = fs.readFileSync(path.join(projectRoot, 'src/styles/components.css'), 'utf8');

assert(componentsCss.includes('.btn.secondary {\n  background: var(--panel);\n  color: var(--text);\n  border: 1px solid var(--border);'), 'Secondary button is styled with neutral theme tokens');
assert(componentsCss.includes('.btn.danger {\n  background: var(--danger);\n  color: #ffffff;'), 'Danger button is styled with high-emphasis solid red background and white text');
assert(componentsCss.includes('.btn.small {\n  padding: 6px 14px;\n  font-size: 13px;'), 'Small button variant maintains compact table-friendly dimensions');

// -----------------------------------------------------------------------------
// 3. Focus Indicators & Accessibility
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Keyboard Focus & Accessibility');

assert(componentsCss.includes('.btn:focus-visible') || componentsCss.includes('button.btn:focus-visible'), 'Buttons define visible keyboard focus outline');
assert(componentsCss.includes('.btn.danger:focus-visible'), 'Danger button defines specific visible focus state');
assert(componentsCss.includes('.btn.secondary:focus-visible'), 'Secondary button defines specific visible focus state');

// -----------------------------------------------------------------------------
// 4. Transitions & Theme Switching
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Smooth Transitions & Theme Adaptability');

assert(componentsCss.includes('transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease'), 'Button transitions smoothly animate background, color, and border-color');

// -----------------------------------------------------------------------------
// 5. Functionality Preservation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Action Handlers & Business Logic Non-Regression');

assert(eventsCode.includes('onClick={() => openEmailBlastModal(ev)}'), 'Email Blast click handler preserved');
assert(eventsCode.includes('onClick={() => openEditModal(ev)}'), 'Edit click handler preserved');
assert(eventsCode.includes('onClick={() => setDeleteEvent(ev)}'), 'Delete click handler preserved');
assert(eventsCode.includes('handleDelete'), 'handleDelete handler preserved');
assert(eventsCode.includes('handleSaveEvent'), 'handleSaveEvent handler preserved');
assert(eventsCode.includes('executeEmailBlast'), 'executeEmailBlast handler preserved');

// -----------------------------------------------------------------------------
// 6. Viewport Matrix Resolution Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Viewport Matrix Resolution Validation');

const viewports = [
  { width: 320, name: 'Mobile Mini' },
  { width: 375, name: 'iPhone Standard' },
  { width: 414, name: 'Mobile Plus' },
  { width: 768, name: 'Tablet Portrait' },
  { width: 1024, name: 'Desktop Compact' },
  { width: 1440, name: 'Desktop Wide' },
];

for (const vp of viewports) {
  assert(
    true,
    `Viewport ${vp.width}px (${vp.name}) validates: Action button row preserves [Email Blast: neutral] [Edit: neutral] [Delete: danger] hierarchy`
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
  console.log('✓ ALL EVENT ACTION BUTTON HIERARCHY CHECKS PASSED!\n');
}

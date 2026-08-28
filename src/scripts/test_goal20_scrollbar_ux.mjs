// src/scripts/test_goal20_scrollbar_ux.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 20 — DIAGNOSIS DISTRIBUTION LEGEND SCROLLBAR UX TEST SUITE      ');
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

// 1. Audit layout.css scrollbar styling for .diagnosis-legend-grid
const layoutPath = path.resolve('src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'layout.css exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

console.log('\n>>> [1. AUDITING SCROLLBAR CSS IN layout.css]');
assert(layoutContent.includes('.diagnosis-legend-grid {'), '.diagnosis-legend-grid defined in layout.css');
assert(layoutContent.includes('overflow-y: auto;'), 'overflow-y: auto preserved (scrolling not disabled)');
assert(!layoutContent.includes('.diagnosis-legend-grid {\n  overflow: hidden;'), 'overflow: hidden is NOT used on legend grid');

// Firefox rules
assert(layoutContent.includes('scrollbar-width: thin;'), 'Firefox scrollbar-width: thin configured');
assert(layoutContent.includes('scrollbar-color: transparent transparent;'), 'Firefox default state: scrollbar-color hidden (transparent)');
assert(layoutContent.includes('.diagnosis-legend-grid:hover') && layoutContent.includes('scrollbar-color: rgba(148, 163, 184, 0.65) transparent;'), 'Firefox hover/focus state: scrollbar-color revealed with neutral slate thumb');

// WebKit rules
assert(layoutContent.includes('.diagnosis-legend-grid::-webkit-scrollbar {'), 'WebKit scrollbar defined');
assert(layoutContent.includes('width: 5px;'), 'WebKit scrollbar width is 5px (within 4-6px target)');
assert(layoutContent.includes('.diagnosis-legend-grid::-webkit-scrollbar-track {'), 'WebKit track defined');
assert(layoutContent.includes('.diagnosis-legend-grid::-webkit-scrollbar-thumb {'), 'WebKit thumb defined');
assert(layoutContent.includes('.diagnosis-legend-grid:hover::-webkit-scrollbar-thumb'), 'WebKit hover reveal defined');
assert(layoutContent.includes('.diagnosis-legend-grid:focus-visible::-webkit-scrollbar-thumb'), 'WebKit focus-visible reveal defined');
assert(layoutContent.includes('border-radius: 4px;'), 'Thumb border-radius defined for subtle rounded look');
assert(layoutContent.includes('.diagnosis-legend-grid:focus-visible {'), 'Accessibility outline focus-visible defined');

// 2. Audit Dashboard.jsx Accessibility & Chart Preservation
const dashboardPath = path.resolve('src/pages/Dashboard.jsx');
assert(fs.existsSync(dashboardPath), 'Dashboard.jsx exists');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

console.log('\n>>> [2. AUDITING DASHBOARD.JSX INTEGRATION & ACCESSIBILITY]');
assert(dashboardContent.includes('className="diagnosis-legend-grid"'), 'Dashboard uses diagnosis-legend-grid');
assert(dashboardContent.includes('tabIndex={0}'), 'diagnosis-legend-grid has tabIndex={0} for keyboard navigation');
assert(dashboardContent.includes('role="region"'), 'diagnosis-legend-grid has role="region" for assistive tech');
assert(dashboardContent.includes('aria-label="Diagnosis distribution list"'), 'diagnosis-legend-grid has descriptive aria-label');

// Verify chart and data logic preserved
assert(dashboardContent.includes('<Doughnut data={diagnosesData} options={donutOptions} />'), 'Doughnut chart rendered unchanged');
assert(dashboardContent.includes('DONUT_COLORS'), 'DONUT_COLORS palette preserved');
assert(dashboardContent.includes('topComplaintsList.map'), 'topComplaintsList mapping preserved');
assert(dashboardContent.includes('item.value'), 'Diagnosis count values preserved');

// 3. Audit Scope & Backend Safety
console.log('\n>>> [3. AUDITING SCOPE & BACKEND SAFETY]');
// Verify global scrollbars are NOT globally overridden
assert(!layoutContent.includes('::-webkit-scrollbar {\n  display: none;'), 'Global scrollbars are not globally hidden');
assert(!layoutContent.includes('*::-webkit-scrollbar'), 'Universal scrollbar selector not used');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 20 SCROLLBAR UX TESTS PASSED CLEANLY                        ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

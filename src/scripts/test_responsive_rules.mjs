// src/scripts/test_responsive_rules.mjs
import fs from 'fs';
import path from 'path';

const layoutCssPath = path.resolve('src/styles/layout.css');
const dashboardJsxPath = path.resolve('src/pages/Dashboard.jsx');

console.log('========================================================================');
console.log('   DASHBOARD RESPONSIVE LAYOUT & FLUID BEHAVIOR TEST SUITE              ');
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

// 1. Check layout.css
const layoutCss = fs.readFileSync(layoutCssPath, 'utf8');

console.log('>>> [1. AUDITING CSS GRID & FLUID RULES IN layout.css]');
assert(layoutCss.includes('min-width: 0;'), 'min-width: 0 present for fluid grid/flex children');
assert(layoutCss.includes('.dashboard-kpis-grid'), '.dashboard-kpis-grid class defined');
assert(layoutCss.includes('.dashboard-main-grid'), '.dashboard-main-grid class defined');
assert(layoutCss.includes('.dashboard-analytics-grid'), '.dashboard-analytics-grid class defined');
assert(layoutCss.includes('.dashboard-operations-column'), '.dashboard-operations-column class defined');
assert(layoutCss.includes('.dashboard-chart-wrapper'), '.dashboard-chart-wrapper defined with overflow protection');
assert(layoutCss.includes('.diagnosis-card-body'), '.diagnosis-card-body defined with dynamic flex reflow');
assert(layoutCss.includes('.diagnosis-legend-grid'), '.diagnosis-legend-grid defined with auto-fit/minmax');

console.log('\n>>> [2. AUDITING RESPONSIVE BREAKPOINTS]');
assert(layoutCss.includes('@media (max-width: 1399px)'), 'Breakpoints include 1399px (laptop/medium desktop)');
assert(layoutCss.includes('@media (max-width: 1199px)'), 'Breakpoints include 1199px (compact 1024px desktop/laptop range)');


// 2. Check Dashboard.jsx
const dashboardJsx = fs.readFileSync(dashboardJsxPath, 'utf8');

console.log('\n>>> [3. AUDITING DASHBOARD.JSX INTEGRATION]');
assert(!dashboardJsx.includes("gridTemplateColumns: 'repeat(5, minmax(0, 1fr))'"), 'Inline fixed 5-col KPI grid removed');
assert(dashboardJsx.includes('className="dashboard-kpis-grid"'), 'Dashboard uses responsive dashboard-kpis-grid');
assert(dashboardJsx.includes('className="dashboard-main-grid"'), 'Dashboard uses responsive dashboard-main-grid');
assert(dashboardJsx.includes('className="dashboard-analytics-grid"'), 'Dashboard uses responsive dashboard-analytics-grid');
assert(dashboardJsx.includes('className="dashboard-operations-column"'), 'Dashboard uses responsive dashboard-operations-column');
assert(dashboardJsx.includes('className="dashboard-chart-wrapper"'), 'Dashboard uses responsive dashboard-chart-wrapper for charts');
assert(dashboardJsx.includes('className="diagnosis-card-body"'), 'Dashboard uses diagnosis-card-body');
assert(dashboardJsx.includes('className="diagnosis-legend-grid"'), 'Dashboard uses diagnosis-legend-grid');
assert(dashboardJsx.includes('className="quick-actions-grid"'), 'Dashboard uses quick-actions-grid');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL RESPONSIVE LAYOUT RULES & BREAKPOINTS PASSED CLEANLY             ');
} else {
  console.error('   SOME RESPONSIVE TESTS FAILED                                       ');
  process.exit(1);
}
console.log('========================================================================');

// src/scripts/test_goal34_reports_workspace.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 34 — REPORTS & CLINICAL ANALYTICS WORKSPACE TEST SUITE          ');
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

// 1. Audit Reports.jsx JSX Architecture
console.log('\n>>> [1. AUDITING REPORTS.JSX WORKSPACE & HEADER ARCHITECTURE]');
const reportsPath = path.resolve('src/pages/Reports.jsx');
assert(fs.existsSync(reportsPath), 'Reports.jsx exists');
const reportsContent = fs.readFileSync(reportsPath, 'utf8');

// Header isolation
assert(reportsContent.includes('<div className="page-header">'), 'Standard page-header used');
assert(reportsContent.includes('<h1 className="page-header-title">Reports & Clinical Analytics</h1>'), 'Page title in page-header');

const headerMatch = reportsContent.match(/<div className="page-header">([\s\S]*?)<\/div>\s*\{\/\* 2\. Report Overview/);
if (headerMatch) {
  const headerContent = headerMatch[1];
  assert(!headerContent.includes('type="date"'), 'Date inputs REMOVED from page-header');
  assert(!headerContent.includes('<select'), 'Report type selector REMOVED from page-header');
  assert(!headerContent.includes('Export Report'), 'Export Report button REMOVED from page-header');
}

// Report Overview workspace card & toolbar
assert(reportsContent.includes('Report Overview'), 'Report Overview workspace header present');
assert(reportsContent.includes('<div className="reports-toolbar">'), '.reports-toolbar present in workspace');
assert(reportsContent.includes('className="reports-date-group"'), 'Unified date group container present');
assert(reportsContent.includes('id="r-from"') && reportsContent.includes('id="r-to"'), 'From and To date inputs present');
assert(reportsContent.includes('id="r-type"') && reportsContent.includes('className="reports-filter-select"'), 'Report type select uses unified filter select class');
assert(reportsContent.includes('ChevronDownIcon size={13}'), 'Standard 13px ChevronDownIcon used for select chevron');
assert(reportsContent.includes('id="reports-export-btn"'), 'Export Report button located in reports toolbar');

// 2. Audit Analytics Empty-State & Chart Logic
console.log('\n>>> [2. AUDITING ANALYTICS VISUALIZATION & EMPTY STATE]');
assert(reportsContent.includes('Analytics Visualization'), 'Analytics Visualization section title present');
assert(reportsContent.includes('No report data available'), 'Restrained zero-data empty state title present');
assert(reportsContent.includes('There are no encounter records within the selected date range'), 'Informative zero-data description present');
assert(reportsContent.includes('records analyzed'), 'Dynamic records analyzed counter preserved');

// 3. Audit Clinical Guide & Raw Data Drill-Down
console.log('\n>>> [3. AUDITING CLINICAL GUIDE & RAW DATA]');
assert(reportsContent.includes('Clinical Intelligence Guide'), 'Clinical Intelligence Guide section present');
assert(reportsContent.includes('Auto 30-Day Lookback'), 'Auto 30-Day Lookback content preserved');
assert(reportsContent.includes('Clinical Indicators'), 'Clinical Indicators content preserved');
assert(reportsContent.includes('Confidentiality Policy'), 'Confidentiality Policy content preserved');

assert(reportsContent.includes('Raw Encounters Data'), 'Raw Encounters Data section present');
assert(reportsContent.includes('Rows: <strong>{reportData.length}</strong>'), 'Dynamic row count badge present');
assert(reportsContent.includes('No data records found for the selected date range'), 'Raw data empty state present');

// 4. Audit layout.css Toolbar Classes
console.log('\n>>> [4. AUDITING LAYOUT.CSS TOOLBAR CLASSES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.reports-toolbar'), '.reports-toolbar class defined in layout.css');
assert(layoutContent.includes('.reports-date-group'), '.reports-date-group class defined in layout.css');
assert(layoutContent.includes('.reports-filter-select'), '.reports-filter-select class defined in layout.css');
assert(layoutContent.includes('.reports-filter-chevron'), '.reports-filter-chevron class defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 34 REPORTS WORKSPACE TESTS PASSED CLEANLY                   ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

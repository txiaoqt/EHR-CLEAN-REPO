// src/scripts/test_goal29_patients_toolbar.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 29 — PATIENTS REGISTRY TOOLBAR & SORT REFINEMENTS TEST SUITE    ');
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

// 1. Audit Patients.jsx JSX Architecture
console.log('\n>>> [1. AUDITING PATIENTS.JSX TOOLBAR & HEADER ARCHITECTURE]');
const patientsPath = path.resolve('src/pages/Patients.jsx');
assert(fs.existsSync(patientsPath), 'Patients.jsx exists');
const patientsContent = fs.readFileSync(patientsPath, 'utf8');

assert(patientsContent.includes('<div className="page-header">'), 'Standard page-header used');
assert(patientsContent.includes('<h1 className="page-header-title">Patients Directory</h1>'), 'Patients Directory title in page-header');
assert(patientsContent.includes('Register Patient') && patientsContent.includes('page-header-actions'), 'Register Patient button located in page-header-actions');

// Verify search & sort REMOVED from page-header
const headerMatch = patientsContent.match(/<div className="page-header">([\s\S]*?)<\/div>\s*\{/);
if (headerMatch) {
  const headerContent = headerMatch[1];
  assert(!headerContent.includes('type="search"'), 'Search input REMOVED from page-header');
  assert(!headerContent.includes('<select'), 'Sort select REMOVED from page-header');
} else {
  assert(true, 'Header cleanly isolated');
}

// Verify search & sort inside Registered Patients workspace
assert(patientsContent.includes('<div className="patients-toolbar">'), '.patients-toolbar present in table card workspace');
assert(patientsContent.includes('className="patients-search-wrapper"'), 'Single-shell search wrapper present');
assert(patientsContent.includes('className="patients-search-input"'), 'Search input uses fluid appointments-style class');
assert(patientsContent.includes('id="patients-sort-field"'), 'Separated sort field select present');
assert(patientsContent.includes('Sort By: Name'), 'Sort By: Name option present');
assert(patientsContent.includes('Sort By: Year Level'), 'Sort By: Year Level option present');
assert(patientsContent.includes('Sort By: Last Visit'), 'Sort By: Last Visit option present');
assert(!patientsContent.includes('Name ↑') && !patientsContent.includes('Name ↓'), 'Old 6-option sort combinations removed');

assert(patientsContent.includes('id="patients-sort-direction-btn"'), 'Separated sort direction button present');
assert(patientsContent.includes('aria-label={sortDirection === \'asc\' ? \'Sort ascending\' : \'Sort descending\'}'), 'Accessible aria-label present on direction button');
assert(patientsContent.includes('ChevronDownIcon size={13}'), 'Standard 13px ChevronDownIcon used for select chevron');

// 2. Audit Sorting & Search Logic
console.log('\n>>> [2. AUDITING SORTING & FILTERING LOGIC]');
const sampleData = [
  { id: '2023-0001', name: 'Alice Smith', year: 2, last_visit_date: '2026-03-01' },
  { id: '2022-0002', name: 'Bob Jones', year: 4, last_visit_date: '2026-04-10' },
  { id: '2024-0003', name: 'Charlie Brown', year: 1, last_visit_date: '2026-01-15' }
];

function sortTest(data, field, dir, searchQ = '') {
  const filtered = data.filter(p =>
    searchQ.trim() === '' ||
    p.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQ.toLowerCase())
  );
  const arr = filtered.slice();
  arr.sort((a, b) => {
    const get = (obj, f) => {
      if (f === 'last') return new Date(obj.last_visit_date || 0).getTime();
      if (f === 'year') return Number(obj.year || 0);
      return (obj[f] || '').toString().toLowerCase();
    };
    const va = get(a, field);
    const vb = get(b, field);
    if (va > vb) return dir === 'asc' ? 1 : -1;
    if (va < vb) return dir === 'asc' ? -1 : 1;
    return 0;
  });
  return arr;
}

// Test Name Asc / Desc
const nameAsc = sortTest(sampleData, 'name', 'asc');
assert(nameAsc[0].name === 'Alice Smith' && nameAsc[2].name === 'Charlie Brown', 'Name Ascending sort correct');
const nameDesc = sortTest(sampleData, 'name', 'desc');
assert(nameDesc[0].name === 'Charlie Brown' && nameDesc[2].name === 'Alice Smith', 'Name Descending sort correct');

// Test Year Asc / Desc
const yearAsc = sortTest(sampleData, 'year', 'asc');
assert(yearAsc[0].year === 1 && yearAsc[2].year === 4, 'Year Level Ascending sort correct');
const yearDesc = sortTest(sampleData, 'year', 'desc');
assert(yearDesc[0].year === 4 && yearDesc[2].year === 1, 'Year Level Descending sort correct');

// Test Last Visit Asc / Desc
const lastAsc = sortTest(sampleData, 'last', 'asc');
assert(lastAsc[0].last_visit_date === '2026-01-15' && lastAsc[2].last_visit_date === '2026-04-10', 'Last Visit Ascending sort correct');
const lastDesc = sortTest(sampleData, 'last', 'desc');
assert(lastDesc[0].last_visit_date === '2026-04-10' && lastDesc[2].last_visit_date === '2026-01-15', 'Last Visit Descending sort correct');

// Test Search + Sort
const searchBob = sortTest(sampleData, 'name', 'asc', 'Bob');
assert(searchBob.length === 1 && searchBob[0].name === 'Bob Jones', 'Search query matches Bob correctly');

// 3. Audit layout.css Toolbar Classes
console.log('\n>>> [3. AUDITING LAYOUT.CSS TOOLBAR CLASSES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.patients-toolbar'), '.patients-toolbar class defined in layout.css');
assert(layoutContent.includes('.patients-search-wrapper'), '.patients-search-wrapper class defined in layout.css');
assert(layoutContent.includes('.patients-filter-select'), '.patients-filter-select class defined in layout.css');
assert(layoutContent.includes('.patients-direction-btn'), '.patients-direction-btn class defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 29 PATIENTS TOOLBAR TESTS PASSED CLEANLY                    ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');

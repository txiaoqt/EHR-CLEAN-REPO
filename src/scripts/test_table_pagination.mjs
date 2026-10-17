import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' STAFF PORTAL TABLE PAGINATION AUDIT');
console.log('='.repeat(80));

const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

// -----------------------------------------------------------------------------
// [TEST GROUP 1] Page-Number Strip Logic (buildPageItems)
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 1] Page-Number Strip Logic');

const hookPath = path.join(projectRoot, 'src/hooks/useTablePagination.js');
const hookSrc = fs.readFileSync(hookPath, 'utf8');

// Pull the real implementation out of the hook module and evaluate it, so this
// test exercises shipped code rather than a copy.
const fnSource = hookSrc
  .slice(hookSrc.indexOf('export const buildPageItems'))
  .replace('export const buildPageItems', 'const buildPageItems');
const buildPageItems = new Function(`${fnSource}\nreturn buildPageItems;`)();

assert.deepStrictEqual(buildPageItems(0, 1), [0], 'single page renders just page 1');
assert.deepStrictEqual(
  buildPageItems(0, 7),
  [0, 1, 2, 3, 4, 5, 6],
  'up to 7 pages renders every page number'
);
assert.deepStrictEqual(
  buildPageItems(0, 10),
  [0, 1, 'ellipsis-end', 9],
  'first page shows the first window plus last page'
);
assert.deepStrictEqual(
  buildPageItems(5, 10),
  [0, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 9],
  'middle page shows a centred window with ellipsis on both sides'
);
assert.deepStrictEqual(
  buildPageItems(9, 10),
  [0, 'ellipsis-start', 8, 9],
  'last page shows the trailing window without a redundant ellipsis'
);

// Every rendered page number must be a valid, in-range index.
for (const totalPages of [1, 2, 7, 8, 15, 40]) {
  for (let current = 0; current < totalPages; current++) {
    const items = buildPageItems(current, totalPages);
    const pages = items.filter((i) => typeof i === 'number');
    assert(pages.includes(current), `current page ${current}/${totalPages} is always rendered`);
    assert(
      pages.every((p) => p >= 0 && p < totalPages),
      `all page numbers in range for ${current}/${totalPages}`
    );
    assert(
      pages.every((p, idx) => idx === 0 || p > pages[idx - 1]),
      `page numbers strictly ascending for ${current}/${totalPages}`
    );
  }
}
console.log('  ✓ PASS: buildPageItems produces correct, in-range, ascending page strips');

// -----------------------------------------------------------------------------
// [TEST GROUP 2] Shared Pagination Primitives
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Shared Pagination Primitives');

assert(/DEFAULT_PAGE_SIZE\s*=\s*10/.test(hookSrc), 'default page size is 10 rows');
assert(hookSrc.includes('Math.min(page, totalPages - 1)'), 'out-of-range pages are clamped');
assert(hookSrc.includes('resetKey'), 'hook supports resetting to page 1 on filter change');

const componentSrc = read('src/components/table/TablePagination.jsx');
assert(componentSrc.includes('table-pagination'), 'TablePagination renders the shared footer');
assert(componentSrc.includes('itemLabel'), 'footer label is configurable per table');
assert(componentSrc.includes('aria-current'), 'active page is exposed to assistive tech');
assert(componentSrc.includes('disabled={!canPrev}') && componentSrc.includes('disabled={!canNext}'), 'prev/next disable at the ends');

const cssSrc = read('src/styles/components.css');
for (const cls of [
  '.table-pagination',
  '.table-pagination-info',
  '.table-pagination-btn',
  '.table-pagination-page',
  '.table-pagination-page.active',
  '.table-pagination-ellipsis',
]) {
  assert(cssSrc.includes(cls), `components.css styles ${cls}`);
}
console.log('  ✓ PASS: Shared hook + footer component + styles are in place');

// -----------------------------------------------------------------------------
// [TEST GROUP 3] Every Data Table Is Paginated
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Every Data Table Is Paginated');

// page -> the paged variables that table renders from
const paginatedTables = {
  'src/pages/Patients.jsx': ['pagination.pageRows'],
  'src/pages/Appointments.jsx': ['pagination.pageRows'],
  'src/pages/Inventory.jsx': ['itemPagination.pageRows', 'transactionPagination.pageRows'],
  'src/pages/Events.jsx': ['eventPagination.pageRows'],
  'src/pages/Reports.jsx': ['reportPagination.pageRows'],
};

let tableCount = 0;

for (const [rel, vars] of Object.entries(paginatedTables)) {
  const content = read(rel);

  assert(
    content.includes("from '../hooks/useTablePagination.js'"),
    `${rel} imports useTablePagination`
  );
  assert(
    content.includes("from '../components/table/TablePagination.jsx'"),
    `${rel} imports TablePagination`
  );

  for (const v of vars) {
    assert(content.includes(v), `${rel} renders rows via ${v}`);
    tableCount++;
  }

  const footerCount = (content.match(/<TablePagination/g) || []).length;
  assert.strictEqual(
    footerCount,
    vars.length,
    `${rel} renders one <TablePagination> per paginated table (found ${footerCount}, expected ${vars.length})`
  );

  console.log(`  ✓ PASS: ${rel} — ${vars.length} table(s) paginated`);
}

console.log(`\n  Total paginated tables: ${tableCount}`);

// -----------------------------------------------------------------------------
// [TEST GROUP 4] No Table Still Renders Its Full Row Set
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] No Table Renders An Unpaged Row Set');

const unboundedPatterns = [
  [/sortedPatients\.map\(/, 'Patients.jsx'],
  [/filterTable\(\)\.map\(/, 'Appointments.jsx'],
  [/filteredItems\.map\(/, 'Inventory.jsx'],
  [/transactions\.map\(/, 'Inventory.jsx transactions'],
  [/filteredEvents\.map\(/, 'Events.jsx'],
  [/reportData\.map\(/, 'Reports.jsx'],
];

for (const [pattern, label] of unboundedPatterns) {
  for (const rel of Object.keys(paginatedTables)) {
    const content = read(rel);
    assert(
      !pattern.test(content),
      `${rel} must not render the full row set in JSX (${label})`
    );
  }
}
console.log('  ✓ PASS: All table bodies render only the current page of rows');

// -----------------------------------------------------------------------------
// [TEST GROUP 5] Table Wrappers Cannot Overlap Their Footer
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Table Wrappers Cannot Overlap Their Footer');

// `.table-responsive` used to be defined ONLY inside a max-width media query, so
// on desktop it had no overflow and a `maxHeight` wrapper spilled its rows out
// from under itself — landing the next sibling (the pagination footer) on top.
// A capped wrapper must therefore never come without a real overflow rule.
assert(
  /\.table-responsive\s*\{[^}]*overflow-x:\s*auto/.test(cssSrc),
  'components.css defines a base .table-responsive overflow rule (not mobile-only)'
);

for (const rel of Object.keys(paginatedTables)) {
  const content = read(rel);
  const cappedWrappers = content.match(/table-responsive[^>]*maxHeight/g) || [];
  assert.strictEqual(
    cappedWrappers.length,
    0,
    `${rel} must not cap a .table-responsive wrapper with maxHeight (rows spill under the footer)`
  );
}
console.log('  ✓ PASS: No capped table wrappers; pagination footers sit clear of the rows');

// -----------------------------------------------------------------------------
// [TEST GROUP 6] Exports Still Use The Full Data Set
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Exports Still Use The Full Data Set');

// Pagination must only affect rendering — CSV/PDF exports keep every row.
assert(
  read('src/pages/Reports.jsx').includes('reportData.length === 0') &&
  read('src/pages/Reports.jsx').includes('const rows = (reportData || []).map'),
  'Reports.jsx exports remain driven by the full reportData set'
);
console.log('  ✓ PASS: CSV/PDF exports are unaffected by client-side pagination');

console.log('\n' + '='.repeat(80));
console.log(' ALL STAFF PORTAL TABLE PAGINATION TESTS PASSED (100%)');
console.log('='.repeat(80));

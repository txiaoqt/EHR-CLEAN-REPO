import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' EXPORT LAYER AUDIT (CSV safety + config coverage)');
console.log('='.repeat(80));

const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

// -----------------------------------------------------------------------------
// [TEST GROUP 1] CSV Injection Guard
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 1] CSV Injection Guard');

const csvSrc = read('src/utils/export/csv.js');

// Pull the real implementations out of the module and evaluate them, so this
// exercises shipped code rather than a copy.
const extract = (name) => {
  const start = csvSrc.indexOf(`export const ${name} =`);
  assert(start !== -1, `${name} exists in csv.js`);
  const body = csvSrc.slice(start, csvSrc.indexOf('\n};', start) + 3)
    .replace(`export const ${name} =`, `const ${name} =`);
  return body;
};

const sandbox = new Function(`
  ${extract('sanitizeForSpreadsheet')}
  ${extract('toCsvCell')}
  return { sanitizeForSpreadsheet, toCsvCell };
`)();
const { sanitizeForSpreadsheet, toCsvCell } = sandbox;

// A leading = + - or @ is treated as a formula by Excel / Sheets / LibreOffice.
for (const dangerous of ['=cmd()', '+1+1', '-1+1', '@SUM(A1)', '=HYPERLINK("http://x")']) {
  assert.strictEqual(
    sanitizeForSpreadsheet(dangerous),
    `'${dangerous}`,
    `neutralises ${JSON.stringify(dangerous)}`
  );
}
console.log('  ✓ PASS: formula-leading values are neutralised with a leading apostrophe');

// Ordinary values must be left completely untouched.
for (const safe of ['Angel Keith Carbon', 'TUPM-25-0001', 'Fever', '2026-10-17']) {
  assert.strictEqual(sanitizeForSpreadsheet(safe), safe, `leaves ${JSON.stringify(safe)} alone`);
}
console.log('  ✓ PASS: ordinary values pass through unchanged');

assert.strictEqual(sanitizeForSpreadsheet(null), '');
assert.strictEqual(sanitizeForSpreadsheet(undefined), '');
assert.strictEqual(sanitizeForSpreadsheet(''), '');
console.log('  ✓ PASS: null/undefined/empty become empty cells');

// -----------------------------------------------------------------------------
// [TEST GROUP 2] CSV Quoting
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] CSV Quoting');

assert.strictEqual(toCsvCell('plain'), 'plain');
assert.strictEqual(toCsvCell('has,comma'), '"has,comma"', 'commas force quoting');
assert.strictEqual(toCsvCell('has"quote'), '"has""quote"', 'quotes are doubled');
assert.strictEqual(toCsvCell('line\nbreak'), '"line\nbreak"', 'newlines force quoting');
assert.strictEqual(toCsvCell('a,"b"'), '"a,""b"""', 'mixed comma + quote');

// The exact case that silently corrupted the old exportCsv helper.
const nasty = 'Carbon, Angel "AK"';
assert.strictEqual(toCsvCell(nasty), '"Carbon, Angel ""AK"""');
console.log('  ✓ PASS: commas, quotes and newlines are escaped per RFC 4180');

// -----------------------------------------------------------------------------
// [TEST GROUP 3] Every Critical Entity Has An Export Config
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Export Config Coverage');

const configsSrc = read('src/utils/export/configs.js');
const required = [
  ['appointments', 'appointmentsExportConfig'],
  ['patients', 'patientsExportConfig'],
  ['encounters', 'encountersExportConfig'],
  ['inventory', 'inventoryExportConfig'],
  ['inventory transactions', 'inventoryTransactionsExportConfig'],
  ['patient profile', 'patientProfileExportConfig'],
  ['audit trail', 'auditLogsExportConfig'],
];
for (const [label, symbol] of required) {
  assert(configsSrc.includes(`export const ${symbol}`), `${label} config exists`);
  assert(configsSrc.includes(symbol.replace('ExportConfig', 'ExportConfig,') || true), `${label} is registered`);
}
assert(configsSrc.includes('EXPORT_CONFIGS'), 'configs are collected into EXPORT_CONFIGS');
console.log(`  ✓ PASS: all ${required.length} entity configs defined and registered`);

// Each config must define columns with a label and a value accessor.
// (Matched on the declaration itself, so the EXPORT_CONFIGS aggregation object
// that merely references them is not treated as a config.)
const configBlocks = configsSrc
  .split('export const ')
  .slice(1)
  .filter((b) => /^[a-zA-Z]+ExportConfig\s*=\s*\{/.test(b));
for (const block of configBlocks) {
  const name = block.slice(0, block.indexOf(' '));
  const labels = (block.match(/label:\s*'/g) || []).length;
  const values = (block.match(/value:\s*\(/g) || []).length;
  assert(labels > 0, `${name} declares columns`);
  assert.strictEqual(labels, values, `${name}: every column has a value accessor (${labels} labels, ${values} values)`);
}
console.log('  ✓ PASS: every declared column has a value accessor');

// -----------------------------------------------------------------------------
// [TEST GROUP 4] Engine Supports Both Formats
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Engine Formats');

const engineSrc = read('src/utils/export/engine.js');
assert(engineSrc.includes("'csv'") && engineSrc.includes("'pdf'"), 'engine dispatches csv and pdf');
assert(engineSrc.includes('autoTable'), 'PDF uses jsPDF autoTable (real text, not a screenshot)');
assert(!/import\s+html2canvas/.test(engineSrc), 'engine does not import html2canvas');
assert(!/import\s+html2canvas/.test(read('src/pages/PatientProfile.jsx')), 'PatientProfile no longer uses html2canvas');
assert(!/import\s+html2canvas/.test(read('src/pages/PatientProfile.jsx')), 'PatientProfile no longer uses html2canvas');
assert(engineSrc.includes('long_bond'), 'Philippine Long Bond paper size is available');
assert(/\\uFEFF/.test(csvSrc), 'CSV is written with a UTF-8 BOM');
console.log('  ✓ PASS: CSV + PDF, real-text tables, PH paper sizes, UTF-8 BOM');

// -----------------------------------------------------------------------------
// [TEST GROUP 5] No Export Is Password-Gated, Every Export Is Logged
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Gating + Audit Logging');

const pagesWithExports = [
  'src/pages/Appointments.jsx',
  'src/pages/Patients.jsx',
  'src/pages/Inventory.jsx',
  'src/pages/PatientProfile.jsx',
];
for (const rel of pagesWithExports) {
  const src = read(rel);
  assert(src.includes('useTableExport'), `${rel} wires the export hook`);
  assert(src.includes('<ExportDialog'), `${rel} renders the export dialog`);
}
console.log(`  ✓ PASS: ${pagesWithExports.length} entity pages wired to the shared export layer`);

const allSources = [...pagesWithExports, 'src/pages/Dashboard.jsx', 'src/pages/Reports.jsx']
  .map(read).join('\n');
assert(
  !/exportPassword|EXPORT_CENSUS_PASSWORD|REPORT_EXPORT_PASSWORD/.test(allSources),
  'no export password gating remains anywhere'
);
console.log('  ✓ PASS: export password gating fully removed');

assert(read('src/hooks/useTableExport.js').includes("'EXPORT'"), 'the export hook writes an audit entry');
assert(read('src/pages/Dashboard.jsx').includes("'EXPORT'"), 'Dashboard census export writes an audit entry');
assert(read('src/pages/Reports.jsx').includes("'EXPORT'"), 'Reports export writes an audit entry');
console.log('  ✓ PASS: every export path records an EXPORT entry in the audit trail');

// -----------------------------------------------------------------------------
// [TEST GROUP 6] Audit Trail Page
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Audit Trail Page');

const auditPage = read('src/pages/AuditTrail.jsx');
assert(auditPage.includes("from('audit_logs')"), 'reads the audit_logs table');
assert(auditPage.includes('count: \'exact\''), 'uses an exact count for pagination');
assert(auditPage.includes('.range('), 'pages server-side');
assert(auditPage.includes('<TablePagination'), 'reuses the shared pagination footer');
assert(auditPage.includes('auditLogsExportConfig'), 'can export itself');

const appSrc = read('src/App.jsx');
assert(appSrc.includes("path=\"/audit-trail\""), 'route registered');
assert(appSrc.includes("guard(<AuditTrail />, ['admin', 'physician'])"), 'route is role-gated');

const sidebarSrc = read('src/components/sidebar/Sidebar.jsx');
assert(sidebarSrc.includes("page: 'audit-trail'"), 'sidebar entry present');
assert(sidebarSrc.includes('roles:'), 'sidebar supports role-gated items');
console.log('  ✓ PASS: Audit Trail page registered, role-gated and linked from the sidebar');

assert(read('src/utils.js').includes('performed_by: finalUserName'), 'logAudit mirrors the actor into performed_by');
console.log('  ✓ PASS: logAudit populates performed_by (the profile feed previously matched nothing)');

// -----------------------------------------------------------------------------
// [TEST GROUP 5] PDF Column Widths Never Collapse
//
// Regression guard for the bug that shipped a PDF whose headers rendered one
// letter per line: `pdfWidth` was applied as an absolute point value, so on a
// portrait page the leftover columns were squeezed to a couple of points.
// The engine now scales weights proportionally to fill the printable width.
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] PDF Column Widths Never Collapse');

const MARGIN = 34;
const PAGES = {
  'A4 landscape': [842 - MARGIN * 2, 22],
  'A4 portrait': [595 - MARGIN * 2, 16],
  'Long Bond landscape': [936 - MARGIN * 2, 22],
};

for (const block of configBlocks) {
  const name = block.slice(0, block.indexOf(' '));
  const weights = [...block.matchAll(/pdfWidth:\s*(\d+)/g)].map((m) => Number(m[1]));
  const labels = (block.match(/label:\s*'/g) || []).length;

  assert.strictEqual(
    weights.length,
    labels,
    `${name}: every column needs a pdfWidth weight for proportional sizing (${weights.length}/${labels})`
  );

  const total = weights.reduce((a, b) => a + b, 0);

  for (const [page, [available, floor]] of Object.entries(PAGES)) {
    const widths = weights.map((w) => (w / total) * available);
    const sum = widths.reduce((a, b) => a + b, 0);
    const min = Math.min(...widths);
    assert(
      Math.abs(sum - available) < 0.5,
      `${name} on ${page}: widths fill the printable area (${sum.toFixed(1)} of ${available})`
    );
    assert(
      min >= floor,
      `${name} on ${page}: narrowest column is ${min.toFixed(1)}pt (floor ${floor}pt)`
    );
  }
}
console.log(`  ✓ PASS: all ${configBlocks.length} configs size proportionally on every paper size`);

// The engine must use the proportional path when every column has a weight,
// rather than treating pdfWidth as raw points.
assert(
  /\(column\.pdfWidth \/ total\) \* availableWidth/.test(engineSrc),
  'engine scales pdfWidth weights rather than using them as points'
);
console.log('  ✓ PASS: engine scales pdfWidth weights rather than using them as points');

// -----------------------------------------------------------------------------
// [TEST GROUP 6] PDF Carries The Letterhead And Summary
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] Letterhead + Summary Block');

assert(engineSrc.includes('LETTERHEAD'), 'letterhead block is defined');
for (const line of [
  'TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES',
  'Ayala Blvd., Ermita, Manila, 1000, Philippines',
  'Tel No. +632-301-3001 local 607',
  'Fax No. +632-521-4063',
  'Email: clinic@tup.edu.ph',
  'Website: www.tup.edu.ph',
]) {
  assert(engineSrc.includes(line), `letterhead contains "${line}"`);
}
assert(engineSrc.includes('tupSealUrl'), 'the university seal is embedded on the left');
assert(engineSrc.includes('clinicLogoUrl'), "the clinic's own EHR mark is embedded on the right");
assert(!engineSrc.includes('cosSealUrl'), 'the College of Science seal is no longer referenced');
assert(engineSrc.includes('EMBED_MAX_PX'), 'embedded marks are downscaled so exports stay small');
assert(engineSrc.includes('if (page > 1) drawLetterhead'), 'letterhead repeats on continuation pages');
assert(engineSrc.includes('Page ${page} of ${totalPages}'), 'page numbers know the real total (second pass)');

const detailBuilder = engineSrc.slice(engineSrc.indexOf('const buildDetailLines'), engineSrc.indexOf('const drawTitleBlock'));
assert(detailBuilder.includes('Total Records:'), 'summary includes the record count');
assert(detailBuilder.includes('Generated:'), 'summary includes the generated timestamp');
assert(detailBuilder.includes('filterSummaryLines'), 'summary includes the active filters');
// Match the code pattern, not the word — the explanatory comment mentions it.
assert(!/Filters — \$\{/.test(detailBuilder), 'the "Filters —" prefix is gone; each filter is its own line');
assert(/lines\.push\(\.\.\.filterSummaryLines\)/.test(detailBuilder), 'each active filter becomes its own line');
assert(engineSrc.includes('drawTitleBlock'), 'summary block is drawn under the title');

// A rule must separate the summary from the table.
const titleBlock = engineSrc.slice(engineSrc.indexOf('const drawTitleBlock'), engineSrc.indexOf('const buildColumnStyles'));
assert(/doc\.line\(/.test(titleBlock), 'a horizontal rule separates the summary from the table');

// ...and it must be the ONLY rule: the letterhead is closed off by space.
const letterheadBlock = engineSrc.slice(engineSrc.indexOf('const drawLetterhead'), engineSrc.indexOf('const buildDetailLines'));
assert(!/doc\.line\(/.test(letterheadBlock), 'no rule under the letterhead (space alone closes the masthead)');
console.log('  ✓ PASS: single rule — summary to table only, none under the letterhead');

// The appointments export carries exactly the columns the clinic asked for.
const apptBlock = configsSrc.slice(
  configsSrc.indexOf('appointmentsExportConfig'),
  configsSrc.indexOf('patientsExportConfig')
);
const apptLabels = [...apptBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert.deepStrictEqual(
  apptLabels,
  ['Student ID', 'Patient Name', 'Department', 'Service', 'Date', 'Time', 'Type', 'Mode', 'Status'],
  `appointments export columns are exactly as specified (got: ${apptLabels.join(', ')})`
);
console.log('  ✓ PASS: appointments export carries exactly the 9 requested columns');

// Student ID is the standard label across every export that identifies a patient.
const allLabels = [...configsSrc.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(
  !allLabels.includes('Patient ID'),
  `no export labels the column "Patient ID" (found: ${allLabels.filter((l) => l === 'Patient ID').length})`
);
assert(allLabels.includes('Student ID'), 'the standard label "Student ID" is used');
console.log('  ✓ PASS: "Student ID" is the standard identifier label across all exports');

// The encounters export no longer carries a Clinician column.
const encBlock = configsSrc.slice(
  configsSrc.indexOf('encountersExportConfig'),
  configsSrc.indexOf('inventoryExportConfig')
);
assert(!/label:\s*'Clinician'/.test(encBlock), 'encounters export has no Clinician column');
const encLabels = [...encBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
console.log(`  ✓ PASS: encounters export columns — ${encLabels.join(', ')}`);

// Inventory: no Reorder Level column, and a status word staff can read at a glance.
const invBlock = configsSrc.slice(
  configsSrc.indexOf('inventoryExportConfig'),
  configsSrc.indexOf('inventoryTransactionsExportConfig')
);
assert(!/label:\s*'Reorder Level'/.test(invBlock), 'inventory export has no Reorder Level column');
assert(invBlock.includes("'Low Stock' : 'In Stock'"), 'inventory status reads "In Stock" / "Low Stock"');
const invLabels = [...invBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
console.log(`  ✓ PASS: inventory export columns — ${invLabels.join(', ')}`);

// The reorder banner carries its meaning in the rose field and the wording —
// the solid rule and the repeated threshold were redundant.
const inventoryPageSrc = read('src/pages/Inventory.jsx');
assert(
  !/borderLeft:\s*'4px solid var\(--danger\)'/.test(inventoryPageSrc),
  'the reorder banner has no solid red rule'
);
assert(
  !/Reorder threshold:/.test(inventoryPageSrc),
  'the warning no longer repeats the reorder threshold'
);
console.log('  ✓ PASS: reorder banner — no solid rule, no repeated threshold');

// "Adequate" was jargon; it must not linger anywhere in the UI either.
const uiSources = ['src/pages/Inventory.jsx', 'src/pages/Dashboard.jsx', 'src/utils/export/configs.js']
  .map(read).join('\n');
assert(!/Adequate/.test(uiSources), '"Adequate" is gone from the UI and the exports');
console.log('  ✓ PASS: "Adequate" replaced consistently across UI and exports');

// The audit trail's Reference column was raw database UUIDs — not meaningful to
// clinic staff. Gone from both the page and the export.
const auditBlock = configsSrc.slice(
  configsSrc.indexOf('auditLogsExportConfig'),
  configsSrc.indexOf('buildMedicalLogExportConfig')
);
assert(!/label:\s*'Reference'/.test(auditBlock), 'audit export has no Reference column');
const auditLabels = [...auditBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert.deepStrictEqual(
  auditLabels,
  ['Timestamp', 'Performed By', 'Action', 'Description'],
  `audit export columns are as expected (got: ${auditLabels.join(', ')})`
);
const auditPageSrc = read('src/pages/AuditTrail.jsx');
assert(!/>Reference</.test(auditPageSrc), 'audit page has no Reference column header');
assert(!/appointment_id \|\| row\.encounter_id/.test(auditPageSrc), 'audit page no longer renders a raw UUID');
console.log('  ✓ PASS: audit trail Reference column removed from both the page and the export');

// Medical Log — built by a factory because its medicine columns are the live
// dispensary list, so it is checked separately from the static configs.
const medLogBlock = configsSrc.slice(
  configsSrc.indexOf('buildMedicalLogExportConfig'),
  configsSrc.indexOf('export const EXPORT_CONFIGS')
);
assert(/lockOrientation:\s*true/.test(medLogBlock), 'Medical Log export is locked to landscape');
assert(/orientation:\s*'landscape'/.test(medLogBlock), 'Medical Log default orientation is landscape');
assert(/sexAbbrev\(/.test(medLogBlock), 'Sex prints as M/F');
assert(/courseAcronym\(/.test(medLogBlock), 'Dept./Course prints as an acronym');
assert(/rotateHead:\s*true/.test(medLogBlock), 'medicine headers are rotated like the paper form');

// Rotation is per column: the visit block must print horizontally, only the
// narrow medicine columns are rotated.
const visitBlock = medLogBlock.slice(0, medLogBlock.indexOf('...medicines.map'));
const medsMapping = medLogBlock.slice(medLogBlock.indexOf('...medicines.map'));
assert(!/rotateHead/.test(visitBlock), 'Date/Student ID/Name/Sex/Course/Complaint/Signature print horizontally');
assert(/rotateHead:\s*true/.test(medsMapping), 'rotation is set on the medicine columns');

const headHeight = Number((medLogBlock.match(/pdfHeadHeight:\s*(\d+)/) || [])[1]);
assert(headHeight >= 80, `head band is tall enough for the longest rotated name (${headHeight}pt)`);
assert(/didDrawCell:/.test(engineSrc) && /angle:\s*90/.test(engineSrc), 'engine draws head cells rotated bottom-to-top');
assert(/if\s*\(column\.rotateHead\)/.test(engineSrc), 'the engine rotates per column, not the whole head row');

// The head divider must differ from the fill, or the columns vanish into one
// solid navy block (which is exactly what shipped first).
const navy = (engineSrc.match(/navy:\s*\[(\d+),\s*(\d+),\s*(\d+)\]/) || []).slice(1).join(',');
const divider = (engineSrc.match(/headDivider:\s*\[(\d+),\s*(\d+),\s*(\d+)\]/) || []).slice(1).join(',');
assert(divider && navy && divider !== navy, `head divider (${divider}) is visible against the fill (${navy})`);

// Horizontal head labels are centred by the engine, not left as autoTable drew them.
assert(/align:\s*'center'/.test(engineSrc), 'horizontal head labels are centred');
assert(
  /x \+ width \/ 2, y \+ height \/ 2/.test(engineSrc) && /align:\s*'center',\s*\n\s*baseline:\s*'middle'/.test(engineSrc),
  'horizontal head labels are centred vertically as well as horizontally'
);
assert(medLogBlock.includes('...medicines.map'), 'one column per stocked medicine, built from the dispensary list');
assert(!/label:\s*'Medicines Dispensed'/.test(medLogBlock), 'the old combined medicine column is gone');
const medWeights = [...medLogBlock.matchAll(/pdfWidth:\s*(\d+)/g)].map((m) => Number(m[1]));
// Only the weighted columns are counted now — the text columns are measured
// against their own content instead of being given a guessed width.
assert(medWeights.length >= 2, `Medical Log declares weights for its weighted columns (${medWeights.length})`);
// With the headers rotated, a medicine column only has to be as wide as the
// font is tall (~6.5pt) plus padding — hence the lower floor than the other
// reports, whose headers wrap and therefore need real width.
assert(
  Math.min(...medWeights) >= 12,
  `no Medical Log column is narrower than its rotated header can render (min ${Math.min(...medWeights)}pt)`
);

const medHelpers = read('src/utils/medicalLog.js');
assert(/BSCS/.test(medHelpers) && /BSIT/.test(medHelpers), 'course acronyms are defined');
assert(/return 'M'/.test(medHelpers) && /return 'F'/.test(medHelpers), 'sex abbreviates to M/F');
assert(
  /lockOrientation\s*\?/.test(engineSrc),
  'the engine honours a locked orientation rather than letting the dialog override it'
);
console.log('  ✓ PASS: Medical Log export — landscape-locked, medicine columns, M/F and course acronyms');

// The standard PDF fonts use WinAnsi, which has no arrow glyph. An unsupported
// character makes jsPDF fall back and distorts the spacing of the whole line,
// so these are transliterated before anything is drawn.
assert(/export const pdfSafeText/.test(engineSrc), 'engine transliterates characters the PDF font cannot encode');
assert(/\\u2192\/g, 'to'/.test(engineSrc), 'the arrow is transliterated rather than handed to jsPDF');
assert(!/\u2192/.test(engineSrc), 'no raw arrow character remains in the engine');
assert(/pdfSafeText\(column\.label\)/.test(engineSrc), 'head labels are transliterated too');

const medLogPage = read('src/pages/MedicalLog.jsx');
assert(/Date Range:/.test(medLogPage), 'the summary line reads "Date Range:"');
assert(!/\u2192/.test(medLogPage), 'the page no longer passes an arrow into the export');
console.log('  ✓ PASS: PDF-safe text — arrows transliterated, filter line reads "Date Range:"');

// The register's search must reach the patient's name, which lives on the
// profile — encounters.patient_name is NULL on every row in the seeded data, so
// searching encounters alone silently returns nothing.
const medPageSrc = read('src/pages/MedicalLog.jsx');
assert(/resolveSearchPatientIds/.test(medPageSrc), 'a name search resolves against patient_profiles');
assert(
  /from\('patient_profiles'\)[\s\S]{0,220}full_name\.ilike/.test(medPageSrc),
  'the search matches the profile full_name'
);
assert(/patient_id\.eq\.\$\{id\}/.test(medPageSrc), 'matched profiles are folded into the encounter query');
assert(/buildVisitQuery\(\{ courseIds, searchPatientIds \}/.test(medPageSrc), 'both filters reach the query builder');
console.log('  ✓ PASS: Medical Log search reaches the patient name via the profile');

// The encounter's own patient_name is now authoritative, so the search does not
// have to depend on the profile join (and every other reader stops needing a
// client-side workaround).
const encSync = read('supabase/migrations/20261017240000_sync_encounter_patient_name.sql');
assert(/UPDATE public\.encounters e\s+SET patient_name = p\.name/.test(encSync), 'NULL names are backfilled from the patient record');
assert(/CREATE TRIGGER trg_sync_encounter_patient_name/.test(encSync), 'a trigger keeps the name in step on rename');
assert(/AFTER UPDATE OF name ON public\.patients/.test(encSync), 'the trigger fires only when the patient name changes');

const encounterPage = read('src/pages/Encounter.jsx');
assert(/patient_name: form\.patientName/.test(encounterPage), 'the encounter form stores the name on creation');
assert(/patientName: s\.name/.test(encounterPage), 'picking a patient carries their clean name');
assert(!/patient_name: form\.patientNameVisible/.test(encounterPage), 'the "Name (ID)" display string is not stored as the name');
console.log('  ✓ PASS: encounters.patient_name backfilled, kept in sync, and written on creation');

// The on-screen register must mirror the export: Signature beside Complaint,
// not stranded at the far right past 24 medicine columns.
const medPageMarkup = read('src/pages/MedicalLog.jsx');
const headBlock = medPageMarkup.slice(
  medPageMarkup.indexOf('<thead>'),
  medPageMarkup.indexOf('</thead>')
);
const columnOrder = [...headBlock.matchAll(/>\s*(Date|Student ID|Name|Sex|Dept\.\/Course|Complaint|Signature)\s*</g)]
  .map((m) => m[1]);
assert.deepStrictEqual(
  columnOrder,
  ['Date', 'Student ID', 'Name', 'Sex', 'Dept./Course', 'Complaint', 'Signature'],
  `the register orders its columns as expected (got: ${columnOrder.join(' | ')})`
);
assert(
  /const patientUrl = signatureUrl\(row\.patient_signature_path\)/.test(medPageMarkup),
  'the drawn patient signature is shown, not just a name'
);
assert(
  /Awaiting patient/.test(medPageMarkup),
  'an unsigned visit is marked as awaiting the patient, not left blank'
);
console.log('  ✓ PASS: register shows Signature beside Complaint, with the drawn signature');

// The on-screen register's own layout rules.
assert(
  /writingMode: 'vertical-rl'/.test(medPageMarkup) && /transform: 'rotate\(180deg\)'/.test(medPageMarkup),
  'medicine names print vertically, reading bottom-to-top'
);
assert(
  /verticalAlign: 'bottom',[\s\S]{0,700}?width: 46,/.test(medPageMarkup),
  'a rotated medicine column has a plain width'
);
// 46 matches the cell input's minWidth, so the declared width is the real one.
assert(
  /minWidth: 46,\s*\n\s*textAlign: 'center'/.test(medPageMarkup),
  'the column width and the cell input width agree'
);
// min/max-width on a table cell squeezes it, and the rotated name then wraps
// mid-string — the very thing rotating was meant to prevent. Confirmed in a
// headless Chrome render, so the guard is deliberate.
assert(
  !/minWidth: 34/.test(medPageMarkup) && !/maxWidth: 46/.test(medPageMarkup),
  'no min/max-width on a rotated medicine column'
);
// In vertical writing the block axis runs right-to-left, so without a centring
// wrapper the name hugged the right edge of its cell.
assert(
  /flexDirection: 'column', alignItems: 'center', gap: 6/.test(medPageMarkup),
  'the rotated name and its count are centred in the cell'
);
// Digits rotated are hard to read, and the count is the number being scanned.
assert(
  /writingMode: 'horizontal-tb'/.test(medPageMarkup),
  'the stock count stays horizontal while the name is rotated'
);
// Without nowrap the narrow headers broke mid-word ("Se x", "Dept./Cours e").
const headerNowrap = (medPageMarkup.match(/whiteSpace: 'nowrap'/g) || []).length;
assert(headerNowrap >= 7, `every horizontal header is nowrap (${headerNowrap} found)`);
// 160px held one- or two-word complaints.
assert(
  /whiteSpace: 'nowrap', minWidth: 96 \}\}>Complaint/.test(medPageMarkup),
  'Complaint is no longer given 160px for a word like "Fever"'
);
// The signed date lives in the record and the Date column already shows it.
assert(
  !/caption=\{row\.patient_signed_at/.test(medPageMarkup),
  'the register does not repeat the signed date under the signature'
);
assert(
  /width=\{104\}/.test(medPageMarkup) && /height=\{24\}/.test(medPageMarkup),
  'the signature occupies a fixed box, however long the signature is'
);
console.log('  ✓ PASS: register — vertical medicine names, nowrap headers, fixed signature box');

// -----------------------------------------------------------------------------
// [TEST GROUP] Contrast and interaction fixes from the design audit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 16] Audit fixes — contrast, frozen columns, states');

// --text-light is the DISABLED token and measures 3.07:1 on the panel and
// 2.54:1 on the navy header — both below AA for the sizes used here.
assert(
  !/var\(--text-light\)/.test(medPageMarkup),
  'the register uses no disabled-token text for real content'
);
// The medicine grid is ~1000px wide; with only the date frozen, scrolling to a
// medicine pushed the patient's name off screen.
assert(
  /const stickyCell2 = \{/.test(medPageMarkup) && /className="sticky-cell"/.test(medPageMarkup),
  'a second column is frozen so the patient stays visible while scrolling'
);
assert(
  /const STICKY_FIRST_WIDTH = 92/.test(medPageMarkup),
  'the first column has a fixed width, so the second column\u2019s offset is exact'
);

const componentsCss = read('src/styles/components.css');
// A frozen cell sets its own background to stay opaque, which defeated the row hover.
assert(
  /\.table tr:hover td\.sticky-cell/.test(componentsCss),
  'the frozen cells take part in the row hover'
);
assert(
  /transition: transform 160ms ease-out/.test(componentsCss),
  'buttons animate their press feedback instead of snapping'
);
// The frame is shown at rest: for staff scanning the grid it IS the affordance
// that says "you can type here". Hiding it until hover left them guessing, and a
// known pattern outranks a calmer surface on a data-entry screen.
assert(
  /border: '1px solid var\(--border\)'/.test(medPageMarkup) &&
    /\.medlog-cell-input:focus/.test(componentsCss),
  'medicine cells are framed at rest, with a focus ring on top'
);
assert(
  /\.medlog-cell-input:hover \{\s*\n\s*background: var\(--surface-raised\)/.test(componentsCss),
  'hover adds feedback rather than revealing the frame'
);
console.log('  ✓ PASS: audit fixes in place');

// -----------------------------------------------------------------------------
// [TEST GROUP] The register's horizontal scroller
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 17] The scroller matches the system');

assert(
  /\.table-responsive::-webkit-scrollbar-thumb \{[\s\S]{0,220}border-radius: var\(--radius-full\)/.test(componentsCss),
  'the scrollbar thumb is rounded, like every other surface in the system'
);
assert(
  /\.table-responsive::-webkit-scrollbar \{[\s\S]{0,80}height: 10px/.test(componentsCss),
  'the bar is thinner than the platform default'
);
// The chat reveals its bar on hover. This one must NOT: with two columns frozen
// it is the only sign there are more columns to the right.
assert(
  /\.table-responsive \{\s*\n\s*scrollbar-width: thin;\s*\n\s*scrollbar-color: rgba\(148, 163, 184, 0\.45\) transparent/.test(componentsCss),
  'the bar is visible at rest, not revealed on hover'
);
assert(
  !/\.table-responsive::-webkit-scrollbar-thumb \{[^}]*background: transparent/.test(componentsCss),
  'the thumb is not transparent at rest'
);
console.log('  ✓ PASS: scroller — thin, rounded, and visible at rest');

// -----------------------------------------------------------------------------
// [TEST GROUP] Scrollbars across the whole app
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 18] One scrollbar treatment, app-wide');

const baseCss = read('src/styles/base.css');
// The platform default is a chunky square slab that reads as the OS, not this
// app. One default covers the shell (main + sidebar) and every panel.
assert(
  /\*\s*\{[\s\S]{0,120}scrollbar-width: thin/.test(baseCss),
  'a global default styles every scrollbar, not one container at a time'
);
assert(
  /\*::-webkit-scrollbar-thumb \{[\s\S]{0,260}border-radius: var\(--radius-full/.test(baseCss),
  'the thumb is rounded app-wide'
);
assert(
  /\*::-webkit-scrollbar \{[\s\S]{0,80}width: 10px/.test(baseCss),
  'the bar is thinner than the platform default'
);
// Visible at rest — a bar that only appears when you are already over the thing
// is a poor signpost that content continues.
assert(
  /\*::-webkit-scrollbar-thumb \{[\s\S]{0,120}background: rgba\(148, 163, 184, 0\.45\)/.test(baseCss),
  'the thumb is visible at rest, not transparent'
);
// The chat deliberately reveals on hover. Its rules are more specific, so the
// global default must not have swallowed it.
const chatRules = read('src/styles/components.css');
assert(
  /\.tup-chat-messages-area::-webkit-scrollbar-thumb/.test(chatRules) &&
    /\.tup-chat-messages-area:hover::-webkit-scrollbar-thumb/.test(chatRules),
  'the chat keeps its hover-reveal override'
);
console.log('  ✓ PASS: scrollbars unified, chat override preserved');

// -----------------------------------------------------------------------------
// [TEST GROUP] Patient acknowledgement of a visit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 9] Patient signs to acknowledge what they received');

const ackMigration = read('supabase/migrations/20261017300000_patient_visit_acknowledgement.sql');
assert(/ADD COLUMN IF NOT EXISTS patient_signature_path/.test(ackMigration), 'patient_signature_path is stored separately');
assert(/ADD COLUMN IF NOT EXISTS patient_signed_at/.test(ackMigration), 'the acknowledgement is timestamped');
assert(/CREATE OR REPLACE FUNCTION public\.patient_acknowledge_visit/.test(ackMigration), 'a dedicated RPC records it');
assert(/v_role <> 'patient'/.test(ackMigration), 'only a patient may acknowledge');
assert(/AND patient_id = v_patient_id/.test(ackMigration), 'a patient may only sign their own visit');
assert(/SECURITY DEFINER/.test(ackMigration), 'it runs with the privileges it needs, since patients cannot update encounters');

const recordsPage = read('src/pages/patient/PatientRecords.jsx');
assert(/SignaturePad/.test(recordsPage), 'the portal offers a signature pad');
assert(/rpc\('patient_acknowledge_visit'/.test(recordsPage), 'the portal calls the acknowledgement RPC');
assert(/if \(data !== true\) throw/.test(recordsPage), 'the RPC result is checked, not just the absence of an error');
assert(
  /const blob = await \(await fetch\(signature\)\)\.blob\(\)[\s\S]{0,900}patient_acknowledge_visit/.test(recordsPage),
  'the signature uploads before the visit is marked acknowledged'
);
assert(/PATIENT_SIGNATURE_PREFIX/.test(recordsPage), 'patient signatures are stored under their own prefix');
assert(/Acknowledgement/.test(recordsPage), 'the portal shows the acknowledgement state per visit');

// The log shows both, clearly distinguished.
assert(/patient_signature_path/.test(medPageMarkup), 'the register reads the patient signature');
// The signature column belongs to the PATIENT — staff do not sign the log.
assert(!/label:\s*'Signature'/.test(configsSrc), 'the export no longer has a clinician signature column');
assert(/label:\s*'Patient Signature'/.test(configsSrc), 'the export carries the patient acknowledgement column');
assert(!/signatureUrl\(row\.signature_path\)/.test(medPageMarkup), 'the register does not render a clinician signature');
assert(/patient_signature_path \? `Signed/.test(configsSrc), 'the export records that it was signed, and when');
console.log('  ✓ PASS: patient acknowledgement captured, stored separately, shown in the log and export');

// -----------------------------------------------------------------------------
// [TEST GROUP] The export prints the signature the UI shows
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 10] The exported log prints the actual signature');

assert(
  /column\.pdfImage/.test(engineSrc),
  'the engine can draw an image into a cell'
);
assert(
  /doc\.getImageProperties\(image\)/.test(engineSrc) && /doc\.addImage\(image, 'PNG'/.test(engineSrc),
  'the image is measured and drawn, preserving its aspect ratio'
);
assert(
  /if \(column\.pdfImage\)[\s\S]{0,160}minCellHeight/.test(engineSrc),
  'an image column gets the row height it needs, so the signature is not clipped'
);
assert(
  /A broken image must not break the whole export/.test(engineSrc),
  'a failed image does not abort the export'
);

assert(/pdfImage: \(r\) => r\.signatureImage/.test(configsSrc), 'the signature column supplies the image');
// The PDF cell holds the image and nothing else — a caption collided with the
// strokes. The CSV keeps the fact and the date, since it cannot show a picture.
assert(
  /label: 'Patient Signature',\s*\n\s*value: \(\) => '',/.test(configsSrc),
  'the PDF cell carries no text alongside the signature'
);
assert(
  /csvValue: \(r\) => \(r\.patient_signature_path \? `Signed/.test(configsSrc),
  'the CSV still records that it was signed, and when'
);
assert(/pdfImageHeight: 16/.test(configsSrc), 'every signature prints at a fixed height');
assert(/pdfImageRowHeight: 22/.test(configsSrc), 'the signature row is only as tall as it needs to be');
assert(
  /let h = Math\.min\(config\.pdfImageHeight \?\? 16/.test(engineSrc),
  'the engine draws at that fixed height rather than scaling to the cell'
);
assert(/if \(w > maxWidth\)/.test(engineSrc), 'width follows the aspect ratio, capped to the cell');

const medLogPageSrc = read('src/pages/MedicalLog.jsx');
assert(/loadSignatureDataUrls/.test(medLogPageSrc), 'the page preloads the signature images');
assert(/readAsDataURL/.test(medLogPageSrc), 'the images are converted for jsPDF');
assert(
  /SIGNATURE_FETCH_CONCURRENCY/.test(medLogPageSrc),
  'signature requests use bounded concurrency without omitting later visits'
);
assert(
  /signatureImage: e\.patient_signature_path/.test(medLogPageSrc),
  'each row carries its own signature image'
);
console.log('  ✓ PASS: the exported signature matches what the UI shows');

// -----------------------------------------------------------------------------
// [TEST GROUP] A signature is always readable, in either theme
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 10] Signatures are visible in dark mode');

// The ink is dark (#111827) and the PNG is transparent — a CSS background is not
// captured by toDataURL — so on a dark panel the strokes vanish. Both the pad
// and every display site must therefore supply a light surface.
const signaturePadSrc = read('src/components/SignaturePad.jsx');
assert(
  /background: '#ffffff'/.test(signaturePadSrc),
  'the signing pad is a light surface, so the ink is visible while signing'
);
assert(
  !/background: 'var\(--panel\)'/.test(signaturePadSrc),
  'the pad no longer uses the theme panel as its background'
);
assert(
  /ctx\.strokeStyle = '#111827'/.test(signaturePadSrc),
  'the ink is still dark, which is what makes the light backing necessary'
);

const signatureImageSrc = read('src/components/SignatureImage.jsx');
assert(/background: '#ffffff'/.test(signatureImageSrc), 'a displayed signature gets a light backing');
assert(
  /a baked-in background would print as a grey box/.test(signatureImageSrc),
  'the reason the PNG is left transparent (so the PDF still prints cleanly) is recorded'
);

// Every display site must go through it — a bare <img> would be invisible again.
const displaySites = [
  ['src/pages/MedicalLog.jsx', 'the Medical Log'],
  ['src/pages/patient/PatientRecords.jsx', 'the patient Records page'],
];
for (const [rel, label] of displaySites) {
  const src = read(rel);
  assert(/<SignatureImage/.test(src), `${label} renders signatures through the shared component`);
  assert(
    !/src=\{patientUrl\}|src=\{url\}/.test(src),
    `${label} has no bare <img> signature left`
  );
}
console.log('  ✓ PASS: dark-mode signatures — light backing on the pad and every display site');

// -----------------------------------------------------------------------------
// [TEST GROUP] Text columns size to their content
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 11] Text columns size to content, not to a guess');

assert(
  /const hasWeight = \(column\) => typeof column\.pdfWidth === 'number'/.test(engineSrc),
  'the engine distinguishes weighted from measured columns'
);
assert(
  /doc\.getTextWidth\(pdfSafeText\(column\.label\)\)/.test(engineSrc),
  'a measured column is sized against its own header'
);
assert(
  /widest = Math\.max\(widest, doc\.getTextWidth\(String\(value\)\)\)/.test(engineSrc),
  'and against its content'
);
assert(/pdfMaxWidth/.test(engineSrc), 'a single long value cannot swallow the page');
assert(/AUTO_WIDTH_SAMPLE/.test(engineSrc), 'measuring is capped, so a large export is not slowed');
assert(
  /remaining = Math\.max\(availableWidth \* 0\.25, availableWidth - autoTotal\)/.test(engineSrc),
  'the weighted columns keep a workable share even if the text is greedy'
);

// The Medical Log's text columns carry no width, so they are measured.
const medLogWidths = configsSrc.slice(
  configsSrc.indexOf('buildMedicalLogExportConfig'),
  configsSrc.indexOf('export const EXPORT_CONFIGS')
);
for (const label of ['Date', 'Student ID', 'Name', 'Sex', 'Dept./Course', 'Complaint']) {
  const re = new RegExp(`label: '${label.replace(/[/.]/g, '\\$&')}'[^\\n]*`);
  const line = (medLogWidths.match(re) || [])[0] || '';
  assert(!/pdfWidth/.test(line), `${label} is measured, not given a fixed width`);
}
assert(/pdfMaxWidth: 130/.test(medLogWidths), 'Name is capped so one long name cannot dominate');
assert(/pdfMaxWidth: 90/.test(medLogWidths), 'Complaint is capped');
// The medicine columns keep their weight — that is where the width is needed.
assert(/rotateHead: true,\s*\n\s*pdfWidth: 13/.test(medLogWidths), 'medicine columns keep their weight');
console.log('  ✓ PASS: measured text columns, weighted medicine columns');

// -----------------------------------------------------------------------------
// [TEST GROUP] One action completes a visit
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 12] Completing a visit closes both records');

const visitMigration = read('supabase/migrations/20261017330000_complete_visit_and_timezone.sql');
assert(/CREATE OR REPLACE FUNCTION public\.complete_visit/.test(visitMigration), 'complete_visit() exists');
assert(/v_role NOT IN \('admin', 'physician', 'nurse'\)/.test(visitMigration), 'only clinic staff may complete a visit');
assert(
  /SELECT e\.id INTO v_enc[\s\S]{0,300}SELECT a\.id INTO v_appt/.test(visitMigration),
  'it resolves the counterpart, so the two records cannot disagree'
);
assert(
  /lower\(status\) <> 'cancelled'/.test(visitMigration),
  'a cancelled booking is not resurrected by completing its note'
);
assert(
  /AT TIME ZONE 'Asia\/Manila'/.test(visitMigration),
  'dates are computed in Manila time, not the UTC session timezone'
);

// Both entry points must call the same action.
assert(
  /rpc\('complete_visit', \{\s*\n\s*p_appointment_id: appt\.id/.test(read('src/pages/Appointments.jsx')),
  'the Appointments dropdown routes Completed through complete_visit'
);
// The queue page is gone: completing the appointment is the single action, so a
// separate list of who is still waiting has nothing left to say.
assert(
  !fs.existsSync(path.join(projectRoot, 'src/pages/Encounters.jsx')),
  'the Clinic Queue page has been removed'
);
const appSrcForQueue = read('src/App.jsx');
assert(!/path="\/encounters"/.test(appSrcForQueue), 'its route is gone');
assert(!/from '\.\/pages\/Encounters/.test(appSrcForQueue), 'its import is gone');
assert(
  !/page: 'encounters'/.test(read('src/components/sidebar/Sidebar.jsx')),
  'its sidebar entry is gone'
);
assert(
  !/navigate\('\/encounters'\)/.test(read('src/pages/Dashboard.jsx')),
  'nothing navigates to the removed route'
);

// Its one unique capability — closing a note by hand — is no longer needed:
// a walk-in is recorded as completed, and a booked visit closes with its
// appointment.
assert(
  /const encounterStatus = sameDayBooking\?\.length \? 'active' : 'completed'/.test(read('src/pages/Encounter.jsx')),
  'a visit with no booking is recorded as completed; a booked one waits for its appointment'
);
assert(
  !/falling back to local/.test(appSrcForQueue),
  'the local-only fallback that reported success on a failed write is gone'
);
console.log('  ✓ PASS: queue removed, and its capability folded into the two records');

// -----------------------------------------------------------------------------
// [TEST GROUP] The encounter form reports properly
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 13] The encounter form reports with a dialog, then moves on');

const encounterSrc = read('src/pages/Encounter.jsx');
assert(!/alert\('Encounter saved successfully/.test(encounterSrc), 'the native success alert is gone');
assert(!/alert\(validation\)/.test(encounterSrc), 'the native validation alert is gone');
assert(/ResultDialog/.test(encounterSrc), 'the form uses the result dialog');
assert(
  /navigate\(`\/patient-profile\?id=\$\{savedPatientId\}`\)/.test(encounterSrc),
  'the dialog can take the clinician to the record they just created'
);
assert(/Record another/.test(encounterSrc), 'staying on the form is a choice, not the default');

const resultDialog = read('src/components/ResultDialog.jsx');
assert(/role="alertdialog"/.test(resultDialog), 'the dialog is announced as an alert dialog');
assert(/e\.key === 'Escape'/.test(resultDialog), 'Escape closes it');
assert(/primaryRef\.current\?\.focus\(\)/.test(resultDialog), 'focus moves to the primary action');
console.log('  ✓ PASS: styled dialog, focus handled, and the form no longer traps you');

// -----------------------------------------------------------------------------
// [TEST GROUP] The note is readable where it is reviewed
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 14] The full note is visible where the visit is reviewed');

const profileSrc = read('src/pages/PatientProfile.jsx');
assert(/from\('medical_log_visits'\)/.test(profileSrc), 'the profile reads visits, not only encounters');
assert(/Show details/.test(profileSrc), 'a visit can be expanded');
for (const field of ['hpi', 'physical_exam', 'vitals']) {
  assert(profileSrc.includes(field), `the profile shows ${field}`);
}
assert(
  /Show details/.test(profileSrc) && /History of present illness/.test(profileSrc),
  'the profile shows the full note, expandable'
);
assert(
  /Medicine Log/.test(read('src/components/sidebar/Sidebar.jsx')),
  'the clinic-wide record is reachable from the sidebar'
);
console.log('  ✓ PASS: note readable in both places, queue named for its job');
console.log('  ✓ PASS: letterhead, summary-under-title, and the rule before the table');

// lydorg's export palette.
assert(/navy:\s*\[22,\s*54,\s*98\]/.test(engineSrc), "table header uses lydorg's navy fill");
assert(/border:\s*\[190,\s*198,\s*210\]/.test(engineSrc), "grid lines use lydorg's border colour");
assert(/muted:\s*\[92,\s*102,\s*120\]/.test(engineSrc), "summary text uses lydorg's muted colour");
assert(engineSrc.includes("theme: 'grid'"), "table uses the grid theme like lydorg's export");
console.log('  ✓ PASS: table matches the reference palette and grid treatment');

console.log('\n' + '='.repeat(80));
console.log(' ALL EXPORT LAYER TESTS PASSED (100%)');
console.log('='.repeat(80));

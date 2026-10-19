// Runs the shipped PDF path against synthetic visits, then inspects the actual
// PDF text, images and grid with PyMuPDF. No Supabase connection is used.
// Run: node src/scripts/test_medicine_log_export.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const output = path.join(root, 'output/pdf');
const temporary = path.join(root, 'tmp/pdfs/medicine-log-tests');
mkdirSync(output, { recursive: true });
mkdirSync(temporary, { recursive: true });
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const signature = 'data:image/png;base64,' + readFileSync(
  path.join(root, 'src/scripts/fixtures/medicine-log-signature-test.png')
).toString('base64');
// The image is a printed TEST IMAGE rectangle, never a fabricated signature.
const names = [
  'Band Aid', 'Elastic Bandage', 'Face Mask', 'Gauze', 'Aluminum Hydroxide',
  'Amoxicillin', 'Bioflu', 'Captopril', 'Cefalexin', 'Cetirizine',
  'Chlorphe maleate', 'Cinnarizine', 'Clonidine', 'Doxycycline', 'Loperamide',
  'Mecilizine Tablet', 'Mefenamic', 'Metronidazole', 'Omeprazole',
  'Paracetamol Biogesic', 'Salbutamol Neb', 'Salompas', 'Symdex tablet', 'Tetanus Toxoid',
];
const medicines = names.map((item_name) => ({ item_name }));
const visit = (number, overrides = {}) => ({
  visit_id: 'test-visit-' + number,
  patient_id: 'TEST-STUDENT-' + number,
  visit_date: '2026-10-19',
  patient_name: 'Sample Student ' + number,
  profile: { sex: number % 2 ? 'Male' : 'Female', course: 'BS Computer Science' },
  chief_complaint: 'Review ' + number,
  dispensed: {},
  ...overrides,
});
const sampleRows = [
  visit(1, { patient_id: 'TEST-REPEAT', patient_name: 'Sample Student A', chief_complaint: 'Headache', signatureImage: signature, dispensed: { Mefenamic: 1, 'Band Aid': 2 } }),
  visit(2, { patient_id: 'TEST-REPEAT', patient_name: 'Sample Student A', profile: { sex: 'Male', course: 'BS Computer Science' }, visit_date: '2026-10-17', chief_complaint: 'Cough', dispensed: { Amoxicillin: 3, 'Paracetamol Biogesic': 2 } }),
  visit(3, { visit_date: '2026-10-17', chief_complaint: 'Follow-up', signatureImage: signature }),
  visit(4, { visit_date: '2026-10-16', chief_complaint: 'Fever', dispensed: { 'Paracetamol Biogesic': 2 } }),
  visit(5, { visit_date: '2026-10-10', chief_complaint: 'Allergic rhinitis', dispensed: { Cetirizine: 1 } }),
  visit(6, { visit_date: '2026-10-09', chief_complaint: 'Ankle review', dispensed: { Salompas: 2, 'Elastic Bandage': 1 } }),
];
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const server = await createServer({
  configFile: path.join(root, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
});
const originalFetch = globalThis.fetch;
try {
  const { buildPdfDocument } = await server.ssrLoadModule('/src/utils/export/engine.js');
  const { buildMedicalLogExportConfig, appointmentsExportConfig } = await server.ssrLoadModule('/src/utils/export/configs.js');
  const { medicineLogPdfColumns } = await server.ssrLoadModule('/src/utils/export/medicineLogPdf.js');
  const { buildCsv } = await server.ssrLoadModule('/src/utils/export/csv.js');
  const config = deepFreeze(buildMedicalLogExportConfig(medicines));
  const pdfColumns = medicineLogPdfColumns(config);
  const medicineColumns = pdfColumns.filter((column) => column.rotateHead);
  assert.equal(pdfColumns.length, 6 + medicines.length);
  assert(!pdfColumns.some((column) => column.label === 'Student ID'));
  assert.equal(config.filenamePrefix, 'Medicine_Log');
  assert.equal(medicineColumns.at(-1).label, 'Salompas', 'additional stocked items follow the printed list');
  assert.equal(medicineColumns[15].label, 'Mecilizine Tablet', 'original inventory key is preserved');
  assert.equal(medicineColumns[15].pdfLabel, 'Meclizine Tablet');
  assert.equal(medicineColumns[22].label, 'Tetanus Toxoid');
  assert.equal(medicineColumns[22].pdfLabel, 'Tetrus Toxoid');
  const csv = buildCsv(config.columns, sampleRows);
  assert(csv.includes('Student ID'), 'CSV retains the student identifier');
  assert(csv.includes('TEST-REPEAT'));
  assert(csv.indexOf('Band Aid') < csv.indexOf('Aluminum Hydroxide'), 'CSV inventory ordering is preserved');

  // Building a PDF in Node needs only local assets. A network call here would
  // expose an unexpected read or write in what should be a pure renderer.
  globalThis.fetch = async () => { throw new Error('Unexpected network access during PDF generation'); };
  const cases = [];
  const writeCase = async (name, rows, options = {}) => {
    const caseConfig = options.config || config;
    const immutable = deepFreeze(structuredClone(rows));
    const before = JSON.stringify(immutable);
    const beforeConfig = JSON.stringify(caseConfig);
    const doc = await buildPdfDocument({
      config: caseConfig,
      rows: immutable,
      pageConfig: { paperSize: 'a4', orientation: 'portrait' },
      filterSummaryLines: options.filters || ['Date Range: 2026-10-09 to 2026-10-19'],
    });
    assert.equal(JSON.stringify(immutable), before, 'export does not modify visits, quantities or signatures');
    assert.equal(JSON.stringify(caseConfig), beforeConfig, 'export does not mutate the export definition');
    const filename = path.join(options.deliverable ? output : temporary, name + '.pdf');
    writeFileSync(filename, Buffer.from(doc.output('arraybuffer')));
    cases.push({
      name, filename, rows,
      labels: medicineLogPdfColumns(caseConfig).filter((column) => column.rotateHead).map((column) => ({
        label: column.pdfLabel, key: column.medicineName,
      })),
    });
    return doc;
  };
  await writeCase('Medicine_Log_Sample', sampleRows, { deliverable: true });
  await writeCase('Medicine_Log_Blank', [], { deliverable: true, filters: ['Date Range: 2027-01-01 to 2027-01-31'] });
  await writeCase('one-visit', [sampleRows[0]]);
  const multipage = Array.from({ length: 55 }, (_, index) => visit(index + 1, {
    chief_complaint: 'Review ' + (index + 1),
    dispensed: { Amoxicillin: (index % 3) + 1 },
    ...(index % 7 === 0 ? { signatureImage: signature } : {}),
  }));
  const multipleDoc = await writeCase('Medicine_Log_Multipage', multipage, { deliverable: true });
  assert(multipleDoc.internal.getNumberOfPages() > 1, 'long registers paginate');
  const longRows = [visit(1, {
    patient_name: 'Maria Alejandra Isabel Concepcion Dela Cruz-Santos',
    chief_complaint: 'Intermittent headache since yesterday with associated dizziness after prolonged standing. The student reports that symptoms improve with rest and fluids and recur during afternoon laboratory sessions. Full clinical text is preserved in this exported visit.',
    profile: { sex: 'Female', course: 'Bachelor of Engineering Technology major in Electronics and Communications Technology' },
    signatureImage: signature,
    dispensed: { 'Salbutamol Neb': 2, 'Tetanus Toxoid': 1 },
  })];
  await writeCase('long-visit', longRows);
  const extraName = 'Additional catalogue medicine with a long name 10 mg';
  const extraConfig = deepFreeze(buildMedicalLogExportConfig([...medicines, { item_name: extraName }]));
  await writeCase('long-medicine', [visit(1, { dispensed: { [extraName]: 4 } })], { config: extraConfig });
  const duplicateConfig = buildMedicalLogExportConfig([...medicines, { item_name: 'Meclizine Tablet' }]);
  const duplicates = medicineLogPdfColumns(duplicateConfig).filter((column) => column.printedIndex === 15);
  assert.equal(duplicates.length, 2, 'distinct medicine definitions never merge');
  assert.equal(new Set(duplicates.map((column) => column.pdfLabel)).size, 2, 'duplicate aliases remain distinguishable');
  await assert.rejects(
    buildPdfDocument({ config: buildMedicalLogExportConfig(Array.from({ length: 70 }, (_, i) => ({ item_name: 'Medicine ' + i }))), rows: [] }),
    /cannot fit legibly/, 'an oversized catalogue fails explicitly instead of dropping columns'
  );
  await assert.rejects(
    buildPdfDocument({ config, rows: [visit(1, { chief_complaint: 'Unabridged clinical text '.repeat(500) })] }),
    /more text than one landscape page/, 'an oversized visit is never silently split or truncated'
  );
  const generic = await buildPdfDocument({
    config: appointmentsExportConfig,
    rows: [{ patient_id: 'OTHER-EXPORT', patient_name: 'Other Report Sample', appointment_date: '2026-10-19', status: 'Scheduled' }],
    pageConfig: { paperSize: 'a4', orientation: 'landscape' },
  });
  const genericFile = path.join(temporary, 'unchanged-generic-export.pdf');
  writeFileSync(genericFile, Buffer.from(generic.output('arraybuffer')));

  // Execute the real hook with React and audit dependencies replaced by spies.
  // This verifies the Medicine Log PDF makes zero writes, while CSV and every
  // generic export retain their pre-existing audit behavior.
  let hookSource = read('src/hooks/useTableExport.js')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export const useTableExport', 'const useTableExport')
    .replace('export default useTableExport;', '');
  const exported = [];
  const audited = [];
  const useExport = new Function('useCallback', 'useState', 'exportReport', 'logAudit',
    hookSource + '\nreturn useTableExport;'
  )(
    (callback) => callback, (initial) => [initial, () => {}],
    async (...args) => exported.push(args), async (...args) => audited.push(args)
  );
  const filters = ['Date Range: 2026-10-17 to 2026-10-17', 'Course: BS Computer Science'];
  const filteredRows = sampleRows.filter((row) => row.visit_date === '2026-10-17');
  const hook = useExport({ config, getRows: async () => filteredRows, getFilterLines: () => filters });
  await hook.runExport({ format: 'pdf', pageConfig: { paperSize: 'a4' } });
  assert.equal(audited.length, 0, 'the Medicine Log PDF makes no audit/database write');
  assert.deepEqual(exported[0][1].rows, filteredRows, 'all selected visits reach the renderer in order');
  assert.deepEqual(exported[0][1].filterSummaryLines, filters, 'active filters reach the existing export pipeline');
  await hook.runExport({ format: 'csv' });
  assert.equal(audited.length, 1, 'existing CSV audit behavior is preserved');
  await useExport({ config: appointmentsExportConfig, getRows: () => [] }).runExport({ format: 'pdf' });
  assert.equal(audited.length, 2, 'other PDFs retain audit behavior');

  // Exercise the actual page's export-only reader with a paginated query spy.
  const pageSource = read('src/pages/MedicalLog.jsx');
  const fetchSource = pageSource.slice(pageSource.indexOf('const fetchAllForExport'), pageSource.indexOf('// The medicine columns ARE'));
  const selectedVisits = deepFreeze(Array.from({ length: 205 }, (_, i) => ({
    ...visit(i + 1), patient_signature_path: 'test/' + i + '.png',
  })));
  const ranges = [];
  const fetchExportRows = new Function('useCallback', 'buildVisitQuery', 'decorate', 'resolveCourseIds', 'resolveSearchPatientIds', 'loadSignatureDataUrls',
    fetchSource + '\nreturn fetchAllForExport;'
  )(
    (callback) => callback,
    (selected) => {
      assert.deepEqual(selected, { courseIds: ['selected-course'], searchPatientIds: ['selected-search'] });
      return {
        order: () => ({
          range: async (first, last) => {
            ranges.push([first, last]);
            return { data: selectedVisits.slice(first, last + 1) };
          },
        }),
      };
    },
    async (visits) => ({
      profileMap: Object.fromEntries(visits.map((v) => [v.patient_id, { full_name: v.patient_name }])),
      cellMap: Object.fromEntries(visits.map((v) => [v.visit_id + '|Amoxicillin', 2])),
    }),
    async () => ['selected-course'], async () => ['selected-search'],
    async (paths) => Object.fromEntries(paths.map((name) => [name, signature]))
  );
  const allRows = await fetchExportRows();
  assert.equal(allRows.length, 205);
  assert.deepEqual(ranges, [[0, 99], [100, 199], [200, 299]], 'every selected range is fetched');
  assert.deepEqual(allRows.map((row) => row.visit_id), selectedVisits.map((row) => row.visit_id));
  assert(allRows.every((row) => row.dispensed.Amoxicillin === 2 && row.signatureImage === signature));

  // More than 200 signatures must all load, with at most six requests in flight.
  const imageSource = pageSource.slice(pageSource.indexOf('const loadSignatureDataUrls'), pageSource.indexOf('// Public URL for a signature image'));
  let active = 0;
  let peak = 0;
  let imageRequests = 0;
  class Reader {
    readAsDataURL() { this.result = signature; queueMicrotask(() => this.onload()); }
  }
  const loadImages = new Function('SIGNATURE_FETCH_CONCURRENCY', 'signatureUrl', 'fetch', 'FileReader',
    imageSource + '\nreturn loadSignatureDataUrls;'
  )(6, (name) => name, async () => {
    active += 1;
    peak = Math.max(peak, active);
    imageRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return { ok: true, blob: async () => ({}) };
  }, Reader);
  const imagePaths = Array.from({ length: 240 }, (_, i) => 'test/signature-' + i);
  const images = await loadImages([...imagePaths, imagePaths[0], null]);
  assert.equal(imageRequests, 240, 'duplicate paths are loaded once');
  assert.equal(Object.keys(images).length, 240, 'later signatures are not dropped');
  assert(peak > 1 && peak <= 6, 'signature concurrency is bounded');

  assert(read('src/components/sidebar/Sidebar.jsx').includes("page: 'medical-log', label: 'Medicine Log'"));
  assert(read('src/pages/MedicalLog.jsx').includes('page-header-title">Medicine Log</h1>'));
  assert(read('src/App.jsx').includes('path="/medical-log"'), 'bookmarked route is unchanged');
  const manifest = path.join(temporary, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ cases, genericFile }, null, 2));
  execFileSync(process.env.PYTHON || 'python', [path.join(root, 'scripts/check_medicine_log_pdf.py'), manifest], { stdio: 'inherit' });
  console.log('PASS: real PDF scenarios, non-mutation, medicine mapping, CSV, filtered rows, read-only hook and route/labels.');
  console.log('Review PDFs: ' + output);
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}

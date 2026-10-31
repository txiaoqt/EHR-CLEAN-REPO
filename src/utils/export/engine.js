// src/utils/export/engine.js
//
// One config drives every export format, so a column is defined once and the
// CSV and PDF can never drift apart.
//
//   await exportReport('pdf', { config, rows, filterSummaryLines: ['Status: Scheduled'] });
//
// PDFs are rendered with jsPDF + autoTable (real selectable text) rather than an
// html2canvas screenshot of the DOM, and carry the official university
// letterhead as the header of every page.

// Named import, not default. jsPDF's browser build has a default export but its
// Node build (dist/jspdf.node.min.js, which a Node build resolves to) exposes
// jsPDF as a named export — so the default becomes the module namespace and
// `new jsPDF()` throws. The named form works in both.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import tupSealUrl from '../../assets/images/tup-seal.jpg';
import clinicLogoUrl from '../../assets/images/clinic-ehr-logo.png';
import {
  buildCsv,
  downloadBlob,
  exportFilename,
  formatGeneratedAt,
} from './csv.js';

export const EXPORT_FORMATS = ['csv', 'pdf'];

// jsPDF format values, or [width, height] in points. Long Bond is the
// Philippine 8.5 x 13in "folio" that clinics actually print on.
export const PAPER_SIZES = [
  { id: 'a4', label: 'A4', dimensions: '210 × 297 mm', jsPdf: 'a4' },
  { id: 'letter', label: 'Short Bond (Letter)', dimensions: '8.5 × 11 in', jsPdf: 'letter' },
  { id: 'long_bond', label: 'Long Bond (Folio)', dimensions: '8.5 × 13 in', jsPdf: [612, 936] },
  { id: 'legal', label: 'Legal', dimensions: '8.5 × 14 in', jsPdf: 'legal' },
  { id: 'a3', label: 'A3', dimensions: '297 × 420 mm', jsPdf: 'a3' },
];

export const getJsPdfFormat = (paperSize) =>
  (PAPER_SIZES.find((p) => p.id === paperSize) ?? PAPER_SIZES[0]).jsPdf;

// ---------------------------------------------------------------------------
// Letterhead — the official header, reproduced from the university's own
// document template so every export leaves the portal looking like a TUP
// document rather than a database dump.
// ---------------------------------------------------------------------------
export const LETTERHEAD = {
  line1: 'TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES',
  line2: 'Ayala Blvd., Ermita, Manila, 1000, Philippines',
  line3: 'Tel No. +632-301-3001 local 607  |  Fax No. +632-521-4063',
  line4: 'Email: clinic@tup.edu.ph  |  Website: www.tup.edu.ph',
};

export const CLINIC_NAME = 'TUP Manila — Clinic';

const PDF_COLORS = {
  navy: [22, 54, 98],
  // Column dividers inside the navy head band. Stroking navy on navy (as this
  // first did) made the head read as one solid block with no columns.
  headDivider: [116, 143, 179],
  border: [190, 198, 210],
  rule: [210, 218, 226],
  text: [32, 41, 57],
  muted: [92, 102, 120],
  zebra: [247, 249, 251],
};

const SEAL_SIZE = 52;
const LETTERHEAD_TOP = 24;

/**
 * Characters the standard PDF fonts cannot encode.
 *
 * jsPDF's built-in Helvetica uses WinAnsi, which has no arrow glyphs. When a
 * string contains one, jsPDF falls back to a different encoding for that line —
 * the character renders as the wrong glyph AND the spacing of the whole line
 * comes out distorted. Transliterating first keeps every line in one encoding.
 */
const PDF_SAFE_SUBSTITUTIONS = [
  [/\u2192/g, 'to'],
  [/\u2190/g, 'from'],
  [/\u2194/g, 'to'],
  [/[\u2022\u25CF\u25AA]/g, '-'],
  [/[\u2713\u2714\u2705]/g, 'yes'],
  [/[\u2717\u2718\u274C]/g, 'no'],
  [/\u2265/g, '>='],
  [/\u2264/g, '<='],
  [/\u2260/g, '!='],
  [/\u00A0/g, ' '],
];

export const pdfSafeText = (value) => {
  let out = value == null ? '' : String(value);
  for (const [pattern, replacement] of PDF_SAFE_SUBSTITUTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
};

// Loads an asset once and caches the data URL, since jsPDF needs pixels.
// Downscales to EMBED_MAX_PX so a large source logo does not bloat every export
// — still ~4x the drawn size, so it stays crisp in print.
const EMBED_MAX_PX = 256;
const imageCache = new Map();
const loadImageAsDataUrl = (src) => {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = (async () => {
    // Node path, for tests and for generating a sample outside the browser.
    // There is no canvas here, so the downscale step is skipped — jsPDF scales
    // on draw regardless. If the asset cannot be resolved the seal is simply
    // absent, which is the same outcome the browser path produces on error.
    if (typeof document === 'undefined') {
      try {
        const { readFile } = await import('node:fs/promises');
        const file = src.startsWith('file:') ? src : src;
        const bytes = await readFile(file);
        const ext = String(src).toLowerCase().endsWith('.jpg') || String(src).toLowerCase().endsWith('.jpeg')
          ? 'jpeg'
          : 'png';
        return {
          dataUrl: `data:image/${ext};base64,${bytes.toString('base64')}`,
          width: EMBED_MAX_PX,
          height: EMBED_MAX_PX,
        };
      } catch {
        return null;
      }
    }

    return new Promise((resolve) => {
      try {
        const img = new Image();
        let done = false;
        const finish = (value) => { if (!done) { done = true; resolve(value); } };
        img.onload = () => {
          try {
            const scale = Math.min(1, EMBED_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
            const width = Math.max(1, Math.round(img.naturalWidth * scale));
            const height = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            finish({ dataUrl: canvas.toDataURL('image/png'), width, height });
          } catch {
            finish(null);
          }
        };
        img.onerror = () => finish(null);
        img.src = src;
        setTimeout(() => finish(null), 5000);
      } catch {
        resolve(null);
      }
    });
  })();
  imageCache.set(src, promise);
  return promise;
};

const drawLetterhead = (doc, pageWidth, margin) => {
  const centerX = pageWidth / 2;
  const seals = doc.__letterheadSeals || {};

  if (seals.tup) doc.addImage(seals.tup, 'PNG', margin, LETTERHEAD_TOP, SEAL_SIZE, SEAL_SIZE);
  if (seals.clinic) {
    doc.addImage(seals.clinic, 'PNG', pageWidth - margin - SEAL_SIZE, LETTERHEAD_TOP, SEAL_SIZE, SEAL_SIZE);
  }

  // Text sits between the two seals, so the block reads as one centred masthead.
  let y = LETTERHEAD_TOP + 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(LETTERHEAD.line1, centerX, y, { align: 'center' });

  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(LETTERHEAD.line2, centerX, y, { align: 'center' });

  y += 11;
  doc.setFontSize(8);
  doc.text(LETTERHEAD.line3, centerX, y, { align: 'center' });

  y += 10.5;
  doc.text(LETTERHEAD.line4, centerX, y, { align: 'center' });

  // The letterhead is closed off by space alone — the document carries a single
  // rule, between the summary block and the table.
  return Math.max(LETTERHEAD_TOP + SEAL_SIZE, y) + 16;
};

const buildDetailLines = ({ rows, metadataLines, filterSummaryLines, config }) => {
  const lines = [`Generated: ${formatGeneratedAt()}`];
  // "Total Records" belongs on a list. This config renders a single form, where
  // the row count is the number of fields — a number that means nothing and
  // reads as though the clinic has 26 patients.
  if (!config?.hideRecordCount) lines.push(`Total Records: ${rows.length}`);
  if (metadataLines?.length) lines.push(...metadataLines);
  // Each active filter gets its own line — no "Filters —" prefix, which just
  // added a word without saying anything the line did not already say.
  if (filterSummaryLines?.length) lines.push(...filterSummaryLines);
  return lines.map(pdfSafeText);
};

const drawTitleBlock = (doc, pageWidth, margin, config, options, startY) => {
  let y = startY + 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(config.title, margin, y);

  // The export summary sits directly under the title.
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  for (const line of buildDetailLines({ rows: options.rows, ...options })) {
    doc.text(line, margin, y);
    y += 10;
  }

  // Rule separating the summary from the table.
  y += 3;
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);

  return y + 8;
};

/**
 * Column widths.
 *
 * Two modes:
 *
 *  - Every column has a `pdfWidth`: they are RELATIVE WEIGHTS scaled to fill
 *    the printable width exactly. (Passing absolute widths, as this engine
 *    first did, collapses the un-weighted columns to a couple of points on a
 *    narrow page and renders headers one letter per line.)
 *
 *  - Some columns have no `pdfWidth`: those are MEASURED against their own
 *    header and content and given exactly that, so a short column does not hold
 *    dead space. The weighted columns then share whatever is left, in
 *    proportion — which is how the medicine columns keep their width instead of
 *    being squeezed by an over-wide text column.
 */
const AUTO_WIDTH_SAMPLE = 200; // measuring thousands of rows buys nothing

export const buildColumnStyles = (pdfColumns, availableWidth, options = {}) => {
  const { doc, rows, config } = options;
  const fontSize = config?.pdfFontSize ?? 7.5;
  const headFontSize = config?.pdfHeadFontSize ?? fontSize;
  const padding =
    (typeof config?.pdfCellPadding === 'number' ? config.pdfCellPadding : 4.5) * 2;

  const hasWeight = (column) => typeof column.pdfWidth === 'number' && column.pdfWidth > 0;

  const style = (column, cellWidth) => ({
    cellWidth,
    halign: column.pdfAlign ?? 'left',
    valign: 'middle',
  });

  // No auto columns: scale the weights to fill the page.
  if (pdfColumns.every(hasWeight)) {
    const total = pdfColumns.reduce((sum, c) => sum + c.pdfWidth, 0);
    return Object.fromEntries(
      pdfColumns.map((column, index) => [
        index,
        style(column, (column.pdfWidth / total) * availableWidth),
      ])
    );
  }

  // Measure the columns that were not given a width.
  const sample = (rows || []).slice(0, AUTO_WIDTH_SAMPLE);
  const measured = pdfColumns.map((column, index) => {
    if (hasWeight(column)) return null;

    let widest = 0;
    if (doc) {
      try {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(headFontSize);
        widest = doc.getTextWidth(pdfSafeText(column.label));

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        for (const row of sample) {
          const value = resolveValue(column, row, index, 'pdf');
          if (value) widest = Math.max(widest, doc.getTextWidth(String(value)));
        }
      } catch {
        widest = 0;
      }
    }

    // Never let one long value swallow the page.
    const cap = column.pdfMaxWidth ?? availableWidth * 0.4;
    return Math.min(widest + padding, cap);
  });

  const autoTotal = measured.reduce((sum, w) => sum + (w || 0), 0);
  const weightedTotal = pdfColumns.reduce((sum, c) => sum + (hasWeight(c) ? c.pdfWidth : 0), 0);
  // Leave the weighted columns a workable share even if the text is greedy.
  const remaining = Math.max(availableWidth * 0.25, availableWidth - autoTotal);

  return Object.fromEntries(
    pdfColumns.map((column, index) => [
      index,
      style(
        column,
        measured[index] != null
          ? measured[index]
          : (column.pdfWidth / weightedTotal) * remaining
      ),
    ])
  );
};

const resolveValue = (column, row, index, format) => {
  const raw = (column[format === 'pdf' ? 'pdfValue' : 'csvValue'] || column.value)(row, index);
  if (Array.isArray(raw)) {
    return raw.filter((p) => p != null && p !== '').join('; ');
  }
  const text = raw == null ? '' : String(raw);
  return format === 'pdf' ? pdfSafeText(text) : text;
};

export const exportReportAsCsv = ({ config, rows, totalsRow }) => {
  const csv = buildCsv(config.columns, rows, { totalsRow });
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    exportFilename(config.filenamePrefix, 'csv', config.filenameDateSuffix !== false)
  );
};

export const buildPdfDocument = async ({
  config,
  rows,
  filterSummaryLines,
  metadataLines,
  totalsRow,
  pageConfig,
}) => {
  const paperSize = pageConfig?.paperSize ?? config.paperSize ?? 'a4';
  // The official Medicine Log has its own controlled paper-form layout. All
  // other reports continue through the shared renderer below.
  if (config.pdfTemplate === 'medicine-log') {
    const { buildMedicineLogPdf } = await import('./medicineLogPdf.js');
    return buildMedicineLogPdf({ config, rows, format: getJsPdfFormat(paperSize), safeText: pdfSafeText });
  }
  // Some reports are only ever printed one way — the Medical Log's medicine
  // columns collapse to a few points in portrait, so its config locks landscape.
  const orientation = config.lockOrientation
    ? (config.orientation ?? 'landscape')
    : (pageConfig?.orientation ?? config.orientation ?? 'landscape');

  const doc = new jsPDF({ orientation, unit: 'pt', format: getJsPdfFormat(paperSize) });

  // Load the marks before the first page is drawn. Left is the university seal,
  // right is the clinic's own EHR mark.
  const [tup, clinic] = await Promise.all([
    loadImageAsDataUrl(tupSealUrl),
    loadImageAsDataUrl(clinicLogoUrl),
  ]);
  doc.__letterheadSeals = { tup: tup?.dataUrl ?? null, clinic: clinic?.dataUrl ?? null };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 34;

  const letterheadBottom = drawLetterhead(doc, pageWidth, margin);
  const tableStartY = drawTitleBlock(doc, pageWidth, margin, config, { rows, metadataLines, filterSummaryLines, config }, letterheadBottom);

  const pdfColumns = config.columns.filter((column) => !column.excludeFromPdf);

  // Rotated headers, per column. autoTable has no rotation option, so a column
  // flagged `rotateHead` gets a blank head cell and its label is drawn
  // bottom-to-top in didDrawCell. Only narrow columns need this — a 20-character
  // medicine name fits a 13pt column when rotated, but not when wrapped.
  const anyRotated = pdfColumns.some((column) => column.rotateHead);

  const columnStyles = buildColumnStyles(pdfColumns, pageWidth - margin * 2, { doc, rows, config });
  // A column that draws an image needs room for it; its text is usually empty
  // or a caption, so the row would otherwise collapse to a few points.
  pdfColumns.forEach((column, index) => {
    if (column.pdfImage) {
      columnStyles[index].minCellHeight = config.pdfImageRowHeight ?? 30;
    }
  });

  autoTable(doc, {
    head: [pdfColumns.map((column) => (column.rotateHead ? '' : column.label))],
    body: (rows || []).map((row, index) =>
      pdfColumns.map((column) => resolveValue(column, row, index, 'pdf'))
    ),
    foot: totalsRow ? [totalsRow] : undefined,
    showFoot: totalsRow ? 'lastPage' : 'never',
    startY: tableStartY,
    // Every page repeats the letterhead: the top margin keeps the table clear of it.
    margin: { top: LETTERHEAD_TOP + SEAL_SIZE + 34, left: margin, right: margin, bottom: 46 },
    theme: 'grid',
    styles: {
      fontSize: config.pdfFontSize ?? 7.5,
      cellPadding: config.pdfCellPadding ?? 4.5,
      overflow: 'linebreak',
      textColor: [...PDF_COLORS.text],
      lineColor: [...PDF_COLORS.border],
      lineWidth: 0.5,
      valign: 'middle',
      fillColor: false,
    },
    headStyles: {
      fillColor: [...PDF_COLORS.navy],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: config.pdfFontSize ?? 7.5,
      halign: 'left',
      // Vertically centred in the band, matching the rotated names, which fill
      // the full height.
      valign: 'middle',
      lineColor: [...PDF_COLORS.navy],
      ...(anyRotated ? { minCellHeight: config.pdfHeadHeight ?? 84 } : {}),
    },
    footStyles: {
      fillColor: [...PDF_COLORS.zebra],
      textColor: [...PDF_COLORS.text],
      fontStyle: 'bold',
      lineWidth: 0.75,
      lineColor: [...PDF_COLORS.border],
    },
    // Matches the reference export: grid lines only, no zebra fill.
    alternateRowStyles: { fillColor: false },
    columnStyles,
    didDrawCell: (data) => {
      if (data.section === 'head') {
        const column = pdfColumns[data.column.index];
        if (!column?.label) return;

        // Every head cell is repainted so the divider is visible and the label
        // alignment is ours: rotated columns read bottom-to-top, the rest are
        // centred and sit just above the data.
        const { x, y, width, height } = data.cell;
        doc.setFillColor(...PDF_COLORS.navy);
        doc.rect(x, y, width, height, 'F');
        doc.setDrawColor(...PDF_COLORS.headDivider);
        doc.setLineWidth(0.5);
        doc.rect(x, y, width, height, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(config.pdfHeadFontSize ?? config.pdfFontSize ?? 7.5);
        doc.setTextColor(255, 255, 255);

        const label = pdfSafeText(column.label);

        if (column.rotateHead) {
          // angle 90 rotates counter-clockwise: reads bottom-to-top, the
          // convention on a printed log.
          doc.text(label, x + width / 2, y + height - 5, {
            angle: 90,
            align: 'left',
            baseline: 'middle',
          });
        } else {
          // Centred both ways within the cell.
          doc.text(label, x + width / 2, y + height / 2, {
            align: 'center',
            baseline: 'middle',
          });
        }
        return;
      }

      // An image column prints the picture the UI shows — a patient's signature
      // — rather than a text stand-in for it.
      if (data.section === 'body') {
        const column = pdfColumns[data.column.index];
        if (!column?.pdfImage) return;

        let image = null;
        try {
          image = column.pdfImage(rows[data.row.index], data.row.index);
        } catch {
          image = null;
        }
        if (!image) return;

        const { x, y, width, height } = data.cell;
        const inset = 2;
        try {
          const props = doc.getImageProperties(image);
          // A FIXED height, so every signature prints at the same size however
          // large it was drawn or however tall the row happens to be. The width
          // follows the aspect ratio, capped to the cell.
          let h = Math.min(config.pdfImageHeight ?? 16, height - inset * 2);
          let w = (props.width / props.height) * h;

          const maxWidth = width - inset * 2;
          if (w > maxWidth) {
            w = maxWidth;
            h = (props.height / props.width) * w;
          }

          doc.addImage(image, 'PNG', x + (width - w) / 2, y + (height - h) / 2, w, h);
        } catch {
          // A broken image must not break the whole export.
        }
      }
    },
  });

  // Decorate after the table is laid out, so "Page n of N" knows the real total.
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);

    // Page 1 already carries the letterhead (drawn before the title block); the
    // continuation pages get it here. It sits entirely above the table's top
    // margin, so it never overlaps content.
    if (page > 1) drawLetterhead(doc, pageWidth, margin);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setDrawColor(...PDF_COLORS.rule);
    doc.setLineWidth(0.8);
    doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);
    doc.text(config.footerText || `${CLINIC_NAME} — generated from the clinic EHR`, margin, pageHeight - 21);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 21, { align: 'right' });
  }

  return doc;
};

export const exportReportAsPdf = async (options) => {
  const doc = await buildPdfDocument(options);
  doc.save(
    exportFilename(options.config.filenamePrefix, 'pdf', options.config.filenameDateSuffix !== false)
  );
};

/**
 * @param {'csv'|'pdf'} format
 * @param {{config, rows, filterSummaryLines?, metadataLines?, totalsRow?, pageConfig?}} options
 */
export const exportReport = async (format, options) => {
  if (format === 'csv') return exportReportAsCsv(options);
  if (format === 'pdf') return exportReportAsPdf(options);
  throw new Error(`Unsupported export format: ${format}`);
};

/**
 * A report made of several small tables (census, breakdowns), each under its
 * own heading, with the same letterhead and footer as every other export.
 * @param {{title: string, metadataLines?: string[], sections: {title: string, head: string[], body: any[][]}[], filename: string}} options
 */
export const exportSectionedPdf = async ({ title, metadataLines = [], sections, filename }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const [tup, clinic] = await Promise.all([loadImageAsDataUrl(tupSealUrl), loadImageAsDataUrl(clinicLogoUrl)]);
  doc.__letterheadSeals = { tup: tup?.dataUrl ?? null, clinic: clinic?.dataUrl ?? null };
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const top = LETTERHEAD_TOP + SEAL_SIZE + 34;

  let y = drawLetterhead(doc, pageWidth, margin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(pdfSafeText(title), margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.muted);
  [`Generated: ${formatGeneratedAt()}`, ...metadataLines].forEach((line) => { doc.text(pdfSafeText(line), margin, y); y += 11; });
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  sections.forEach((section) => {
    // Keep a heading with at least its table head and first row.
    if (y > pageHeight - 120) { doc.addPage(); y = top; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_COLORS.navy);
    doc.text(pdfSafeText(section.title), margin, y);
    autoTable(doc, {
      head: [section.head.map(pdfSafeText)],
      body: section.body.length ? section.body.map((row) => row.map((cell) => pdfSafeText(cell)))
        : [['No data in this range.', ...section.head.slice(1).map(() => '')]],
      startY: y + 6,
      margin: { top, left: margin, right: margin, bottom: 46 },
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4.5, textColor: [...PDF_COLORS.text], lineColor: [...PDF_COLORS.border], lineWidth: 0.5 },
      headStyles: { fillColor: [...PDF_COLORS.navy], textColor: [255, 255, 255], fontStyle: 'bold' },
      // Every column after the first holds a count.
      columnStyles: Object.fromEntries(section.head.slice(1).map((_, i) => [i + 1, { halign: 'right', cellWidth: 80 }])),
      didParseCell: (data) => { if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'; },
    });
    y = doc.lastAutoTable.finalY + 22;
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    if (page > 1) drawLetterhead(doc, pageWidth, margin);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setDrawColor(...PDF_COLORS.rule);
    doc.setLineWidth(0.8);
    doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);
    doc.text(`${CLINIC_NAME} — generated from the clinic EHR`, margin, pageHeight - 21);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 21, { align: 'right' });
  }
  doc.save(filename);
  return doc;
};

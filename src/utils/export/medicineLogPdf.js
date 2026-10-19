// The official VAF-MDC Medicine Log. This template is used only by its PDF
// export; the register, inventory keys, CSV columns and other reports stay on
// their existing paths.
import { jsPDF } from 'jspdf';
import sealUrl from '../../assets/images/tup-medicine-log-seal.png';

export const MEDICINE_LOG_DOCUMENT_CONTROL = Object.freeze({
  index: 'F-MDC-8.1c-MED',
  issue: '01',
  revision: '00',
  date: '11192019',
  qac: 'CC-11192019',
});

// Labels and order transcribed from the photographed preprinted form. Only
// corresponding live inventory columns are included; this never creates stock.
const PRINTED_MEDICINES = [
  'Aluminum Hydroxide', 'Amoxicillin', 'Band Aid', 'Bioflu', 'Captopril',
  'Cefalexin', 'Cetirizine', 'Chlorphe maleate', 'Cinnarizine', 'Clonidine',
  'Doxycycline', 'Elastic Bandage', 'Face Mask', 'Gauze', 'Loperamide',
  'Meclizine Tablet', 'Mefenamic', 'Metronidazole', 'Omeprazole',
  'Paracetamol/Biogesic', 'Salbutamol Neb', 'Symdex tablet', 'Tetrus Toxoid',
];
const nameKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const printedIndex = new Map(PRINTED_MEDICINES.map((name, index) => [nameKey(name), index]));
// Existing catalogue spellings, mapped for printing only.
printedIndex.set('mecilizinetablet', 15);
printedIndex.set('tetanustoxoid', 22);

export const medicineLogPdfColumns = (config) => {
  const columns = config.columns.filter((column) => !column.excludeFromPdf);
  const visitColumns = columns.filter((column) => !column.rotateHead);
  const medicineColumns = columns.filter((column) => column.rotateHead).map((column, index) => ({
    ...column,
    originalIndex: index,
    printedIndex: printedIndex.get(nameKey(column.medicineName || column.label)),
  }));
  const counts = new Map();
  medicineColumns.forEach((column) => {
    if (column.printedIndex !== undefined) {
      counts.set(column.printedIndex, (counts.get(column.printedIndex) || 0) + 1);
    }
  });

  // Distinct inventory items are never merged, even if they map to the same
  // printed label. Preserve their full catalogue names to distinguish them.
  medicineColumns.forEach((column) => {
    column.pdfLabel = column.printedIndex !== undefined && counts.get(column.printedIndex) === 1
      ? PRINTED_MEDICINES[column.printedIndex]
      : column.label;
  });
  medicineColumns.sort((a, b) =>
    (a.printedIndex ?? Infinity) - (b.printedIndex ?? Infinity) || a.originalIndex - b.originalIndex
  );
  return [...visitColumns, ...medicineColumns];
};

const MARGIN = 18;
const HEADER_ROW = 12;
const HEADER_HEIGHT = HEADER_ROW * 6;
const FOOTER_HEIGHT = 24;
const BODY_FONT = 7;
const HEAD_FONT = 7.2;
const LINE_FACTOR = 1.15;
const PADDING = 2.4;
const MIN_ROW_HEIGHT = 15;
const MIN_MEDICINE_WIDTH = 12.5;
const VISIT_WIDTHS = [36, 102, 24, 46, 58, 60];
let sealPromise;

const loadSeal = () => {
  if (!sealPromise) {
    sealPromise = (async () => {
      if (typeof document === 'undefined') {
        const { readFile } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        const bytes = await readFile(resolve(process.cwd(), 'src/assets/images/tup-medicine-log-seal.png'));
        return 'data:image/png;base64,' + bytes.toString('base64');
      }
      const response = await fetch(sealUrl);
      if (!response.ok) throw new Error('The official TUP seal could not be loaded.');
      return new Promise((resolve, reject) => {
        response.blob().then((blob) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('The official TUP seal could not be read.'));
          reader.readAsDataURL(blob);
        }, reject);
      });
    })().catch((error) => {
      sealPromise = null;
      throw error;
    });
  }
  return sealPromise;
};

const textStyle = (doc, size, style = 'normal') => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(0);
};

const centeredLines = (doc, lines, x, centerY, fontSize, align = 'center') => {
  const step = fontSize * LINE_FACTOR;
  const firstY = centerY - ((lines.length - 1) * step) / 2;
  lines.forEach((line, index) =>
    doc.text(line, x, firstY + index * step, { align, baseline: 'middle' })
  );
};

const drawHeader = (doc, layout, seal, page, totalPages, control) => {
  const { width } = layout;
  const x = MARGIN;
  const y = MARGIN;
  const logoWidth = 80;
  const metaWidth = 208;
  const labelWidth = 92;
  const metaX = x + width - metaWidth;
  const valueX = metaX + labelWidth;
  const institutionCenter = (x + logoWidth + metaX) / 2;
  const mainBottom = y + HEADER_ROW * 4;

  doc.rect(x, y, width, HEADER_HEIGHT);
  [x + logoWidth, metaX, valueX].forEach((lineX) => doc.line(lineX, y, lineX, y + HEADER_HEIGHT));
  doc.line(x, mainBottom, x + width, mainBottom);
  for (let row = 1; row < 6; row += 1) {
    if (row !== 4) doc.line(metaX, y + row * HEADER_ROW, x + width, y + row * HEADER_ROW);
  }

  const properties = doc.getImageProperties(seal);
  const scale = Math.min(44 / properties.width, 44 / properties.height);
  const sealWidth = properties.width * scale;
  const sealHeight = properties.height * scale;
  doc.addImage(seal, 'PNG', x + (logoWidth - sealWidth) / 2, y + (48 - sealHeight) / 2, sealWidth, sealHeight);

  textStyle(doc, 9.6, 'bold');
  doc.text('TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES', institutionCenter, y + 12, { align: 'center' });
  textStyle(doc, 8.1);
  [
    'Ayala Blvd., Ermita, Manila, 1000, Philippines',
    'Tel No. +632-301-3001 local 607 | Fax No. +632-521-4063',
    'Email: clinic@tup.edu.ph | Website: www.tup.edu.ph',
  ].forEach((line, index) => doc.text(line, institutionCenter, y + 23 + index * 9, { align: 'center' }));
  textStyle(doc, 10, 'bold');
  doc.text('VAF-MDC', x + logoWidth / 2, mainBottom + 12, { align: 'center', baseline: 'middle' });
  doc.text('MEDICINE LOG', institutionCenter, mainBottom + 12, { align: 'center', baseline: 'middle' });

  textStyle(doc, 7.7);
  [
    ['Index No.', control.index],
    ['Issue No.', control.issue],
    ['Revision No.', control.revision],
    ['Date', control.date],
    ['Page', page + ' / ' + totalPages],
    ['QAC No.', control.qac],
  ].forEach(([label, value], row) => {
    const centerY = y + HEADER_ROW * (row + 0.5);
    doc.text(label, metaX + 4, centerY, { baseline: 'middle' });
    doc.text(value, valueX + 4, centerY, { baseline: 'middle' });
  });
};

const drawFooter = (doc, layout) => {
  const x = MARGIN;
  const y = layout.footerY;
  doc.rect(x, y, layout.width, FOOTER_HEIGHT);
  doc.line(x, y + FOOTER_HEIGHT / 2, x + layout.width, y + FOOTER_HEIGHT / 2);
  doc.line(x + 80, y, x + 80, y + FOOTER_HEIGHT);
  textStyle(doc, 7.7, 'bolditalic');
  doc.text('Transaction ID', x + 4, y + 6, { baseline: 'middle' });
  doc.text('Signature', x + 4, y + 18, { baseline: 'middle' });
  // No source for a form-level transaction ID or signatory exists. Both remain
  // blank; these are separate from the saved patient signature in each visit.
};

const valueText = (column, row, index, safeText) => {
  const raw = (column.pdfValue || column.value)(row, index);
  return safeText(Array.isArray(raw) ? raw.filter((part) => part != null).join('; ') : raw);
};

const prepareLayout = (doc, columns, rows, safeText) => {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const visitScale = width / (841.89 - MARGIN * 2);
  const visitWidths = VISIT_WIDTHS.map((value) => value * visitScale);
  const medicineCount = columns.filter((column) => column.rotateHead).length;
  const medicineWidth = medicineCount
    ? (width - visitWidths.reduce((sum, value) => sum + value, 0)) / medicineCount
    : 0;
  if (medicineCount && medicineWidth < MIN_MEDICINE_WIDTH) {
    throw new Error('The ' + medicineCount + ' medicine columns cannot fit legibly on this paper size. Choose a larger paper size.');
  }
  const widths = columns.map((column, index) => column.rotateHead ? medicineWidth : visitWidths[index]);
  if (!medicineCount) widths[1] += width - widths.reduce((sum, value) => sum + value, 0);
  const xPositions = [MARGIN];
  widths.forEach((cellWidth) => xPositions.push(xPositions[xPositions.length - 1] + cellWidth));

  textStyle(doc, HEAD_FONT, 'bold');
  let headHeight = 90;
  let headings;
  for (; headHeight <= 170; headHeight += 5) {
    headings = columns.map((column, index) =>
      doc.splitTextToSize(safeText(column.pdfLabel || column.label), column.rotateHead ? headHeight - 10 : widths[index] - 4)
    );
    if (columns.every((column, index) =>
      !column.rotateHead || headings[index].length * HEAD_FONT * LINE_FACTOR <= widths[index] - 2
    )) break;
  }
  if (headHeight > 170) {
    throw new Error('A medicine label cannot fit legibly on this paper size. Choose a larger paper size.');
  }

  const tableY = MARGIN + HEADER_HEIGHT + 10;
  const bodyY = tableY + headHeight;
  const footerY = doc.internal.pageSize.getHeight() - MARGIN - FOOTER_HEIGHT;
  const bodyBottom = footerY - 14;
  const capacity = bodyBottom - bodyY;
  textStyle(doc, BODY_FONT);
  const measured = rows.map((row, index) => {
    const lines = columns.map((column, colIndex) => column.pdfImage ? [] :
      doc.splitTextToSize(valueText(column, row, index, safeText), widths[colIndex] - PADDING * 2)
    );
    const height = Math.max(MIN_ROW_HEIGHT, ...lines.map((parts) => parts.length * BODY_FONT * LINE_FACTOR + PADDING * 2));
    if (height > capacity) {
      throw new Error('Visit ' + (index + 1) + ' contains more text than one landscape page can hold. Choose a larger paper size.');
    }
    return { row, index, lines, height };
  });
  const pages = [[]];
  let used = 0;
  measured.forEach((row) => {
    if (used + row.height > capacity + 0.01) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(row);
    used += row.height;
  });
  return { width, widths, xPositions, tableY, headHeight, headings, bodyY, bodyBottom, footerY, pages };
};

const drawSignature = (doc, column, entry, x, y, width) => {
  const image = column.pdfImage(entry.row, entry.index);
  if (!image) return;
  try {
    const properties = doc.getImageProperties(image);
    const scale = Math.min(
      (width - PADDING * 2) / properties.width,
      (entry.height - PADDING * 2) / properties.height,
      14 / properties.height
    );
    const imageWidth = properties.width * scale;
    const imageHeight = properties.height * scale;
    doc.addImage(image, x + (width - imageWidth) / 2, y + (entry.height - imageHeight) / 2, imageWidth, imageHeight);
  } catch {
    // As in the existing export, an unreadable saved image leaves a blank cell.
  }
};

const drawRegister = (doc, layout, columns, entries) => {
  const { widths, xPositions, tableY, headHeight, headings, bodyY, bodyBottom } = layout;
  textStyle(doc, HEAD_FONT, 'bold');
  columns.forEach((column, index) => {
    const centerX = xPositions[index] + widths[index] / 2;
    if (column.rotateHead) {
      headings[index].forEach((line, lineIndex) => {
        const offset = (lineIndex - (headings[index].length - 1) / 2) * HEAD_FONT * LINE_FACTOR;
        // jsPDF applies center alignment before rotation, which shifts a long
        // label into the preceding column. Place its baseline explicitly:
        // half the measured text length below the vertical midpoint, and the
        // Helvetica bold ascent/descent midpoint across the narrow column.
        doc.text(line, centerX + offset + HEAD_FONT * 0.38, tableY + headHeight / 2 + doc.getTextWidth(line) / 2, {
          angle: 90, align: 'left',
        });
      });
    } else {
      centeredLines(doc, headings[index], centerX, tableY + headHeight / 2, HEAD_FONT);
    }
  });

  const boundaries = [tableY, bodyY];
  let y = bodyY;
  textStyle(doc, BODY_FONT);
  entries.forEach((entry) => {
    columns.forEach((column, index) => {
      if (column.pdfImage) {
        drawSignature(doc, column, entry, xPositions[index], y, widths[index]);
      } else {
        const centered = column.rotateHead || index === 0 || index === 2;
        centeredLines(
          doc, entry.lines[index],
          xPositions[index] + (centered ? widths[index] / 2 : PADDING),
          y + entry.height / 2, BODY_FONT, centered ? 'center' : 'left'
        );
      }
    });
    y += entry.height;
    boundaries.push(y);
  });
  // The official paper retains its blank writing rows even for a short export.
  while (y + MIN_ROW_HEIGHT <= bodyBottom + 0.01) {
    y += MIN_ROW_HEIGHT;
    boundaries.push(y);
  }
  boundaries.forEach((lineY) => doc.line(MARGIN, lineY, MARGIN + layout.width, lineY));
  xPositions.forEach((lineX) => doc.line(lineX, tableY, lineX, y));
};

export const buildMedicineLogPdf = async ({
  config,
  rows = [],
  format = 'a4',
  safeText = (value) => value == null ? '' : String(value),
}) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format, compress: true });
  doc.setProperties({ title: 'Medicine Log', subject: 'TUP VAF-MDC Medicine Log' });
  const columns = medicineLogPdfColumns(config);
  const layout = prepareLayout(doc, columns, rows, safeText);
  const seal = await loadSeal();
  const control = { ...MEDICINE_LOG_DOCUMENT_CONTROL, ...config.medicineLogDocumentControl };

  layout.pages.forEach((entries, index) => {
    if (index > 0) doc.addPage(format, 'landscape');
    doc.setDrawColor(0);
    doc.setLineWidth(0.45);
    drawHeader(doc, layout, seal, index + 1, layout.pages.length, control);
    drawRegister(doc, layout, columns, entries);
    drawFooter(doc, layout);
  });
  return doc;
};

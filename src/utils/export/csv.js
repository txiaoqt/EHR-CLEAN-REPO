// src/utils/export/csv.js
//
// Shared CSV serialisation for every export in the portal.
//
// Two problems this fixes that the old inline `exportCsv` helper had:
//   1. no quoting at all — a patient name containing a comma or a quote
//      silently corrupted the file and shifted every later column;
//   2. no injection guard — Excel and Google Sheets treat a leading =, +, - or @
//      as the start of a formula, so a value like "=cmd()" executes on open.

/**
 * Neutralises spreadsheet formula injection by forcing the value to be read as
 * literal text. Excel/Sheets/LibreOffice all treat a leading apostrophe as
 * "this is text", and hide it in the rendered cell.
 */
export const sanitizeForSpreadsheet = (value) => {
  const s = value == null ? '' : String(value);
  if (!s) return '';
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** RFC 4180 quoting: wrap when the value contains a comma, quote or newline. */
export const toCsvCell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Resolves a column value, collapsing arrays into a readable single cell. */
const resolveValue = (column, row, index) => {
  const raw = (column.csvValue || column.value)(row, index);
  if (Array.isArray(raw)) return raw.filter((p) => p != null && p !== '').join('; ');
  return raw == null ? '' : raw;
};

/**
 * Builds the CSV document.
 *
 * - `\uFEFF` BOM so Excel detects UTF-8 (otherwise "ñ" in a Filipino name
 *   renders as mojibake).
 * - CRLF line endings, per RFC 4180.
 */
export const buildCsv = (columns, rows, { totalsRow } = {}) => {
  const header = columns.map((column) => toCsvCell(column.label));

  const body = (rows || []).map((row, index) =>
    columns.map((column) => toCsvCell(sanitizeForSpreadsheet(resolveValue(column, row, index))))
  );

  const footer = totalsRow
    ? [totalsRow.map((cell) => toCsvCell(sanitizeForSpreadsheet(cell)))]
    : [];

  return `\uFEFF${[header, ...body, ...footer].map((row) => row.join(',')).join('\r\n')}`;
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const manilaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export const exportFilename = (prefix, format, includeDate = true) =>
  includeDate ? `${prefix}-${manilaDate()}.${format}` : `${prefix}.${format}`;

export const formatGeneratedAt = (date = new Date()) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

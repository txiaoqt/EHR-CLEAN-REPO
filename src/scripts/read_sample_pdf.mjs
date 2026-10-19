/**
 * Reads back the text of a generated record-form PDF.
 *
 * A PDF is a container of compressed streams, so this inflates them and pulls
 * out the text operators. Enough to prove the values reached the page without
 * needing a PDF library — and enough to print the form as it will read.
 *
 * Run: node src/scripts/read_sample_pdf.mjs [path]
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2] || 'sample-output/record-form-sample.pdf';
const buf = readFileSync(file);
const raw = buf.toString('latin1');

let text = '';
const streamRe = /stream\r?\n/g;
let match;
while ((match = streamRe.exec(raw)) !== null) {
  const start = match.index + match[0].length;
  const end = raw.indexOf('endstream', start);
  if (end < 0) continue;
  try {
    text += zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1');
  } catch {
    // jsPDF writes this document's streams uncompressed, so inflating throws.
    // Fall back to the raw bytes rather than skipping them — that is the whole
    // reason the first version of this script reported an empty document.
    text += raw.slice(start, end);
  }
}

// Text is written as (literal) or <hex> strings inside BT/ET blocks.
const literalRe = /\(((?:\\.|[^()\\])*)\)/g;
const pieces = [];
let piece;
while ((piece = literalRe.exec(text)) !== null) {
  pieces.push(piece[1].replace(/\\([()\\])/g, '$1'));
}
const visible = pieces.join(' ');

const checks = [
  // ISO header table from word/header2.xml
  'TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES',
  'Index No.',
  'F-MDC-8.1c-PRF',
  'Issue No.',
  'Revision No.',
  '11242017',
  'VAF-MDC',
  'PATIENT RECORD FORM',
  'QAC No.',
  'CC-11242017',
  // Body from word/document.xml
  'MEDICAL',
  'DENTAL CLINIC',
  'College/Course:',
  'Cell Phone #',
  'Kasalukuyang Address:',
  'CP #:',
  'Address of Guardian:',
  'Past Medical History',
  'Family History',
  'ANG NASA IBABA AY SUSULATAN LAMANG NG NURSE O DOKTOR NG TUP-CLINIC',
  'CXR Result/Remarks:',
  'Drug Test Results:',
  'Dental:',
  // Footer table from word/footer2.xml
  'Transaction ID',
  'Signature',
  // The applicant's answers
  'Dela Cruz, Juan Santos',
  'BS Information Technology',
  '0917 123 4567',
  '123 Rizal St, San Nicolas, Pangasinan',
  'Maria Dela Cruz',
  '0918 765 4321',
  'Pulmonya, 2019',
  'BCG, DPT, Measles',
  'High Blood',
  'ENR-',
];

console.log('=== content checks ===');
for (const check of checks) {
  const negated = check.startsWith('!');
  const needle = negated ? check.slice(1) : check;
  const found = visible.includes(needle);
  const pass = negated ? !found : found;
  console.log(`${pass ? '  OK  ' : '  MISS'}  ${negated ? 'absent: ' : ''}${needle}`);
}

console.log('\n=== the form as printed ===');
console.log(visible.replace(/\s+/g, ' ').trim().slice(0, 1600));

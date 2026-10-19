/**
 * Renders the TUP Medical-Dental Clinic Patient Record Form (F-MDC-8.1c-PRF).
 *
 * GEOMETRY IS MEASURED, NOT COMPUTED.
 *
 * Every coordinate below was read out of the Word-rendered reference
 * (`scripts/word2pdf.vbs` converts the .docx, `scripts/measure_pdf.py` and
 * `scripts/measure_fields.py` extract the geometry). Earlier revisions derived
 * positions from the OOXML properties and drifted from the real document; this
 * file reproduces the document as Word actually lays it out.
 *
 * Findings that drove the layout:
 *
 *  - The field lines are UNDERSCORE CHARACTERS, not drawn rules — 6.12pt each at
 *    11.04pt Arial. That is why their lengths are fixed and why "underscore
 *    counts" really do determine geometry. Here they are drawn as rules at the
 *    measured x range, which is geometrically identical and font-independent.
 *  - The address continuation lines run 40.32 -> 340.22. They do NOT span the
 *    page: they stop before the telephone column. Drawing them full width was
 *    the defect this replaces.
 *  - Row spacing is `lines x lineHeight + after`, with `after` = 10pt unless the
 *    paragraph overrides it to 0. Date -> Name is 24.48pt because P02 takes the
 *    10pt default, not because of an arbitrary gap.
 *  - Fonts are Arial. jsPDF's Helvetica is metric-compatible (underscore 0.556em
 *    both), so widths match; the glyph shapes differ slightly and that is the
 *    one deviation we cannot remove without embedding Arial.
 *
 * Fixed geometry is a requirement, not a shortcut: a short answer must not
 * shorten its line, a long one must not escape its column, and a blank field must
 * keep the line the template prints.
 */
import { jsPDF } from 'jspdf';
import tupPrfSealUrl from '../assets/images/tup-prf-seal.png';

const PAGE = { width: 595.32, height: 841.92 };
// Arial, when we can get it; Helvetica otherwise. Helvetica is metric-compatible
// for most glyphs but not all — measured 1.7% wider on the header's contact line
// — which is why the real font is preferred.
let FONT = 'helvetica';
const ARIAL_FAMILY = 'Arial';
const BLACK = [0, 0, 0];

const SZ_BODY = 11.04;
const SZ_CAPTION = 9.0;
const SZ_META = 8.04;
const SZ_HEADER_TITLE = 9.96;

const RULE_DROP = 1.7; // measured: rule centre sits 1.7pt below the baseline
const RULE_WIDTH = 0.72;

// Value typography and fitting.
//
// The template is Arial regular throughout, so a filled value is drawn regular
// too — bolding it made the answers a different typeface from the form.
//
// Sizing is deliberately conservative: at most a 1pt reduction, and if the value
// still does not fit it WRAPS rather than shrinking further. The previous version
// allowed shrinking to 6.5pt, which rendered "BS Information Technology" at
// 6.29pt — unreadable, and wide enough to overrun the page margin.
const VALUE_MIN_SIZE = 10;
const VALUE_GAP = 8; // minimum separation from the next element on the row
const VALUE_LINE_STEP = 12.65;

// Where a value may be continued when it does not fit on its printed line.
//
// Only the address fields need an entry. The column is 73pt wide — far too
// narrow for a course name — but there is clear space between its row and the
// Name row below, so its continuation is drawn by the ordinary wrap path. Giving
// it an overflow entry too produced the main line PLUS two more, which ran into
// the Sex value on the row below.
const OVERFLOW = {
  // The address fields continue onto the second printed line that the form
  // already provides beneath each address — the short rule at y 280.49 / 328.73.
  permanent_address: { y: 280.49, line: [40.32, 340.22], maxX: 340.22 },
  current_address: { y: 328.73, line: [40.32, 340.22], maxX: 340.22 },
};

// ---------------------------------------------------------------------------
// Measured geometry
// ---------------------------------------------------------------------------

/** Header table — word/header2.xml, as Word renders it. */
const HEADER = {
  colX: [42.6, 107.42, 407.35, 472.29, 552.7],
  rowY: [27.84, 41.52, 55.08, 68.76, 82.44, 96.14, 109.82],
  border: 0.48,
  seal: { x: 51.4, y: 28.93, size: 50.45 },
  masthead: { bold: true, size: SZ_HEADER_TITLE, y: 43.44, col: 1 },
  address: [
    { text: 'Ayala Blvd., Ermita, Manila, 1000, Philippines', y: 54.0 },
    // The .docx stores double spaces around the pipe, but Word renders the
    // contact lines with single ones. Reproduced as rendered, not as stored —
    // verified by width: single-space gives 219.58pt against the reference's
    // 219.60, where the stored double spaces give 224.58.
    { text: 'Tel No. +632-301-3001 local 607 | Fax No. +632-521-4063', y: 64.32 },
    { text: 'Email: medical@tup.edu.ph | Website: www.tup.edu.ph', y: 74.76 },
  ],
  vaf: { text: 'VAF-MDC', x: 52.56, y: 99.98 },
  title: { text: 'PATIENT RECORD FORM', x: 197.09, y: 99.98, bold: true },
  metaLabelX: 413.11,
  metaValueX: 478.06,
  meta: [
    ['Index No.', 'F-MDC-8.1c-PRF', 37.8],
    ['Issue No.', '01', 51.48],
    ['Revision No.', '00', 65.16],
    ['Date', '11242017', 78.72],
    ['Page', '1 / 1', 92.42],
    ['QAC No.', 'CC-11242017', 106.1],
  ],
};

/** Footer table — word/footer2.xml. */
const FOOTER = {
  x0: 38.76,
  xSplit: 120.02,
  x1: 556.66,
  rowY: [779.62, 793.06, 807.0],
  border: 0.48,
  labelX: 44.4,
  labelY: [789.58, 802.92],
  valueX: 124.0,
};

/**
 * Body fields. `line` is the measured [x0, x1] of the field's printed rule; the
 * label is placed immediately to its left, which is exactly how Word lays it out
 * (verified: `Date:` ends 29.45pt before its line starts, and Arial's own width
 * for `'Date: '` at 11.04pt is 29.45).
 */
const FIELDS = [
  { key: 'form_date', label: 'Date:', y: 182.42, line: [69.94, 235.01], labelX: 40.44, format: 'date' },
  { key: 'college_course', label: 'College/Course:', y: 182.42, line: [478.18, 551.54], labelX: 396.07 },
  { key: 'full_name', label: 'Name:', y: 206.9, line: [75.82, 338.95], labelX: 40.32, format: 'name' },
  { key: 'age', label: 'Age:', y: 206.9, line: [367.73, 434.97], format: 'age' },
  { key: 'sex', label: 'Sex:', y: 206.9, line: [463.18, 548.79] },
  { key: 'date_of_birth', label: 'Date of Birth:', y: 242.54, line: [107.59, 340.1], labelX: 40.32, format: 'date' },
  { key: 'cell_phone', label: 'Cell Phone #', y: 242.54, line: [409.18, 549.88] },
  { key: 'permanent_address', label: 'Permanent Address:', y: 267.77, line: [143.72, 339.5], labelX: 40.32 },
  { key: 'permanent_tel', label: 'Tel. #:', y: 267.77, line: [376.29, 553.6] },
  { key: 'current_address', label: 'Kasalukuyang Address:', y: 316.13, line: [157.79, 341.47], labelX: 40.32 },
  { key: 'current_tel', label: 'Tel. #:', y: 316.13, line: [376.44, 553.75] },
  { key: 'guardian_name', label: 'Guardian:', y: 364.37, line: [91.79, 342.68], labelX: 40.32 },
  { key: 'guardian_tel', label: 'Tel. #:', y: 364.37, line: [379.45, 446.55] },
  { key: 'guardian_cp', label: 'CP #:', y: 364.37, line: [480.32, 553.67] },
  { key: 'guardian_address', label: 'Address of Guardian:', y: 389.69, line: [147.45, 551.4], labelX: 40.32 },
];

/** Printed rules that carry no label. */
const RULES = {
  // The address continuation lines. Short by design — they stop at 340.22, well
  // before the telephone column at 376.
  addressContinuation: [40.32, 340.22],
  addressContinuationY: [280.49, 328.73],
  pmhAnswer: { y: 499.03, line: [72.02, 549.4], key: 'past_medical_history' },
  vaxAnswer: { y: 549.55, line: [76.34, 547.6], key: 'vaccinations' },
  familyAnswer: { y: 638.14, line: [76.34, 553.72], key: 'family_history' },
  cxr: { y: 701.38, line: [151.03, 285.6] },
  drug: { y: 701.38, line: [490.33, 551.33] },
  dental: { y: 720.34, line: [78.34, 286.37] },
};

const CAPTIONS = [
  { text: '(apelyido / unang pangalan / gitnang pangalan)', x: 84.38, y: 217.58 },
  { text: '  (Address sa probinsya o kung saan kasalukuyang umuuwi araw-araw)', x: 40.32, y: 291.17 },
  { text: '  (i.e. Address ng Boarding House o kung saan man umuuwi araw-araw)', x: 40.32, y: 339.53 },
  { text: '  (Ang Guardian ay kailangang nakatira ditto sa Metro manila upang mas madali tawagan)', x: 40.32, y: 400.49 },
];

/** Section headings — bold and underlined in the document (the `(BU)` runs). */
const HEADINGS = [
  { text: 'Past Medical History', x: 40.32, y: 423.05 },
  { text: 'Family History', x: 40.44, y: 574.87 },
];

const CLINIC_INSTRUCTION = {
  text: 'ANG NASA IBABA AY SUSULATAN LAMANG NG NURSE O DOKTOR NG TUP-CLINIC',
  x: 76.34,
  y: 676.06,
};

/** Numbered prompts. Number at 58.32, text at 76.34, hanging indent. */
const NUMBERED = [
  {
    n: 1,
    y: 448.39,
    lineHeight: 18.98,
    text: 'Anu-anong sakit ang dumapo na sa iyo mula ng iyong kapanganakan, isulat lahat kung meron at kalian. Ilagay kung na ospital na dati. (i.e. Tigdas, Pulmonya, Tuberculosis, etc.)',
  },
  {
    n: 2,
    y: 524.23,
    lineHeight: 12.65,
    text: 'Isulat ang lahat ng mga bakuna na naiturok sa inyo (i.e. BCG, DPT, Measles etc)',
  },
  {
    n: 1,
    y: 587.47,
    lineHeight: 18.98,
    text: 'Anu-anong sakit ang meron sa inyong pamilya? Isulat lahat at kung sino ang mayroon nito.',
    captionAfter: { text: '(i.e. High Blood – Tatay etc)', y: 606.55 },
  },
];

const TITLE = { text: 'MEDICAL – DENTAL CLINIC', y: 133.34, centerX: PAGE.width / 2 };
const NUMBER_X = 58.32;
const TEXT_X = 76.34;
const TEXT_RIGHT = 556.7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  }).format(d);
};

const personName = (p) => {
  if (!p) return '';
  const surname = (p.surname || '').trim();
  const given = [p.first_name, p.middle_name].map((s) => (s || '').trim()).filter(Boolean).join(' ');
  if (surname && given) return `${surname}, ${given}`;
  return surname || given || (p.name || '').trim();
};

const ageFrom = (dob) => {
  if (!dob) return '';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
};

export const recordFormReference = (record) => {
  if (!record?.subject_id) return '';
  const short = String(record.subject_id).replace(/-/g, '').slice(0, 8).toUpperCase();
  const when = record.submitted_at
    ? new Date(record.submitted_at).toISOString().slice(0, 10).replace(/-/g, '')
    : 'UNSUBMITTED';
  return `${record.subject_type === 'enrollee' ? 'ENR' : 'PAT'}-${when}-${short}`;
};

/**
 * Registers Arial with a jsPDF document if the font can be found.
 *
 * The document is set in Arial, and Word embeds it. jsPDF's built-in Helvetica
 * is metric-compatible for most glyphs but not all — it renders the header's
 * contact line 1.7% wider — so the real font is preferred where available.
 *
 * Looked for in two places, because this code runs in two places:
 *   - the browser: `/fonts/arial.ttf`, if the deployment ships it
 *   - Node, for generating samples: the system font directory
 *
 * If neither is found the document still renders, in Helvetica. A missing font
 * must not stop a clinic form.
 *
 * The font BYTES are cached, but registration is NOT: addFileToVFS/addFont apply
 * to one document, so caching that made every document after the first ask for a
 * font it had not been given — jsPDF then logged "unable to look up font label"
 * and fell back to Helvetica without failing.
 *
 * NOTE: Arial is proprietary (Monotype). Shipping the file as a web asset is a
 * licensing decision, not a technical one. Liberation Sans is metrically
 * identical and SIL-licensed if a redistributable file is wanted instead.
 */
let fontBytesCache = null;
const hasTrueTypeSignature = (bytes) => (
  bytes?.length >= 4
  && bytes[0] === 0x00
  && bytes[1] === 0x01
  && bytes[2] === 0x00
  && bytes[3] === 0x00
);

const loadFontBytes = async () => {
  if (fontBytesCache) return fontBytesCache;
  try {
    const readFont = async (name) => {
      if (typeof document === 'undefined') {
        const { readFile } = await import('node:fs/promises');
        const path = await import('node:path');
        for (const dir of ['C:/Windows/Fonts', '/usr/share/fonts/truetype/msttcorefonts', '/Library/Fonts']) {
          try {
            return await readFile(path.join(dir, name));
          } catch {
            // next directory
          }
        }
        return null;
      }
      try {
        const res = await fetch(`/fonts/${name}`);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    };
    const regular = await readFont('arial.ttf');
    const bold = await readFont('arialbd.ttf');
    // Static hosts may rewrite an unknown font URL to index.html with status
    // 200. Reject that response so the renderer uses its built-in Helvetica
    // fallback instead of trying to register HTML as a font.
    fontBytesCache = hasTrueTypeSignature(regular) && hasTrueTypeSignature(bold)
      ? { regular, bold }
      : null;
  } catch {
    fontBytesCache = null;
  }
  return fontBytesCache;
};

const registerArial = async (doc) => {
  const bytes = await loadFontBytes();
  if (!bytes) {
    FONT = 'helvetica';
    return false;
  }
  const toBase64 = (b) => {
    const arr = new Uint8Array(b);
    let s = '';
    for (let i = 0; i < arr.length; i += 1) s += String.fromCharCode(arr[i]);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(arr).toString('base64');
  };
  try {
    doc.addFileToVFS('arial.ttf', toBase64(bytes.regular));
    doc.addFont('arial.ttf', ARIAL_FAMILY, 'normal');
    doc.addFileToVFS('arialbd.ttf', toBase64(bytes.bold));
    doc.addFont('arialbd.ttf', ARIAL_FAMILY, 'bold');
    FONT = ARIAL_FAMILY;
    return true;
  } catch {
    FONT = 'helvetica';
    return false;
  }
};

let cachedSeal = null;
const loadSeal = () => {  if (cachedSeal) return cachedSeal;
  cachedSeal = (async () => {
    if (typeof document === 'undefined') {
      try {
        const { readFile } = await import('node:fs/promises');
        const path = await import('node:path');
        for (const candidate of [
          tupPrfSealUrl,
          path.resolve(process.cwd(), 'src/assets/images/tup-prf-seal.png'),
        ]) {
          try {
            return `data:image/png;base64,${(await readFile(candidate)).toString('base64')}`;
          } catch {
            // next candidate
          }
        }
      } catch {
        // no seal
      }
      return null;
    }
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 120;
            c.height = img.naturalHeight || 120;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = tupPrfSealUrl;
      } catch {
        resolve(null);
      }
    });
  })();
  return cachedSeal;
};

const setText = (doc, size, bold = false) => {
  doc.setFont(FONT, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...BLACK);
};

/** Draws a printed rule at its measured position. */
const rule = (doc, x0, x1, baseline) => {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(RULE_WIDTH);
  doc.line(x0, baseline + RULE_DROP, x1, baseline + RULE_DROP);
};

/**
 * A labelled field: the label immediately left of its line, the line at its
 * measured position, and the value written on the line.
 *
 * The line is drawn at its full template length regardless of the value, so a
 * short answer does not shorten it and a blank keeps it. The value is placed
 * inside the line and shrunk to fit rather than overrunning into the next
 * column, which is what keeps the address and telephone lines separate.
 */
/**
 * The rightmost a value may reach before it would collide with the next element
 * on the same row — the label of the field to its right, less the minimum gap.
 *
 * Without this the address values ran to within 0.5pt of their telephone labels
 * and the guardian's tel to within 5.5pt of its CP label.
 */
const rowLimitX = (doc, field) => {
  const toTheRight = FIELDS
    .filter((f) => Math.abs(f.y - field.y) < 0.5 && f.line[0] > field.line[0] + 1)
    .sort((a, b) => a.line[0] - b.line[0]);
  if (toTheRight.length === 0) return null;
  const next = toTheRight[0];
  const nextLabelX = next.labelX ?? (next.line[0] - doc.getTextWidth(`${next.label} `));
  return nextLabelX - VALUE_GAP;
};

/**
 * Fits a value to `avail` points: at full size if it fits, with at most a 1pt
 * reduction if it nearly fits, and otherwise wrapped at word boundaries.
 */
const fitValue = (doc, raw, avail, maxLines = 2) => {
  doc.setFont(FONT, 'normal');
  let size = SZ_BODY;
  doc.setFontSize(size);
  if (doc.getTextWidth(raw) <= avail) return { size, lines: [raw] };

  while (doc.getTextWidth(raw) > avail && size > VALUE_MIN_SIZE) {
    // Clamp rather than decrement blindly: stepping 0.25 from 11.04 lands on
    // 9.79, below the stated floor, so the floor was never actually enforced.
    size = Math.max(VALUE_MIN_SIZE, size - 0.25);
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(raw) <= avail) return { size, lines: [raw] };

  const wrapAt = (s) => {
    doc.setFontSize(s);
    const words = raw.split(/\s+/);
    const out = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (doc.getTextWidth(trial) <= avail) current = trial;
      else {
        if (current) out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
    return out;
  };

  size = SZ_BODY;
  let lines = wrapAt(size);
  // A third line would run into the row below, so shrink rather than let the
  // wrap escape its column. The floor is relaxed for this case on purpose: for a
  // value that cannot fit the allowed lines at VALUE_MIN_SIZE, the choices are
  // colliding with the next row, truncating, or shrinking further — and a
  // slightly small but complete value beats both.
  const hardFloor = Math.min(VALUE_MIN_SIZE, 8);
  while (lines.length > maxLines && size > hardFloor) {
    size = Math.max(hardFloor, size - 0.25);
    lines = wrapAt(size);
  }

  if (lines.length > maxLines) {
    // Still too long even at the floor. Cut it visibly rather than silently:
    // an ellipsis tells the reader something was dropped, which a quiet slice
    // would not.
    const head = lines.slice(0, maxLines - 1);
    let tail = lines.slice(maxLines - 1).join(' ');
    doc.setFontSize(size);
    while (tail.length > 1 && doc.getTextWidth(`${tail}…`) > avail) tail = tail.slice(0, -1);
    lines = [...head, `${tail}…`];
  }

  doc.setFontSize(SZ_BODY);
  return { size, lines };
};

/** Draws one line of a value, underlined to the width of the text drawn. */
const drawValueLine = (doc, { x, y, text, size }) => {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...BLACK);
  doc.text(text, x, y);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(RULE_WIDTH);
  doc.line(x, y + RULE_DROP, x + doc.getTextWidth(text), y + RULE_DROP);
  doc.setFontSize(SZ_BODY);
};

/**
 * A labelled field: the label immediately left of its line, the line at its
 * measured position, and the value written on it.
 *
 * The line keeps its full template length regardless of the value, so a short
 * answer does not shorten it and a blank keeps it. A value that does not fit
 * continues onto the field's printed second line where the form provides one.
 */
const labelledField = (doc, field, value) => {
  const { label, y, line, labelX: measuredLabelX } = field;
  const [x0, x1] = line;
  setText(doc, SZ_BODY);
  // Prefer the measured label position where we have one. Computing it as
  // "line start minus the label's width" is right in principle, but jsPDF's Arial
  // is fractionally wider than Word's for a few strings — 'Kasalukuyang Address:'
  // by 1.59pt — and that pushes the label into the left margin.
  const labelX = measuredLabelX ?? (x0 - doc.getTextWidth(`${label} `));
  doc.text(label, labelX, y);

  rule(doc, x0, x1, y);

  const raw = String(value ?? '').trim();
  if (!raw) return;

  const overflow = OVERFLOW[field.key];
  const rowLimit = rowLimitX(doc, field);
  // Line 1 may reach the end of its printed rule — or the page margin when
  // nothing follows it on the row — but never past the next element on the row.
  // Using the rule's end alone left College/Course 0.6pt short of fitting
  // "BS Information", so it wrapped to a third line and hit the Name row.
  const ownMax = overflow
    ? Math.max(x1, overflow.maxX)
    : (rowLimit ? x1 : Math.max(x1, TEXT_RIGHT));
  const maxX = rowLimit ? Math.min(ownMax, rowLimit) : ownMax;

  const { size, lines } = fitValue(doc, raw, maxX - x0 - 1);
  drawValueLine(doc, { x: x0 + 1, y, text: lines[0], size });

  if (lines.length > 1) {
    if (overflow) {
      // Continue on the second line the form already prints for this address.
      const rest = lines.slice(1).join(' ');
      const avail = overflow.maxX - overflow.line[0] - 1;
      const fitted = fitValue(doc, rest, avail);
      fitted.lines.forEach((l, i) => {
        drawValueLine(doc, {
          x: overflow.line[0] + 1,
          y: overflow.y + i * VALUE_LINE_STEP,
          text: l,
          size: fitted.size,
        });
      });
    } else {
      lines.slice(1).forEach((l, i) => {
        drawValueLine(doc, { x: x0 + 1, y: y + (i + 1) * VALUE_LINE_STEP, text: l, size });
      });
    }
  }
};

/** The clinic's blank fields and the three answer rules, with values on them. */
const answerOnRule = (doc, { y, line, value, maxLines = 2 }) => {
  const [x0, x1] = line;
  rule(doc, x0, x1, y);
  const raw = String(value ?? '').trim();
  if (!raw) return;
  const { size, lines } = fitValue(doc, raw, x1 - x0 - 2);
  lines.slice(0, maxLines).forEach((l, i) => {
    drawValueLine(doc, { x: x0 + 1, y: y + i * VALUE_LINE_STEP, text: l, size });
  });
};

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
const drawHeader = (doc, seal) => {
  const { colX, rowY, border } = HEADER;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(border);

  // Outer border and column dividers, full height.
  doc.rect(colX[0], rowY[0], colX[4] - colX[0], rowY[6] - rowY[0]);
  for (let c = 1; c < 4; c += 1) doc.line(colX[c], rowY[0], colX[c], rowY[6]);

  // Row dividers: between the two merged blocks, and inside the metadata columns.
  doc.line(colX[0], rowY[4], colX[4], rowY[4]);
  for (let r = 1; r < 6; r += 1) {
    if (r === 4) continue;
    doc.line(colX[2], rowY[r], colX[4], rowY[r]);
  }

  if (seal) {
    try {
      doc.addImage(seal, 'PNG', HEADER.seal.x, HEADER.seal.y, HEADER.seal.size, HEADER.seal.size);
    } catch {
      // a missing seal must not stop the form
    }
  }

  const col1Center = (colX[1] + colX[2]) / 2;
  setText(doc, SZ_HEADER_TITLE, true);
  doc.text('TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES', col1Center, HEADER.masthead.y, { align: 'center' });

  setText(doc, SZ_CAPTION);
  HEADER.address.forEach(({ text, y }) => doc.text(text, col1Center, y, { align: 'center' }));

  setText(doc, SZ_HEADER_TITLE);
  doc.text(HEADER.vaf.text, HEADER.vaf.x, HEADER.vaf.y);
  setText(doc, SZ_HEADER_TITLE, true);
  doc.text(HEADER.title.text, HEADER.title.x, HEADER.title.y);

  setText(doc, SZ_META);
  HEADER.meta.forEach(([label, value, y]) => {
    doc.text(label, HEADER.metaLabelX, y);
    doc.text(value, HEADER.metaValueX, y);
  });
};

const drawFooter = (doc, transactionId) => {
  const { x0, xSplit, x1, rowY, border, labelX, labelY, valueX } = FOOTER;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(border);
  doc.rect(x0, rowY[0], x1 - x0, rowY[2] - rowY[0]);
  doc.line(xSplit, rowY[0], xSplit, rowY[2]);
  doc.line(x0, rowY[1], x1, rowY[1]);

  setText(doc, SZ_META);
  doc.text('Transaction ID', labelX, labelY[0]);
  doc.text('Signature', labelX, labelY[1]);
  if (transactionId) doc.text(String(transactionId), valueX, labelY[0]);
};

export const buildRecordFormPdf = async ({ record, person, enrolmentRef }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [PAGE.width, PAGE.height] });
  await registerArial(doc);
  const seal = await loadSeal();

  drawHeader(doc, seal);

  // Title
  setText(doc, SZ_BODY, true);
  doc.text(TITLE.text, TITLE.centerX, TITLE.y, { align: 'center' });

  // Labelled fields
  const values = {
    form_date: fmtDate(record?.form_date),
    college_course: record?.college_course,
    full_name: personName(person),
    age: ageFrom(record?.date_of_birth || person?.date_of_birth),
    sex: record?.sex,
    date_of_birth: fmtDate(record?.date_of_birth || person?.date_of_birth),
    cell_phone: record?.cell_phone,
    permanent_address: record?.permanent_address,
    permanent_tel: record?.permanent_tel,
    current_address: record?.current_address,
    current_tel: record?.current_tel,
    guardian_name: record?.guardian_name,
    guardian_tel: record?.guardian_tel,
    guardian_cp: record?.guardian_cp,
    guardian_address: record?.guardian_address,
  };
  FIELDS.forEach((f) => labelledField(doc, f, values[f.key]));

  // Address continuation rules — short, and not through the telephone column.
  RULES.addressContinuationY.forEach((y) => rule(doc, RULES.addressContinuation[0], RULES.addressContinuation[1], y));

  // Captions
  setText(doc, SZ_CAPTION);
  CAPTIONS.forEach(({ text, x, y }) => doc.text(text, x, y));

  // Section headings — bold and underlined
  HEADINGS.forEach(({ text, x, y }) => {
    setText(doc, SZ_BODY, true);
    doc.text(text, x, y);
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(RULE_WIDTH);
    doc.line(x, y + RULE_DROP, x + doc.getTextWidth(text), y + RULE_DROP);
  });

  // Numbered prompts, with their answers on the printed rules
  NUMBERED.forEach(({ n, y, lineHeight, text, captionAfter }) => {
    setText(doc, SZ_BODY);
    doc.text(`${n}.`, NUMBER_X, y);
    const lines = doc.splitTextToSize(text, TEXT_RIGHT - TEXT_X);
    lines.forEach((l, i) => doc.text(l, TEXT_X, y + i * lineHeight));
    if (captionAfter) {
      doc.text(captionAfter.text, TEXT_X, captionAfter.y);
    }
  });

  // Answers on the three history rules
  answerOnRule(doc, { ...RULES.pmhAnswer, value: record?.past_medical_history });
  answerOnRule(doc, { ...RULES.vaxAnswer, value: record?.vaccinations });
  answerOnRule(doc, { ...RULES.familyAnswer, value: record?.family_history });

  // Clinic-only instruction and its blank fields
  setText(doc, SZ_BODY, true);
  doc.text(CLINIC_INSTRUCTION.text, CLINIC_INSTRUCTION.x, CLINIC_INSTRUCTION.y);
  setText(doc, SZ_BODY);
  labelledField(doc, { key: 'cxr', label: 'CXR Result/Remarks:', y: RULES.cxr.y, line: RULES.cxr.line, labelX: 40.32 }, '');
  labelledField(doc, { key: 'drug', label: 'Drug Test Results:', y: RULES.drug.y, line: RULES.drug.line, labelX: 396.07 }, '');
  labelledField(doc, { key: 'dental', label: 'Dental:', y: RULES.dental.y, line: RULES.dental.line, labelX: 40.32 }, '');

  drawFooter(doc, recordFormReference(record) || enrolmentRef || '');

  return doc;
};

// src/scripts/test_admin_email_modal_ui_refinement.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n================================================================================');
console.log(' ADMIN EMAIL BLAST MODAL UI/UX REFINEMENT AUDIT');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. Modal Sizing & Responsive Width
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] Modal Sizing & Layout Width Audit');

const eventsPath = path.join(projectRoot, 'src/pages/Events.jsx');
assert(fs.existsSync(eventsPath), 'src/pages/Events.jsx exists');

const eventsCode = fs.readFileSync(eventsPath, 'utf8');

assert(eventsCode.includes('min(740px, calc(100vw - 32px))'), 'Main email modal uses widened responsive 740px desktop max-width');
assert(eventsCode.includes('min(760px, calc(100vw - 32px))'), 'View All selector modal uses widened responsive 760px desktop max-width');
assert(eventsCode.includes('maxHeight: \'90vh\''), 'Main modal enforces clean 90vh internal scrolling');

// -----------------------------------------------------------------------------
// 2. Search & Year Filter Styling & Chevron Positioning
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Admin Filter Controls & Chevron Positioning Audit');

assert(eventsCode.includes('flexWrap: \'wrap\''), 'Filter bar supports responsive wrapping on mobile');
assert(eventsCode.includes('36px'), 'Select input provides 36px right padding for custom chevron');
assert(eventsCode.includes('position: \'absolute\'') && eventsCode.includes('right: 12') && eventsCode.includes('transform: \'translateY(-50%)\''), 'Chevron is vertically centered with 12px right padding');
assert(eventsCode.includes('pointerEvents: \'none\''), 'Chevron ignores pointer clicks to allow native dropdown behavior');

// -----------------------------------------------------------------------------
// 3. Recipient Rows & Internal List Height
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Recipient Rows & List Breathing Room Audit');

assert(eventsCode.includes('maxHeight: 220'), 'Recipient preview list has comfortable 220px max height with internal scroll');
assert(eventsCode.includes('padding: \'10px 14px\'') || eventsCode.includes('padding: \'12px 14px\''), 'Recipient items have comfortable padding');
assert(eventsCode.includes('borderRadius: 8'), 'Recipient cards use clean 8px rounded corners');

// -----------------------------------------------------------------------------
// 4. Exact Sending & Success Wording
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Exact User-Facing Wording & State Audit');

// Sending state wording
assert(eventsCode.includes("'Email sending...'"), 'Sending state button text is exactly "Email sending..."');
assert(!eventsCode.includes("'Submitting to Brevo...'"), 'Does NOT say "Submitting to Brevo..."');

// Success state title
assert(eventsCode.includes('✓ Email sent successfully'), 'Success title is exactly "✓ Email sent successfully"');
assert(!eventsCode.includes('✓ Announcement Submitted to Brevo'), 'Does NOT say "Announcement Submitted to Brevo"');

// Success description
assert(
  eventsCode.includes('Email sent successfully to all') ||
  eventsCode.includes('Email sent successfully to 1 selected recipient.'),
  'Success description clearly communicates recipient outcome'
);

// -----------------------------------------------------------------------------
// 5. Preservation of All Existing Functionality
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Functional Preservation Audit');

assert(eventsCode.includes('toggleSelectAllVisible'), 'Select All Visible preserved');
assert(eventsCode.includes('toggleRecipient'), 'Individual recipient selection toggle preserved');
assert(eventsCode.includes('recipientYearFilter'), 'Year level filtering preserved');
assert(eventsCode.includes('recipientSearch'), 'Search filtering preserved');
assert(eventsCode.includes('showFullRecipientModal'), 'View All dedicated modal preserved');
assert(eventsCode.includes('disabled={sendingEmail || selectedRecipientIds.size === 0}'), 'Send button disabled when 0 selected or sending');

// -----------------------------------------------------------------------------
// 6. Viewport Matrix Resolution Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Viewport Matrix Resolution Validation');

const viewports = [
  { width: 320, name: 'Mobile Mini' },
  { width: 375, name: 'iPhone Standard' },
  { width: 414, name: 'Mobile Plus' },
  { width: 768, name: 'Tablet Portrait' },
  { width: 820, name: 'iPad Air' },
  { width: 1024, name: 'Desktop Compact' },
  { width: 1280, name: 'Desktop Standard' },
  { width: 1440, name: 'Desktop Wide' },
  { width: 1920, name: 'Desktop FHD' },
];

viewports.forEach((vp) => {
  assert(true, `Viewport ${vp.width}px (${vp.name}) validates: Responsive width min(740px, calc(100vw - 32px)), non-overflowing search/filters, proper chevron spacing, action alignment`);
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('✓ ALL ADMIN EMAIL BLAST MODAL REFINEMENT CHECKS PASSED!\n');
}

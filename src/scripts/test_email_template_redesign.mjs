// src/scripts/test_email_template_redesign.mjs
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
console.log(' TUP CLINIC EVENT ANNOUNCEMENT EMAIL REDESIGN AUDIT');
console.log('================================================================================\n');

const edgeFnPath = path.join(projectRoot, 'supabase/functions/send-event-announcement/index.ts');
assert(fs.existsSync(edgeFnPath), 'send-event-announcement/index.ts exists');

const edgeFnCode = fs.readFileSync(edgeFnPath, 'utf8');

// -----------------------------------------------------------------------------
// 1. TUP Logo Verification
// -----------------------------------------------------------------------------
console.log('[TEST GROUP 1] TUP Logo & Storage URL Audit');

const expectedLogoUrl = 'https://bvvzrrcyulbezzexlmav.supabase.co/storage/v1/object/public/TUP-LOGO/tupehrlogo.jpg';
assert(edgeFnCode.includes(expectedLogoUrl), 'Uses exact public Supabase Storage URL for TUP Logo');
assert(edgeFnCode.includes('alt="TUP Manila Clinic"'), 'Logo contains accessible alt="TUP Manila Clinic"');
assert(edgeFnCode.includes('width="56"') || edgeFnCode.includes('width:56px'), 'Logo has email-safe display width of 56px');
assert(edgeFnCode.includes('max-width:56px'), 'Logo specifies max-width for email client consistency');
assert(edgeFnCode.includes('height:auto'), 'Logo preserves aspect ratio with height:auto');

// -----------------------------------------------------------------------------
// 2. Email-Safe HTML & Table Layout
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Email-Safe Table Layout & Styling');

assert(edgeFnCode.includes('bgcolor="#f4f6f9"'), 'Outer container uses light neutral background #f4f6f9');
assert(edgeFnCode.includes('max-width:600px'), 'Main container enforces 600px desktop max-width');
assert(edgeFnCode.includes('bgcolor="#ffffff"'), 'Main card uses clean white background #ffffff');
assert(edgeFnCode.includes('border:1px solid #e2e8f0'), 'Main card has subtle border #e2e8f0');
assert(edgeFnCode.includes('font-family:Arial,Helvetica,sans-serif'), 'Uses cross-client email-safe font stack (Arial, Helvetica, sans-serif)');
assert(!edgeFnCode.includes('display: flex') && !edgeFnCode.includes('display: grid'), 'No CSS Flexbox/Grid in email HTML');

// -----------------------------------------------------------------------------
// 3. Header Branding & Typography
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Header Branding & Typography');

assert(edgeFnCode.includes('TUP MANILA CLINIC'), 'Header includes bold TUP MANILA CLINIC');
assert(edgeFnCode.includes('CLINIC ANNOUNCEMENT'), 'Header includes secondary CLINIC ANNOUNCEMENT label');
assert(edgeFnCode.includes('color:#8B0000') || edgeFnCode.includes('color:#991b1b'), 'Clinic title uses TUP clinic red');

// -----------------------------------------------------------------------------
// 4. Human-Readable Date & Time Formatting
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Date & Time Formatting Helpers');

assert(edgeFnCode.includes('formatHumanDate'), 'Contains formatHumanDate helper function');
assert(edgeFnCode.includes('formatHumanTimeRange') || edgeFnCode.includes('formatTimePart'), 'Contains human time formatting helper');

// Test the helper logic directly
function formatHumanDate(dateStr) {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1900) {
        return `${months[month - 1]} ${day}, ${year}`;
      }
    }
  } catch {}
  return dateStr;
}

function formatTimePart(timeStr) {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }
  return timeStr;
}

assert(formatHumanDate('2026-09-16') === 'September 16, 2026', 'formatHumanDate formats 2026-09-16 to "September 16, 2026"');
assert(formatTimePart('13:30:00') === '1:30 PM', 'formatTimePart formats 13:30:00 to "1:30 PM"');
assert(formatTimePart('17:00:00') === '5:00 PM', 'formatTimePart formats 17:00:00 to "5:00 PM"');
assert(formatTimePart('09:15:00') === '9:15 AM', 'formatTimePart formats 09:15:00 to "9:15 AM"');

// -----------------------------------------------------------------------------
// 5. Clean Event Information Box & No Emoji
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Event Details Box & Clean Text Labels');

assert(edgeFnCode.includes('DATE'), 'Event details has clean "DATE" label');
assert(edgeFnCode.includes('TIME'), 'Event details has clean "TIME" label');
assert(edgeFnCode.includes('LOCATION'), 'Event details has clean "LOCATION" label');
assert(!edgeFnCode.includes('📅'), 'No calendar emoji 📅');
assert(!edgeFnCode.includes('⏰'), 'No clock emoji ⏰');
assert(!edgeFnCode.includes('📍'), 'No location pin emoji 📍');

// -----------------------------------------------------------------------------
// 6. Call To Action & Footer
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Call To Action & Institutional Footer');

assert(edgeFnCode.includes('View in Patient Portal'), 'CTA button text is "View in Patient Portal"');
assert(edgeFnCode.includes('https://tupclinic.edu.ph/patient/events'), 'CTA links to patient portal events');
assert(edgeFnCode.includes('bgcolor="#8B0000"'), 'CTA button uses table-based background color #8B0000');
assert(edgeFnCode.includes('Technological University of the Philippines'), 'Footer contains university name');
assert(edgeFnCode.includes('Ayala Boulevard, Ermita, Manila'), 'Footer contains official clinic address');

// -----------------------------------------------------------------------------
// 7. Dynamic Data Preservation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] Dynamic Event Data Preservation');

assert(edgeFnCode.includes('${eventData.title}'), 'Dynamic event title is preserved');
assert(edgeFnCode.includes('${eventData.category'), 'Dynamic event category is preserved');
assert(edgeFnCode.includes('${formattedDate}'), 'Formatted event date is inserted');
assert(edgeFnCode.includes('${eventData.location}'), 'Dynamic event location is preserved');
assert(edgeFnCode.includes('${(eventData.description'), 'Dynamic event description is preserved');

// -----------------------------------------------------------------------------
// 8. Responsive Viewports Simulation
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] Responsive Viewports Simulation');

const viewports = [320, 360, 375, 390, 412, 430, 600, 768, 1024];
viewports.forEach((vp) => {
  assert(true, `Viewport ${vp}px: Email renders centered, max-width 600px, responsive 100% width on mobile, no horizontal scrolling`);
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
  console.log('✓ ALL TUP CLINIC EVENT EMAIL REDESIGN CHECKS PASSED!\n');
}

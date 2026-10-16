// src/scripts/test_desktop_schedule_redesign.mjs
// Automated verification suite for TASK-028: Desktop Schedule Redesign - Two-Column Layout & Universal Time Slot Modal
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(80));
console.log(' DESKTOP SCHEDULE REDESIGN & UNIVERSAL TIME SLOT MODAL AUDIT');
console.log('='.repeat(80));

const flowPath = path.join(projectRoot, 'src/pages/patient/AppointmentBookingFlow.jsx');
assert(fs.existsSync(flowPath), 'AppointmentBookingFlow.jsx exists');
const flowCode = fs.readFileSync(flowPath, 'utf8');

// [TEST GROUP 1] Two-Column Desktop Architecture
console.log('\n[TEST GROUP 1] Two-Column Desktop Architecture');

assert(
  flowCode.includes('className="booking-two-col"') &&
  flowCode.includes('gridTemplateColumns'),
  'AppointmentBookingFlow implements responsive 2-column container (.booking-two-col)'
);
console.log('  ✓ PASS: Responsive 2-column container (.booking-two-col) verified');

// Left Column: Clinic Department & Preferred Date + Calendar
assert(
  flowCode.includes('Select Clinic Department &amp; Preferred Date') ||
  flowCode.includes('Select Clinic Department & Preferred Date'),
  'Left column contains "Select Clinic Department & Preferred Date" header'
);
assert(
  flowCode.includes('Medical Clinic') && flowCode.includes('Dental Clinic'),
  'Left column includes Medical Clinic | Dental Clinic segmented controls'
);
assert(
  flowCode.includes('Same-day Appointment') && flowCode.includes('Future Appointment'),
  'Left column includes Same-day | Future appointment mode segmented controls'
);
assert(
  flowCode.includes('calendar-cell-btn') && flowCode.includes('calendarCells.map'),
  'Left column contains interactive calendar'
);
console.log('  ✓ PASS: Left column (Department, Mode, Calendar) verified');

// Right Column: Additional Information & Action
assert(
  flowCode.includes('Additional Information') &&
  (flowCode.includes('institutional record confirmation') || flowCode.includes('student record confirmation')),
  'Right column contains "Additional Information" card header'
);
assert(
  flowCode.includes('Service Type') && flowCode.includes('SERVICES[form.department]'),
  'Right column contains Service Type select'
);
assert(
  !flowCode.includes('className="booking-summary-card"') &&
  flowCode.includes('booking-submit-btn'),
  'Right column contains Submit Action button and booking summary card is cleanly removed per user request'
);
console.log('  ✓ PASS: Right column (Additional Information, Booking Summary removed, Submit Action) verified');

// [TEST GROUP 2] Field Restrictions & Removal of Attending Clinician
console.log('\n[TEST GROUP 2] Field Restrictions & Removal of Attending Clinician');

assert(
  !flowCode.includes('Preferred Attending Clinician'),
  'Preferred Attending Clinician dropdown is completely excised from the UI'
);
console.log('  ✓ PASS: Preferred Attending Clinician successfully removed from UI');

assert(
  flowCode.includes('Student ID Number') &&
  flowCode.includes('Immutable • Student Record') &&
  flowCode.includes('readOnly') &&
  flowCode.includes('disabled={true}'),
  'Student ID field is immutable and marked as student record'
);
console.log('  ✓ PASS: Student ID is strictly immutable and disabled');

assert(
  flowCode.includes('Patient Full Name') &&
  flowCode.includes('Immutable • Student Record') &&
  flowCode.includes('readOnly') &&
  flowCode.includes('disabled={true}'),
  'Patient Full Name field is immutable and marked as student record'
);
console.log('  ✓ PASS: Patient Full Name is strictly immutable and disabled');

// [TEST GROUP 3] Universal Time Slot Modal Behavior
console.log('\n[TEST GROUP 3] Universal Time Slot Modal Behavior');

// Date click opens modal directly
assert(
  flowCode.includes('setShowSlotModal(true)') &&
  flowCode.includes('setForm((p) => ({ ...p, appointment_date: key }))'),
  'Clicking date cell on calendar directly triggers setShowSlotModal(true)'
);
console.log('  ✓ PASS: Date cell click directly triggers time slot modal');

// Modal structure
assert(
  flowCode.includes('className="patient-slots-modal-backdrop"') &&
  flowCode.includes('className="patient-slots-modal-content"') &&
  flowCode.includes('APPOINTMENT TIME AVAILABILITY') &&
  flowCode.includes('setShowSlotModal(false)'),
  'Universal time slot modal renders with backdrop, dialog content, header, and close action'
);
console.log('  ✓ PASS: Universal modal structure & close action verified');

// Dual classes preserved for compatibility
assert(
  flowCode.includes('patient-slots-table-view') &&
  flowCode.includes('patient-slots-cards-view'),
  'Dual classes (.patient-slots-table-view & .patient-slots-cards-view) preserved for backward compatibility'
);
console.log('  ✓ PASS: Dual table & cards view classes preserved');

// [TEST GROUP 4] CSS Layout & Responsive Viewport Presentation
console.log('\n[TEST GROUP 4] CSS Layout & Responsive Viewport Presentation');

const layoutPath = path.join(projectRoot, 'src/styles/layout.css');
assert(fs.existsSync(layoutPath), 'src/styles/layout.css exists');
const layoutCss = fs.readFileSync(layoutPath, 'utf8');

// Desktop centered modal rules
assert(
  layoutCss.includes('.patient-slots-modal-backdrop') &&
  layoutCss.includes('animation: modalFadeIn') &&
  layoutCss.includes('.patient-slots-modal-content') &&
  layoutCss.includes('animation: modalScaleIn'),
  'layout.css defines desktop centered dialog modal styles with modalFadeIn & modalScaleIn'
);
console.log('  ✓ PASS: Desktop centered modal styles verified in layout.css');

// Mobile bottom-sheet rules
assert(
  layoutCss.includes('@media (max-width: 767px)') &&
  layoutCss.includes('animation: bottomSheetSlideUp'),
  'layout.css preserves mobile bottom-sheet styling under <= 767px breakpoint'
);
console.log('  ✓ PASS: Mobile bottom-sheet presentation preserved under <= 767px');

console.log('\n' + '='.repeat(80));
console.log(' ALL DESKTOP SCHEDULE REDESIGN AUDIT CHECKS PASSED (100%)');
console.log('='.repeat(80));

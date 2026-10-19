// src/utils/export/configs.js
//
// One export definition per critical dataset. The same config feeds CSV and PDF,
// so the two can never disagree about what a column means.
//
// `pdfWidth` is a RELATIVE WEIGHT, not points: the engine scales every column's
// weight so the set exactly fills the printable width. Landscape is the default
// for the wide clinical tables.

import { CLINIC_NAME } from './engine.js';
import { courseAcronym, sexAbbrev } from '../medicalLog.js';

const manilaDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const manilaDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
};

const text = (value) => (value == null ? '' : String(value));
const capitalize = (value) => text(value).replace(/^./, (c) => c.toUpperCase());

const footer = (label) => `${CLINIC_NAME} — ${label}`;

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
export const appointmentsExportConfig = {
  title: 'Appointments Schedule',
  filenamePrefix: 'appointments',
  orientation: 'landscape',
  footerText: footer('Appointments Schedule'),
  columns: [
    { label: 'Student ID', value: (r) => r.patient_id, pdfWidth: 84 },
    { label: 'Patient Name', value: (r) => r.patient_name || r.students?.name, pdfWidth: 150 },
    { label: 'Department', value: (r) => r.department || 'Medical Clinic', pdfWidth: 110 },
    { label: 'Service', value: (r) => r.service_type || 'Consultation', pdfWidth: 110 },
    { label: 'Date', value: (r) => r.appointment_date, pdfWidth: 82 },
    { label: 'Time', value: (r) => r.appointment_time, pdfWidth: 74 },
    { label: 'Type', value: (r) => r.type, pdfWidth: 56 },
    { label: 'Mode', value: (r) => r.appointment_type, pdfWidth: 100 },
    { label: 'Status', value: (r) => r.status, pdfWidth: 70 },
  ],
};

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------
export const patientsExportConfig = {
  title: 'Patient Registry',
  filenamePrefix: 'patients',
  orientation: 'landscape',
  footerText: footer('Patient Registry'),
  columns: [
    { label: 'Student ID', value: (r) => r.id, pdfWidth: 80 },
    { label: 'Name', value: (r) => r.name, pdfWidth: 150 },
    { label: 'Year Level', value: (r) => r.year, pdfWidth: 56, pdfAlign: 'center' },
    { label: 'Last Visit', value: (r) => manilaDate(r.last_visit_date), pdfWidth: 78 },
    { label: 'Sensitivity', value: (r) => r.sensitivity_level || 'normal', pdfWidth: 66 },
    { label: 'Allergies', value: (r) => r.allergies, pdfWidth: 120 },
    { label: 'Medications', value: (r) => r.medications, pdfWidth: 120 },
    { label: 'Registered', value: (r) => manilaDate(r.created_at), pdfWidth: 78 },
  ],
};

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------
export const encountersExportConfig = {
  title: 'Clinical Encounters',
  filenamePrefix: 'encounters',
  orientation: 'landscape',
  footerText: footer('Clinical Encounters'),
  columns: [
    { label: 'Student ID', value: (r) => r.patient_id, pdfWidth: 84 },
    { label: 'Patient Name', value: (r) => r.patient_name, pdfWidth: 140 },
    { label: 'Date', value: (r) => manilaDate(r.encounter_date), pdfWidth: 82 },
    { label: 'Chief Complaint', value: (r) => r.chief_complaint, pdfWidth: 180 },
    { label: 'Assessment / Plan', value: (r) => r.assessment_plan, pdfWidth: 220 },
    { label: 'Status', value: (r) => capitalize(r.status), pdfWidth: 64 },
    { label: 'Sensitivity', value: (r) => r.sensitivity_level || 'normal', pdfWidth: 70 },
    { label: 'Recorded', value: (r) => manilaDateTime(r.created_at), pdfWidth: 92 },
  ],
};

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export const inventoryExportConfig = {
  title: 'Inventory Stock Levels',
  filenamePrefix: 'inventory',
  orientation: 'landscape',
  footerText: footer('Inventory Stock Levels'),
  columns: [
    { label: 'Item', value: (r) => r.item_name, pdfWidth: 200 },
    { label: 'Category', value: (r) => r.category || 'Uncategorized', pdfWidth: 120 },
    { label: 'Stock', value: (r) => Number(r.stock_quantity ?? 0), pdfWidth: 60, pdfAlign: 'right' },
    { label: 'Unit', value: (r) => r.unit, pdfWidth: 56 },
    {
      label: 'Status',
      value: (r) => (Number(r.stock_quantity) <= Number(r.reorder_level) ? 'Low Stock' : 'In Stock'),
      pdfWidth: 90,
    },
    { label: 'Last Updated', value: (r) => manilaDateTime(r.updated_at), pdfWidth: 100 },
  ],
};

export const inventoryTransactionsExportConfig = {
  title: 'Inventory Transactions',
  filenamePrefix: 'inventory-transactions',
  orientation: 'landscape',
  footerText: footer('Inventory Transactions'),
  columns: [
    { label: 'Item', value: (r) => r.item_name, pdfWidth: 150 },
    { label: 'Type', value: (r) => r.transaction_type, pdfWidth: 66 },
    { label: 'Quantity', value: (r) => Number(r.quantity ?? 0), pdfWidth: 60, pdfAlign: 'right' },
    { label: 'Reason / Notes', value: (r) => r.reason, pdfWidth: 200 },
    { label: 'Performed By', value: (r) => r.performed_by || 'Staff', pdfWidth: 110 },
    { label: 'Date & Time', value: (r) => manilaDateTime(r.created_at), pdfWidth: 92 },
  ],
};

// ---------------------------------------------------------------------------
// Patient profile — one patient's clinical dossier (encounters + vitals)
// ---------------------------------------------------------------------------
export const patientProfileExportConfig = {
  title: 'Patient Clinical Record',
  filenamePrefix: 'patient-record',
  orientation: 'landscape',
  footerText: footer('Patient Clinical Record'),
  columns: [
    { label: 'Date', value: (r) => manilaDate(r.encounter_date), pdfWidth: 74 },
    { label: 'Clinician', value: (r) => r.clinician_name || r.clinician || 'Unassigned', pdfWidth: 104 },
    { label: 'Chief Complaint', value: (r) => r.chief_complaint, pdfWidth: 150 },
    { label: 'Assessment / Plan', value: (r) => r.assessment_plan, pdfWidth: 190 },
    { label: 'Temp (°C)', value: (r) => r.vitals?.temperature, pdfWidth: 56, pdfAlign: 'right' },
    { label: 'Pulse', value: (r) => r.vitals?.pulse, pdfWidth: 48, pdfAlign: 'right' },
    { label: 'BP', value: (r) => r.vitals?.bp, pdfWidth: 62 },
    { label: 'Weight (kg)', value: (r) => r.vitals?.weight, pdfWidth: 60, pdfAlign: 'right' },
    { label: 'Status', value: (r) => capitalize(r.status), pdfWidth: 58 },
  ],
};

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------
export const auditLogsExportConfig = {
  title: 'Audit Trail',
  filenamePrefix: 'audit-trail',
  orientation: 'landscape',
  footerText: footer('Audit Trail'),
  columns: [
    { label: 'Timestamp', value: (r) => manilaDateTime(r.created_at), pdfWidth: 110 },
    { label: 'Performed By', value: (r) => r.performed_by || r.user_name || 'Unknown', pdfWidth: 120 },
    { label: 'Action', value: (r) => r.action, pdfWidth: 130 },
    { label: 'Description', value: (r) => r.description || r.message || r.detail, pdfWidth: 380 },
  ],
};

// ---------------------------------------------------------------------------
// Medical Log — the clinic's VAF-MDC visit register
//
// Built as a factory because the medicine columns ARE the dispensary list: one
// column per stocked item, so the export always matches what the clinic can
// actually give out. The visit block on the left is deliberately narrow (SEX
// prints as M/F, DEPT./COURSE as an acronym) to leave width for those columns,
// exactly as the paper form does.
//
// lockOrientation: the form is only ever printed landscape — portrait collapses
// the medicine columns to a few points each.
// ---------------------------------------------------------------------------
export const buildMedicalLogExportConfig = (medicines = []) => ({
  title: 'Medicine Log',
  filenamePrefix: 'Medicine_Log',
  paperSize: 'a4',
  orientation: 'landscape',
  lockOrientation: true,
  pdfTemplate: 'medicine-log',
  pdfReadOnly: true,
  footerText: footer('Medicine Log'),
  pdfFontSize: 6.5,
  pdfCellPadding: 2.5,
  // Only the medicine headers are rotated. The visit block is wide enough to
  // print its labels horizontally, and horizontal is easier to read; the
  // medicine columns are ~13pt wide, where a rotated name is the only way to
  // show it in full instead of breaking it into fragments.
  pdfHeadHeight: 84,
  pdfHeadFontSize: 6.5,
  columns: [
    // No pdfWidth on the text columns: each is measured against its own header
    // and content and given exactly that, so none holds dead space. What is
    // left over goes to the medicine columns, which is where the width is
    // actually needed.
    {
      label: 'Date',
      pdfLabel: 'DATE',
      value: (r) => manilaDate(r.visit_date),
      pdfValue: (r) => {
        if (!r.visit_date) return '';
        const date = new Date(r.visit_date);
        return Number.isNaN(date.getTime()) ? String(r.visit_date) : new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila', month: 'numeric', day: 'numeric', year: '2-digit',
        }).format(date);
      },
    },
    { label: 'Student ID', value: (r) => r.patient_id, excludeFromPdf: true },
    { label: 'Name', pdfLabel: 'NAME', value: (r) => r.patient_name || r.profile?.full_name, pdfMaxWidth: 130 },
    { label: 'Sex', pdfLabel: 'SEX', value: (r) => sexAbbrev(r.profile?.sex), pdfAlign: 'center' },
    { label: 'Dept./Course', pdfLabel: 'COURSE/\nDEPT.', value: (r) => courseAcronym(r.profile?.course) },
    { label: 'Complaint', pdfLabel: 'COMPLAINT', value: (r) => r.chief_complaint, pdfMaxWidth: 90 },
    // The signature's "content" is an image, so it is given a fixed width
    // rather than measured from its caption.
    {
      label: 'Patient Signature',
      value: () => '',
      pdfLabel: 'SIGNATURE',
      csvValue: (r) => (r.patient_signature_path ? `Signed ${manilaDate(r.patient_signed_at)}` : ''),
      pdfImage: (r) => r.signatureImage || null,
      pdfImageHeight: 16,
      pdfImageRowHeight: 22,
      // A modest weight: the image needs ~62pt, so anything more would be dead
      // space taken from the medicine columns.
      pdfWidth: 48,
    },
    ...medicines.map((m) => ({
      label: m.item_name,
      medicineName: m.item_name,
      value: (r) => {
        const qty = r.dispensed?.[m.item_name];
        return qty ? qty : '';
      },
      rotateHead: true,
      pdfWidth: 13,
      pdfAlign: 'center',
    })),
  ],
});

// Kept for the generic EXPORT_CONFIGS registry; the page uses the factory above
// so the columns match the live dispensary list.
export const medicalLogExportConfig = buildMedicalLogExportConfig([]);

export const EXPORT_CONFIGS = {
  appointments: appointmentsExportConfig,
  patients: patientsExportConfig,
  encounters: encountersExportConfig,
  inventory: inventoryExportConfig,
  inventoryTransactions: inventoryTransactionsExportConfig,
  patientProfile: patientProfileExportConfig,
  auditLogs: auditLogsExportConfig,
  medicalLog: medicalLogExportConfig,
};

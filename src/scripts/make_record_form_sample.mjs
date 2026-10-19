/**
 * Generates a sample of the clinic record form PDF, for review.
 *
 * Run: node src/scripts/make_record_form_sample.mjs
 * Writes sample-output/record-form-sample.pdf
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

// Resolved from the working directory: when Vite bundles this for Node it runs
// from an output folder, so a path relative to __dirname lands elsewhere.
const outDir = path.join(process.cwd(), 'sample-output');
mkdirSync(outDir, { recursive: true });

const person = {
  first_name: 'Juan',
  middle_name: 'Santos',
  surname: 'Dela Cruz',
  applicant_id: '2526A34660',
  personal_email: 'juan.delacruz@gmail.com',
  date_of_birth: '2007-06-14',
};

const record = {
  subject_type: 'enrollee',
  subject_id: '6f1c2a44-9d3b-4e7a-8c21-5b0e7d9a1f30',
  submitted_at: '2026-10-18T09:41:00+08:00',
  form_date: '2026-10-18',
  college_course: 'BS Information Technology',
  sex: 'Male',
  date_of_birth: '2007-06-14',
  cell_phone: '0917 123 4567',
  permanent_address: '123 Rizal St, San Nicolas, Pangasinan',
  permanent_tel: '075 123 4567',
  current_address: '45 Boarding House, Ermita, Manila',
  current_tel: '02 8123 4567',
  guardian_name: 'Maria Dela Cruz',
  guardian_tel: '075 765 4321',
  guardian_cp: '0918 765 4321',
  guardian_address: '123 Rizal St, San Nicolas, Pangasinan',
  past_medical_history: 'Pulmonya, 2019. No hospital stays since.',
  vaccinations: 'BCG, DPT, Measles, Hepatitis B',
  family_history: 'High Blood - Father; Diabetes - Lola',
};

const server = await createServer({
  configFile: path.join(process.cwd(), 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { buildRecordFormPdf } = await server.ssrLoadModule('/src/utils/recordFormPdf.js');

  // The filled sample, and a blank one.
  //
  // The blank variant exists for verification: comparing a filled form against
  // the blank template measures the VALUES, not the layout. Comparing blank to
  // blank measures the template itself, which is what "template fidelity" means.
  const variants = [
    { name: 'record-form-sample.pdf', record, person },
    {
      name: 'record-form-blank.pdf',
      record: {
        subject_type: record.subject_type,
        subject_id: record.subject_id,
        submitted_at: record.submitted_at,
        // Values omitted on purpose; every field keeps its printed line.
      },
      person: {},
    },
    {
      // Deliberately hostile input: the longest plausible value in every field.
      // Checks that nothing collides with a neighbouring label and that the
      // document stays on one page.
      name: 'record-form-long.pdf',
      record: {
        ...record,
        college_course: 'BS Electronics and Communications Engineering',
        permanent_address: '1234 Rizal Street Extension, Barangay San Nicolas, Urdaneta City, Pangasinan',
        permanent_tel: '075 123 4567 local 22',
        current_address: 'Unit 45-B Boarding House, 1234 Estrada Street, Ermita, Manila',
        current_tel: '02 8123 4567 local 9',
        guardian_name: 'Maria Concepcion Dela Cruz-Santos',
        guardian_tel: '075 765 4321',
        guardian_cp: '0918 765 4321',
        guardian_address: '1234 Rizal Street Extension, Barangay San Nicolas, Urdaneta City, Pangasinan',
        cell_phone: '0917 123 4567',
        past_medical_history:
          'Pulmonya noong 2019, naospital ng tatlong araw. Asthma mula pagkabata. Walang operasyon.',
        vaccinations: 'BCG, DPT, Measles, Hepatitis B, MMR booster, Tetanus',
        family_history: 'High Blood - Tatay; Diabetes - Lola; Asthma - Nanay; Heart disease - Tito',
      },
      person: {
        ...person,
        first_name: 'Juan Miguel',
        middle_name: 'Santos',
        surname: 'Dela Cruz',
      },
    },
    {
      // A real address from the clinic's catchment, asked for explicitly. It is
      // 55 characters — far past what either address field's first line holds —
      // so it exercises the continuation line the form prints beneath each one.
      name: 'record-form-address.pdf',
      record: {
        ...record,
        permanent_address: 'Phase 3 BLK 3 Lot 209 Lupang Pangako Payatas B Quezon City',
        current_address: 'Phase 3 BLK 3 Lot 209 Lupang Pangako Payatas B Quezon City',
      },
      person,
    },
  ];

  for (const v of variants) {
    const doc = await buildRecordFormPdf({ ...v, enrolmentRef: '2526A34660' });
    const bytes = Buffer.from(doc.output('arraybuffer'));
    const out = path.join(outDir, v.name);
    writeFileSync(out, bytes);
    console.log('wrote', out, bytes.length, 'bytes');
  }
} finally {
  await server.close();
}

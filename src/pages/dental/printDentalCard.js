import seal from '../../assets/images/tup-prf-seal.png';
import { TOOTH_ROWS, ageFrom, conditionOf, formatDay } from './dentalShared.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// DTL-TDC-<patient initials>-<MMDDYYYY>-<hhmmAM>, from when the record was first encoded.
export const transactionId = (record) => {
  const initials = [record.first_name, record.middle_name, record.surname].filter(Boolean).map((n) => n.trim()[0]).join('').toUpperCase();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    .formatToParts(new Date(record.created_at || Date.now())).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  return `DTL-TDC-${initials}-${parts.month}${parts.day}${parts.year}-${parts.hour}${parts.minute}${(parts.dayPeriod || '').toUpperCase()}`;
};

const header = (page) => `
  <table class="head">
    <tr><td class="seal"><img src="${esc(new URL(seal, window.location.href).href)}" alt=""></td>
      <td class="uni"><strong>TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES</strong><br>Ayala Blvd., Ermita, Manila, 1000, Philippines<br>
        Tel No. +632-301-3001 local 607 | Fax No. +632-521-4063<br>Email: clinic@tup.edu.ph | Website: www.tup.edu.ph</td>
      <td class="idx"><table>
        <tr><td>Index No.</td><td>F-DTL-8.1d-TDC</td></tr><tr><td>Issue No.</td><td>01</td></tr>
        <tr><td>Revision No.</td><td>00</td></tr><tr><td>Date</td><td>11242017</td></tr>
        <tr><td>Page</td><td>${page} / 2</td></tr><tr><td>QAC No.</td><td>CC-11242017</td></tr></table></td></tr>
    <tr><td class="vaf">VAF-DTL</td><td class="title" colspan="2">DENTAL CONSULTATION</td></tr>
  </table>`;

const footer = (record) => `
  <table class="foot"><tr><td>Transaction ID</td><td>${esc(transactionId(record))}</td></tr><tr><td>Signature</td><td></td></tr></table>`;

export const dentalCardHtml = (record, services) => {
  const box = (checked) => `<span class="box">${checked ? '&#10003;' : ''}</span>`;
  const dob = record.date_of_birth ? record.date_of_birth.split('-') : null;
  const toothRow = (left, right) => [...left, ...right].map((t) => `<td>${t}<br><b>${esc(conditionOf(record.tooth_chart?.[t])?.code || '')}</b></td>`).join('');
  const rows = [...services].sort((a, b) => a.service_date.localeCompare(b.service_date));
  const padded = [...rows, ...Array.from({ length: Math.max(0, 14 - rows.length) }, () => null)];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dental Card · ${esc(record.surname)}, ${esc(record.first_name)}</title>
  <style>
    @page { size: letter; margin: 12mm; }
    * { box-sizing: border-box; } body { font: 10.5pt Arial, Helvetica, sans-serif; color: #000; margin: 0; }
    .sheet { page-break-after: always; } .sheet:last-child { page-break-after: auto; }
    table { border-collapse: collapse; width: 100%; } .head td { border: 1px solid #000; vertical-align: middle; }
    .seal { width: 70px; text-align: center; } .seal img { width: 58px; } .uni { text-align: center; font-size: 9pt; line-height: 1.35; }
    .idx { width: 190px; padding: 0; } .idx td { border: 0; border-bottom: 1px solid #000; font-size: 8pt; padding: 1px 4px; } .idx tr:last-child td { border-bottom: 0; }
    .idx td:first-child { border-right: 1px solid #000; width: 78px; }
    .vaf { text-align: center; font-weight: bold; padding: 4px; } .title { text-align: center; font-weight: bold; font-size: 12pt; padding: 4px; }
    .row { display: flex; gap: 8px; align-items: flex-end; margin-top: 12px; } .lbl { white-space: nowrap; }
    .line { flex: 1; border-bottom: 1px solid #000; min-height: 16px; padding: 0 4px; } .sub { display: flex; justify-content: space-around; font-size: 8pt; }
    .box { display: inline-block; width: 13px; height: 13px; border: 1px solid #000; text-align: center; line-height: 12px; font-size: 9pt; margin: 0 2px; vertical-align: middle; }
    h3 { text-align: center; font-size: 11pt; margin: 16px 0 4px; }
    .teeth { margin-top: 14px; } .teeth td { border: 1px solid #000; text-align: center; font-size: 9pt; height: 30px; width: 6.25%; }
    .remarks { margin-top: 12px; } .remarks .line { margin-top: 10px; display: block; }
    .foot { margin-top: 14px; } .foot td { border: 1px solid #000; padding: 4px 6px; font-size: 9pt; } .foot td:first-child { width: 110px; }
    .log { margin-top: 10px; } .log th, .log td { border: 1px solid #000; padding: 4px 6px; font-size: 9.5pt; vertical-align: top; } .log td { height: 26px; }
    .legend { font-size: 8pt; margin-top: 4px; }
  </style></head><body onload="window.focus(); window.print();">
  <section class="sheet">${header(1)}
    <div class="row"><span class="lbl">Name:</span><span class="line">${esc(record.surname)}</span><span class="line">${esc(record.first_name)}</span><span class="line">${esc(record.middle_name)}</span>
      <span class="lbl">College/Course/Unit:</span><span class="line">${esc(record.college_course_unit)}</span></div>
    <div class="sub" style="margin-right:38%"><span>(Surname)</span><span>(Name)</span><span>(Middle)</span></div>
    <div class="row"><span class="lbl">Classification:</span>${['Student', 'Faculty', 'Admin', 'Other'].map((c) => `${box(record.classification === c)} ${c}`).join(' &nbsp; ')}</div>
    <div class="row"><span class="lbl">Address:</span><span class="line">${esc(record.address)}</span></div>
    <div class="row"><span class="lbl">Date of Birth:</span><span class="line" style="flex:0 0 120px">${dob ? `${dob[1]}/${dob[2]}/${dob[0]}` : ''}</span>
      <span class="lbl">Age:</span><span class="line" style="flex:0 0 40px">${esc(ageFrom(record.date_of_birth))}</span>
      <span class="lbl">Sex:</span>${box(record.sex === 'F')} F ${box(record.sex === 'M')} M
      <span class="lbl">ID Number:</span><span class="line">${esc(record.patient_id)}</span></div>
    <div class="row"><span class="lbl">Place of Birth:</span><span class="line">${esc(record.place_of_birth)}</span></div>
    <h3>In Case of Emergency, Please Notify:</h3>
    <div class="row"><span class="lbl">Name:</span><span class="line">${esc(record.emergency_name)}</span><span class="lbl">Relationship:</span><span class="line">${esc(record.emergency_relationship)}</span></div>
    <div class="row"><span class="lbl">Address:</span><span class="line">${esc(record.emergency_address)}</span></div>
    <div class="row"><span class="lbl">Contact Number:</span><span class="line">${esc(record.emergency_contact)}</span></div>
    <table class="teeth"><tr>${toothRow(...TOOTH_ROWS.upper)}</tr><tr>${toothRow(...TOOTH_ROWS.lower)}</tr></table>
    <div class="legend">C caries · F filled · FX for extraction · X extracted · M missing · Cr crown · S sealant</div>
    <div class="remarks"><strong>REMARKS:</strong><span class="line">${esc(record.remarks)}</span><span class="line"></span><span class="line"></span></div>
    ${footer(record)}
  </section>
  <section class="sheet">${header(2)}
    <table class="log"><thead><tr><th style="width:15%">DATE</th><th>SERVICE RENDERED</th><th style="width:15%">Medicine</th><th style="width:15%">Anesthesia</th><th style="width:17%">Signature</th></tr></thead>
      <tbody>${padded.map((s) => (s ? `<tr><td>${esc(formatDay(s.service_date))}</td><td>${esc(s.service_rendered)}${s.teeth?.length ? ` (${esc(s.teeth.join(', '))})` : ''}</td><td>${esc(s.medicine)}</td><td>${esc(s.anesthesia)}</td><td>${esc(s.dentist_name)}</td></tr>` : '<tr><td></td><td></td><td></td><td></td><td></td></tr>')).join('')}</tbody></table>
    ${footer(record)}
  </section></body></html>`;
};

/**
 * The Dental Card: the patient's details as a plain list, then every dental
 * consultation. The pink form above is the clinic's official layout of the same data.
 */
export const dentalSummaryHtml = (record, services, profile = {}) => {
  const value = (v) => (String(v ?? '').trim() ? esc(v) : '<span class="na">—</span>');
  const list = (rows) => `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${value(v)}</dd></div>`).join('')}</dl>`;
  const name = [record.first_name, record.middle_name, record.surname].filter(Boolean).join(' ');
  const age = ageFrom(record.date_of_birth);
  const rows = [...services].sort((a, b) => b.service_date.localeCompare(a.service_date));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dental Card · ${esc(record.surname)}, ${esc(record.first_name)}</title>
  <style>
    @page { size: letter; margin: 14mm; }
    * { box-sizing: border-box; } body { font: 10.5pt Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 10px; }
    header img { width: 48px; } header .uni { font-size: 9pt; line-height: 1.35; } header .uni strong { font-size: 10.5pt; }
    h1 { font-size: 16pt; margin: 16px 0 2px; } .meta { color: #555; font-size: 9.5pt; }
    h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #bbb; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin: 0; }
    dl div { display: grid; grid-template-columns: 150px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px dotted #ccc; break-inside: avoid; }
    dt { color: #555; } dd { margin: 0; font-weight: bold; } .na { color: #999; font-weight: normal; }
    ol { list-style: none; margin: 0; padding: 0; }
    li { padding: 8px 0; border-bottom: 1px solid #ddd; break-inside: avoid; }
    li .top { display: flex; justify-content: space-between; gap: 12px; } li .date { font-weight: bold; } li .by { color: #555; }
    li .what { margin-top: 2px; } li .extra { color: #555; font-size: 9.5pt; margin-top: 2px; }
    .empty { color: #777; padding: 8px 0; }
  </style></head><body onload="window.focus(); window.print();">
  <header><img src="${esc(new URL(seal, window.location.href).href)}" alt="">
    <div class="uni"><strong>TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES</strong><br>University Clinic · Dental Clinic · Ayala Blvd., Ermita, Manila</div></header>
  <h1>${esc(name)}</h1>
  <div class="meta">Dental Card · ${esc(record.patient_id)} · ${esc(transactionId(record))}</div>
  <h2>Patient Information</h2>
  ${list([
    ['Surname', record.surname], ['First Name', record.first_name], ['Middle Name', record.middle_name], ['ID Number', record.patient_id],
    ['Age', age === '' ? '' : `${age} yrs`], ['Date of Birth', record.date_of_birth ? formatDay(record.date_of_birth) : ''],
    ['Sex', record.sex === 'F' ? 'Female' : record.sex === 'M' ? 'Male' : ''], ['Place of Birth', record.place_of_birth],
    ['Classification', record.classification], ['College / Course / Unit', record.college_course_unit || profile.course], ['Year', profile.year],
    ['Address', record.address || profile.address], ['Contact Number', profile.contact_number], ['Email', profile.email],
    ['Blood Type', profile.blood_type], ['Allergies', profile.allergies], ['Medications', profile.medications],
  ])}
  <h2>In Case of Emergency</h2>
  ${list([['Name', record.emergency_name], ['Relationship', record.emergency_relationship],
    ['Contact Number', record.emergency_contact], ['Address', record.emergency_address]])}
  ${record.remarks ? `<h2>Remarks</h2><p style="white-space:pre-wrap;margin:0">${esc(record.remarks)}</p>` : ''}
  <h2>Dental Consultation History (${rows.length})</h2>
  ${rows.length === 0 ? '<div class="empty">No consultations recorded yet.</div>' : `<ol>${rows.map((s) => `<li>
    <div class="top"><span class="date">${esc(formatDay(s.service_date))}</span><span class="by">${esc(s.dentist_name)}</span></div>
    <div class="what">${esc(s.service_rendered)}${s.teeth?.length ? ` · Teeth ${esc(s.teeth.join(', '))}` : ''}</div>
    ${s.medicine || s.anesthesia ? `<div class="extra">${[s.medicine && `Medicine: ${esc(s.medicine)}`, s.anesthesia && `Anesthesia: ${esc(s.anesthesia)}`].filter(Boolean).join(' · ')}</div>` : ''}
  </li>`).join('')}</ol>`}
  </body></html>`;
};

export const printHtml = (html) => {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
};

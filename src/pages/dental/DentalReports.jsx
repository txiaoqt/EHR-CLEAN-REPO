import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { exportCsv, logAudit } from '../../utils.js';
import { exportSectionedPdf } from '../../utils/export/engine.js';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import { formatDay, todayIso } from './dentalShared.js';
import './dental.css';

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const countBy = (items, key) => Object.entries(items.reduce((acc, item) => {
  const k = key(item) || 'Not recorded';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

// Fixed-height cards: a long breakdown scrolls inside its card instead of
// stretching the row, however many services or colleges a range has.
const Breakdown = ({ title, rows, total, id, unit }) => (
  <section className="card dental-breakdown" aria-labelledby={id}>
    <div className="dental-breakdown-head">
      <h2 className="dental-section-title" id={id} style={{ margin: 0 }}>{title}</h2>
      {rows.length > 0 && <span className="badge badge-neutral">{rows.length} {rows.length === 1 ? unit : `${unit}s`}</span>}
    </div>
    {rows.length === 0 ? <div className="dental-empty">No data in this range.</div> : (
      <div className="dental-breakdown-body" tabIndex={0} aria-label={`${title} breakdown`}>
        {rows.map(([label, n]) => (
          <div className="dental-bar" key={label}>
            <span className="dental-bar-label" title={label}>{label}</span>
            <span className="dental-bar-value">{n}<span className="dental-bar-pct">{total ? Math.round((n / total) * 100) : 0}%</span></span>
            <div className="dental-bar-track" aria-hidden="true"><div className="dental-bar-fill" style={{ transform: `scaleX(${total ? n / total : 0})` }} /></div>
          </div>
        ))}
      </div>
    )}
  </section>
);

/** Census, accomplishments and demographics from page 2 rows, for any date range. */
const DentalReports = () => {
  const today = todayIso();
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return undefined;
    let current = true;
    setRows(null); setError('');
    supabase.from('dental_services')
      .select('id, patient_id, service_date, service_rendered, dentist_name, dental_records(sex, classification, college_course_unit, students(year))')
      .gte('service_date', range.from).lte('service_date', range.to).order('service_date')
      .then(({ data, error: loadError }) => {
        if (!current) return;
        if (loadError) setError('The report could not be loaded. Try again.');
        setRows(data || []);
      });
    return () => { current = false; };
  }, [range]);

  const report = useMemo(() => {
    if (!rows) return null;
    const isConsult = (r) => /consult/i.test(r.service_rendered);
    const census = Object.values(rows.reduce((acc, r) => {
      const day = acc[r.service_date] || (acc[r.service_date] = { date: r.service_date, visits: 0, patients: new Set(), consultations: 0, procedures: 0 });
      day.visits += 1; day.patients.add(r.patient_id);
      if (isConsult(r)) day.consultations += 1; else day.procedures += 1;
      return acc;
    }, {})).map((d) => ({ ...d, patients: d.patients.size }));
    const patients = Object.values(rows.reduce((acc, r) => ({ ...acc, [r.patient_id]: r.dental_records || {} }), {}));
    const sex = (p) => (p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : '');
    return {
      census,
      services: countBy(rows, (r) => r.service_rendered.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase())),
      dentists: countBy(rows, (r) => r.dentist_name),
      sex: countBy(patients, sex),
      classification: countBy(patients, (p) => p.classification),
      year: countBy(patients.filter((p) => p.classification === 'Student'), (p) => (p.students?.year ? `Year ${p.students.year}` : '')),
      college: countBy(patients, (p) => (p.college_course_unit || '').trim()),
      patientCount: patients.length,
      consultations: rows.filter(isConsult).length,
    };
  }, [rows]);

  // One list of tables feeds both exports, so the CSV and PDF always match.
  const sections = () => [
    { title: 'Summary', head: ['Measure', 'Count'], body: [['Visits', rows.length], ['Patients seen', report.patientCount],
      ['Consultations', report.consultations], ['Procedures', rows.length - report.consultations]] },
    { title: 'Daily Census', head: ['Date', 'Visits', 'Patients', 'Consultations', 'Procedures'],
      body: report.census.map((d) => [formatDay(d.date), d.visits, d.patients, d.consultations, d.procedures]) },
    { title: 'Accomplishments', head: ['Service Rendered', 'Count'], body: report.services },
    { title: 'Visits by Dentist', head: ['Dentist', 'Visits'], body: report.dentists },
    { title: 'Patients by Sex', head: ['Sex', 'Patients'], body: report.sex },
    { title: 'Patients by Classification', head: ['Classification', 'Patients'], body: report.classification },
    { title: 'Students by Year Level', head: ['Year Level', 'Students'], body: report.year },
    { title: 'Patients by College / Unit', head: ['College / Unit', 'Patients'], body: report.college },
  ];
  const period = `${formatDay(range.from)} to ${formatDay(range.to)}`;
  const filename = `dental-report-${range.from}-to-${range.to}`;

  const download = async (format) => {
    setExporting(true);
    try {
      try { await logAudit('EXPORT', `Exported Dental Clinic report (${range.from} → ${range.to}) as ${format.toUpperCase()} — ${rows.length} visits`); } catch { /* audit failure must not block the export */ }
      if (format === 'pdf') {
        await exportSectionedPdf({ title: 'Dental Clinic Report', metadataLines: [`Period: ${period}`], sections: sections(), filename: `${filename}.pdf` });
      } else {
        const lines = [['Dental Clinic Report'], ['Period', period], [],
          ...sections().flatMap((t) => [[t.title], t.head, ...t.body, []])];
        exportCsv(`${filename}.csv`, lines.map((l) => l.map(csvCell).join(',')).join('\n'));
      }
    } catch {
      setError('The export could not be created. Try again.');
    } finally { setExporting(false); }
  };

  const censusPages = useTablePagination(report?.census || [], { pageSize: 7, resetKey: `${range.from}|${range.to}` });
  const invalid = !range.from || !range.to || range.from > range.to;

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Reports</h1>
            <div className="page-header-subtitle">Daily census, accomplishments and patient demographics for the Dental Clinic.</div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={() => download('csv')} disabled={!report || !rows.length || exporting}>Export CSV</button>
            <button type="button" className="btn" onClick={() => download('pdf')} disabled={!report || !rows.length || exporting}>{exporting ? 'Exporting…' : 'Export PDF'}</button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div className="dental-filter" style={{ paddingTop: 20 }}>
            <label className="dental-field"><span>From</span>
              <input className="input" type="date" value={range.from} max={range.to || today} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label className="dental-field"><span>To</span>
              <input className="input" type="date" value={range.to} min={range.from} max={today} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
            {invalid && <p className="dental-alert" role="alert" style={{ margin: 0 }}>Choose a start date on or before the end date.</p>}
          </div>
        </div>

        {error && <p className="dental-alert" role="alert">{error}</p>}
        {!report ? <div className="card dental-empty" role="status">{invalid ? 'Choose a date range.' : 'Loading the report…'}</div> : (
          <div className="dental-stack">
            <div className="dental-kpis">
              <div className="kpi-card"><div className="kpi-title">Visits</div><div className="kpi-value">{rows.length}</div><div className="kpi-subtitle">{formatDay(range.from)} – {formatDay(range.to)}</div></div>
              <div className="kpi-card"><div className="kpi-title">Patients Seen</div><div className="kpi-value">{report.patientCount}</div><div className="kpi-subtitle">Counted once each</div></div>
              <div className="kpi-card"><div className="kpi-title">Consultations</div><div className="kpi-value">{report.consultations}</div><div className="kpi-subtitle">First visits and check-ups</div></div>
              <div className="kpi-card"><div className="kpi-title">Procedures</div><div className="kpi-value">{rows.length - report.consultations}</div><div className="kpi-subtitle">All other services</div></div>
            </div>

            <section className="card table-section-card" aria-labelledby="report-census">
              <div className="table-section-header"><h2 id="report-census" style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-extrabold)' }}>Daily Census</h2></div>
              <div className="table-responsive">
                <table className="table" aria-labelledby="report-census">
                  <thead><tr><th>Date</th><th className="dental-num">Visits</th><th className="dental-num">Patients</th><th className="dental-num">Consultations</th><th className="dental-num">Procedures</th></tr></thead>
                  <tbody>
                    {report.census.length === 0 ? <tr className="table-empty-row"><td colSpan={5}>No visits in this range</td></tr>
                      : censusPages.pageRows.map((d) => (
                        <tr key={d.date}><td>{formatDay(d.date)}</td><td className="dental-num">{d.visits}</td><td className="dental-num">{d.patients}</td><td className="dental-num">{d.consultations}</td><td className="dental-num">{d.procedures}</td></tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <TablePagination page={censusPages.page} totalPages={censusPages.totalPages} startIndex={censusPages.startIndex}
                endIndex={censusPages.endIndex} total={censusPages.total} onPageChange={censusPages.goToPage} itemLabel="days" />
            </section>

            <div className="dental-report-grid">
              <Breakdown id="report-services" title="Accomplishments" rows={report.services} total={rows.length} unit="service" />
              <Breakdown id="report-dentists" title="Visits by Dentist" rows={report.dentists} total={rows.length} unit="dentist" />
              <Breakdown id="report-sex" title="Patients by Sex" rows={report.sex} total={report.patientCount} unit="group" />
              <Breakdown id="report-class" title="Patients by Classification" rows={report.classification} total={report.patientCount} unit="group" />
              <Breakdown id="report-year" title="Students by Year Level" rows={report.year} total={report.year.reduce((n, [, c]) => n + c, 0)} unit="level" />
              <Breakdown id="report-college" title="Patients by College / Unit" rows={report.college} total={report.patientCount} unit="college" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default DentalReports;

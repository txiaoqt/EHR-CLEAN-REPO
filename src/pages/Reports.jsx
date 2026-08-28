// src/pages/Reports.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
import Chart from 'chart.js/auto';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import 'jspdf-autotable';
import { formatDate, logAudit } from '../utils.js';
import { CloseIcon, ChevronDownIcon } from '../components/icons/Icons.jsx';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const DEFAULT_LOOKBACK_DAYS = 30;

const Reports = () => {
  const { user } = useAuth(); // get user (kept for role gating if needed)
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('census');
  const [reportData, setReportData] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);
  const [exportPasswordInput, setExportPasswordInput] = useState('');
  const [exportPasswordError, setExportPasswordError] = useState('');
  const [pendingExportAction, setPendingExportAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateError, setDateError] = useState('');
  const mountedRef = useRef(false);
  const REPORT_EXPORT_PASSWORD =
    import.meta.env.VITE_REPORT_EXPORT_PASSWORD ||
    import.meta.env.VITE_EXPORT_CENSUS_PASSWORD ||
    'TUPCensus@2026';

  useEffect(() => {
    const today = new Date();
    const prior = new Date();
    prior.setDate(today.getDate() - DEFAULT_LOOKBACK_DAYS + 1);
    setFrom(prior.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, type]);

  const validateDates = (f, t) => {
    if (!f || !t) return false;
    const df = new Date(f);
    const dt = new Date(t);
    return !isNaN(df.getTime()) && !isNaN(dt.getTime()) && df <= dt;
  };

  const runReport = async (opts = {}) => {
    const useFrom = opts.from ?? from;
    const useTo = opts.to ?? to;

    if (!validateDates(useFrom, useTo)) {
      setDateError('Please provide a valid date range (From ≤ To).');
      setReportData([]);
      setChartData(null);
      return;
    } else {
      setDateError('');
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('encounters')
        .select('*')
        .gte('encounter_date', useFrom)
        .lte('encounter_date', useTo + 'T23:59:59')
        .order('encounter_date', { ascending: false });

      if (error) throw error;

      const rows = data || [];
      setReportData(rows);

      // build preview chart for the selected type
      if (type === 'census') {
        const monthCounts = {};
        rows.forEach(enc => {
          const m = new Date(enc.encounter_date).toISOString().slice(0, 7);
          monthCounts[m] = (monthCounts[m] || 0) + 1;
        });
        const labels = Object.keys(monthCounts).sort();
        setChartData({
          type: 'bar',
          data: {
            labels: labels.map(l => l.replace('-', '/')),
            datasets: [{
              label: 'Cases',
              data: labels.map(l => monthCounts[l]),
              backgroundColor: 'rgba(54,162,235,0.85)',
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: { display: true, text: `Monthly Cases (${useFrom} → ${useTo})` },
            },
          },
        });
      } else if (type === 'diagnoses') {
        const diagCounts = {};
        rows.forEach(enc => {
          const diag = (enc.chief_complaint || 'Unknown').trim() || 'Unknown';
          diagCounts[diag] = (diagCounts[diag] || 0) + 1;
        });
        const entries = Object.entries(diagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
        setChartData({
          type: 'pie',
          data: {
            labels: entries.map(([k]) => k),
            datasets: [{
              data: entries.map(([, v]) => v),
              backgroundColor: [
                '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                '#FF9F40', '#8BC34A', '#607D8B', '#9E9E9E', '#FFC107',
              ]
            }]
          },
          options: {
            responsive: true,
            plugins: { title: { display: true, text: `Top Diagnoses (${useFrom} → ${useTo})` } }
          }
        });
      } else if (type === 'visits') {
        const visitCounts = {};
        rows.forEach(enc => {
          const d = new Date(enc.encounter_date).toISOString().slice(0, 10);
          visitCounts[d] = (visitCounts[d] || 0) + 1;
        });
        const dates = Object.keys(visitCounts).sort();
        setChartData({
          type: 'bar',
          data: {
            labels: dates.map(d => new Date(d).toLocaleDateString()),
            datasets: [{
              label: 'Visits',
              data: dates.map(d => visitCounts[d]),
              backgroundColor: 'rgba(255,99,132,0.85)',
            }]
          },
          options: {
            responsive: true,
            plugins: { title: { display: true, text: `Daily Visits (${useFrom} → ${useTo})` } }
          }
        });
      } else {
        setChartData(null);
      }

      try { await logAudit('run_report', `Run ${type} report ${useFrom} → ${useTo}`); } catch (e) { /* ignore */ }
    } catch (err) {
      console.error('Error running report:', err);
      setReportData([]);
      setChartData(null);
    } finally {
      setLoading(false);
    }
  };

  // CSV exporter
  const exportCsv = (mode = 'full') => {
    if (!reportData || reportData.length === 0) {
      setShowExportMenu(false);
      return;
    }

    const headers = ['Date', 'Patient', 'Clinician', 'Chief Complaint', 'Encounter ID'];
    const rows = (reportData || []).map(enc => {
      const date = new Date(enc.encounter_date).toLocaleString();
      const patient = enc.patient_name || enc.patient_id || 'Unknown';
      const clinician = enc.clinician_name || 'Unknown';
      const complaint = (enc.chief_complaint || '').replace(/,/g, ' ');
      const id = enc.id || '';
      return [date, patient, clinician, complaint, id].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tup_report_${type}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // Chart -> dataURL (for higher-res images)
  const createChartImage = async (config, width = 1200, height = 600) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = 'absolute';
    canvas.style.left = '-9999px';
    canvas.style.top = '-9999px';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, config);
    chart.update();
    // give Chart.js a short moment to settle (increase if needed)
    await new Promise(res => setTimeout(res, 500));
    let dataUrl;
    try {
      dataUrl = chart.toBase64Image();
    } catch (e) {
      dataUrl = canvas.toDataURL('image/png', 1.0);
    }
    try { chart.destroy(); } catch {}
    try { document.body.removeChild(canvas); } catch {}
    return dataUrl;
  };

  // load local image asset -> dataURL (safe for jsPDF)
  const loadImageDataUrl = (src, timeout = 5000) => {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let resolved = false;
      img.onload = () => {
        if (resolved) return;
        resolved = true;
        try {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => { if (!resolved) { resolved = true; resolve(null); } };
      img.src = src;
      setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, timeout);
    });
  };

  const buildAllReportConfigs = () => {
    const data = reportData || [];

    const diagCounts = {};
    data.forEach(enc => {
      const diag = (enc.chief_complaint || 'Unknown').trim() || 'Unknown';
      diagCounts[diag] = (diagCounts[diag] || 0) + 1;
    });
    const diagEntries = Object.entries(diagCounts).sort((a, b) => b[1] - a[1]).slice(0, 50);
    const diagConfig = {
      type: 'pie',
      data: {
        labels: diagEntries.map(([k]) => k),
        datasets: [{ data: diagEntries.map(([, v]) => v) }]
      },
      options: { plugins: { title: { display: true, text: 'Top Diagnoses' } } }
    };

    const monthCounts = {};
    data.forEach(enc => {
      const month = new Date(enc.encounter_date).toISOString().slice(0, 7);
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });
    const months = Object.keys(monthCounts).sort();
    const censusConfig = {
      type: 'bar',
      data: {
        labels: months.map(m => m.replace('-', '/')),
        datasets: [{ label: 'Cases', data: months.map(m => monthCounts[m]) }]
      },
      options: { plugins: { title: { display: true, text: 'Monthly Case Counts' } } }
    };

    const visitCounts = {};
    data.forEach(enc => {
      const date = new Date(enc.encounter_date).toISOString().slice(0, 10);
      visitCounts[date] = (visitCounts[date] || 0) + 1;
    });
    const dates = Object.keys(visitCounts).sort();
    const visitsConfig = {
      type: 'bar',
      data: {
        labels: dates.map(d => new Date(d).toLocaleDateString()),
        datasets: [{ label: 'Visits', data: dates.map(d => visitCounts[d]) }]
      },
      options: { plugins: { title: { display: true, text: 'Daily Visit Trends' } } }
    };

    return { diagConfig, censusConfig, visitsConfig, diagEntries, months, dates };
  };

  // placeChart draws title, chart image, and table below it.
  // It does NOT add the clinic header/logo — only a small footer page number is added.
  const placeChart = async (doc, title, config, smallTableRows = null) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    // Title near top of page
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const startY = margin + 10;
    doc.text(title, margin, startY);

    // Chart image area
    const imgW = pageW - margin * 2;
    const imgH = Math.round(imgW * 0.45);
    const chartImg = await createChartImage(config, Math.round(imgW * 2), Math.round(imgH * 2));
    const imgY = startY + 18;
    try {
      doc.addImage(chartImg, 'PNG', margin, imgY, imgW, imgH);
    } catch (e) {
      doc.setFontSize(10);
      doc.text('Chart rendering error', margin, imgY + 10);
    }

    // Table below chart — use autoTable and only draw page number in didDrawPage
    if (smallTableRows && smallTableRows.length) {
      const tableStart = imgY + imgH + 12;
      autoTable(doc, {
        head: [smallTableRows[0]],
        body: smallTableRows.slice(1),
        startY: tableStart,
        margin: { left: margin, right: margin, top: margin, bottom: 60 },
        styles: { fontSize: 10, overflow: 'linebreak', cellPadding: 6 },
        headStyles: { fillColor: [245,245,245] },
        showHead: 'everyPage',
        didDrawPage: function (data) {
          // footer: page number only
          const pageNumber = doc.internal.getNumberOfPages();
          doc.setFontSize(9);
          doc.text(`Page ${pageNumber}`, pageW - margin - 40, pageH - 18);
        }
      });
    } else {
      // no table — still draw page number
      const pageNumber = doc.internal.getNumberOfPages();
      doc.setFontSize(9);
      doc.text(`Page ${pageNumber}`, pageW - margin - 40, pageH - 18);
    }
  };

  // Export PDF (selected | full)
  const exportPdf = async (mode = 'selected') => {
    if (!reportData || reportData.length === 0) {
      setShowExportMenu(false);
      return;
    }
    setExporting(true);

    try {
      const { diagConfig, censusConfig, visitsConfig, diagEntries } = buildAllReportConfigs();
      const doc = new jsPDF('p', 'pt', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;

      const logoDataUrl = await loadImageDataUrl(tupehrlogo);
      const rangeText = `${from} → ${to}`;

      // --- COVER PAGE (page 1) with centered layout ---
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);

      let y = 120;

      // LOGO (centered)
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, 'PNG', pageW / 2 - 35, y, 70, 55);
        } catch (e) {
          // ignore image errors
        }
      }
      y += 90;

      // SCHOOL + CLINIC NAME
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(
        "Technological University of the Philippines - Clinic",
        pageW / 2,
        y,
        { align: "center" }
      );

      y += 40;

      // FULL REPORT (DATE RANGE)
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `FULL REPORT (${from} - ${to})`,
        pageW / 2,
        y,
        { align: "center" }
      );

      y += 35;

      // Generated By (left blank for manual fill or can be auto-filled)
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Generated by: __________________________`,
        pageW / 2,
        y,
        { align: "center" }
      );

      y += 22;

      // Generated On
      doc.text(
        `Generated on: ${formatDate(new Date(), "YYYY-MM-DD HH:mm")}`,
        pageW / 2,
        y,
        { align: "center" }
      );

      y += 22;

      // Generated From
      doc.text(
        `Generated from EHR System`,
        pageW / 2,
        y,
        { align: "center" }
      );

      // --- SELECTED MODE: cover + single chart page ---
      if (mode === 'selected') {
        doc.addPage(); // page 2
        if (type === 'census') {
          await placeChart(doc, 'Monthly Case Counts', censusConfig, [
            ['Month', 'Cases'],
            ...(censusConfig.data?.labels || []).map((lbl, i) => [lbl, censusConfig.data.datasets?.[0]?.data?.[i] || 0])
          ]);
        } else if (type === 'diagnoses') {
          await placeChart(doc, 'Top Diagnoses', diagConfig, [
            ['Diagnosis', 'Count'],
            ...diagEntries.slice(0, 50).map(([k, v]) => [k, v])
          ]);
        } else if (type === 'visits') {
          await placeChart(doc, 'Daily Visit Trends', visitsConfig, [
            ['Date', 'Visits'],
            ...(visitsConfig.data?.labels || []).map((lbl, i) => [lbl, visitsConfig.data.datasets?.[0]?.data?.[i] || 0])
          ]);
        }
      } else {
        // --- FULL MODE: EXACT PAGE ORDER ---
        // page 2 - Census
        doc.addPage();
        await placeChart(doc, 'Monthly Case Counts', censusConfig, [
          ['Month', 'Cases'],
          ...(censusConfig.data?.labels || []).map((lbl, i) => [lbl, censusConfig.data.datasets?.[0]?.data?.[i] || 0])
        ]);

        // page 3 - Top Diagnoses
        doc.addPage();
        await placeChart(doc, 'Top Diagnoses', diagConfig, [
          ['Diagnosis', 'Count'],
          ...diagEntries.slice(0, 50).map(([k, v]) => [k, v])
        ]);

        // page 4 - Visit Trends
        doc.addPage();
        await placeChart(doc, 'Daily Visit Trends', visitsConfig, [
          ['Date', 'Visits'],
          ...(visitsConfig.data?.labels || []).map((lbl, i) => [lbl, visitsConfig.data.datasets?.[0]?.data?.[i] || 0])
        ]);
      }

      const filename = `tup_report_${type}_${new Date().toISOString().slice(0,10)}.pdf`;
      doc.save(filename);
      setShowExportMenu(false);
    } catch (err) {
      console.error('PDF export error', err);
    } finally {
      setExporting(false);
    }
  };

  const requestReportExport = (action) => {
    if (!reportData || reportData.length === 0 || exporting) return;
    setPendingExportAction(action);
    setExportPasswordInput('');
    setExportPasswordError('');
    setShowExportMenu(false);
    setShowExportPasswordModal(true);
  };

  const confirmReportExport = async () => {
    const trimmed = (exportPasswordInput || '').trim();
    if (!trimmed) {
      setExportPasswordError('Please enter the export password.');
      return;
    }
    if (trimmed !== REPORT_EXPORT_PASSWORD) {
      setExportPasswordError('Incorrect export password.');
      return;
    }

    const action = pendingExportAction;
    setShowExportPasswordModal(false);
    setExportPasswordInput('');
    setExportPasswordError('');
    setPendingExportAction(null);

    if (action === 'csv-full') exportCsv('full');
    if (action === 'pdf-selected') await exportPdf('selected');
    if (action === 'pdf-full') await exportPdf('full');
  };

  return (
    <main className="main">
      <div className="page">
        {/* 1. Page Header: Focused on page identity */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Reports & Clinical Analytics</h1>
            <div className="page-header-subtitle">
              Generate census metrics, diagnosis distributions, and date-filtered clinic reporting.
            </div>
          </div>
        </div>

        {/* 2. Report Overview & Control Toolbar */}
        <div className="card" style={{ padding: '20px 22px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Report Overview
              </h2>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Configure date range, analytical view, and generate official clinical records
              </div>
            </div>

            <span className="badge badge-purple" style={{ fontSize: 12, padding: '4px 10px' }}>
              <strong>{reportData.length}</strong> records analyzed
            </span>
          </div>

          {/* Report Controls Toolbar */}
          <div className="reports-toolbar">
            {/* Date Range Inputs */}
            <div className="reports-date-group">
              <div className="reports-date-field">
                <label htmlFor="r-from" className="reports-date-label">From</label>
                <input
                  id="r-from"
                  type="date"
                  className="reports-date-input"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                />
              </div>
              <span style={{ color: 'var(--border)', fontWeight: 600 }}>|</span>
              <div className="reports-date-field">
                <label htmlFor="r-to" className="reports-date-label">To</label>
                <input
                  id="r-to"
                  type="date"
                  className="reports-date-input"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                />
              </div>
            </div>

            {/* Report Type Selector */}
            <div className="reports-select-wrapper">
              <select
                id="r-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="reports-filter-select"
                aria-label="Report type"
              >
                <option value="census">Monthly Census</option>
                <option value="diagnoses">Top Diagnoses</option>
                <option value="visits">Daily Visit Trends</option>
              </select>
              <span className="reports-filter-chevron">
                <ChevronDownIcon size={13} />
              </span>
            </div>

            {/* Export menu (Physician Gated) */}
            {user?.role === 'physician' && (
              <div style={{ position: 'relative', display: 'inline-flex', marginLeft: 'auto' }}>
                <button
                  type="button"
                  id="reports-export-btn"
                  className="btn"
                  onClick={() => setShowExportMenu(s => !s)}
                >
                  Export Report
                </button>
                {showExportMenu && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 6, background: '#ffffff',
                    border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
                    borderRadius: 12, zIndex: 2000, overflow: 'hidden', minWidth: 220, padding: '6px 0'
                  }}>
                    <button onClick={() => requestReportExport('csv-full')} style={menuBtnStyle} disabled={!reportData || reportData.length === 0 || exporting}>Export CSV (Full)</button>
                    <button onClick={() => requestReportExport('pdf-selected')} style={menuBtnStyle} disabled={!reportData || reportData.length === 0 || exporting}>Export PDF (Selected Chart)</button>
                    <button onClick={() => requestReportExport('pdf-full')} style={menuBtnStyle} disabled={!reportData || reportData.length === 0 || exporting}>Export PDF (Complete Census)</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {dateError && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>
              {dateError}
            </div>
          )}
        </div>

        {/* 3. Analytics & Clinical Guide Layout */}
        <div className="reports-main-grid">
          {/* Main Visuals & Drill-down Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Analytics Visualization Card */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: 16 }}>Analytics Visualization</h3>
                  <span className="card-subtitle">
                    Showing {type === 'census' ? 'case counts' : (type === 'diagnoses' ? 'diagnostic breakdown' : 'daily trends')} for selected range
                  </span>
                </div>
              </div>

              {loading ? (
                <div style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Generating visualization…
                </div>
              ) : (!reportData || reportData.length === 0) ? (
                <div style={{
                  minHeight: 180,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '36px 20px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    No report data available
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5 }}>
                    There are no encounter records within the selected date range. Try selecting a different date range.
                  </div>
                </div>
              ) : chartData ? (
                <div style={{ minHeight: 280, padding: 10 }}>
                  {chartData.type === 'bar' ? <Bar data={chartData.data} options={chartData.options} /> :
                   chartData.type === 'pie' ? <Pie data={chartData.data} options={chartData.options} /> : null}
                </div>
              ) : (
                <div style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No chart available for the specified range.
                </div>
              )}
            </div>

            {/* Raw Encounters Drill-Down Card */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: 16 }}>Raw Encounters Data</h3>
                  <span className="card-subtitle">Granular clinical records within active date filter</span>
                </div>
                <span className="badge badge-neutral">
                  Rows: <strong>{reportData.length}</strong>
                </span>
              </div>

              {(!reportData || reportData.length === 0) ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No data records found for the selected date range.
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: 360 }}>
                  <table className="table" aria-label="Report data table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Patient ID / Name</th>
                        <th>Clinician</th>
                        <th>Chief Complaint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map(enc => (
                        <tr key={enc.id || Math.random()}>
                          <td style={{ color: 'var(--text-muted)' }}>{new Date(enc.encounter_date).toLocaleString()}</td>
                          <td>
                            <span style={{ fontWeight: 700 }}>{enc.patient_name || enc.patient_id}</span>
                          </td>
                          <td>{enc.clinician_name || 'Staff'}</td>
                          <td style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {enc.chief_complaint || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Side Guide Card */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h3 className="card-title" style={{ fontSize: 15, marginBottom: 12 }}>
              Clinical Intelligence Guide
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
              <div>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Auto 30-Day Lookback</strong>
                By default, queries the last {DEFAULT_LOOKBACK_DAYS} days of clinic operations to ensure responsive analysis.
              </div>

              <div>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Clinical Indicators</strong>
                <ul style={{ paddingLeft: 16, margin: '4px 0 0' }}>
                  <li>Spike in respiratory complaints may indicate seasonal influenza cluster.</li>
                  <li>Track recurring consultations to assess chronic illness follow-up compliance.</li>
                  <li>Use exported reports for quarterly university health census compliance.</li>
                </ul>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Confidentiality Policy</strong>
                Exporting full census reports requires staff authorization credentials due to sensitive medical information.
              </div>
            </div>
          </div>
        </div>
      </div>

      {showExportPasswordModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2100 }}>
          <div style={{ background:'#ffffff', padding:24, borderRadius:16, maxWidth:420, width:'92%', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Reports Export Authorization</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowExportPasswordModal(false)} aria-label="Close modal">
                <CloseIcon size={18} />
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
              Enter staff export security password to download the protected clinic census.
            </p>
            <input
              type="password"
              className="input"
              value={exportPasswordInput}
              onChange={(e) => {
                setExportPasswordInput(e.target.value);
                if (exportPasswordError) setExportPasswordError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmReportExport(); }}
              placeholder="Enter export password..."
              style={{ width: '100%', marginTop: 8 }}
              autoFocus
            />
            {exportPasswordError && (
              <div style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13, fontWeight: 600 }}>{exportPasswordError}</div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop: 20 }}>
              <button className="btn secondary" onClick={() => setShowExportPasswordModal(false)}>Cancel</button>
              <button className="btn" onClick={confirmReportExport}>Confirm & Export</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const menuBtnStyle = {
  display: 'block',
  padding: '8px 14px',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13
};

export default Reports;

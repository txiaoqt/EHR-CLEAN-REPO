// src/pages/MedicalLog.jsx
//
// The clinic's paper VAF-MDC Medical Log, digitised.
//
// The form is ONE wide table: a block of visit fields on the left (date, name,
// sex, dept/course, complaint, signature) and then a column per medicine, with
// the quantity given written into the cell. That is exactly what this renders.
//
// It is dynamic in both directions:
//   * a new consultation adds a row automatically (rows come from encounters);
//   * typing a quantity into a cell records the dispensing against that visit
//     AND draws the stock down, so the inventory never disagrees with the log.
//
// Operate surface: dense, scannable, no decoration competing with the data.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { SearchIcon, ChevronDownIcon, CloseIcon } from '../components/icons/Icons.jsx';
import TablePagination from '../components/table/TablePagination.jsx';
import ExportDialog from '../components/export/ExportDialog.jsx';
import SignatureImage from '../components/SignatureImage.jsx';
import MedicineQuantityCell from '../components/MedicineQuantityCell.jsx';
import '../styles/medicineLog.css';
import { useTableExport } from '../hooks/useTableExport.js';
import { buildMedicalLogExportConfig } from '../utils/export/configs.js';
import { courseAcronym, sexAbbrev } from '../utils/medicalLog.js';

const PAGE_SIZE = 20;
const VISIT_COLUMN_WIDTHS = [104, 132, 164, 48, 100, 104, 120];
const MEDICINE_COLUMN_WIDTH = 48;

const COURSES = [
  'BS Computer Science',
  'BS Information Technology',
  'BS Information Systems',
  'BS Mathematics',
  'BS Biology',
  'BS Chemistry',
  'BS Food Technology',
  'BS Environmental Science',
];

// The view unifies appointments and walk-in encounters. In the Medical Log,
// appointment-backed rows become visible only after the appointment is marked
// Completed; standalone encounter rows remain visible in the register.
const VISIT_COLUMNS =
  'visit_id, visit_source, appointment_id, encounter_id, patient_id, patient_name, ' +
  'visit_date, visit_time, department, service_type, appointment_type, appointment_status, ' +
  'encounter_status, chief_complaint, assessment_plan, clinician_name, ' +
  'patient_signature_path, patient_signed_at';

const manilaDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
};

const displayDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(d);
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return manilaDate(d);
};

// Signature images are small PNGs in a public bucket. Loading them before the
// PDF is drawn lets the export print the actual signature the UI shows, rather
// than a caption saying one exists.
const SIGNATURE_FETCH_CONCURRENCY = 6;

const loadSignatureDataUrls = async (paths) => {
  const unique = [...new Set((paths || []).filter(Boolean))];
  const map = {};
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(SIGNATURE_FETCH_CONCURRENCY, unique.length) }, async () => {
      while (next < unique.length) {
        const path = unique[next++];
        const url = signatureUrl(path);
        if (!url) continue;
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const blob = await res.blob();
          map[path] = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          // An unavailable saved image leaves its signature cell blank.
        }
      }
    })
  );

  return map;
};

// Public URL for a signature image. The signatures bucket is public, so this
// needs no signing round-trip — unlike the private message attachments.
const signatureUrl = (path) => {
  if (!path) return null;
  try {
    return supabase.storage.from('signatures').getPublicUrl(path).data?.publicUrl || null;
  } catch {
    return null;
  }
};

const MedicalLog = () => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(0);

  const [dateFrom, setDateFrom] = useState(() => daysAgo(30));
  const [dateTo, setDateTo] = useState(() => manilaDate(new Date()));
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('all');

  const [profiles, setProfiles] = useState({});
  const [medicines, setMedicines] = useState([]);        // the 24 columns
  // `${encounterId}|${itemName}` -> quantity recorded
  const [cells, setCells] = useState({});
  const [pendingCount, setPendingCount] = useState(0);
  const [activeCell, setActiveCell] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const pendingRef = useRef(new Set());
  const stockRevisionRef = useRef({});
  const loadRevisionRef = useRef(0);

  // ---- dispensary list: the form's medicine columns --------------------------
  const loadInventory = useCallback(async () => {
    const { data, error } = await supabase.from('inventory')
      .select('item_name, category, stock_quantity, unit').order('category').order('item_name');
    if (error) throw error;
    return data || [];
  }, []);

  const resolveCourseIds = useCallback(async () => {
    if (course === 'all') return null;
    const { data } = await supabase.from('patient_profiles').select('patient_id').eq('course', course);
    return (data || []).map((r) => r.patient_id);
  }, [course]);

  // A patient's name is not reliably on the encounter — `encounters.patient_name`
  // is NULL for some rows and the register falls back to the profile. So a name
  // search has to resolve against patient_profiles first and match on the ids it
  // returns; searching encounters alone silently misses those visits.
  const resolveSearchPatientIds = useCallback(async () => {
    const safe = search.trim().replace(/[,()%*"'\\]/g, ' ').trim();
    if (!safe) return [];
    const { data } = await supabase
      .from('patient_profiles')
      .select('patient_id')
      .or(`full_name.ilike.%${safe}%,student_id.ilike.%${safe}%`)
      .limit(200);
    return (data || []).map((r) => r.patient_id);
  }, [search]);

  // Returns a query BUILDER (never awaited here) so the caller can add .range()
  // or .limit(). Awaiting it would run the query and hand back a result object.
  const buildVisitQuery = useCallback(
    ({ courseIds, searchPatientIds }, withCount) => {
      let q = supabase
        .from('medical_log_visits')
        .select(VISIT_COLUMNS, withCount ? { count: 'exact' } : undefined);

      if (dateFrom) q = q.gte('visit_date', dateFrom);
      if (dateTo) q = q.lte('visit_date', dateTo);

      const safe = search.trim().replace(/[,()%*"'\\]/g, ' ').trim();
      const visibleVisitFilter = 'or(visit_source.eq.encounter,appointment_status.eq.Completed)';
      if (safe) {
        const parts = [
          `patient_name.ilike.%${safe}%`,
          `chief_complaint.ilike.%${safe}%`,
          `patient_id.ilike.%${safe}%`,
        ];
        for (const id of searchPatientIds || []) {
          parts.push(`patient_id.eq.${id}`);
        }
        q = q.or(`and(${visibleVisitFilter},or(${parts.join(',')}))`);
      } else {
        q = q.or('visit_source.eq.encounter,appointment_status.eq.Completed');
      }

      if (courseIds) {
        if (courseIds.length === 0) return null;
        q = q.in('patient_id', courseIds);
      }

      return q.order('visit_date', { ascending: false });
    },
    [dateFrom, dateTo, search]
  );

  // Attach profiles + recorded quantities to a set of visits. Dispensing may be
  // recorded against the appointment or against the walk-in encounter, so both
  // are fetched and folded onto the visit.
  const decorate = useCallback(async (visits) => {
    const patientIds = [...new Set(visits.map((v) => v.patient_id).filter(Boolean))];
    const appointmentIds = visits.map((v) => v.appointment_id).filter(Boolean);
    const encounterIds = visits.map((v) => v.encounter_id).filter(Boolean);
    const dispenseColumns = 'id, appointment_id, encounter_id, item_name, quantity';

    const [profileRes, byAppointment, byEncounter] = await Promise.all([
      patientIds.length
        ? supabase.from('patient_profiles').select('patient_id, full_name, sex, course').in('patient_id', patientIds)
        : Promise.resolve({ data: [] }),
      appointmentIds.length
        ? supabase.from('inventory_transactions').select(dispenseColumns).eq('transaction_type', 'out').in('appointment_id', appointmentIds)
        : Promise.resolve({ data: [] }),
      encounterIds.length
        ? supabase.from('inventory_transactions').select(dispenseColumns).eq('transaction_type', 'out').in('encounter_id', encounterIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = Object.fromEntries((profileRes.data || []).map((p) => [p.patient_id, p]));

    // Keyed by visit so a grid cell can be looked up directly.
    const cellMap = {};
    const seen = new Set();
    for (const t of [...(byAppointment.data || []), ...(byEncounter.data || [])]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const visit = visits.find(
        (v) =>
          (t.appointment_id && v.appointment_id === t.appointment_id) ||
          (t.encounter_id && v.encounter_id === t.encounter_id)
      );
      if (!visit) continue;
      const key = `${visit.visit_id}|${t.item_name}`;
      cellMap[key] = (cellMap[key] || 0) + Number(t.quantity || 0);
    }

    return { profileMap, cellMap };
  }, []);

  const fetchPage = useCallback(async () => {
    if (pendingRef.current.size) return;
    const request = ++loadRevisionRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const [courseIds, searchPatientIds, inventoryItems] = await Promise.all([
        resolveCourseIds(),
        resolveSearchPatientIds(),
        loadInventory(),
      ]);
      const base = buildVisitQuery({ courseIds, searchPatientIds }, true);
      if (!base) {
        if (request !== loadRevisionRef.current) return;
        setMedicines(inventoryItems);
        setRows([]); setTotal(0); setProfiles({}); setCells({});
        return;
      }

      const from = page * PAGE_SIZE;
      const { data, error, count } = await base.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const encounters = data || [];
      const { profileMap, cellMap } = await decorate(encounters);
      if (request !== loadRevisionRef.current) return;

      setMedicines(inventoryItems);
      stockRevisionRef.current = {};
      setRows(encounters);
      setTotal(count || 0);
      setProfiles(profileMap);
      setCells(cellMap);
    } catch (err) {
      if (request !== loadRevisionRef.current) return;
      console.error('Failed to load the medicine log:', err);
      setLoadError(err?.message || 'Failed to load the medicine log.');
      setRows([]); setTotal(0);
    } finally {
      if (request === loadRevisionRef.current) setLoading(false);
    }
  }, [buildVisitQuery, decorate, page, resolveCourseIds, resolveSearchPatientIds, loadInventory]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  useEffect(() => { setPage(0); }, [dateFrom, dateTo, search, course]);

  // ---- writing a cell -------------------------------------------------------
  // Records the dispensing against the visit and moves the stock by the
  // difference, so correcting 2 to 5 only removes 3 more.
  const commitCell = useCallback(
    async (visit, itemName, next, expectedQuantity) => {
      const key = `${visit.visit_id}|${itemName}`;
      if (pendingRef.current.has(key)) throw new Error('This quantity is already saving.');
      pendingRef.current.add(key);
      setPendingCount(pendingRef.current.size);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const { data, error } = await supabase.rpc('save_medical_log_quantity', {
          p_visit_id: visit.visit_id, p_item_name: itemName,
          p_quantity: next, p_expected_quantity: expectedQuantity,
        }).abortSignal(controller.signal);
        if (error) throw error;
        if (data?.quantity !== next || !Number.isInteger(data?.stock_quantity)) {
          throw new Error('SAVE_NOT_CONFIRMED');
        }
        setCells((previous) => ({ ...previous, [key]: data.quantity }));
        // Responses for different visits can arrive out of order. Do not let
        // an older acknowledgement replace this medicine's newer stock count.
        const revision = Date.parse(data.saved_at);
        if (!stockRevisionRef.current[itemName] || revision >= stockRevisionRef.current[itemName]) {
          stockRevisionRef.current[itemName] = revision;
          setMedicines((previous) => previous.map((item) => item.item_name === itemName
            ? { ...item, stock_quantity: data.stock_quantity } : item));
        }
        return data;
      } catch (err) {
        console.error('Could not record the dispensing:', err);
        let message = 'Could not confirm this save. Retry to check and save your quantity.';
        if (err.message?.includes('INSUFFICIENT_STOCK')) message = 'Not enough stock. Refresh availability and enter a smaller quantity.';
        else if (err.message?.includes('QUANTITY_CHANGED')) {
          let baseline = null;
          try { baseline = JSON.parse(err.details); } catch { /* Keep the entered value for review. */ }
          if (Number.isSafeInteger(baseline?.quantity)) {
            setCells((previous) => ({ ...previous, [key]: baseline.quantity }));
            message = `This entry changed elsewhere. The saved quantity is ${baseline.quantity}. Review your entry, then retry.`;
          } else message = 'This entry changed elsewhere. Refresh and review it before retrying.';
        } else if (err.code === '42501') message = 'You do not have permission to change this entry, or clinic access has ended.';
        else if (/VISIT_UNAVAILABLE|MEDICINE_UNAVAILABLE/.test(err.message || '')) message = 'This visit or medicine is no longer available. Refresh the register.';
        showToast(message, 'error');
        throw new Error(message);
      } finally {
        clearTimeout(timeout);
        pendingRef.current.delete(key);
        setPendingCount(pendingRef.current.size);
      }
    },
    [showToast]
  );

  const fetchAllForExport = useCallback(async () => {
    const [courseIds, searchPatientIds] = await Promise.all([
      resolveCourseIds(),
      resolveSearchPatientIds(),
    ]);
    const exportRows = [];
    const batchSize = 100;
    for (let from = 0; ; from += batchSize) {
      const base = buildVisitQuery({ courseIds, searchPatientIds }, false);
      if (!base) return [];
      // Retain the visit-date ordering, with stable ties for range pagination.
      const { data, error } = await base.order('visit_id', { ascending: false }).range(from, from + batchSize - 1);
      if (error) throw error;
      const visits = data || [];
      if (!visits.length) break;
      const { profileMap, cellMap } = await decorate(visits);
      visits.forEach((visit) => {
        const dispensed = {};
        for (const [key, quantity] of Object.entries(cellMap)) {
          if (key.startsWith(visit.visit_id + '|')) dispensed[key.slice(visit.visit_id.length + 1)] = quantity;
        }
        exportRows.push({ ...visit, profile: profileMap[visit.patient_id] || null, dispensed });
      });
      if (visits.length < batchSize) break;
    }

    // Read every selected signature with bounded concurrency, rather than
    // silently dropping images after the first 200 visits.
    const signatureImages = await loadSignatureDataUrls(exportRows.map((visit) => visit.patient_signature_path));
    return exportRows.map((e) => ({
      ...e,
      signatureImage: e.patient_signature_path ? signatureImages[e.patient_signature_path] || null : null,
    }));
  }, [buildVisitQuery, decorate, resolveCourseIds, resolveSearchPatientIds]);

  // The medicine columns ARE the dispensary list, so the config is built from
  // whatever is stocked rather than hardcoded.
  const exportConfig = useMemo(() => buildMedicalLogExportConfig(medicines), [medicines]);

  const activeFilterLines = useMemo(() => {
    // Plain words, not symbols: the summary is rendered in a standard PDF font
    // whose encoding has no arrow glyph, and an unsupported character makes
    // jsPDF fall back and distort the whole line.
    const lines = [`Date Range: ${dateFrom || 'earliest'} to ${dateTo || 'today'}`];
    if (course !== 'all') lines.push(`Course: ${course}`);
    if (search.trim()) lines.push(`Search: "${search.trim()}"`);
    return lines;
  }, [dateFrom, dateTo, course, search]);

  const exporter = useTableExport({
    config: exportConfig,
    getRows: fetchAllForExport,
    getFilterLines: () => activeFilterLines,
    itemLabel: 'visits',
    count: total,
    onMessage: showToast,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const endIndex = Math.min((page + 1) * PAGE_SIZE, total);
  const hasFilters = course !== 'all' || search.trim() !== '';

  // Fixed column widths keep all three frozen identity columns aligned with
  // their headers, even at the far end of the medicine grid.
  const gridWidth = VISIT_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0)
    + medicines.length * MEDICINE_COLUMN_WIDTH;
  const changeView = (update) => { if (!pendingRef.current.size) update(); };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Medicine Log</h1>
            <div className="page-header-subtitle">
              Clinic visit register — log the medicines given to each patient; stock is deducted automatically.
            </div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={fetchPage} disabled={loading || pendingCount > 0}>
              Refresh
            </button>
            <button type="button" className="btn" onClick={() => changeView(exporter.openExport)} disabled={loading || total === 0 || pendingCount > 0}>
              Export
            </button>
          </div>
        </div>

        <div className="card table-section-card medical-log-table-card">
          <div className="card-header table-section-header">
            <div>
              <h3 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Visit Register</h3>
              <span className="card-subtitle" id="medlog-save-instructions">
                Enter a quantity, then press Enter or leave the field to save it and update stock.
              </span>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}>
              {total.toLocaleString()} {total === 1 ? 'visit' : 'visits'}
            </span>
          </div>

          <div className="table-section-toolbar medical-log-toolbar">
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'inline-flex' }}>
                <SearchIcon size={16} />
              </span>
              <input
                type="search"
                className="input"
                style={{ width: '100%', paddingLeft: 36 }}
                placeholder="Search patient, ID or complaint…"
                value={search}
                onChange={(e) => changeView(() => setSearch(e.target.value))}
                disabled={pendingCount > 0}
                aria-label="Search the medicine log"
              />
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200 }}>
              <select
                className="input"
                style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                value={course}
                onChange={(e) => changeView(() => setCourse(e.target.value))}
                disabled={pendingCount > 0}
                aria-label="Filter by course"
              >
                <option value="all">All courses</option>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>

            <input type="date" className="input" value={dateFrom} max={dateTo || undefined} disabled={pendingCount > 0} onChange={(e) => changeView(() => setDateFrom(e.target.value))} aria-label="From date" />
            <input type="date" className="input" value={dateTo} min={dateFrom || undefined} disabled={pendingCount > 0} onChange={(e) => changeView(() => setDateTo(e.target.value))} aria-label="To date" />

            {hasFilters && (
              <button type="button" className="btn secondary small" disabled={pendingCount > 0} onClick={() => changeView(() => { setSearch(''); setCourse('all'); })}>
                Clear filters
              </button>
            )}
          </div>

          {loadError && (
            <div className="table-section-feedback" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-rose-bg)', color: 'var(--color-rose-text)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>
              {loadError}
            </div>
          )}

          <div className="medlog-legend" id="medlog-stock-legend">
            <span><strong>Available stock:</strong> the number below each medicine name, in that item's unit.</span>
            <span className="medlog-save-summary" role="status">{pendingCount > 0
              ? `Saving ${pendingCount} ${pendingCount === 1 ? 'entry' : 'entries'}…`
              : loading && rows.length > 0 ? 'Refreshing register…' : 'Clear a quantity or enter 0 to return it to stock.'}</span>
          </div>
          <div className="table-responsive medlog-scroll-region" role="region" aria-label="Scrollable medicine log"
            tabIndex={0} aria-busy={loading} onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setActiveCell(null);
            }}>
            <table className="table medlog-grid" aria-label="Medicine log" aria-describedby="medlog-stock-legend medlog-save-instructions"
              style={{ '--medlog-grid-width': `${gridWidth}px`, '--medlog-date-width': `${VISIT_COLUMN_WIDTHS[0]}px`,
                '--medlog-id-offset': `${VISIT_COLUMN_WIDTHS[0] + VISIT_COLUMN_WIDTHS[1]}px` }}>
              <colgroup>
                {VISIT_COLUMN_WIDTHS.map((width, index) => <col key={index} style={{ width }} />)}
                {medicines.map((medicine) => <col key={medicine.item_name} style={{ width: MEDICINE_COLUMN_WIDTH }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="medlog-frozen-date">Date</th>
                  <th scope="col" className="medlog-frozen-id">Student ID</th>
                  <th scope="col" className="medlog-frozen-name">Name</th>
                  <th scope="col">Sex</th>
                  <th scope="col">Dept./Course</th>
                  <th scope="col">Complaint</th>
                  <th scope="col">Signature</th>
                  {medicines.map((m) => (
                    <th
                      key={m.item_name}
                      scope="col"
                      className="medlog-medicine-header"
                      data-active={activeCell?.itemName === m.item_name}
                      title={`${m.item_name} — ${m.stock_quantity} ${m.unit || 'units'} in stock`}
                    >
                      {/* A flex column so the pair is centred: in vertical
                          writing the block axis runs right-to-left, which left
                          the name hugging the right edge of its cell. */}
                      <div className="medlog-medicine-heading">
                        <span className="medlog-medicine-name">
                          {m.item_name}
                        </span>
                        {/* The count stays HORIZONTAL — digits rotated are hard
                            to read, and this is the number being scanned. */}
                        <span className="medlog-stock-count" aria-label={`${m.stock_quantity} ${m.unit || 'units'} available`}>
                          {m.stock_quantity}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={7 + medicines.length} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading the medicine log…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr className="table-empty-row">
                    <td colSpan={7 + medicines.length}>{loadError ? 'Unable to load visits. Use Refresh to try again.' : hasFilters ? 'No matching visits' : 'No visits yet'}</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const profile = profiles[row.patient_id] || null;
                    return (
                      <tr key={row.visit_id} data-active={activeCell?.visitId === row.visit_id}>
                        <td className="medlog-frozen-date">
                          {displayDate(row.visit_date)}
                        </td>
                        <td className="medlog-frozen-id">{row.patient_id || '—'}</td>
                        <td className="medlog-frozen-name">
                          {row.patient_name || profile?.full_name || '—'}
                        </td>
                        <td>{sexAbbrev(profile?.sex) || '—'}</td>
                        <td title={profile?.course || ''}>{courseAcronym(profile?.course) || '—'}</td>
                        <td style={{ maxWidth: 200 }}>{row.chief_complaint || '—'}</td>

                        <td>
                          {/* The signature belongs to the PATIENT: they confirm
                              what they were given. Staff do not sign here.

                              The date is deliberately not shown — it is stored
                              (patient_signed_at) and the table already has a
                              Date column, so repeating it here added noise. */}
                          {(() => {
                            const patientUrl = signatureUrl(row.patient_signature_path);
                            if (patientUrl) {
                              return (
                                <SignatureImage
                                  url={patientUrl}
                                  alt="Patient acknowledgement signature"
                                  width={104}
                                  height={24}
                                />
                              );
                            }
                            return (
                              <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>
                                Awaiting patient
                              </span>
                            );
                          })()}
                        </td>

                        {medicines.map((m) => {
                          const key = `${row.visit_id}|${m.item_name}`;
                          return (
                            <td key={m.item_name} className="medlog-quantity-cell">
                              <MedicineQuantityCell quantity={cells[key] || 0} disabled={loading}
                                label={`${m.item_name} for ${row.patient_name || profile?.full_name || row.patient_id}, ${row.patient_id}, visit ${displayDate(row.visit_date)}`}
                                onActivate={() => setActiveCell({ visitId: row.visit_id, itemName: m.item_name })}
                                onCommit={(next, expected) => commitCell(row, m.item_name, next, expected)} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={page}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            total={total}
            onPageChange={(next) => changeView(() => setPage(Math.max(0, Math.min(next, totalPages - 1))))}
            itemLabel="visits"
            showWhenEmpty={!loading}
            disabled={loading || pendingCount > 0}
          />
        </div>
      </div>

      <ExportDialog
        open={exporter.exportOpen}
        config={exportConfig}
        rowCount={exporter.rowCount}
        itemLabel="visits"
        busy={exporter.exportBusy}
        onClose={exporter.closeExport}
        onExport={exporter.runExport}
      />

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 7000,
            padding: '12px 20px',
            borderRadius: 12,
            color: 'var(--text-on-primary)',
            fontWeight: 'var(--font-weight-bold)',
            backgroundColor: toast.type === 'error' ? 'var(--danger)' : 'var(--color-emerald)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
    </main>
  );
};

export default MedicalLog;

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
import { useTableExport } from '../hooks/useTableExport.js';
import { buildMedicalLogExportConfig } from '../utils/export/configs.js';
import { courseAcronym, sexAbbrev } from '../utils/medicalLog.js';

const PAGE_SIZE = 20;

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

// A visit is either a non-cancelled appointment or a walk-in encounter, which
// the medical_log_visits view unifies. Reading the view is what makes a
// completed appointment appear here — it has no encounter of its own.
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
const SIGNATURE_IMAGE_LIMIT = 200;

const loadSignatureDataUrls = async (paths) => {
  const unique = [...new Set((paths || []).filter(Boolean))].slice(0, SIGNATURE_IMAGE_LIMIT);
  const map = {};

  await Promise.all(
    unique.map(async (path) => {
      const url = signatureUrl(path);
      if (!url) return;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        map[path] = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        // Left out; the column's text value covers it.
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
  const [stockByName, setStockByName] = useState({});
  // `${encounterId}|${itemName}` -> quantity recorded
  const [cells, setCells] = useState({});
  const [savingCell, setSavingCell] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const pendingRef = useRef({});

  // ---- dispensary list: the form's medicine columns --------------------------
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('inventory')
          .select('item_name, category, stock_quantity, unit')
          .order('category')
          .order('item_name');
        const items = data || [];
        setMedicines(items);
        setStockByName(Object.fromEntries(items.map((i) => [i.item_name, i])));
      } catch (err) {
        console.warn('Could not load the dispensary list:', err);
      }
    })();
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
      if (safe) {
        const parts = [
          `patient_name.ilike.%${safe}%`,
          `chief_complaint.ilike.%${safe}%`,
          `patient_id.ilike.%${safe}%`,
        ];
        for (const id of searchPatientIds || []) {
          parts.push(`patient_id.eq.${id}`);
        }
        q = q.or(parts.join(','));
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
    const dispenseColumns = 'appointment_id, encounter_id, item_name, quantity';

    const [profileRes, byAppointment, byEncounter] = await Promise.all([
      patientIds.length
        ? supabase.from('patient_profiles').select('patient_id, full_name, sex, course').in('patient_id', patientIds)
        : Promise.resolve({ data: [] }),
      appointmentIds.length
        ? supabase.from('inventory_transactions').select(dispenseColumns).in('appointment_id', appointmentIds)
        : Promise.resolve({ data: [] }),
      encounterIds.length
        ? supabase.from('inventory_transactions').select(dispenseColumns).in('encounter_id', encounterIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = Object.fromEntries((profileRes.data || []).map((p) => [p.patient_id, p]));

    // Keyed by visit so a grid cell can be looked up directly.
    const cellMap = {};
    for (const t of [...(byAppointment.data || []), ...(byEncounter.data || [])]) {
      const visit = visits.find(
        (v) =>
          (t.appointment_id && v.appointment_id === t.appointment_id) ||
          (t.encounter_id && v.encounter_id === t.encounter_id)
      );
      if (!visit) continue;
      cellMap[`${visit.visit_id}|${t.item_name}`] = Number(t.quantity || 0);
    }

    return { profileMap, cellMap };
  }, []);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [courseIds, searchPatientIds] = await Promise.all([
        resolveCourseIds(),
        resolveSearchPatientIds(),
      ]);
      const base = buildVisitQuery({ courseIds, searchPatientIds }, true);
      if (!base) {
        setRows([]); setTotal(0); setProfiles({}); setCells({});
        return;
      }

      const from = page * PAGE_SIZE;
      const { data, error, count } = await base.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const encounters = data || [];
      const { profileMap, cellMap } = await decorate(encounters);

      setRows(encounters);
      setTotal(count || 0);
      setProfiles(profileMap);
      setCells(cellMap);
    } catch (err) {
      console.error('Failed to load the medical log:', err);
      setLoadError(err?.message || 'Failed to load the medical log.');
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildVisitQuery, decorate, page, resolveCourseIds, resolveSearchPatientIds]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  useEffect(() => { setPage(0); }, [dateFrom, dateTo, search, course]);

  // ---- writing a cell -------------------------------------------------------
  // Records the dispensing against the visit and moves the stock by the
  // difference, so correcting 2 to 5 only removes 3 more.
  const commitCell = useCallback(
    async (visit, itemName, rawValue) => {
      const key = `${visit.visit_id}|${itemName}`;
      const next = Math.max(0, Math.floor(Number(rawValue) || 0));
      const current = cells[key] || 0;
      if (next === current) return;

      const delta = next - current;
      const item = stockByName[itemName];
      const signer = visit.clinician_name || 'Clinic Staff';

      // Dispensing belongs to the VISIT: the appointment when there is one,
      // otherwise the walk-in encounter. A completed appointment with no
      // encounter can still receive medicines.
      const scope = (q) =>
        visit.appointment_id
          ? q.eq('appointment_id', visit.appointment_id)
          : q.eq('encounter_id', visit.encounter_id);

      const link = visit.appointment_id
        ? { appointment_id: visit.appointment_id, encounter_id: visit.encounter_id || null }
        : { encounter_id: visit.encounter_id };

      setSavingCell(key);
      try {
        if (next === 0) {
          const { error } = await scope(
            supabase.from('inventory_transactions').delete().eq('item_name', itemName)
          );
          if (error) throw error;
        } else {
          const { data: existing, error: findErr } = await scope(
            supabase.from('inventory_transactions').select('id').eq('item_name', itemName)
          ).maybeSingle();
          if (findErr) throw findErr;

          if (existing) {
            const { error } = await supabase
              .from('inventory_transactions')
              .update({ quantity: next, performed_by: signer })
              .eq('id', existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('inventory_transactions').insert([{
              item_name: itemName,
              transaction_type: 'out',
              quantity: next,
              reason: 'Dispensed during consultation',
              performed_by: signer,
              patient_id: visit.patient_id,
              ...link,
            }]);
            if (error) throw error;
          }
        }

        // Stock follows the change, never below zero.
        if (item && delta !== 0) {
          const updated = Math.max(0, Number(item.stock_quantity || 0) - delta);
          const { error: stockErr } = await supabase
            .from('inventory')
            .update({ stock_quantity: updated, updated_at: new Date().toISOString() })
            .eq('item_name', itemName);
          if (stockErr) throw stockErr;
          setStockByName((prev) => ({ ...prev, [itemName]: { ...prev[itemName], stock_quantity: updated } }));
          setMedicines((prev) =>
            prev.map((m) => (m.item_name === itemName ? { ...m, stock_quantity: updated } : m))
          );
        }

        setCells((prev) => {
          const copy = { ...prev };
          if (next === 0) delete copy[key];
          else copy[key] = next;
          return copy;
        });

        await supabase.from('audit_logs').insert([{
          user_name: signer,
          performed_by: signer,
          action: 'Medicine Dispensed',
          description: `${itemName} ×${next} for ${visit.patient_name || visit.patient_id} (was ×${current})`,
          type: 'dispense',
          encounter_id: visit.encounter_id || null,
        }]).then(() => {}, () => {});
      } catch (err) {
        console.error('Could not record the dispensing:', err);
        showToast('Could not save that quantity. Please try again.', 'error');
      } finally {
        setSavingCell(null);
      }
    },
    [cells, stockByName, showToast]
  );

  const fetchAllForExport = useCallback(async () => {
    const [courseIds, searchPatientIds] = await Promise.all([
      resolveCourseIds(),
      resolveSearchPatientIds(),
    ]);
    const base = buildVisitQuery({ courseIds, searchPatientIds }, false);
    if (!base) return [];

    const { data, error } = await base.limit(5000);
    if (error) throw error;

    const encounters = data || [];
    const { profileMap, cellMap } = await decorate(encounters);

    // Preload the signatures so the PDF can print them as images.
    const signatureImages = await loadSignatureDataUrls(
      encounters.map((v) => v.patient_signature_path)
    );

    // One row per visit, with a { medicine: qty } map so the export can render
    // the same medicine columns as the screen.
    return encounters.map((e) => {
      const dispensed = {};
      for (const [key, qty] of Object.entries(cellMap)) {
        if (key.startsWith(`${e.visit_id}|`)) dispensed[key.split('|')[1]] = qty;
      }
      return {
        ...e,
        profile: profileMap[e.patient_id] || null,
        dispensed,
        signatureImage: e.patient_signature_path
          ? signatureImages[e.patient_signature_path] || null
          : null,
      };
    });
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

  // Two frozen columns, not one: the medicine grid is ~1000px wide, so with
  // only the date frozen, scrolling to a medicine pushed the patient's name off
  // screen and you could no longer tell whose row you were typing into.
  //
  // The second column's offset is only correct if the first is exactly this
  // wide, so the first carries width AND min-width and its content is nowrap.
  // Verified in a headless Chrome render: with nowrap it holds at 92px and the
  // second column sits flush against it.
  const STICKY_FIRST_WIDTH = 92;
  const stickyHead = {
    position: 'sticky',
    left: 0,
    width: STICKY_FIRST_WIDTH,
    minWidth: STICKY_FIRST_WIDTH,
    background: 'var(--surface-raised)',
    zIndex: 3,
  };
  const stickyHead2 = {
    position: 'sticky',
    left: STICKY_FIRST_WIDTH,
    background: 'var(--surface-raised)',
    zIndex: 3,
  };
  const stickyCell = {
    position: 'sticky',
    left: 0,
    width: STICKY_FIRST_WIDTH,
    minWidth: STICKY_FIRST_WIDTH,
    background: 'var(--panel)',
    zIndex: 2,
  };
  const stickyCell2 = {
    position: 'sticky',
    left: STICKY_FIRST_WIDTH,
    background: 'var(--panel)',
    zIndex: 2,
  };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Medical Log</h1>
            <div className="page-header-subtitle">
              Clinic visit register — log the medicines given to each patient; stock is deducted automatically.
            </div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={fetchPage} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="btn" onClick={exporter.openExport} disabled={total === 0}>
              Export
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
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
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search the medical log"
              />
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200 }}>
              <select
                className="input"
                style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                aria-label="Filter by course"
              >
                <option value="all">All courses</option>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>

            <input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />

            {hasFilters && (
              <button type="button" className="btn secondary small" onClick={() => { setSearch(''); setCourse('all'); }}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div>
              <h3 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Visit Register</h3>
              <span className="card-subtitle">
                Type the quantity given into a medicine cell — stock is deducted on save.
              </span>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}>
              {total.toLocaleString()} {total === 1 ? 'visit' : 'visits'}
            </span>
          </div>

          {loadError && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--color-rose-bg)', color: 'var(--color-rose-text)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>
              {loadError}
            </div>
          )}

          <div className="table-responsive" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
            <table className="table" aria-label="Medical log">
              <thead>
                <tr>
                  <th style={{ ...stickyHead, whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ ...stickyHead2, whiteSpace: 'nowrap', minWidth: 92 }}>Student ID</th>
                  <th style={{ whiteSpace: 'nowrap', minWidth: 150 }}>Name</th>
                  {/* nowrap on every horizontal header: without it the narrow
                      ones broke mid-word ("Se x", "Dept./Cours e"). */}
                  <th style={{ whiteSpace: 'nowrap', minWidth: 46 }}>Sex</th>
                  <th style={{ whiteSpace: 'nowrap', minWidth: 68 }}>Dept./Course</th>
                  {/* Was 160px holding one- or two-word entries like "Fever". */}
                  <th style={{ whiteSpace: 'nowrap', minWidth: 96 }}>Complaint</th>
                  <th style={{ whiteSpace: 'nowrap', minWidth: 118 }}>Signature</th>
                  {medicines.map((m) => (
                    <th
                      key={m.item_name}
                      title={`${m.item_name} — ${m.stock_quantity} ${m.unit} in stock`}
                      style={{
                        verticalAlign: 'bottom',
                        // A plain width, NOT min/max-width: on a table cell
                        // max-width squeezes the column and the rotated name
                        // wraps mid-string ("Mecilizine / Tablet"), which is
                        // the exact thing rotating was meant to stop. Verified
                        // in a headless Chrome render.
                        //
                        // 46, not 40: the cell input declares minWidth 46, so
                        // that is what the column actually renders at. The two
                        // must agree or the comment describes a width that never
                        // ships.
                        width: 46,
                        padding: '10px 4px',
                        fontSize: 'var(--font-size-2xs)',
                      }}
                    >
                      {/* A flex column so the pair is centred: in vertical
                          writing the block axis runs right-to-left, which left
                          the name hugging the right edge of its cell. */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            // Read bottom-to-top, as on a printed log. The names
                            // are long and the columns narrow, so horizontal text
                            // broke mid-word ("Alu min um Hyd rox ide"); rotated,
                            // a column only needs to be as wide as the font is
                            // tall.
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.15,
                          }}
                        >
                          {m.item_name}
                        </span>
                        {/* The count stays HORIZONTAL — digits rotated are hard
                            to read, and this is the number being scanned. */}
                        <span
                          style={{
                            writingMode: 'horizontal-tb',
                            fontWeight: 'var(--font-weight-normal)',
                            color: 'var(--text-muted)',
                            lineHeight: 1,
                          }}
                        >
                          {m.stock_quantity}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7 + medicines.length} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading the medical log…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7 + medicines.length} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                      {hasFilters
                        ? 'No visits match the current filters.'
                        : 'No consultations recorded in this range.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const profile = profiles[row.patient_id] || null;
                    return (
                      <tr key={row.visit_id}>
                        <td className="sticky-cell" style={{ ...stickyCell, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {displayDate(row.visit_date)}
                        </td>
                        <td className="sticky-cell" style={{ ...stickyCell2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.patient_id || '—'}</td>
                        <td style={{ fontWeight: 'var(--font-weight-semibold)' }}>
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
                          const value = cells[key] ?? '';
                          const isSaving = savingCell === key;
                          return (
                            <td key={m.item_name} style={{ padding: '6px 4px' }}>
                              <input
                                // Remount when the stored value changes so a Refresh
                                // re-syncs the cell; typing is unaffected because the
                                // value only changes once the save lands.
                                key={`${m.item_name}-${value}`}
                                type="number"
                                min="0"
                                inputMode="numeric"
                                aria-label={`${m.item_name} given to ${row.patient_name || row.patient_id}`}
                                className="medlog-cell-input"
                                defaultValue={value}
                                disabled={isSaving}
                                onBlur={(e) => commitCell(row, m.item_name, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                style={{
                                  width: '100%',
                                  minWidth: 46,
                                  textAlign: 'center',
                                  padding: '4px 2px',
                                  borderRadius: 6,
                                  // The frame is shown at rest, deliberately. Hiding it
                                  // until hover made it unclear where you could type —
                                  // for staff scanning the grid, the box IS the
                                  // affordance, and a known pattern outranks a calmer
                                  // surface on a data-entry screen.
                                  border: '1px solid var(--border)',
                                  background: isSaving ? 'var(--surface-raised)' : 'var(--input-bg)',
                                  color: 'var(--text)',
                                  fontVariantNumeric: 'tabular-nums',
                                  fontSize: 'var(--font-size-sm)',
                                }}
                              />
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
            onPageChange={(next) => setPage(Math.max(0, Math.min(next, totalPages - 1)))}
            itemLabel="visits"
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

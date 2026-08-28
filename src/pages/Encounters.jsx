// src/pages/Encounters.jsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { canDeleteRecord, canViewSensitiveField, getSensitivityLevel, isHighSensitivity, isOwnerOrPrivileged, isPhysician } from '../accessControl.js';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';
import { SearchIcon, CloseIcon, ChevronDownIcon } from '../components/icons/Icons.jsx';

function localizedDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  } catch {
    return new Date(dateStr).toLocaleString();
  }
}

// Helper: return date-key "YYYY-MM-DD" in Asia/Manila for a given date string or Date
function toManilaDateKey(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  // en-CA produces YYYY-MM-DD formatting
  try {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  } catch {
    // fallback
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
}

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

const Encounters = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // UI controls
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent'); // 'recent' | 'oldest'
  const [clinicianFilter, setClinicianFilter] = useState('all');

  // per-row loading ids for actions (so only that row's button is disabled)
  const [loadingIds, setLoadingIds] = useState([]); // array of encIds being processed

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const pdfExportRef = useRef();

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // DELETE modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteMessageType, setDeleteMessageType] = useState(''); // success | error
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  // Active queue will reference today's date in Asia/Manila
  const todayKey = toManilaDateKey(new Date());

  // determine active = encounter date is today (Asia/Manila)
  const isActive = (dateStr) => {
    if (!dateStr) return false;
    return toManilaDateKey(dateStr) === todayKey;
  };

  // Helper: batch fetch patient names for missing patient_name fields
  const enrichWithPatientNames = async (rows) => {
    if (!rows || rows.length === 0) return rows;
    const idsToFetch = Array.from(new Set(rows.filter(r => !r.patient_name && r.patient_id).map(r => r.patient_id)));
    if (idsToFetch.length === 0) return rows;
    try {
      const { data: patientsData, error } = await supabase.from('patients').select('id, name').in('id', idsToFetch);
      if (!error && patientsData) {
        const map = {};
        patientsData.forEach(p => { map[p.id] = p.name; });
        return rows.map(r => r.patient_name ? r : { ...r, patient_name: map[r.patient_id] || r.patient_name || '' });
      }
    } catch (err) {
      console.error('Failed fetching patient names', err);
    }
    return rows;
  };

  // fetch encounters and enrich
  const fetchEncounters = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('encounters').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching encounters:', error);
        showToast('Failed to load encounters', 'error');
      } else if (mountedRef.current) {
        const enriched = await enrichWithPatientNames(data || []);
        setEncounters(enriched || []);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load encounters', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchEncounters();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        fetchEncounters();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // realtime subscription (Supabase channel API)
    const channel = supabase
      .channel('public:encounters')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounters' }, async (payload) => {
        const ev = payload.eventType;
        const row = payload.new ?? payload.old;
        let rowWithName = row;
        if (row && !row.patient_name && row.patient_id) {
          try {
            const { data: pData, error: pErr } = await supabase.from('patients').select('id,name').eq('id', row.patient_id).maybeSingle();
            if (!pErr && pData) rowWithName = { ...row, patient_name: pData.name };
          } catch (err) {
            // ignore
          }
        }

        setEncounters(prev => {
          if (ev === 'INSERT') return [rowWithName, ...prev];
          if (ev === 'UPDATE') return prev.map(r => (r.id === rowWithName.id ? rowWithName : r));
          if (ev === 'DELETE') return prev.filter(r => r.id !== rowWithName.id);
          return prev;
        });
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        supabase.removeChannel(channel);
      } catch {
        try { supabase.removeAllSubscriptions(); } catch (e) { /* ignore */ }
      }
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamically derive unique clinicians list from existing encounter records
  const clinicians = useMemo(() => {
    const set = new Set();
    (encounters || []).forEach(e => {
      if (e.clinician_name && e.clinician_name.trim()) {
        set.add(e.clinician_name.trim());
      }
    });
    return Array.from(set).sort();
  }, [encounters]);

  // Active Queue (Today) - patients with encounter today not yet completed
  const activeEncounters = useMemo(() => {
    return (encounters || []).filter(e => isActive(e.encounter_date) && (e.status || '').toLowerCase() !== 'completed');
  }, [encounters, todayKey]);

  // Encounter History & Archived Visits - historical/completed records filtered by search, clinician, and sort
  const historyEncounters = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    let arr = (encounters || []).filter(e => !isActive(e.encounter_date) || (e.status || '').toLowerCase() === 'completed');

    if (q) {
      arr = arr.filter(e => {
        const idVal = (e.patient_id || '').toString().toLowerCase();
        const nameVal = (e.patient_name || '').toLowerCase();
        const clinician = (e.clinician_name || '').toLowerCase();
        const complaint = (e.chief_complaint || '').toLowerCase();
        return idVal.includes(q) || nameVal.includes(q) || clinician.includes(q) || complaint.includes(q);
      });
    }

    if (clinicianFilter && clinicianFilter !== 'all') {
      arr = arr.filter(e => (e.clinician_name || '').trim() === clinicianFilter);
    }

    arr.sort((a, b) => {
      const da = new Date(a.encounter_date || a.created_at).getTime();
      const db = new Date(b.encounter_date || b.created_at).getTime();
      return sort === 'recent' ? db - da : da - db;
    });

    return arr;
  }, [encounters, search, sort, clinicianFilter, todayKey]);

  // helper to add/remove loading id
  const setLoadingId = (id, isLoading) => {
    setLoadingIds(prev => {
      if (isLoading) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      } else {
        return prev.filter(x => x !== id);
      }
    });
  };

  // Mark complete action — try DB, fallback to local-only
  const markComplete = async (encId) => {
    if (!encId) return;
    const target = (encounters || []).find(e => e.id === encId);
    if (!isOwnerOrPrivileged(user, target?.clinician_name)) {
      showToast('You can only update your own encounters.', 'error');
      return;
    }
    setLoadingId(encId, true);

    try {
      try {
        const { data, error } = await supabase
          .from('encounters')
          .update({ status: 'completed' })
          .eq('id', encId)
          .select()
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setEncounters(prev => prev.map(e => (e.id === encId ? { ...e, ...data } : e)));
          showToast('Marked complete');
          setLoadingId(encId, false);
          return;
        }
      } catch (dbErr) {
        console.warn('DB update failed (falling back to local):', dbErr);
      }

      setEncounters(prev => prev.map(e => (e.id === encId ? { ...e, status: 'completed' } : e)));
      await new Promise(res => setTimeout(res, 200));
      showToast('Completed');
    } catch (err) {
      console.error('Mark complete failed', err);
      showToast('Failed to move to history', 'error');
    } finally {
      setLoadingId(encId, false);
    }
  };

  // ---------------- DELETE ENCOUNTER ----------------
  const openDeleteModal = (enc) => {
    setDeleteItem(enc);
    setDeleteConfirmText('');
    setDeleteMessage('');
    setDeleteMessageType('');
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteItem(null);
    setDeleteConfirmText('');
    setDeleteMessage('');
    setDeleteMessageType('');
  };

  const submitDeleteEncounter = async () => {
    if (!canDeleteRecord(user)) {
      setDeleteMessage('Only physicians can delete encounters.');
      setDeleteMessageType('error');
      return;
    }

    if (!deleteItem || !deleteItem.id) {
      setDeleteMessage('Invalid encounter.');
      setDeleteMessageType('error');
      return;
    }

    // require patient ID typed for safety
    if (deleteConfirmText !== String(deleteItem.patient_id)) {
      setDeleteMessage('Type the exact patient ID to confirm.');
      setDeleteMessageType('error');
      return;
    }

    if (!deletePassword) {
      setDeleteMessage('Password is required.');
      setDeleteMessageType('error');
      return;
    }

    setDeleting(true);
    try {
      // Verify password with Supabase Auth
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: deletePassword,
      });

      if (verifyError) {
        setDeleteMessage('Incorrect password.');
        setDeleteMessageType('error');
        setDeleting(false);
        return;
      }

      const { error } = await supabase
        .from('encounters')
        .delete()
        .eq('id', deleteItem.id);

      if (error) throw error;

      // remove locally
      setEncounters(prev => prev.filter(e => e.id !== deleteItem.id));

      setDeleteMessage('Encounter deleted successfully.');
      setDeleteMessageType('success');

      // close after delay
      setTimeout(() => {
        closeDeleteModal();
      }, 900);
    } catch (err) {
      console.error(err);
      setDeleteMessage('Delete failed: ' + (err.message || err));
      setDeleteMessageType('error');
    } finally {
      setDeleting(false);
    }
  };
  // ---------------- end DELETE ----------------

  // ---------------- PDF Export (last 30 days) ----------------
  const exportPdfLast30Days = async () => {
    const now = Date.now();
    const rows = (encounters || []).filter(e => {
      const t = new Date(e.encounter_date || e.created_at).getTime();
      return now - t <= DAYS_30_MS;
    }).sort((a, b) => new Date(b.encounter_date || b.created_at) - new Date(a.encounter_date || a.created_at));

    if (rows.length === 0) {
      showToast('No encounters in the last 30 days to export', 'error');
      return;
    }

    try {
      const container = pdfExportRef.current;
      if (!container) {
        showToast('Export failed (missing container)', 'error');
        return;
      }

      // clear previous body
      const tableBody = container.querySelector('#export-tbody');
      tableBody.innerHTML = '';

      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.style.borderTop = '1px solid #eee';
        // sanitize inline by replacing '<' to '&lt;'
        const safeName = (r.patient_name || '').replace(/</g,'&lt;');
        const safeId = (r.patient_id || '').toString().replace(/</g,'&lt;');
        const safeClin = (r.clinician_name || '').replace(/</g,'&lt;');
        const safeComplaint = (r.chief_complaint || '').replace(/</g,'&lt;');
        const safePlan = canViewSensitiveField(user, 'assessment_plan', r)
          ? (r.assessment_plan || '').replace(/</g,'&lt;')
          : '[Restricted for nurse access]';

        tr.innerHTML = `
          <td style="padding:8px; font-weight:600; vertical-align: top;">${safeName}</td>
          <td style="padding:8px; vertical-align: top;">${safeId}</td>
          <td style="padding:8px; vertical-align: top;">${localizedDateTime(r.encounter_date || r.created_at)}</td>
          <td style="padding:8px; vertical-align: top;">${safeClin}</td>
          <td style="padding:8px; max-width:240px; word-wrap:break-word; vertical-align: top;">${safeComplaint}</td>
          <td style="padding:8px; vertical-align: top;">${safePlan}</td>
        `;
        tableBody.appendChild(tr);
      }

      const imgs = Array.from(container.querySelectorAll('img'));
      await Promise.all(imgs.map(img => new Promise(res => { if (img.complete) return res(); img.onload = img.onerror = res; })));

      const scale = 2;
      const canvas = await html2canvas(container, { scale, useCORS: true, allowTaint: true, logging: false, windowWidth: container.scrollWidth, windowHeight: container.scrollHeight });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const ratio = pageWidth / canvasWidth;
      const renderedHeight = canvasHeight * ratio;

      if (renderedHeight <= pageHeight) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, renderedHeight);
      } else {
        let y = 0;
        const pxPerPage = Math.floor(pageHeight / ratio);
        while (y < canvasHeight) {
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvasWidth;
          pageCanvas.height = Math.min(pxPerPage, canvasHeight - y);
          const ctx = pageCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, y, canvasWidth, pageCanvas.height, 0, 0, canvasWidth, pageCanvas.height);
          const pageData = pageCanvas.toDataURL('image/jpeg', 0.95);
          if (y > 0) pdf.addPage();
          const h = pageCanvas.height * ratio;
          pdf.addImage(pageData, 'JPEG', 0, 0, pageWidth, h);
          y += pxPerPage;
        }
      }

      pdf.save(`encounters_last30days_${new Date().toISOString().slice(0,10)}.pdf`);
      showToast('PDF exported');
    } catch (err) {
      console.error('Export error', err);
      showToast('Export failed', 'error');
    }
  };
  // ---------------- end PDF Export ----------------

  return (
    <>
      <main className="main">
        <div className="page" aria-labelledby="encounters-title">
          {/* 1. Page Header: Clean & focused with primary action only */}
          <div className="page-header">
            <div className="page-header-title-block">
              <h1 id="encounters-title" className="page-header-title">Clinical Encounters</h1>
              <div className="page-header-subtitle">
                Manage daily patient consultations, active encounter queue, and clinical records.
              </div>
            </div>

            <div className="page-header-actions">
              <button type="button" className="btn" onClick={() => navigate('/encounter')}>
                New Encounter
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
            {/* 2. Active Queue (Today) */}
            <div className="card" aria-live="polite">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Active Queue (Today)</h3>
                  <span className="card-subtitle">Patients currently undergoing consultation or awaiting triage</span>
                </div>
                <span className="badge badge-purple">
                  {activeEncounters.length} Active Visits
                </span>
              </div>

              <div className="table-responsive">
                <table className="table" aria-label="Active Encounters table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Student ID</th>
                      <th>Encounter Time</th>
                      <th>Clinician</th>
                      <th>Chief Complaint</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading queue…</td></tr>
                    ) : activeEncounters.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No active encounters for today.</td></tr>
                    ) : (
                      activeEncounters.map(enc => (
                        <tr key={enc.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{enc.patient_name || enc.patient_id || '—'}</div>
                          </td>
                          <td>
                            <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{enc.patient_id}</span>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }} title={localizedDateTime(enc.encounter_date)}>
                            {localizedDateTime(enc.encounter_date)}
                          </td>
                          <td>{enc.clinician_name || 'Staff'}</td>
                          <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 500 }}>{enc.chief_complaint || 'N/A'}</span>
                            {isPhysician(user) && getSensitivityLevel(enc) && getSensitivityLevel(enc) !== 'normal' && (
                              <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                                {getSensitivityLevel(enc)}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 8 }}>
                              <button className="btn secondary small" onClick={() => markComplete(enc.id)} disabled={loadingIds.includes(enc.id)}>
                                {loadingIds.includes(enc.id) ? 'Completing…' : 'Mark Complete'}
                              </button>
                              <button className="btn small" onClick={() => navigate(`/patient-profile?id=${enc.patient_id}`)}>
                                Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Encounter History & Archived Visits Workspace */}
            <div className="card" style={{ padding: '20px 22px' }}>
              {/* Header & Dynamic Record Count */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    Encounter History & Archived Visits
                  </h2>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Comprehensive clinical records log
                  </div>
                </div>
                <span className="badge badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
                  Total: <strong>{historyEncounters.length}</strong> records
                </span>
              </div>

              {/* Table Toolbar: Fluid Search + Sort + Clinician Filter + Export PDF */}
              <div className="encounters-toolbar">
                {/* 1. Full-Width Search Input */}
                <div className="encounters-search-wrapper">
                  <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center' }}>
                    <SearchIcon size={16} />
                  </span>
                  <input
                    id="encounters-search"
                    type="search"
                    className="encounters-search-input"
                    placeholder="Search patient, ID, or complaint..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search patient, ID, or complaint"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}
                      aria-label="Clear search"
                    >
                      <CloseIcon size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Controls Group */}
                <div className="encounters-filter-group">
                  {/* 2. Sort Dropdown */}
                  <div className="encounters-select-wrapper">
                    <select
                      id="encounters-sort"
                      aria-label="Sort encounters"
                      value={sort}
                      onChange={e => setSort(e.target.value)}
                      className="encounters-filter-select"
                    >
                      <option value="recent">Recent first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                    <span className="encounters-filter-chevron">
                      <ChevronDownIcon size={13} />
                    </span>
                  </div>

                  {/* 3. Clinician Filter Dropdown */}
                  <div className="encounters-select-wrapper">
                    <select
                      id="encounters-clinician-filter"
                      aria-label="Filter by clinician"
                      value={clinicianFilter}
                      onChange={e => setClinicianFilter(e.target.value)}
                      className="encounters-filter-select"
                    >
                      <option value="all">All Clinicians</option>
                      {clinicians.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span className="encounters-filter-chevron">
                      <ChevronDownIcon size={13} />
                    </span>
                  </div>

                  {/* 4. Export PDF Button (text-only, secondary button) */}
                  {user?.role === 'physician' && (
                    <button
                      type="button"
                      id="encounters-export-pdf-btn"
                      className="btn secondary"
                      onClick={exportPdfLast30Days}
                    >
                      Export PDF
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive" style={{ maxHeight: 480 }}>
                <table className="table" aria-label="Encounter History table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Student ID</th>
                      <th>Date & Time</th>
                      <th>Clinician</th>
                      <th>Chief Complaint</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading history records…</td></tr>
                    ) : historyEncounters.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No history records.</td></tr>
                    ) : (
                      historyEncounters.map(enc => (
                        <tr key={enc.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{enc.patient_name || enc.patient_id || '—'}</div>
                          </td>
                          <td>
                            <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{enc.patient_id}</span>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }} title={localizedDateTime(enc.encounter_date)}>
                            {localizedDateTime(enc.encounter_date)}
                          </td>
                          <td>{enc.clinician_name || 'Staff'}</td>
                          <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 500 }}>{enc.chief_complaint || 'N/A'}</span>
                            {isPhysician(user) && getSensitivityLevel(enc) && getSensitivityLevel(enc) !== 'normal' && (
                              <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                                {getSensitivityLevel(enc)}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 8 }}>
                              <button className="btn secondary small" onClick={() => navigate(`/patient-profile?id=${enc.patient_id}`)}>
                                Profile
                              </button>

                              {canDeleteRecord(user) && (
                                <button
                                  className="btn danger small"
                                  onClick={() => openDeleteModal(enc)}
                                  title="Delete Encounter"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 7000,
              padding: '12px 20px',
              borderRadius: 12,
              color: 'white',
              fontWeight: 700,
              backgroundColor: toast.type === 'error' ? '#dc2626' : '#059669',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
              <span>{toast.text}</span>
            </div>
          )}
        </div>
      </main>

      {/* Hidden export container for PDF (styled inline for reliable rendering)
          - Updated to match PatientProfile export layout (header, semantic table, exported timestamp)
      */}
      <div ref={pdfExportRef} style={{ position: 'absolute', left: -9999, top: -9999, width: 794, padding: 24, background: '#fff' }} aria-hidden>
        <div style={{ width: '100%', background: '#fff', color: '#111', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <img src={tupehrlogo} alt="TUP Clinic logo" style={{ width: 100, height: 'auto', objectFit: 'contain' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Technological University of the Philippines (TUP) Manila – Clinic</div>
              <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700 }}>Encounters — Last 30 days</div>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #ddd', marginBottom: 12 }} />

          <div style={{ marginBottom: 10, color: '#444' }}>
            Manage today's queue and review the most recent encounters (last 30 days).
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>ID</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Date</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Clinician</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Complaint</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Assessment / Plan</th>
              </tr>
            </thead>
            <tbody id="export-tbody">
              {/* rows populated dynamically by export function */}
            </tbody>
          </table>

          <div style={{ marginTop: 20, fontSize: 12, color: '#666' }}>
            Exported on: <strong>{new Date().toLocaleString()}</strong>
          </div>

          <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
            Exported from EHR system
          </div>
        </div>
      </div>

      {/* DELETE MODAL */}
      {showDeleteModal && deleteItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 10,
            width: '420px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ marginTop: 0 }}>Delete Encounter</h3>

            <p style={{ color: 'var(--muted)' }}>
              This will permanently delete the encounter for <strong>{deleteItem.patient_id}</strong>.
            </p>

            <div style={{ marginTop: 12 }}>
              <label>Type the Patient ID to confirm:</label>
              <input
                className="input"
                style={{ marginTop: 6 }}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Enter your password to verify:</label>
              <input
                type="password"
                className="input"
                style={{ marginTop: 6 }}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>

            {deleteMessage && (
              <div style={{
                marginTop: 12,
                padding: '8px',
                borderRadius: 6,
                border: `1px solid ${deleteMessageType === 'error' ? 'red' : 'green'}`,
                color: deleteMessageType === 'error' ? 'red' : 'green'
              }}>
                {deleteMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
              <button className="btn secondary" onClick={submitDeleteEncounter} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Encounters;

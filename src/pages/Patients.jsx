// src/pages/Patients.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { getSensitivityLevel, isPhysician } from '../accessControl.js';
import { useAuth } from '../AuthContext.jsx';
import { SearchIcon, CloseIcon, ChevronDownIcon, ArrowUpIcon, ArrowDownIcon } from '../components/icons/Icons.jsx';

const Patients = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // data
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // search & sort (separate field and direction)
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('desc');

  // register modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerTab, setRegisterTab] = useState('search'); // 'search' | 'manual'
  // search mode
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSuggestions, setStudentSuggestions] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  // manual mode
  const [manualStudent, setManualStudent] = useState({ name: '', id: '', year: 1 });

  const [showNewStudentForm, setShowNewStudentForm] = useState(false);

  // state for registering
  const [registering, setRegistering] = useState(false);

  // toast
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  // ---------- Validation / Sanitization helpers (ADDED) ----------
  const NAME_MAX = 50;
  const ID_MAX = 30;
  // Allow letters, spaces, dots, apostrophes, hyphens (common in names)
  const nameRegex = /^[a-zA-Z .'\-]+$/;
  // Allow alphanumerics and a few safe punctuation for student IDs
  const idRegex = /^[A-Za-z0-9\-_.]+$/;

  const validateName = (name) => {
    if (!name) return false;
    if (typeof name !== 'string') return false;
    if (name.length > NAME_MAX) return false;
    // trim and test
    return nameRegex.test(name.trim());
  };

  const validateId = (id) => {
    if (!id) return false;
    if (typeof id !== 'string') return false;
    if (id.length > ID_MAX) return false;
    return idRegex.test(id.trim());
  };

  // sanitize free-text search used in ilike patterns: remove % and _
  const sanitizeIlikeQuery = (q) => {
    if (!q || typeof q !== 'string') return '';
    return q.replace(/[%_]/g, '').trim();
  };
  // ---------------------------------------------------------------

  // fetch patients
  const fetchPatients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('patients').select('*').order('name', { ascending: true });
      if (error) {
        console.error('Error fetching patients:', error);
        showToast('Failed to fetch patients', 'error');
      } else {
        setPatients(data || []);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch patients', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPatients();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // student suggestions for search tab
  useEffect(() => {
    let mounted = true;
    const fetchStudents = async () => {
      const q = (studentSearch || '').trim();
      if (!q || q.length < 2) {
        setStudentSuggestions([]);
        return;
      }

      // SANITIZE the query so `%` and `_` cannot change the pattern
      const safeQ = sanitizeIlikeQuery(q);
      if (!safeQ || safeQ.length < 2) {
        setStudentSuggestions([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, name, year')
          .or(`name.ilike.%${safeQ}%,id.ilike.%${safeQ}%`)
          .limit(8)
          .order('name', { ascending: true });
        if (error) console.error('Error fetching students:', error);
        else if (mounted) setStudentSuggestions(data || []);
      } catch (err) {
        console.error(err);
      }
    };

    const deb = setTimeout(fetchStudents, 200);
    return () => { mounted = false; clearTimeout(deb); };
  }, [studentSearch]);

  // Sorting and filtering
  const filteredPatients = patients.filter(p =>
    search.trim() === '' ||
    (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
    (p.id && p.id.toString().toLowerCase().includes(search.toLowerCase()))
  );

  const sortedPatients = React.useMemo(() => {
    const arr = (filteredPatients || []).slice();
    arr.sort((a, b) => {
      const get = (obj, f) => {
        if (f === 'last') return new Date(obj.last_visit_date || 0).getTime();
        if (f === 'year') return Number(obj.year || 0);
        return (obj[f] || '').toString().toLowerCase();
      };
      const va = get(a, sortField);
      const vb = get(b, sortField);
      if (va > vb) return sortDirection === 'asc' ? 1 : -1;
      if (va < vb) return sortDirection === 'asc' ? -1 : 1;
      return 0;
    });
    return arr;
  }, [filteredPatients, sortField, sortDirection]);

  // create student (manual tab) - insert into students table and select it automatically
  const submitCreateStudent = async () => {
    // VALIDATION: ensure name and id meet rules
    const name = (manualStudent.name || '').trim();
    const id = (manualStudent.id || '').trim();

    if (!name || !id) {
      showToast('Student name and ID are required', 'error');
      return;
    }

    if (!validateName(name)) {
      showToast(`Invalid name. Letters, spaces, dot, apostrophe, and hyphen only. Max ${NAME_MAX} chars.`, 'error');
      return;
    }

    if (!validateId(id)) {
      showToast(`Invalid ID. Use letters, numbers, -, _, or . only. Max ${ID_MAX} chars.`, 'error');
      return;
    }

    try {
      const payload = { id: id, name: name, year: Number(manualStudent.year || 1) };
      const { error } = await supabase.from('students').insert([payload]).select();

      if (error) {
        // if insert fails (e.g. already exists) attempt to fetch existing
        console.warn('create student error', error);
        const { data: existing, error: fetchErr } = await supabase.from('students').select('id,name,year').eq('id', id).single();
        if (fetchErr) {
          console.error('fetch after insert fail', fetchErr);
          showToast('Failed to create student', 'error');
          return;
        }
        setSelectedStudent(existing);
        showToast('Student exists — selected', 'success');
      } else {
        setSelectedStudent(payload);
        showToast('Student created & selected', 'success');
        try { await logAudit('Student Create', `Created new student: ${payload.name} (${payload.id})`); } catch (e) { console.warn('audit failed', e); }
      }
      // switch preview to selected student
      setShowNewStudentForm(false);
      setStudentSearch('');
      setStudentSuggestions([]);
      setRegisterTab('search');
    } catch (err) {
      console.error(err);
      showToast('Failed to create student', 'error');
    }
  };

  // register patient (from modal) — uses selectedStudent (from search or manual)
  const submitRegisterPatient = async (studentToRegister) => {
    const s = studentToRegister || selectedStudent;
    if (!s || !s.id) {
      showToast('No patient selected', 'error');
      return;
    }

    // VALIDATION: verify preview fields are well-formed before registering
    const sName = (s.name || '').toString().trim();
    const sId = (s.id || '').toString().trim();
    if (!validateName(sName)) {
      showToast('Preview has invalid name — cannot register', 'error');
      return;
    }
    if (!validateId(sId)) {
      showToast('Preview has invalid ID — cannot register', 'error');
      return;
    }

    if (patients.some(p => (p.id || '').toString() === (sId || '').toString())) {
      showToast('This student is already registered as a patient', 'error');
      return;
    }

    setRegistering(true);
    try {
      const lastVisit = new Date().toISOString().split('T')[0];
      const payload = {
        id: sId,
        name: sName,
        year: s.year || 1,
        last_visit_date: lastVisit
      };
      const { error } = await supabase.from('patients').insert([payload]);

      if (error) {
        console.error('Error registering patient', error);
        showToast('Error registering patients', 'error');
      } else {
        showToast('Patient registered', 'success');
        await fetchPatients(); // refresh list
        try { await logAudit('Patient Registration', `Registered new patient: ${payload.name} (${payload.id})`); } catch (e) { console.warn('audit failed', e); }
        // close modal and reset
        setShowRegisterModal(false);
        setSelectedStudent(null);
        setManualStudent({ name: '', id: '', year: 1 });
        setStudentSearch('');
        setStudentSuggestions([]);
        setShowNewStudentForm(false);
      }
    } catch (err) {
      console.error(err);
      showToast('Registration failed', 'error');
    } finally {
      setRegistering(false);
    }
  };

  // navigation helpers
  const handleOpenProfile = (patientId) => navigate('/patient-profile', { state: { patientId } });
  const handleNewEncounter = (patient) => navigate('/encounter', { state: { patientId: patient.id, patientName: patient.name } });

  // preview item (student to show in modal)
  const previewStudent = selectedStudent ? selectedStudent : (manualStudent.name ? manualStudent : null);

  return (
    <main className="main">
      <div className="page">
        {/* Header Bar: Clean & focused with primary action only */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Patients Directory</h1>
            <div className="page-header-subtitle">
              Manage registered patient records, student profiles, and clinical encounters.
            </div>
          </div>

          <div className="page-header-actions">
            <button
              type="button"
              className="btn"
              onClick={() => { setShowRegisterModal(true); setRegisterTab('search'); setSelectedStudent(null); setManualStudent({ name: '', id: '', year: 1 }); }}
            >
              Register Patient
            </button>
          </div>
        </div>

        {/* register modal */}
        {showRegisterModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', padding: 16
          }}>
            <div style={{ width: 880, maxWidth: '98%', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Register New Patient</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Search existing student directory or create manual patient entry</div>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => { setShowRegisterModal(false); setSelectedStudent(null); setStudentSearch(''); setStudentSuggestions([]); setManualStudent({ name: '', id: '', year: 1 }); }}
                  aria-label="Close modal"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0, minHeight: 360 }}>
                <div style={{ padding: 24 }}>
                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                    <button
                      className={registerTab === 'search' ? 'btn small' : 'btn secondary small'}
                      onClick={() => {
                        setRegisterTab('search');
                        setSelectedStudent(null);
                        setManualStudent({ name: '', id: '', year: 1 });
                      }}
                    >
                      Search Student Directory
                    </button>

                    <button
                      className={registerTab === 'manual' ? 'btn small' : 'btn secondary small'}
                      onClick={() => {
                        setRegisterTab('manual');
                        setStudentSearch('');
                        setStudentSuggestions([]);
                        setSelectedStudent(null);
                      }}
                    >
                      Manual Entry
                    </button>
                  </div>

                  {/* Search tab */}
                  {registerTab === 'search' && (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Search students</label>
                        <input
                          placeholder="Type name or ID (min 2 chars)..."
                          value={studentSearch}
                          onChange={(e) => { setStudentSearch(e.target.value); setShowNewStudentForm(false); setSelectedStudent(null); }}
                          className="input"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--panel)' }}>
                        {studentSuggestions.length > 0 ? (
                          studentSuggestions.map(s => (
                            <div key={s.id} onClick={() => { setSelectedStudent(s); setStudentSearch(`${s.name} (${s.id})`); setStudentSuggestions([]); }} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.12s' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{s.name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.id} — Year {s.year}</div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: 18, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                            Type at least 2 characters to search students.
                          </div>
                        )}
                      </div>

                      {selectedStudent && (
                        <div style={{ marginTop: 16, padding: 14, background: 'var(--color-primary-tint)', border: '1px solid var(--color-primary-border)', borderRadius: 10 }}>
                          <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 12, textTransform: 'uppercase' }}>Selected Student</div>
                          <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--text)' }}>{selectedStudent.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedStudent.id} • Year {selectedStudent.year}</div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Manual tab */}
                  {registerTab === 'manual' && (
                    <div style={{ display: 'grid', gap: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Full name</label>
                        <input
                          value={manualStudent.name}
                          onChange={(e) => setManualStudent(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Juan Dela Cruz"
                          className="input"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Student ID</label>
                          <input
                            value={manualStudent.id}
                            onChange={(e) => setManualStudent(prev => ({ ...prev, id: e.target.value }))}
                            placeholder="e.g. 2023-01234"
                            className="input"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Year</label>
                          <input value={manualStudent.year} onChange={(e) => setManualStudent(prev => ({ ...prev, year: Number(e.target.value || 1) }))} type="number" min={1} max={5} className="input" style={{ width: '100%' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                        <button className="btn secondary small" onClick={() => { setManualStudent({ name: '', id: '', year: 1 }); }}>Reset</button>
                        <button className="btn small" onClick={async () => { await submitCreateStudent(); }}>
                          Create & Select
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column: preview */}
                <div style={{ padding: 24, borderLeft: '1px solid var(--border-subtle)', background: 'var(--surface-raised)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Patient Preview</div>

                  {!previewStudent ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                      No patient selected. Search or enter details on the left to preview the patient profile before registering.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="card" style={{ padding: 16, background: 'var(--panel)' }}>
                        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{previewStudent.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{previewStudent.id} • Year {previewStudent.year || '—'}</div>
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10, fontSize: 12, color: 'var(--text-light)' }}>
                          Clicking register will create an active EHR record and log the registration date.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-raised)' }}>
                <button
                  className="btn secondary"
                  onClick={() => { setShowRegisterModal(false); setSelectedStudent(null); setStudentSearch(''); setStudentSuggestions([]); setManualStudent({ name: '', id: '', year: 1 }); }}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  onClick={() => submitRegisterPatient(previewStudent)}
                  disabled={!previewStudent || registering}
                  title={!previewStudent ? 'Preview a student first' : 'Register the previewed student'}
                >
                  {registering ? 'Registering…' : 'Register Patient'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Patients Table Card */}
        <div className="card" style={{ padding: '20px 22px' }}>
          {/* Card Header & Dynamic Count */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Registered Patients
              </h2>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Student directory and clinical patient registry
              </div>
            </div>

            <span className="badge badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
              Total: <strong>{sortedPatients.length}</strong>
            </span>
          </div>

          {/* Table Toolbar: Fluid Search + Sort Field + Sort Direction */}
          <div className="patients-toolbar">
            {/* 1. Full-Width Search Input (Single visible input shell) */}
            <div className="patients-search-wrapper">
              <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center' }}>
                <SearchIcon size={16} />
              </span>
              <input
                id="patients-search"
                type="search"
                className="patients-search-input"
                placeholder="Search patients by name or student ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search patients by name or student ID"
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

            {/* 2. Filter Controls Group: Sort Field + Direction */}
            <div className="patients-filter-group">
              <div className="patients-select-wrapper">
                <select
                  id="patients-sort-field"
                  className="patients-filter-select"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  aria-label="Sort patients by field"
                >
                  <option value="name">Sort By: Name</option>
                  <option value="year">Sort By: Year Level</option>
                  <option value="last">Sort By: Last Visit</option>
                </select>
                <span className="patients-filter-chevron">
                  <ChevronDownIcon size={13} />
                </span>
              </div>

              <button
                type="button"
                id="patients-sort-direction-btn"
                className="patients-direction-btn"
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
                aria-label={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
              >
                {sortDirection === 'asc' ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table" aria-label="Patients table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Student ID</th>
                  <th>Year Level</th>
                  <th>Last Visit</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading patient records…</td></tr>
                ) : sortedPatients.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No patients found.</td></tr>
                ) : (
                  sortedPatients.map(pat => (
                    <tr key={pat.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{pat.name}</div>
                        {isPhysician(user) && getSensitivityLevel(pat) && getSensitivityLevel(pat) !== 'normal' && (
                          <span className="badge badge-warning" style={{ marginTop: 4 }}>
                            Sensitivity: {getSensitivityLevel(pat)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{pat.id}</span>
                      </td>
                      <td>
                        <span className="badge badge-info">Year {pat.year}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {pat.last_visit_date || '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <button className="btn secondary small" onClick={() => handleOpenProfile(pat.id)}>
                            View Profile
                          </button>
                          <button className="btn small" onClick={() => handleNewEncounter(pat)}>
                            Encounter
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

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 6000,
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
  );
};

export default Patients;

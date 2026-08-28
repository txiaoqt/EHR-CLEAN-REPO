// src/pages/Patients.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { getSensitivityLevel, isPhysician } from '../accessControl.js';
import { useAuth } from '../AuthContext.jsx';

const Patients = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // data
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // search & sort
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState('name_desc');

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
    const [field, dir] = (sortOption || 'name_desc').split('_');
    arr.sort((a, b) => {
      const get = (obj, f) => {
        if (f === 'last') return new Date(obj.last_visit_date || 0).getTime();
        if (f === 'year') return Number(obj.year || 0);
        return (obj[f] || '').toString().toLowerCase();
      };
      const va = get(a, field === 'last' ? 'last' : field);
      const vb = get(b, field === 'last' ? 'last' : field);
      if (va > vb) return dir === 'asc' ? 1 : -1;
      if (va < vb) return dir === 'asc' ? -1 : 1;
      return 0;
    });
    return arr;
  }, [filteredPatients, sortOption]);

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

  // UI helpers
  const sortOptions = [
    { value: 'name_asc', label: 'Name ↑' },
    { value: 'name_desc', label: 'Name ↓' },
    { value: 'year_asc', label: 'Year ↑' },
    { value: 'year_desc', label: 'Year ↓' },
    { value: 'last_asc', label: 'Last Visit ↑' },
    { value: 'last_desc', label: 'Last Visit ↓' }
  ];

  return (
    <main className="main">
      <section className="page">
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 25, fontWeight: 700 }}>Patients</div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="patients-search"
                type="search"
                placeholder="Search by name, student number..."
                style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', minWidth: 260 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}
              >
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <button className="btn" onClick={() => { setShowRegisterModal(true); setRegisterTab('search'); setSelectedStudent(null); setManualStudent({ name: '', id: '', year: 1 }); }}>
                Register / Add
              </button>
            </div>
          </div>

          {/* short description below the header (matches Appointments header style) */}
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
            Manage patient records — register patients, view records, and start new encounters.
          </div>
        </div>

        {/* register modal */}
        {showRegisterModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)', padding: 16
          }}>
            <div style={{ width: 940, maxWidth: '98%', background: 'var(--panel)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid rgba(0,0,0,0.04)', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Register Patient</div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn secondary" onClick={() => { setShowRegisterModal(false); setSelectedStudent(null); setStudentSearch(''); setStudentSuggestions([]); setManualStudent({ name: '', id: '', year: 1 }); }}>
                    Close
                  </button>
                  <button
                    className="btn"
                    onClick={() => submitRegisterPatient(previewStudent)}
                    disabled={!previewStudent || registering}
                    title={!previewStudent ? 'Preview a student first' : 'Register the previewed student'}
                  >
                    {registering ? 'Registering…' : `Register`}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 0, minHeight: 360 }}>
                <div style={{ padding: 18 }}>
                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                      className={registerTab === 'search' ? 'btn' : 'btn secondary'}
                      onClick={() => {
                        setRegisterTab('search');
                        setSelectedStudent(null);
                        setManualStudent({ name: '', id: '', year: 1 });
                      }}
                    >
                      Search Patient
                    </button>

                    <button
                      className={registerTab === 'manual' ? 'btn' : 'btn secondary'}
                      onClick={() => {
                        setRegisterTab('manual');
                        setStudentSearch('');
                        setStudentSuggestions([]);
                        setSelectedStudent(null);
                      }}
                    >
                      Add Patient
                    </button>
                  </div>

                  {/* Search tab */}
                  {registerTab === 'search' && (
                    <>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Search students</label>
                        <input
                          placeholder="Type name or ID (min 2 chars)"
                          value={studentSearch}
                          onChange={(e) => { setStudentSearch(e.target.value); setShowNewStudentForm(false); setSelectedStudent(null); }}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}
                        />
                      </div>

                      <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 8 }}>
                        {studentSuggestions.length > 0 ? (
                          studentSuggestions.map(s => (
                            <div key={s.id} onClick={() => { setSelectedStudent(s); setStudentSearch(`${s.name} (${s.id})`); setStudentSuggestions([]); }} style={{ padding: 12, borderBottom: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer' }}>
                              <div style={{ fontWeight: 700 }}>{s.name}</div>
                              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{s.id} — Year {s.year}</div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: 12, color: 'var(--muted)' }}>
                            No suggestions.
                          </div>
                        )}
                      </div>

                      {selectedStudent && (
                        <div style={{ marginTop: 12, padding: 12, border: '1px dashed rgba(0,0,0,0.06)', borderRadius: 8 }}>
                          <div style={{ fontWeight: 800 }}>Selected</div>
                          <div style={{ marginTop: 6 }}>{selectedStudent.name} — <span style={{ color: 'var(--muted)' }}>{selectedStudent.id}</span> • Year {selectedStudent.year}</div>
                          <div style={{ marginTop: 10 }}>
                            <button className="btn" onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}>Change</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Manual tab */}
                  {registerTab === 'manual' && (
                    <>
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Full name</label>
                          <input
                            value={manualStudent.name}
                            onChange={(e) => setManualStudent(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Patient full name"
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Student ID</label>
                            <input
                              value={manualStudent.id}
                              onChange={(e) => setManualStudent(prev => ({ ...prev, id: e.target.value }))}
                              placeholder="e.g. TUPM-XX-XXXX"
                              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Year</label>
                            <input value={manualStudent.year} onChange={(e) => setManualStudent(prev => ({ ...prev, year: Number(e.target.value || 1) }))} type="number" min={1} max={5} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                          <button className="btn secondary" onClick={() => { setManualStudent({ name: '', id: '', year: 1 }); }}>Reset</button>
                          <button className="btn" onClick={async () => { await submitCreateStudent(); }}>
                            Create
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* right column: preview */}
                <div style={{ padding: 18, borderLeft: '1px solid rgba(0,0,0,0.04)', background: '#fff' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Preview</div>

                  {!previewStudent ? (
                    <div style={{ color: 'var(--muted)' }}>No patient selected. Use the Search tab or Manual Entry to build the patient's profile, then click Register.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{previewStudent.name}</div>
                      <div style={{ color: 'var(--muted)' }}>{previewStudent.id} • Year {previewStudent.year || '—'}</div>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 700 }}>Register Preview</div>
                        <div style={{ color: 'var(--muted)', marginTop: 6 }}>
                          This will create a patient record with the student details shown and set last visit to today's date.
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          className="btn"
                          onClick={() => {
                            if (registerTab !== 'manual') setRegisterTab('manual');
                            if (previewStudent && previewStudent.id && previewStudent.name && (!selectedStudent || selectedStudent.id !== previewStudent.id)) {
                              setManualStudent(prev => ({ ...(previewStudent.id ? previewStudent : prev) }));
                              setRegisterTab('manual');
                            }
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Card containing Results header (right-aligned) and table */}
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Patients List</div>
            <div style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 13 }}>
              Results: <strong>{sortedPatients.length}</strong>
            </div>
          </div>

          <div style={{ marginTop: 12, overflow: 'auto' }}>
            {/* Use the same table class as Appointments so colors & hover match */}
            <table className="table" aria-label="Patients table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Year</th>
                  <th>Last Visit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 12 }}>Loading…</td></tr>
                ) : sortedPatients.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 12, color: 'var(--muted)' }}>No patients found.</td></tr>
                ) : (
                  sortedPatients.map(pat => (
                    // Allow the table's hover/row styles to apply (no inline borders)
                    <tr key={pat.id}>
                      <td>
                        <div>{pat.name}</div>
                        {isPhysician(user) && getSensitivityLevel(pat) && getSensitivityLevel(pat) !== 'normal' && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            Sensitivity: {getSensitivityLevel(pat)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{pat.id}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{/* optional secondary */}</div>
                      </td>
                      <td>{pat.year}</td>
                      <td className="label-muted">{pat.last_visit_date || '—'}</td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="btn secondary" onClick={() => handleOpenProfile(pat.id)}>Open</button>
                        <button className="btn" onClick={() => handleNewEncounter(pat)}>New Encounter</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6000,
            padding: '10px 16px',
            borderRadius: 8,
            color: 'white',
            fontWeight: 700,
            backgroundColor: toast.type === 'error' ? '#dc3545' : '#28a745',
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)'
          }}>
            {toast.text}
          </div>
        )}
      </section>
    </main>
  );
};

export default Patients;

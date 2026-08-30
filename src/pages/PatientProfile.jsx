// src/pages/PatientProfile.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { canDeleteRecord, canViewSensitiveField, getSensitivityLevel, isPhysician } from '../accessControl.js';
import { CloseIcon } from '../components/icons/Icons.jsx';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const PatientProfile = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const id = searchParams.get('id') || (location.state && location.state.patientId);

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [encounters, setEncounters] = useState([]);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [vitalsData, setVitalsData] = useState(null);

  // edit states
  const [editingMedications, setEditingMedications] = useState(false);
  const [editingAllergies, setEditingAllergies] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [newMedications, setNewMedications] = useState('');
  const [newAllergies, setNewAllergies] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // UI states
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', text }
  const [showMore, setShowMore] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [previewSrc, setPreviewSrc] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const pdfExportRef = useRef(); // hidden export container

  useEffect(() => {
    let mounted = true;
    if (id) {
      const fetchData = async () => {
        setLoading(true);
        try {
          // patient
          const { data: patientData, error: patientError } = await supabase
            .from('patients')
            .select('id, name, year, created_at, updated_at, last_visit_date, medications, allergies, notes')
            .eq('id', id)
            .single();

          if (patientError) console.error('Error fetching patient:', patientError);
          if (mounted && patientData) {
            setPatient(patientData);
            setNewMedications(patientData.medications || '');
            setNewAllergies(patientData.allergies || '');
            setNewNotes(patientData.notes || '');
          }

          // encounters
          const { data: encData } = await supabase
            .from('encounters')
            .select('*')
            .eq('patient_id', id)
            .order('created_at', { ascending: false });
          if (mounted) setEncounters(encData || []);

          // vitals history from encounters
          const { data: vitalsEncData } = await supabase
            .from('encounters')
            .select('encounter_date, vitals')
            .eq('patient_id', id)
            .not('vitals', 'is', null)
            .order('encounter_date', { ascending: true });

          const vitals = (vitalsEncData || []).map(enc => ({ date: enc.encounter_date, ...enc.vitals }));
          if (mounted) {
            setVitalsHistory(vitals);
            if (vitals.length > 0) {
              const labels = vitals.map(v => new Date(v.date).toLocaleDateString());
              setVitalsData({
                labels,
                datasets: [
                  {
                    label: 'Temperature (°C)',
                    data: vitals.map(v => v.temp ?? null),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1,
                    spanGaps: true
                  },
                  {
                    label: 'Pulse (bpm)',
                    data: vitals.map(v => v.pulse ?? null),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    tension: 0.1,
                    spanGaps: true
                  }
                ]
              });
            } else {
              setVitalsData(null);
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          if (mounted) setLoading(false);
        }
      };
      fetchData();
    } else {
      setLoading(false);
    }
    return () => { mounted = false; };
  }, [id]);

  // small toast helper
  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const saveData = async (field, value) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('patients').update({ [field]: value }).eq('id', id);
      if (error) {
        console.error('Error saving', field, error);
        showToast(`Error saving ${field}`, 'error');
      } else {
        setPatient(prev => ({ ...prev, [field]: value }));
        showToast(`${field.charAt(0).toUpperCase() + field.slice(1)} saved`);
      }
    } catch (err) {
      console.error(err);
      showToast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!canDeleteRecord(user)) {
      showToast('Only physicians can delete patient records.', 'error');
      setShowDeleteModal(false);
      return;
    }

    if (!deletePassword) {
      setDeleteMessage('Password is required.');
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
        setDeleting(false);
        return;
      }

      const { error } = await supabase.from('patients').delete().eq('id', id);
      if (error) {
        console.error('Error deleting patient', error);
        showToast('Error deleting patient', 'error');
      } else {
        showToast('Patient deleted', 'success');
        navigate('/patients');
      }
    } catch (err) {
      console.error(err);
      showToast('Delete failed', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeletePassword('');
      setDeleteMessage('');
    }
  };

  const download = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = url.split('/').pop();
    a.click();
  };

  const openPreview = (url) => {
    const ext = url.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (imageExts.includes(ext)) setPreviewType('image');
    else setPreviewType('embed');
    setPreviewSrc(url);
  };

  // SmallBtn now renders className="btn" (uniform)
  const SmallBtn = ({ onClick, children, disabled = false }) => (
    <button className="btn" onClick={onClick} disabled={disabled} type="button">
      {children}
    </button>
  );

  // navigation helpers
  const goToNewVitals = () => {
    navigate('/vitals', { state: { patientId: id, patientName: patient?.name } });
  };

  const goToNewEncounter = () => {
    navigate('/encounter', { state: { patientId: id, patientName: patient?.name } });
  };

  // ------------------ PDF Export ------------------
  const exportPdf = async () => {
    if (!patient) return;
    try {
      const exportNode = pdfExportRef.current;
      if (!exportNode) {
        showToast('Export failed: export node missing', 'error');
        return;
      }

      // wait for images (logo) to load
      const imgs = Array.from(exportNode.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        return new Promise(resolve => {
          if (img.complete) return resolve();
          img.onload = img.onerror = () => resolve();
        });
      }));

      const scale = 2;
      const canvas = await html2canvas(exportNode, {
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: exportNode.scrollWidth,
        windowHeight: exportNode.scrollHeight
      });

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

      pdf.save(`patient_${patient.id}_profile.pdf`);
      showToast('PDF exported');
    } catch (err) {
      console.error('Export error', err);
      showToast('Export failed', 'error');
    }
  };
  // ------------------ end PDF Export ------------------

  if (loading) return <main className="main"><div className="card">Loading...</div></main>;
  if (!patient) return <main className="main"><div className="card">Patient not found.</div></main>;

  return (
    <>
      <main className="main">
        <section className="page" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Clinic header + patient details + actions */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Clinic Header */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 25, fontWeight: 700, marginTop: 10}}>Patient’s Profile</div>
              </div>

              {/* actions group in header */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn" onClick={() => navigate('/patients')}>← Back</button>

                <div style={{ position: 'relative' }}>
                  <button className="btn" onClick={() => setShowMore(s => !s)} aria-haspopup="true" aria-expanded={showMore}>⋯</button>

                  {showMore && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 8px)',
                        background: 'var(--panel)',
                        boxShadow: '0 10px 28px rgba(0,0,0,0.14)',
                        borderRadius: 10,
                        padding: 8,
                        zIndex: 300,
                        minWidth: 180
                      }}
                      role="menu"
                    >
                      {/* Only show export PDF for physicians, as it contains sensitive data */}
                      {user?.role === 'physician' && (
                        <button
                          className="btn"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', textAlign: 'left', color: 'inherit' }}
                          onClick={() => { setShowMore(false); exportPdf(); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Export PDF
                        </button>
                      )}

                      <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '6px 0' }} />

                      {/* Only show delete button for physicians (doctors only) */}
                      {canDeleteRecord(user) && (
                        <button
                          className="btn"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', textAlign: 'left', color: 'var(--danger)' }}
                          onClick={() => { setShowMore(false); setShowDeleteModal(true); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          Delete patient
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Patient Details */}
            <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><strong>Name:</strong> {patient.name}</div>
              <div><strong>TUP ID:</strong> {patient.id}</div>
              <div><strong>Year:</strong> {patient.year}</div>
              <div><strong>Last Visit:</strong> {patient.last_visit_date || '—'}</div>
            </div>
          </div>

          {/* Main grid */}
          <div className="patient-profile-grid">
            {/* encounters */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Encounters</h3>
                <button className="btn" onClick={goToNewEncounter}> New</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {encounters.length > 0 ? encounters.map(enc => (
                  <div key={enc.id} style={{ padding: 10, border: '1px solid rgba(0,0,0,0.05)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {new Date(enc.encounter_date).toLocaleDateString()}
                    </div>
                    <div style={{ fontWeight: 600 }}>{enc.chief_complaint || 'No complaint recorded'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {canViewSensitiveField(user, 'assessment_plan', enc) ? (enc.assessment_plan || '') : '[Restricted for nurse access]'}
                    </div>
                    {isPhysician(user) && getSensitivityLevel(enc) && getSensitivityLevel(enc) !== 'normal' && (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        Sensitivity: {getSensitivityLevel(enc)}
                      </div>
                    )}
                  </div>
                )) : <div style={{ color: 'var(--muted)' }}>No encounters found — create a new encounter.</div>}
              </div>
            </div>

            {/* vitals */}
            <div className="card" style={{ minHeight: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Vitals</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                </div>
              </div>

              <div style={{ height: 220 }}>
                {vitalsData ? (
                  <Line
                    data={vitalsData}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'top' } },
                      scales: { x: { ticks: { maxRotation: 0 } } }
                    }}
                  />
                ) : <div style={{ color: 'var(--muted)' }}>No vitals history.</div>}
              </div>

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {vitalsHistory.map((vital, i) => (
                  <div key={i} style={{ padding: 8, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <strong>{new Date(vital.date).toLocaleDateString()}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      Temp: {vital.temp ?? '—'} °C · Pulse: {vital.pulse ?? '—'} bpm · BP: {vital.bp ?? '—'} · Wt: {vital.weight ?? '—'} kg
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* medications / allergies */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Medications / Allergies</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => setEditingMedications(e => !e)}>{editingMedications ? 'Edit Meds' : 'Edit Meds'}</button>
                  <button className="btn" onClick={() => setEditingAllergies(e => !e)}>{editingAllergies ? 'Edit Allergies' : 'Edit Allergies'}</button>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <h4 style={{ margin: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Medications</span>
                  {editingMedications && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => { setEditingMedications(false); setNewMedications(patient.medications || ''); }}>Cancel</button>
                      <button className="btn" onClick={async () => { await saveData('medications', newMedications); setEditingMedications(false); }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  )}
                </h4>

                {editingMedications ? (
                  <textarea value={newMedications} onChange={(e) => setNewMedications(e.target.value)} style={{ width: '100%', minHeight: 80 }} />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', padding: 8, borderRadius: 6, background: '#fafafa' }}>
                    {patient.medications || <span style={{ color: 'var(--muted)' }}>No medications listed — click Edit Meds to add</span>}
                  </div>
                )}
              </div>

              <div>
                <h4 style={{ margin: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Allergies</span>
                  {editingAllergies && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => { setEditingAllergies(false); setNewAllergies(patient.allergies || ''); }}>Cancel</button>
                      <button className="btn" onClick={async () => { await saveData('allergies', newAllergies); setEditingAllergies(false); }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  )}
                </h4>

                {editingAllergies ? (
                  <textarea value={newAllergies} onChange={(e) => setNewAllergies(e.target.value)} style={{ width: '100%', minHeight: 80 }} />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', padding: 8, borderRadius: 6, background: '#fafafa' }}>
                    {patient.allergies || <span style={{ color: 'var(--muted)' }}>No allergies listed — click Edit Allergies to add</span>}
                  </div>
                )}
              </div>
            </div>

            {/* NOTES card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Notes</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => setEditingNotes(e => !e)}>{editingNotes ? 'Done' : 'Edit'}</button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                {editingNotes ? (
                  <>
                    <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} style={{ width: '100%', minHeight: 140 }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <button className="btn" onClick={() => { setEditingNotes(false); setNewNotes(patient.notes || ''); }}>Cancel</button>
                      <button className="btn" onClick={async () => { await saveData('notes', newNotes); setEditingNotes(false); }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', padding: 12, borderRadius: 8, background: '#f9f9f9', minHeight: 120 }}>
                    {patient.notes || <span style={{ color: 'var(--muted)' }}>No notes or messages — click Edit to add</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* toast */}
          {toast && (
            <div style={{
              position: 'fixed',
              top: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2000,
              padding: '10px 16px',
              borderRadius: 8,
              color: 'white',
              fontWeight: 700,
              backgroundColor: toast.type === 'error' ? '#dc3545' : '#28a745',
              boxShadow: '0 6px 18px rgba(0,0,0,0.15)'
            }}>
              {toast.text}
            </div>
          )}

          {/* preview modal */}
          {previewSrc && (
            <div style={{
              position: 'fixed', inset: 0, background: 'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
            }}>
              <div style={{ width: '90%', maxWidth: 960, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 17, color: 'var(--text)' }}>Preview</strong>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button className="btn secondary small" onClick={() => download(previewSrc)}>Download</button>
                    <button type="button" className="modal-close-btn" onClick={() => { setPreviewSrc(null); setPreviewType(null); }} aria-label="Close preview">
                      <CloseIcon size={18} />
                    </button>
                  </div>
                </div>
                <div style={{ height: '70vh', overflow: 'auto', background: 'var(--surface-raised)', borderRadius: 10, padding: 8 }}>
                  {previewType === 'image' ? (
                    <img src={previewSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', margin: '0 auto', borderRadius: 6 }} />
                  ) : (
                    <iframe src={previewSrc} title="Preview" style={{ width: '100%', height: '100%', border: 'none' }} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* delete modal */}
          {showDeleteModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 440, maxWidth: '92%', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', padding: 24, borderRadius: 16, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>Delete Patient Record</h3>
                  <button type="button" className="modal-close-btn" onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteMessage(''); }} aria-label="Close modal">
                    <CloseIcon size={18} />
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                  Are you sure you want to delete <strong>{patient.name}</strong> ({patient.id})? This action cannot be undone.
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Enter your password to verify:</label>
                  <input
                    type="password"
                    className="input"
                    style={{ width: '100%' }}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </div>

                {deleteMessage && (
                  <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
                    {deleteMessage}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn secondary" onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteMessage(''); }}>Cancel</button>
                  <button className="btn danger" onClick={handleDeletePatient} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete Record'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Hidden export container for PDF */}
<div
  id="pdf-export"
  style={{ position: 'absolute', left: -9999, top: -9999, width: 794, padding: 24, background: '#fff' }}
  aria-hidden
  ref={pdfExportRef}
>
  <div style={{ width: '100%', background: '#fff', color: '#111', fontFamily: 'Arial, Helvetica, sans-serif' }}>
    
    {/* Header: logo + clinic title */}
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
      <img src={tupehrlogo} alt="TUP Clinic logo" style={{ width: 100, height: 'auto', objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          Technological University of the Philippines (TUP) Manila – Clinic
        </div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700 }}>Patient's Profile</div>
      </div>
    </div>

    <hr style={{ border: 'none', borderTop: '1px solid #ddd', marginBottom: 12 }} />

    {/* Patient Summary Table */}
    <section style={{ marginBottom: 14 }}>
      <table className="export-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th colSpan="2" style={{ textAlign: 'left', paddingBottom: 8, fontSize: 14, fontWeight: 800 }}>
              Patient Summary
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 6px' }}>Name</td>
            <td style={{ padding: '8px 6px' }}>{patient.name}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 6px' }}>ID</td>
            <td style={{ padding: '8px 6px' }}>{patient.id}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 6px' }}>Year</td>
            <td style={{ padding: '8px 6px' }}>{patient.year}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 6px' }}>Last Visit</td>
            <td style={{ padding: '8px 6px' }}>{patient.last_visit_date || '—'}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 6px' }}>Medications</td>
            <td style={{ padding: '8px 6px', whiteSpace: 'pre-wrap' }}>{patient.medications || 'None'}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 6px' }}>Allergies</td>
            <td style={{ padding: '8px 6px', whiteSpace: 'pre-wrap' }}>{patient.allergies || 'None'}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />

    {/* Encounters Table */}
    <section style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Encounters</div>
      {encounters.length > 0 ? (
        <table className="export-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Chief Complaint</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Assessment / Plan</th>
            </tr>
          </thead>
          <tbody>
            {encounters.map((enc, i) => (
              <tr key={i}>
                <td style={{ padding: '8px 6px' }}>{new Date(enc.encounter_date).toLocaleDateString()}</td>
                <td style={{ padding: '8px 6px', whiteSpace: 'pre-wrap' }}>{enc.chief_complaint || 'N/A'}</td>
                <td style={{ padding: '8px 6px', whiteSpace: 'pre-wrap' }}>
                  {canViewSensitiveField(user, 'assessment_plan', enc) ? (enc.assessment_plan || 'N/A') : '[Restricted for nurse access]'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: '#666' }}>No encounters recorded.</div>
      )}
    </section>

    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />

    {/* Vitals Table */}
    <section style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Vitals History</div>
      {vitalsHistory.length > 0 ? (
        <table className="export-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Temp (°C)</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Pulse (bpm)</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>BP</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Weight (kg)</th>
            </tr>
          </thead>
          <tbody>
            {vitalsHistory.map((v, i) => (
              <tr key={i}>
                <td style={{ padding: '8px 6px' }}>{new Date(v.date).toLocaleDateString()}</td>
                <td style={{ padding: '8px 6px' }}>{v.temp ?? '—'}</td>
                <td style={{ padding: '8px 6px' }}>{v.pulse ?? '—'}</td>
                <td style={{ padding: '8px 6px' }}>{v.bp ?? '—'}</td>
                <td style={{ padding: '8px 6px' }}>{v.weight ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: '#666' }}>No vitals recorded.</div>
      )}
    </section>

    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />

    {/* Notes */}
    <section style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Notes</div>
      <div style={{ whiteSpace: 'pre-wrap', padding: '8px 6px', borderRadius: 4, background: '#fafafa' }}>
        {patient.notes || 'No notes'}
      </div>
    </section>

    {/* Exported timestamp & footer */}
    <div style={{ marginTop: 20, fontSize: 12, color: '#666' }}>
      Exported on: {new Date().toLocaleString()}
    </div>

    <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
      Exported from EHR system
    </div>
  </div>
</div>

    </>
  );
};

export default PatientProfile;

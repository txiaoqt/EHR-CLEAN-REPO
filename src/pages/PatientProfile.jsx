// src/pages/PatientProfile.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { canDeleteRecord, canViewSensitiveField, getSensitivityLevel, isPhysician } from '../accessControl.js';
import { CloseIcon } from '../components/icons/Icons.jsx';
import avatarPlaceholder from '../assets/images/avatar-placeholder.jpg';
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
  const [patientAvatar, setPatientAvatar] = useState(null);
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

          // Fetch patient profile avatar from patient_profiles and users
          try {
            const { data: ppData } = await supabase
              .from('patient_profiles')
              .select('avatar_url')
              .eq('patient_id', id)
              .maybeSingle();

            let avatar = ppData?.avatar_url || null;
            if (!avatar) {
              const { data: uData } = await supabase
                .from('users')
                .select('avatar')
                .eq('patient_id', id)
                .maybeSingle();
              if (uData?.avatar) avatar = uData.avatar;
            }
            if (mounted) setPatientAvatar(avatar);
          } catch (avErr) {
            console.warn('Error fetching patient avatar:', avErr);
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

          const vitals = (vitalsEncData || []).map((enc) => ({ date: enc.encounter_date, ...enc.vitals }));
          if (mounted) {
            setVitalsHistory(vitals);
            if (vitals.length > 0) {
              const labels = vitals.map((v) => new Date(v.date).toLocaleDateString());
              setVitalsData({
                labels,
                datasets: [
                  {
                    label: 'Temperature (°C)',
                    data: vitals.map((v) => v.temp ?? null),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    spanGaps: true,
                  },
                  {
                    label: 'Pulse (bpm)',
                    data: vitals.map((v) => v.pulse ?? null),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    spanGaps: true,
                  },
                ],
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
    return () => {
      mounted = false;
    };
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
        setPatient((prev) => ({ ...prev, [field]: value }));
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
      await Promise.all(
        imgs.map((img) => {
          return new Promise((resolve) => {
            if (img.complete) return resolve();
            img.onload = img.onerror = () => resolve();
          });
        })
      );

      const scale = 2;
      const canvas = await html2canvas(exportNode, {
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: exportNode.scrollWidth,
        windowHeight: exportNode.scrollHeight,
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
        <section className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. PATIENT HERO CARD */}
          <div className="card patient-hero-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Top row: Patient Avatar + Identity + Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <img
                  src={patientAvatar || avatarPlaceholder}
                  alt={patient.name}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid var(--border)',
                    background: 'var(--surface-raised)',
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = avatarPlaceholder;
                  }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                      {patient.name}
                    </h1>
                    <span className="badge badge-neutral" style={{ fontSize: 12, padding: '2px 8px', fontWeight: 600 }}>
                      Student / Patient
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Clinical Record Profile</span>
                  </div>
                </div>
              </div>

              {/* Action group */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => navigate('/patients')}
                  style={{ height: 38, padding: '0 16px', fontSize: 13.5, fontWeight: 600 }}
                >
                  ← Back
                </button>

                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setShowMore((s) => !s)}
                    aria-haspopup="true"
                    aria-expanded={showMore}
                    aria-label="More patient actions"
                    style={{ height: 38, width: 38, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                  >
                    ⋯
                  </button>

                  {showMore && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 8px)',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-lg, 0 10px 28px rgba(0,0,0,0.14))',
                        borderRadius: 10,
                        padding: 6,
                        zIndex: 300,
                        minWidth: 180,
                      }}
                      role="menu"
                    >
                      {/* Only show export PDF for physicians */}
                      {user?.role === 'physician' && (
                        <button
                          type="button"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '8px 10px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 6,
                            textAlign: 'left',
                            color: 'var(--text)',
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-raised)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => {
                            setShowMore(false);
                            exportPdf();
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          <span>Export PDF</span>
                        </button>
                      )}

                      {canDeleteRecord(user) && (
                        <>
                          {user?.role === 'physician' && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}
                          <button
                            type="button"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              width: '100%',
                              padding: '8px 10px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              textAlign: 'left',
                              color: 'var(--danger)',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            onClick={() => {
                              setShowMore(false);
                              setShowDeleteModal(true);
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                            <span>Delete patient</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom row: Compact metadata chips */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                paddingTop: 14,
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ padding: '8px 12px', background: 'var(--surface-raised, rgba(0,0,0,0.02))', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  TUP ID
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                  {patient.id}
                </div>
              </div>

              <div style={{ padding: '8px 12px', background: 'var(--surface-raised, rgba(0,0,0,0.02))', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  Year Level
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                  {patient.year ? `Year ${patient.year}` : 'Not Specified'}
                </div>
              </div>

              <div style={{ padding: '8px 12px', background: 'var(--surface-raised, rgba(0,0,0,0.02))', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  Last Visit
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                  {patient.last_visit_date ? new Date(patient.last_visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. MAIN 2-COLUMN CLINICAL GRID */}
          <div className="patient-profile-grid">
            {/* LEFT COLUMN: Encounters & Medications/Allergies */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Encounters Card */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Encounters</h3>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Clinical visit history</div>
                  </div>
                  <button type="button" className="btn" onClick={goToNewEncounter} style={{ fontSize: 13, padding: '7px 14px' }}>
                    + New Encounter
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto', paddingRight: 2 }}>
                  {encounters.length > 0 ? (
                    encounters.map((enc) => (
                      <div
                        key={enc.id}
                        style={{
                          padding: '12px 14px',
                          background: 'var(--surface-raised, rgba(0,0,0,0.02))',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {new Date(enc.encounter_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                          {isPhysician(user) && getSensitivityLevel(enc) && getSensitivityLevel(enc) !== 'normal' && (
                            <span className="badge badge-warning" style={{ fontSize: 10, padding: '1px 6px' }}>
                              Sensitivity: {getSensitivityLevel(enc)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                          {enc.chief_complaint || 'No complaint recorded'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.45 }}>
                          {canViewSensitiveField(user, 'assessment_plan', enc)
                            ? enc.assessment_plan || 'No assessment/plan details'
                            : '[Restricted for nurse access]'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface-raised)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                      No encounters found — click New Encounter to record a visit.
                    </div>
                  )}
                </div>
              </div>

              {/* Medications & Allergies Card */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Medications / Allergies</h3>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Active prescriptions & sensitivities</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setEditingMedications((e) => !e)}
                    >
                      {editingMedications ? 'Close' : 'Edit Meds'}
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setEditingAllergies((e) => !e)}
                    >
                      {editingAllergies ? 'Close' : 'Edit Allergies'}
                    </button>
                  </div>
                </div>

                {/* Medications Subsection */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Medications
                  </div>
                  {editingMedications ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="input"
                        value={newMedications}
                        onChange={(e) => setNewMedications(e.target.value)}
                        placeholder="List active medications..."
                        style={{ width: '100%', minHeight: 80, fontSize: 13.5 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => {
                            setEditingMedications(false);
                            setNewMedications(patient.medications || '');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={async () => {
                            await saveData('medications', newMedications);
                            setEditingMedications(false);
                          }}
                          disabled={saving}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--surface-raised, rgba(0,0,0,0.02))',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: 13.5,
                        lineHeight: 1.5,
                      }}
                    >
                      {patient.medications || (
                        <span style={{ color: 'var(--text-muted)' }}>No medications listed — click Edit Meds to add</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Allergies Subsection */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Allergies
                  </div>
                  {editingAllergies ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="input"
                        value={newAllergies}
                        onChange={(e) => setNewAllergies(e.target.value)}
                        placeholder="List known allergies..."
                        style={{ width: '100%', minHeight: 80, fontSize: 13.5 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => {
                            setEditingAllergies(false);
                            setNewAllergies(patient.allergies || '');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={async () => {
                            await saveData('allergies', newAllergies);
                            setEditingAllergies(false);
                          }}
                          disabled={saving}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--surface-raised, rgba(0,0,0,0.02))',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: 13.5,
                        lineHeight: 1.5,
                      }}
                    >
                      {patient.allergies || (
                        <span style={{ color: 'var(--text-muted)' }}>No allergies listed — click Edit Allergies to add</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Vitals & Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Vitals Card */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Vitals</h3>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Recorded physiological indicators</div>
                  </div>
                </div>

                <div style={{ height: 200, width: '100%' }}>
                  {vitalsData ? (
                    <Line
                      data={vitalsData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'top',
                            labels: {
                              boxWidth: 12,
                              padding: 10,
                              font: { size: 12, weight: '600' },
                              color: 'rgba(128, 128, 128, 0.9)',
                            },
                          },
                          tooltip: {
                            padding: 8,
                            cornerRadius: 6,
                          },
                        },
                        scales: {
                          x: {
                            grid: { display: false },
                            ticks: { maxRotation: 0, font: { size: 11 }, color: 'rgba(128, 128, 128, 0.8)' },
                          },
                          y: {
                            grid: { color: 'rgba(128, 128, 128, 0.1)' },
                            ticks: { font: { size: 11 }, color: 'rgba(128, 128, 128, 0.8)' },
                          },
                        },
                      }}
                    />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface-raised)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                      No vitals history recorded.
                    </div>
                  )}
                </div>

                {/* Vitals History Summary Rows */}
                {vitalsHistory.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Recent Measurements
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                      {vitalsHistory.slice().reverse().map((vital, i) => (
                        <div
                          key={i}
                          style={{
                            padding: '8px 10px',
                            background: i === 0 ? 'var(--surface-raised, rgba(0,0,0,0.02))' : 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                            {new Date(vital.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            {i === 0 && (
                              <span className="badge badge-neutral" style={{ fontSize: 9.5, padding: '1px 5px', marginLeft: 6 }}>
                                Latest
                              </span>
                            )}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            Temp {vital.temp ? `${vital.temp}°C` : '—'} · Pulse {vital.pulse ? `${vital.pulse} bpm` : '—'} · BP {vital.bp || '—'} · Wt {vital.weight ? `${vital.weight} kg` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Card */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Notes</h3>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Clinical notes and observations</div>
                  </div>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setEditingNotes((e) => !e)}
                  >
                    {editingNotes ? 'Close' : 'Edit'}
                  </button>
                </div>

                <div>
                  {editingNotes ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="input"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        placeholder="Add clinical observation notes..."
                        style={{ width: '100%', minHeight: 120, fontSize: 13.5 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => {
                            setEditingNotes(false);
                            setNewNotes(patient.notes || '');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={async () => {
                            await saveData('notes', newNotes);
                            setEditingNotes(false);
                          }}
                          disabled={saving}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'var(--surface-raised, rgba(0,0,0,0.02))',
                        border: '1px solid var(--border)',
                        minHeight: 100,
                        color: 'var(--text)',
                        fontSize: 13.5,
                        lineHeight: 1.6,
                      }}
                    >
                      {patient.notes || (
                        <span style={{ color: 'var(--text-muted)' }}>No notes or messages — click Edit to add</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* toast */}
          {toast && (
            <div
              style={{
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
                boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
              }}
            >
              {toast.text}
            </div>
          )}

          {/* preview modal */}
          {previewSrc && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
              }}
            >
              <div
                style={{
                  width: '90%',
                  maxWidth: 960,
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 17, color: 'var(--text)' }}>Preview</strong>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button type="button" className="btn secondary small" onClick={() => download(previewSrc)}>
                      Download
                    </button>
                    <button
                      type="button"
                      className="modal-close-btn"
                      onClick={() => {
                        setPreviewSrc(null);
                        setPreviewType(null);
                      }}
                      aria-label="Close preview"
                    >
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
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
                backdropFilter: 'blur(2px)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 440,
                  maxWidth: '92%',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: 24,
                  borderRadius: 16,
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>Delete Patient Record</h3>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeletePassword('');
                      setDeleteMessage('');
                    }}
                    aria-label="Close modal"
                  >
                    <CloseIcon size={18} />
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                  Are you sure you want to delete <strong>{patient.name}</strong> ({patient.id})? This action cannot be undone.
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Enter your password to verify:
                  </label>
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
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeletePassword('');
                      setDeleteMessage('');
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn danger" onClick={handleDeletePatient} disabled={deleting}>
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
                        {canViewSensitiveField(user, 'assessment_plan', enc)
                          ? enc.assessment_plan || 'N/A'
                          : '[Restricted for nurse access]'}
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

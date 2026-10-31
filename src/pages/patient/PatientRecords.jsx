// src/pages/patient/PatientRecords.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import SignaturePad from '../../components/SignaturePad.jsx';
import SignatureImage from '../../components/SignatureImage.jsx';
import TablePagination from '../../components/table/TablePagination.jsx';
import { useTablePagination } from '../../hooks/useTablePagination.js';
import { CloseIcon } from '../../components/icons/Icons.jsx';
import { isVisitCompleted } from '../../utils/visitStatus.js';

// Patient acknowledgements live in the same public bucket as clinician
// signatures, under a distinct folder so the two can never be confused.
const SIGNATURE_BUCKET = 'signatures';
const PATIENT_SIGNATURE_PREFIX = 'patient-ack';

const signatureUrl = (path) => {
  if (!path) return null;
  try {
    return supabase.storage.from(SIGNATURE_BUCKET).getPublicUrl(path).data?.publicUrl || null;
  } catch {
    return null;
  }
};

const visitStatusLabel = (r) => {
  if (isVisitCompleted(r)) return 'Completed';
  const a = (r.appointment_status || '').toLowerCase();
  const e = (r.encounter_status || '').toLowerCase();
  if (a === 'scheduled' || e === 'active') return 'Scheduled';
  // A walk-in has no appointment status; its encounter is the record.
  return r.visit_source === 'encounter' ? 'Completed' : 'Scheduled';
};

const medicinesSummary = (medicines) => {
  if (!medicines || medicines.length === 0) return null;
  return medicines.map((m) => `${m.item_name} ×${m.quantity}`).join(', ');
};

const PatientRecords = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const recordPages = useTablePagination(records);
  const [loading, setLoading] = useState(true);

  // Which visit the patient is acknowledging, and their drawn signature.
  const [signingRecord, setSigningRecord] = useState(null);
  const [signature, setSignature] = useState(null);
  const [signError, setSignError] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);

  const loadRecords = async () => {
    if (!user?.patient_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // The shared visit view includes completed appointments even when no
      // clinical note was written. Evaluate each row by its source so a
      // scheduled appointment cannot inherit a completed same-day encounter.
      const { data, error } = await supabase
        .from('medical_log_visits')
        .select('visit_id, visit_source, appointment_id, encounter_id, patient_id, visit_date, visit_time, chief_complaint, assessment_plan, clinician_name, appointment_status, encounter_status, patient_signature_path, patient_signed_at, vitals')
        .eq('patient_id', user.patient_id)
        .order('visit_date', { ascending: false });

      if (error) throw error;
      const visits = (data || []).filter(isVisitCompleted);

      // Medicines given on each visit, keyed by whichever record holds them.
      const appointmentIds = visits.map((v) => v.appointment_id).filter(Boolean);
      const encounterIds = visits.map((v) => v.encounter_id).filter(Boolean);
      const cols = 'appointment_id, encounter_id, item_name, quantity';

      const [byAppointment, byEncounter] = await Promise.all([
        appointmentIds.length
          ? supabase.from('inventory_transactions').select(cols).in('appointment_id', appointmentIds)
          : Promise.resolve({ data: [] }),
        encounterIds.length
          ? supabase.from('inventory_transactions').select(cols).in('encounter_id', encounterIds)
          : Promise.resolve({ data: [] }),
      ]);

      const medicinesByVisit = {};
      for (const t of [...(byAppointment.data || []), ...(byEncounter.data || [])]) {
        const visit = visits.find(
          (v) =>
            (t.appointment_id && v.appointment_id === t.appointment_id) ||
            (t.encounter_id && v.encounter_id === t.encounter_id)
        );
        if (!visit) continue;
        (medicinesByVisit[visit.visit_id] ||= []).push({ item_name: t.item_name, quantity: t.quantity });
      }

      setRecords(visits.map((v) => ({ ...v, medicines: medicinesByVisit[v.visit_id] || [] })));
    } catch (err) {
      console.warn('Load patient records error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.patient_id) { if (mounted) setLoading(false); return; }
      await loadRecords();
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.patient_id]);

  // Acknowledge any completed visit. Booked visits store the signature on the
  // appointment; walk-ins store it on the encounter.
  const handleSaveSignature = async () => {
    if (!signingRecord || !signature) {
      setSignError('Please sign before saving.');
      return;
    }
    const appointmentId = signingRecord.appointment_id || null;
    const encounterId = appointmentId ? null : signingRecord.encounter_id || null;
    const signatureRecordId = appointmentId || encounterId;
    if (!signatureRecordId) {
      setSignError('This visit cannot be acknowledged. Please contact the clinic.');
      return;
    }

    setSavingSignature(true);
    setSignError('');
    try {
      // Upload first: a failed upload must not leave a visit marked as
      // acknowledged with no signature behind it.
      const blob = await (await fetch(signature)).blob();
      const path = `${PATIENT_SIGNATURE_PREFIX}/${signatureRecordId}.png`;
      const { error: uploadErr } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'image/png' });
      if (uploadErr) throw new Error(uploadErr.message || 'The signature could not be uploaded.');

      const { data, error } = await supabase.rpc('patient_acknowledge_visit', {
        p_appointment_id: appointmentId,
        p_encounter_id: encounterId,
        p_signature_path: path,
      });
      if (error) throw error;

      // RLS-blocked writes report success with nothing done, so confirm it.
      if (data !== true) throw new Error('The acknowledgement could not be recorded.');

      setRecords((prev) =>
        prev.map((r) =>
          r.visit_id === signingRecord.visit_id
            ? { ...r, patient_signature_path: path, patient_signed_at: new Date().toISOString() }
            : r
        )
      );
      setSigningRecord(null);
      setSignature(null);
    } catch (err) {
      console.error('Acknowledge visit error:', err);
      setSignError(err?.message || 'The acknowledgement could not be saved. Please try again.');
    } finally {
      setSavingSignature(false);
    }
  };

  const formatVitals = (vitals) => {
    if (!vitals || typeof vitals !== 'object') return '—';
    const parts = [];
    if (vitals.blood_pressure || vitals.bp) parts.push(`BP: ${vitals.blood_pressure || vitals.bp}`);
    if (vitals.heart_rate || vitals.hr) parts.push(`HR: ${vitals.heart_rate || vitals.hr} bpm`);
    if (vitals.temperature || vitals.temp) parts.push(`Temp: ${vitals.temperature || vitals.temp}°C`);
    if (vitals.respiratory_rate || vitals.rr) parts.push(`RR: ${vitals.respiratory_rate || vitals.rr}/min`);
    if (vitals.oxygen_saturation || vitals.spo2) parts.push(`SpO2: ${vitals.oxygen_saturation || vitals.spo2}%`);
    if (vitals.weight) parts.push(`Weight: ${vitals.weight} kg`);

    if (parts.length === 0) return 'Recorded (Normal)';
    return parts.join(' • ');
  };

  return (
    <main className="main">
      <section className="page patient-records-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>Records</h2>
            <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
              View selected summaries of your completed clinic visits and consultations.
            </div>
          </div>
        </div>

        {/* Encounter History Container */}
        <div className="card table-section-card patient-records-section">
          <div className="table-section-header">
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Encounter History
              </h3>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
                Authorized consultation summaries and clinical notes provided by your clinician
              </div>
            </div>
            <span className="badge badge-neutral" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
              {records.length} Completed Visit(s)
            </span>
          </div>

          {/* Desktop / Tablet Table View (>= 768px) */}
          <div className={`patient-records-table-view table-responsive${records.length === 0 ? ' patient-records-table-view--empty' : ''}`}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>
                        Visit Date
                      </th>
                      <th style={{ textAlign: 'left' }}>
                        Attending Clinician
                      </th>
                      <th style={{ textAlign: 'left' }}>
                        Chief Complaint / Reason
                      </th>
                      <th style={{ textAlign: 'left' }}>
                        Assessment & Plan Summary
                      </th>
                      <th style={{ textAlign: 'left' }}>
                        Vitals Summary
                      </th>
                      <th style={{ textAlign: 'left' }}>
                        Medicines Given
                      </th>
                      <th style={{ textAlign: 'left' }}>
                        Acknowledgement
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr className="table-empty-row"><td colSpan={7}>Loading medical records…</td></tr>
                    ) : records.length === 0 ? (
                      <tr className="table-empty-row"><td colSpan={7}>No completed visits yet</td></tr>
                    ) : recordPages.pageRows.map((r) => (
                      <tr key={r.visit_id}>
                        <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {r.visit_date ? new Date(r.visit_date).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {r.clinician_name || 'Clinic Physician'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--text)', maxWidth: 220 }}>
                          <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{r.chief_complaint || 'General Medical Consultation'}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--text)', maxWidth: 280 }}>
                          {r.assessment_plan || 'Consultation completed without special prescription.'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>
                          <span style={{ background: 'var(--bg, #f1f5f9)', padding: '4px 8px', borderRadius: 6, display: 'inline-block', lineHeight: 1.4 }}>
                            {formatVitals(r.vitals)}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--text)', maxWidth: 220 }}>
                          {medicinesSummary(r.medicines) ? (
                            <span>{medicinesSummary(r.medicines)}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>None given</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {(() => {
                            const url = signatureUrl(r.patient_signature_path);
                            if (url) {
                              return (
                                <SignatureImage
                                  url={url}
                                  alt="Your signature acknowledging this visit"
                                  height={26}
                                  maxWidth={110}
                                  caption={`Signed${r.patient_signed_at ? ` ${new Date(r.patient_signed_at).toLocaleDateString()}` : ''}`}
                                />
                              );
                            }
                            if (!isVisitCompleted(r)) {
                              return <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>After your visit</span>;
                            }
                            return (
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => { setSigningRecord(r); setSignature(null); setSignError(''); }}
                                style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }}
                                title="Acknowledge that you reviewed this visit record"
                              >
                                Sign
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!loading && (
                <TablePagination
                  page={recordPages.page}
                  totalPages={recordPages.totalPages}
                  startIndex={recordPages.startIndex}
                  endIndex={recordPages.endIndex}
                  total={recordPages.total}
                  onPageChange={recordPages.goToPage}
                  itemLabel="visits"
                  showWhenEmpty
                />
              )}

              {/* Mobile Card List View (< 768px) */}
              {!loading && records.length > 0 && <div className="patient-records-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {recordPages.pageRows.map((r) => (
                  <div
                    key={r.visit_id}
                    style={{
                      background: 'var(--bg, #f8fafc)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                      <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>
                        {r.visit_date ? new Date(r.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recent Visit'}
                      </span>
                      <span className="badge badge-success" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                        {/* encounters.status is stored lowercase ('active' / 'completed') */}
                        {visitStatusLabel(r)}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Attending Clinician
                      </div>
                      <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)', marginTop: 2 }}>
                        {r.clinician_name || 'Clinic Physician'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Chief Complaint / Reason
                      </div>
                      <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)', marginTop: 2 }}>
                        {r.chief_complaint || 'General Medical Consultation'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Assessment & Plan Summary
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text)', marginTop: 2, lineHeight: 1.4 }}>
                        {r.assessment_plan || 'Consultation completed without special prescription.'}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Vitals Summary
                      </div>
                      <span style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 6, display: 'inline-block', fontSize: 'var(--font-size-xs)', color: 'var(--text)' }}>
                        {formatVitals(r.vitals)}
                      </span>
                    </div>

                    {/* Medicines received — the patient's own record of what
                        they were given. */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Medicines Given
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text)' }}>
                        {medicinesSummary(r.medicines) || <span style={{ color: 'var(--muted)' }}>None given</span>}
                      </div>
                    </div>

                    {/* Acknowledgement — the patient confirming what they received */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Acknowledgement
                      </div>
                      {(() => {
                        const url = signatureUrl(r.patient_signature_path);
                        if (url) {
                          return (
                            <SignatureImage
                              url={url}
                              alt="Your signature acknowledging this visit"
                              height={34}
                              maxWidth={150}
                              caption={`Signed${r.patient_signed_at ? ` ${new Date(r.patient_signed_at).toLocaleDateString()}` : ''}`}
                            />
                          );
                        }
                        if (!isVisitCompleted(r)) {
                          return <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>Available after your visit</span>;
                        }
                        return (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => { setSigningRecord(r); setSignature(null); setSignError(''); }}
                            style={{ fontSize: 'var(--font-size-xs)', padding: '6px 14px' }}
                          >
                            Sign to confirm
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </section>

      {/* Acknowledgement Modal */}
      {signingRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3500,
            background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => { if (!savingSignature) { setSigningRecord(null); setSignature(null); setSignError(''); } }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Acknowledge this visit"
            style={{
              width: 'min(94vw, 520px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--panel)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Acknowledge this visit
              </h3>
              <button
                type="button"
                onClick={() => { setSigningRecord(null); setSignature(null); setSignError(''); }}
                disabled={savingSignature}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 12px 0', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
              Visit on <strong>{signingRecord.visit_date ? new Date(`${signingRecord.visit_date}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'record'}</strong>
              {signingRecord.clinician_name ? <> with <strong>{signingRecord.clinician_name}</strong></> : null}.
              Sign to acknowledge that you reviewed this visit record, including any medicines listed.
            </p>

            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 'var(--font-size-xs)', color: 'var(--text)' }}>
              <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{signingRecord.chief_complaint || 'General Medical Consultation'}</div>
              {signingRecord.assessment_plan && (
                <div style={{ marginTop: 4, color: 'var(--muted)' }}>{signingRecord.assessment_plan}</div>
              )}
            </div>

            <SignaturePad
              label="Your signature"
              onChange={setSignature}
              disabled={savingSignature}
            />

            {signError && (
              <div role="alert" style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--color-rose-bg)', color: 'var(--color-rose-text)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                {signError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => { setSigningRecord(null); setSignature(null); setSignError(''); }}
                disabled={savingSignature}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleSaveSignature}
                disabled={savingSignature || !signature}
              >
                {savingSignature ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default PatientRecords;

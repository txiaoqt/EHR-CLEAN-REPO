// src/pages/patient/PatientRecords.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';

const PatientRecords = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadRecords = async () => {
      if (!user?.patient_id) {
        if (mounted) setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('encounters')
          .select('id, encounter_date, clinician_name, chief_complaint, assessment_plan, vitals, status')
          .eq('patient_id', user.patient_id)
          .eq('status', 'Completed')
          .order('encounter_date', { ascending: false });

        if (!error && mounted) {
          setRecords(data || []);
        }
      } catch (err) {
        console.warn('Load patient records error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadRecords();
    return () => { mounted = false; };
  }, [user?.patient_id]);

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
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>Records</h2>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
              View selected summaries of your completed clinic visits and consultations.
            </div>
          </div>
        </div>

        {/* Encounter History Container */}
        <div className="card" style={{ padding: 22, border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                Encounter History
              </h3>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                Authorized consultation summaries and clinical notes provided by your clinician
              </div>
            </div>
            <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
              {records.length} Completed Visit(s)
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)', fontSize: 14 }}>
              Loading medical encounter history...
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', background: 'var(--bg, #f8fafc)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>No completed visits yet</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, maxWidth: 440, margin: '4px auto 0' }}>
                Your completed clinic consultations and visit summaries will appear here once finalized by your clinician.
              </div>
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table View (>= 768px) */}
              <div className="patient-records-table-view table-responsive" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Visit Date
                      </th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Attending Clinician
                      </th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Chief Complaint / Reason
                      </th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Assessment & Plan Summary
                      </th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Vitals Summary
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {r.encounter_date ? new Date(r.encounter_date).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {r.clinician_name || 'Clinic Physician'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text)', maxWidth: 220 }}>
                          <div style={{ fontWeight: 600 }}>{r.chief_complaint || 'General Medical Consultation'}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text)', maxWidth: 280 }}>
                          {r.assessment_plan || 'Consultation completed without special prescription.'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--muted)' }}>
                          <span style={{ background: 'var(--bg, #f1f5f9)', padding: '4px 8px', borderRadius: 6, display: 'inline-block', lineHeight: 1.4 }}>
                            {formatVitals(r.vitals)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View (< 768px) */}
              <div className="patient-records-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {records.map((r) => (
                  <div
                    key={r.id}
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
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                        {r.encounter_date ? new Date(r.encounter_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recent Visit'}
                      </span>
                      <span className="badge badge-success" style={{ fontWeight: 600 }}>
                        {r.status || 'Completed'}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Attending Clinician
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                        {r.clinician_name || 'Clinic Physician'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Chief Complaint / Reason
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                        {r.chief_complaint || 'General Medical Consultation'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Assessment & Plan Summary
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2, lineHeight: 1.4 }}>
                        {r.assessment_plan || 'Consultation completed without special prescription.'}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Vitals Summary
                      </div>
                      <span style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 6, display: 'inline-block', fontSize: 12, color: 'var(--text)' }}>
                        {formatVitals(r.vitals)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default PatientRecords;

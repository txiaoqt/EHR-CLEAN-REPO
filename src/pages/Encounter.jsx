// src/pages/Encounter.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { canEditField, sanitizeEncounterPayloadForRole } from '../accessControl.js';
import { ChevronDownIcon, CloseIcon } from '../components/icons/Icons.jsx';
import ResultDialog from '../components/ResultDialog.jsx';

// simple student search (keeps your original query behaviour)
// NOTE: we sanitize the query to remove % and _ before using ilike patterns.
const sanitizeIlikeQuery = (q) => {
  if (!q || typeof q !== 'string') return '';
  return q.replace(/[%_]/g, '').trim();
};

const fetchStudents = async (query) => {
  const safe = sanitizeIlikeQuery(query);
  if (!safe) return [];
  const { data } = await supabase
    .from('students')
    .select('id, name, year')
    .or(`name.ilike.%${safe}%,id.ilike.%${safe}%`)
    .limit(10);
  return data || [];
};

const formatClinicianName = (userData) => {
  if (!userData) return '';
  let displayName = userData.name;
  const prefix = (userData.email || '').split('.')[0].toLowerCase();
  if (prefix === 'dr' && !displayName.startsWith('Dr.')) displayName = `Dr. ${displayName}`;
  else if (prefix === 'nurse' && !displayName.startsWith('Nr.')) displayName = `Nr. ${displayName.replace(/^(Nurse\s+)?/, '')}`;
  else if (prefix === 'admin') displayName = `Admin ${displayName}`;
  return displayName;
};

const Encounter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const clinicianDefault = user ? formatClinicianName(user) : '';
  const canEditAssessmentPlan = canEditField(user, 'assessment_plan');

  const [form, setForm] = useState({
    patient: '',                 // patient id (TUP id) — required
    patientNameVisible: '',      // text shown in search input
    patientName: '',             // clean name, stored on the encounter
    complaint: '',
    hpi: '',
    exam: '',
    plan: '',
    temp: '',
    pulse: '',
    bp: '',
    weight: '',
    visitType: 'Walk-in',
    clinician: clinicianDefault,
    date: ''
  });

  const [patientSearch, setPatientSearch] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const searchTimer = useRef(null);

  // Medicines dispensed during this consultation. Saved against the encounter,
  // which is what makes the Medical Log dynamic: dispense here and the row
  // appears there with no further work.
  const [inventoryItems, setInventoryItems] = useState([]);
  const [dispensed, setDispensed] = useState([]);
  const [medPick, setMedPick] = useState('');
  const [medQty, setMedQty] = useState('1');

  // Drawn signature. Stored as a PNG against the encounter, with the signer's
  // name and a timestamp so the record is verifiable, not just decorative.

  const [isSaving, setIsSaving] = useState(false);
  // Replaces window.alert(): styled, non-blocking, and able to link to the
  // record that was just created.
  const [result, setResult] = useState(null);

  // Prefill patient when navigating from Appointments/Patients with state.
  useEffect(() => {
    let mounted = true;

    const prefillFromNavigation = async () => {
      const incomingId = location?.state?.patientId;
      const incomingName = location?.state?.patientName;
      if (!incomingId) return;

      let displayName = incomingName || '';
      if (!displayName) {
        try {
          const { data } = await supabase
            .from('students')
            .select('id, name')
            .eq('id', incomingId)
            .maybeSingle();
          if (data?.name) displayName = data.name;
        } catch (e) {
          // ignore; fallback below
        }
      }

      if (!mounted) return;
      const visible = displayName ? `${displayName} (${incomingId})` : `${incomingId}`;
      setForm(prev => ({ ...prev, patient: incomingId, patientNameVisible: visible, patientName: displayName || '' }));
      setPatientSearch(visible);
      setPatientSuggestions([]);
    };

    prefillFromNavigation();
    return () => { mounted = false; };
  }, [location]);

  // ---------- Vitals validation constraints & helpers (ADDED) ----------
  const VITAL_LIMITS = {
    temp: { min: 30, max: 45, decimals: 1 },    // Celsius
    pulse: { min: 20, max: 220 },               // bpm
    weight: { min: 1, max: 300, decimals: 1 },  // kg
    bp: { sysMax: 300, diaMax: 200 }
  };

  // Allow decimal numbers with at most one dot and optionally limit decimals.
  const sanitizeDecimalInput = (value, maxDecimals = 1, maxValue = Infinity) => {
    if (value == null) return '';
    let v = value.toString();
    // remove everything except digits and dot
    v = v.replace(/[^\d.]/g, '');
    // collapse multiple dots
    const parts = v.split('.');
    if (parts.length > 1) {
      const integer = parts.shift();
      const decimal = parts.join(''); // merge subsequent dots content
      v = integer + '.' + decimal;
    }
    // enforce max decimals
    if (maxDecimals >= 0 && v.includes('.')) {
      const [intPart, decPart] = v.split('.');
      v = intPart + '.' + decPart.slice(0, maxDecimals);
    }
    // remove leading zeros (but keep "0" or "0.x")
    if (v && !v.startsWith('0.')) {
      v = v.replace(/^0+(?=\d)/, '');
    }
    // enforce numeric max
    const num = Number(v);
    if (!Number.isNaN(num) && num > maxValue) {
      return String(maxValue);
    }
    return v;
  };

  // Allow digits only
  const sanitizeIntegerInput = (value, maxValue = Infinity) => {
    if (value == null) return '';
    let v = value.toString();
    v = v.replace(/[^\d]/g, '');
    // remove leading zeros
    v = v.replace(/^0+(?=\d)/, '');
    const num = v === '' ? 0 : Number(v);
    if (num > maxValue) return String(maxValue);
    return v;
  };

  // BP input sanitizer: allow digits and a single slash '/'. Remove other chars.
  // Normalize: keep at most one slash; trim leading zeros in each part; enforce maxima.
  const sanitizeBPInput = (value) => {
    if (value == null) return '';
    let v = value.toString();
    // remove everything except digits and slash
    v = v.replace(/[^\d/]/g, '');
    // collapse multiple slashes to one
    v = v.replace(/\/+/g, '/');
    // ensure only one slash
    const parts = v.split('/');
    if (parts.length > 2) {
      // join extras into second part
      v = parts[0] + '/' + parts.slice(1).join('');
    }
    // if we have both parts, enforce numeric maxima
    if (v.includes('/')) {
      const [sysRaw, diaRaw] = v.split('/');
      const sys = (sysRaw || '').replace(/^0+(?=\d)/, '') || '';
      const dia = (diaRaw || '').replace(/^0+(?=\d)/, '') || '';
      const sysNum = sys === '' ? null : Number(sys);
      const diaNum = dia === '' ? null : Number(dia);
      let sysStr = sys;
      let diaStr = dia;
      if (sysNum !== null && !Number.isNaN(sysNum) && sysNum > VITAL_LIMITS.bp.sysMax) sysStr = String(VITAL_LIMITS.bp.sysMax);
      if (diaNum !== null && !Number.isNaN(diaNum) && diaNum > VITAL_LIMITS.bp.diaMax) diaStr = String(VITAL_LIMITS.bp.diaMax);
      v = (sysStr || '') + '/' + (diaStr || '');
    } else {
      // only systolic being typed; trim leading zeros
      v = v.replace(/^0+(?=\d)/, '');
      // enforce systolic max if present
      const n = v === '' ? null : Number(v);
      if (n !== null && !Number.isNaN(n) && n > VITAL_LIMITS.bp.sysMax) v = String(VITAL_LIMITS.bp.sysMax);
    }
    return v;
  };

  const validateVitals = (vals) => {
    // temp, pulse, weight are optional; if provided must be valid
    if (vals.temp) {
      const num = Number(vals.temp);
      if (Number.isNaN(num)) return `Temperature must be a number between ${VITAL_LIMITS.temp.min} and ${VITAL_LIMITS.temp.max}.`;
      if (num < VITAL_LIMITS.temp.min || num > VITAL_LIMITS.temp.max) return `Temperature out of range (${VITAL_LIMITS.temp.min}-${VITAL_LIMITS.temp.max} °C).`;
    }
    if (vals.pulse) {
      const num = Number(vals.pulse);
      if (!/^\d+$/.test(vals.pulse) || Number.isNaN(num)) return `Pulse must be a whole number (bpm).`;
      if (num < VITAL_LIMITS.pulse.min || num > VITAL_LIMITS.pulse.max) return `Pulse out of range (${VITAL_LIMITS.pulse.min}-${VITAL_LIMITS.pulse.max} bpm).`;
    }
    if (vals.weight) {
      const num = Number(vals.weight);
      if (Number.isNaN(num)) return `Weight must be a number between ${VITAL_LIMITS.weight.min} and ${VITAL_LIMITS.weight.max}.`;
      if (num < VITAL_LIMITS.weight.min || num > VITAL_LIMITS.weight.max) return `Weight out of range (${VITAL_LIMITS.weight.min}-${VITAL_LIMITS.weight.max} kg).`;
    }
    if (vals.bp) {
      // must be like 120/80 ; disallow letters and other characters (sanitizer already limits)
      if (!/^\d{1,3}\/\d{1,3}$/.test(vals.bp)) return 'BP must be numeric in the format SYS/DIA (e.g. 120/80). Use only the / symbol (no letters or other characters).';
      const [sysS, diaS] = vals.bp.split('/');
      const sys = Number(sysS), dia = Number(diaS);
      if (Number.isNaN(sys) || Number.isNaN(dia)) return 'BP contains invalid numbers.';
      if (sys < 30 || sys > VITAL_LIMITS.bp.sysMax) return `Systolic out of range (30-${VITAL_LIMITS.bp.sysMax}).`;
      if (dia < 20 || dia > VITAL_LIMITS.bp.diaMax) return `Diastolic out of range (20-${VITAL_LIMITS.bp.diaMax}).`;
    }
    return null;
  };
  // ------------------------------------------------------------------

  // debounced student search
  useEffect(() => {
    if (!patientSearch) {
      setPatientSuggestions([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await fetchStudents(patientSearch);
        setPatientSuggestions(results);
      } catch (e) {
        console.error('Search error', e);
        setPatientSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [patientSearch]);

  // helper setter
  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // helper: ensure patient exists (insert from students if not)
  // Dispensary list for the medicine picker.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('inventory')
          .select('item_name, stock_quantity, unit')
          .order('item_name');
        setInventoryItems(data || []);
      } catch (err) {
        console.warn('Could not load the dispensary list:', err);
      }
    })();
  }, []);

  const addMedication = () => {
    if (!medPick) return;
    const qty = Math.max(1, Number(medQty) || 1);
    setDispensed((prev) => {
      const existing = prev.find((d) => d.item_name === medPick);
      if (existing) {
        return prev.map((d) => (d.item_name === medPick ? { ...d, quantity: d.quantity + qty } : d));
      }
      return [...prev, { item_name: medPick, quantity: qty }];
    });
    setMedPick('');
    setMedQty('1');
  };

  const removeMedication = (itemName) =>
    setDispensed((prev) => prev.filter((d) => d.item_name !== itemName));

  async function ensurePatientExists(patientId) {
    if (!patientId) throw new Error('Patient ID missing');
    const { data: existing, error: checkErr } = await supabase.from('patients').select('id').eq('id', patientId).maybeSingle();
    if (checkErr) throw checkErr;
    if (existing && existing.id) return true;

    // try students
    const { data: studentData, error: studentErr } = await supabase.from('students').select('id,name,year').eq('id', patientId).maybeSingle();
    if (studentErr) throw studentErr;
    if (!studentData || !studentData.id) throw new Error('Patient not found in students. Please select a valid student.');

    const { error: insertErr } = await supabase.from('patients').insert([{
      id: studentData.id,
      name: studentData.name,
      year: studentData.year,
      last_visit_date: new Date().toISOString().slice(0,10)
    }]);
    if (insertErr) throw insertErr;
    return true;
  }

  const validateForm = () => {
    if (!form.patient) return 'Please select a patient (pick from suggestions).';
    if (!form.complaint || form.complaint.trim().length < 2) return 'Chief complaint is required.';

    // vitals validation
    const vitalsValidation = validateVitals({
      temp: form.temp,
      pulse: form.pulse,
      bp: form.bp,
      weight: form.weight
    });
    if (vitalsValidation) return vitalsValidation;

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateForm();
    if (validation) {
      setResult({
        tone: 'error',
        title: 'Please check the form',
        message: validation,
        actions: [{ label: 'Close', onClick: () => setResult(null) }],
      });
      return;
    }

    setIsSaving(true);
    try {
      await ensurePatientExists(form.patient);

      const encDate = form.date || new Date().toISOString();
      const vitalsJson = {
        temp: form.temp || null,
        pulse: form.pulse || null,
        bp: form.bp || null,
        weight: form.weight || null
      };

      // A visit recorded without a booking has no lifecycle to follow, and the
      // note is written once the visit is over — so it is closed immediately.
      // A booked visit stays 'active' until its appointment is marked
      // Completed, which closes the note at the same time.
      const manilaVisitDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
      }).format(new Date(encDate));

      const { data: sameDayBooking } = await supabase
        .from('appointments')
        .select('id')
        .eq('patient_id', form.patient)
        .eq('appointment_date', manilaVisitDate)
        .neq('status', 'Cancelled')
        .limit(1);

      const encounterStatus = sameDayBooking?.length ? 'active' : 'completed';

      const { data: inserted, error } = await supabase.from('encounters').insert([{
        patient_id: form.patient,
        // Stored on the encounter so the column is authoritative. A trigger keeps
        // it in step if the patient is later renamed.
        patient_name: form.patientName || null,
        clinician_name: form.clinician,
        encounter_date: encDate,
        chief_complaint: form.complaint,
        hpi: form.hpi,
        physical_exam: form.exam,
        ...sanitizeEncounterPayloadForRole(user, {
          assessment_plan: form.plan,
        }),
        vitals: vitalsJson,
        status: encounterStatus,
        attachments: [] // attachments removed per request
      }]).select('id').single();

      if (error) throw error;
      const encounterId = inserted?.id;

      // 1. Record the dispensing against this encounter, then draw the stock
      //    down so the catalogue and the history agree.
      if (encounterId && dispensed.length > 0) {
        const { error: dispenseErr } = await supabase.from('inventory_transactions').insert(
          dispensed.map((d) => ({
            item_name: d.item_name,
            transaction_type: 'out',
            quantity: d.quantity,
            reason: 'Dispensed during consultation',
            performed_by: form.clinician,
            patient_id: form.patient,
            encounter_id: encounterId,
          }))
        );
        if (dispenseErr) {
          console.warn('Dispensing was not recorded:', dispenseErr);
        } else {
          for (const d of dispensed) {
            const item = inventoryItems.find((i) => i.item_name === d.item_name);
            if (!item) continue;
            await supabase
              .from('inventory')
              .update({
                stock_quantity: Math.max(0, Number(item.stock_quantity || 0) - d.quantity),
                updated_at: new Date().toISOString(),
              })
              .eq('item_name', d.item_name);
          }
        }
      }

      // 2. The patient signs their own acknowledgement from the patient portal;
      //    staff do not sign the visit.

      await logAudit('Encounter Creation', `Encounter for ${form.patient} - ${form.complaint}`, form.clinician);
      window.dispatchEvent(new CustomEvent('encounterAdded'));

      // Remember what was just recorded before the form is cleared, so the
      // dialog can say something useful rather than just "saved".
      const savedPatientId = form.patient;
      const savedPatientName = form.patientName || form.patient;
      const savedComplaint = form.complaint;
      const savedMedCount = dispensed.length;

      // reset only encounter fields (keep clinician)
      setForm({
        patient: '',
        patientNameVisible: '',
        patientName: '',
        complaint: '',
        hpi: '',
        exam: '',
        plan: '',
        temp: '',
        pulse: '',
        bp: '',
        weight: '',
        visitType: 'Walk-in',
        clinician: clinicianDefault,
        date: ''
      });
      setPatientSearch('');
      setPatientSuggestions([]);
      setDispensed([]);
      setMedPick('');
      setMedQty('1');

      // Stay on the form only if the clinician chooses to; otherwise move on to
      // the record they just created, which is what they actually want to see.
      setResult({
        tone: 'success',
        title: 'Visit recorded',
        message: `${savedPatientName}'s encounter has been saved.`,
        details: [
          `Patient: ${savedPatientName} (${savedPatientId})`,
          `Chief complaint: ${savedComplaint || '—'}`,
          savedMedCount > 0
            ? `Medicines dispensed: ${dispensed.map((d) => `${d.item_name} ×${d.quantity}`).join(', ')}`
            : 'No medicines dispensed',
        ],
        actions: [
          { label: 'View patient record', variant: 'primaryTone', onClick: () => { setResult(null); navigate(`/patient-profile?id=${savedPatientId}`); } },
          { label: 'Record another', variant: 'secondary', onClick: () => setResult(null) },
        ],
      });
    } catch (err) {
      console.error('Save error:', err);
      setResult({
        tone: 'error',
        title: 'Could not save the encounter',
        message: err?.message || 'Something went wrong. Nothing was recorded — please try again.',
        actions: [{ label: 'Close', onClick: () => setResult(null) }],
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSuggestion = (s) => {
    setForm(prev => ({ ...prev, patient: s.id, patientNameVisible: `${s.name} (${s.id})`, patientName: s.name || '' }));
    setPatientSearch(`${s.name} (${s.id})`);
    setPatientSuggestions([]);
  };

  return (
    <main className="main">
      <section className="page">
        <div className="page-header" style={{ maxWidth: 1100, margin: '12px auto' }}>
          <div className="page-header-title-block">
            <h1 className="page-header-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>New Encounter</h1>
            <p className="page-header-subtitle" style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-base)', color: 'var(--muted)' }}>
              Create a new patient encounter. Required: Patient and Chief Complaint.
            </p>
          </div>

          {/* BACK BUTTON (primary) */}
          <div className="page-header-actions">
            <button
              type="button"
              className="btn"
              onClick={() => navigate(-1)}
              aria-label="Go back"
            >
              ← Back
            </button>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 1100, margin: '12px auto', padding: 16 }}>
          <form onSubmit={handleSubmit} className="encounter-form-grid">
            <div>
              {/* Patient selector */}
              <div className="card" style={{ marginBottom: 12 }}>
                <label className="label-muted" htmlFor="patient-search">Patient</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, position: 'relative' }}>
                  <input
                    id="patient-search"
                    aria-label="Search patient by name or student #"
                    type="text"
                    placeholder="Search patient"
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
                    value={patientSearch}
                    onChange={e => {
                      setPatientSearch(e.target.value);
                      setField('patient', ''); // clear selected id when typing
                      setField('patientNameVisible', '');
                    }}
                    autoComplete="off"
                  />
                  <button type="button" className="btn" onClick={() => alert('Patient selector modal not implemented')}>Select</button>

                  {patientSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--border)', maxHeight: 180, overflowY: 'auto', zIndex: 20 }}>
                      {patientSuggestions.map(s => (
                        <div key={s.id}
                          onClick={() => handleSelectSuggestion(s)}
                          style={{ padding: 8, cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                          {s.name} ({s.id}) • Year {s.year}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>
                  Selected ID: <strong>{form.patient || 'none'}</strong>
                </div>
              </div>

              {/* Chief Complaint */}
              <div className="card" style={{ marginBottom: 12 }}>
                <label className="label-muted" htmlFor="complaint">Chief Complaint</label>
                <br />
                <input style={{ marginTop: 16, width: '100%' }}
                  id="complaint"
                  className="input"
                  type="text"
                  placeholder="Guide: 'Fever'"
                  value={form.complaint}
                  onChange={e => setField('complaint', e.target.value)}
                  required

                />
                <div style={{ marginTop: 10, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                  Short statement of the main reason for visit. Keep it concise — location, duration, and key descriptor.
                </div>
              </div>

              {/* HPI */}
              <div className="card" style={{ marginBottom: 12 }}>
                <label className="label-muted">History of Present Illness (HPI)</label>
                <textarea 
                  value={form.hpi}
                  onChange={e => setField('hpi', e.target.value)}
                  rows="8"
                  style={{ width: '100%', marginTop: 16, padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
                  placeholder={
`Guide:
- Onset: when symptoms started
- Location: where
- Duration: continuous/intermittent, how long
- Character: sharp, dull, throbbing
- Aggravating/relieving factors
- Associated symptoms (nausea, cough, shortness of breath)`
                } />
                <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                  Write a brief narrative focused on the current problem — timing, severity, modifiers, and associated symptoms.
                </div>
              </div>

              {/* Physical Exam */}
              <div className="card" style={{ marginBottom: 12 }}>
                <label className="label-muted">Physical Exam</label>
                <textarea
                  value={form.exam}
                  onChange={e => setField('exam', e.target.value)}
                  rows="6"
                  style={{ width: '100%', marginTop: 16, padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
                  placeholder={
`Guide:
- General appearance (well, distressed)
- Vital signs summary (if relevant)
- Focused systems: e.g., ENT: pharynx erythematous; Lungs: clear; Abdomen: soft, non-tender.`
                } />
                <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                  Record objective findings from the physical exam — be concise and system-focused.
                </div>
              </div>

              {/* Assessment / Plan */}
              <div className="card" style={{ marginBottom: 12 }}>
                <label className="label-muted">Assessment / Plan</label>
                <textarea
                  value={form.plan}
                  onChange={e => setField('plan', e.target.value)}
                  rows="4"
                  style={{ width: '100%', marginTop: 16, padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
                  disabled={!canEditAssessmentPlan}
                  placeholder={
`Guide:
- Assessment: likely diagnoses (differentials if needed)
- Plan: investigations, medications, advice, follow-up`
                } />
                <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                  State your impression and the concrete next steps (tests, prescriptions, referrals, safety-netting).
                </div>
                {!canEditAssessmentPlan && (
                  <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                    Physician-only field: nurses cannot edit Assessment / Plan.
                  </div>
                )}
              </div>

              {/* Medicines dispensed — recorded against this encounter, and
                  surfaced automatically in the Medical Log. */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label-muted">Medicines Dispensed</label>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 260px' }}>
                    <select
                      className="input"
                      style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                      value={medPick}
                      onChange={(e) => setMedPick(e.target.value)}
                      aria-label="Choose a medicine to dispense"
                    >
                      <option value="">Select a medicine…</option>
                      {inventoryItems.map((i) => (
                        <option key={i.item_name} value={i.item_name}>
                          {i.item_name} — {i.stock_quantity} {i.unit} in stock
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--muted)' }} />
                  </div>

                  <input
                    type="number"
                    min="1"
                    className="input"
                    style={{ width: 90 }}
                    value={medQty}
                    onChange={(e) => setMedQty(e.target.value)}
                    aria-label="Quantity"
                  />

                  <button
                    type="button"
                    className="btn secondary"
                    onClick={addMedication}
                    disabled={!medPick}
                  >
                    Add
                  </button>
                </div>

                {dispensed.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {dispensed.map((d) => (
                      <span
                        key={d.item_name}
                        className="badge badge-neutral"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-weight-semibold)' }}
                      >
                        {d.item_name} ×{d.quantity}
                        <button
                          type="button"
                          onClick={() => removeMedication(d.item_name)}
                          aria-label={`Remove ${d.item_name}`}
                          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', padding: 0 }}
                        >
                          <CloseIcon size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--muted)' }}>
                  Dispensing is recorded against this visit and shown in the Medical Log.
                </div>
              </div>

              {/* No clinician signature here: the Medical Log's signature column
                  belongs to the PATIENT, who signs from their own portal to
                  confirm what they were given. */}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="submit" className="btn" disabled={isSaving || !form.patient || !form.complaint}>
                  {isSaving ? 'Saving…' : 'Save Encounter'}
                </button>
              </div>
            </div>

            <aside>
              {/* Vitals */}
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Vitals</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="Temperature (°C) — e.g., 37.8"
                    value={form.temp}
                    onChange={e => {
                      const sanitized = sanitizeDecimalInput(e.target.value, VITAL_LIMITS.temp.decimals, VITAL_LIMITS.temp.max);
                      setField('temp', sanitized);
                    }}
                    inputMode="decimal"
                  />
                  <input
                    className="input"
                    placeholder="Pulse (bpm) — e.g., 80"
                    value={form.pulse}
                    onChange={e => {
                      const sanitized = sanitizeIntegerInput(e.target.value, VITAL_LIMITS.pulse.max);
                      setField('pulse', sanitized);
                    }}
                    inputMode="numeric"
                  />
                  <input
                    className="input"
                    placeholder="BP — e.g., 120/80"
                    value={form.bp}
                    onChange={e => {
                      const sanitized = sanitizeBPInput(e.target.value);
                      setField('bp', sanitized);
                    }}
                    // important: keep type=text so user can enter slash
                  />
                  <input
                    className="input"
                    placeholder="Weight (kg) — optional"
                    value={form.weight}
                    onChange={e => {
                      const sanitized = sanitizeDecimalInput(e.target.value, VITAL_LIMITS.weight.decimals, VITAL_LIMITS.weight.max);
                      setField('weight', sanitized);
                    }}
                    inputMode="decimal"
                  />
                </div>
                <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                  Record the most recent / measured vitals. Use numbers only. BP must use a single slash (/) as shown: <strong>SYS/DIA</strong>.
                </div>
              </div>

              {/* Metadata */}
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Metadata</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select className="input" value={form.visitType} onChange={e => setField('visitType', e.target.value)}>
                    <option>Walk-in</option>
                    <option>Scheduled</option>
                    <option>Follow-up</option>
                  </select>

                  <div style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
                    Clinician: <strong>{form.clinician || 'Not logged in'}</strong>
                  </div>

                  <input className="input" type="datetime-local" value={form.date} onChange={e => setField('date', e.target.value)} />
                </div>
              </div>

              {/* Removed attachments per request */}
              <div className="card" style={{ padding: 12, fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                <strong>Notes on documentation</strong>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  <li>Keep entries clear and objective.</li>
                  <li>Use short sentences — include time/duration when relevant.</li>
                  <li>Write plans that are actionable (med + dose + frequency + duration).</li>
                </ul>
              </div>
            </aside>
          </form>
        </div>
      </section>

      <ResultDialog
        open={Boolean(result)}
        tone={result?.tone}
        title={result?.title}
        message={result?.message}
        details={result?.details}
        actions={result?.actions}
        onClose={() => setResult(null)}
      />
    </main>
  );
};

export default Encounter;

// src/pages/Encounter.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { canEditField, canViewSensitiveField, sanitizeEncounterPayloadForRole } from '../accessControl.js';
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

const formatAppointmentDateTime = (date, slot) => {
  if (!date) return '';
  const start = String(slot || '').split('-')[0].trim();
  const match = start.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return `${date}T09:00`;

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return `${date}T${String(hour).padStart(2, '0')}:${minute}`;
};

const AppointmentDescription = ({ description }) => {
  const text = String(description || '').trim();
  return (
    <section className="encounter-appointment-description" aria-labelledby="appointment-description-title">
      <h3 id="appointment-description-title">Patient’s description</h3>
      <p className={text ? '' : 'is-empty'}>
        {text || 'No description was submitted with this appointment.'}
      </p>
    </section>
  );
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
  const [appointmentContext, setAppointmentContext] = useState(null);
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [appointmentLoadError, setAppointmentLoadError] = useState('');
  const [appointmentPhotoUrl, setAppointmentPhotoUrl] = useState('');
  const [appointmentPhotoLoading, setAppointmentPhotoLoading] = useState(false);
  const [appointmentPhotoError, setAppointmentPhotoError] = useState('');
  const [savedEncounter, setSavedEncounter] = useState(null);
  const [savedEncounterPatientName, setSavedEncounterPatientName] = useState('');
  const [savedEncounterLoading, setSavedEncounterLoading] = useState(false);
  const [savedEncounterError, setSavedEncounterError] = useState('');
  const [savedEncounterMeds, setSavedEncounterMeds] = useState([]);
  const [savedEncounterAppointment, setSavedEncounterAppointment] = useState(null);
  const [savedEncounterPhotoUrl, setSavedEncounterPhotoUrl] = useState('');
  const [savedEncounterPhotoLoading, setSavedEncounterPhotoLoading] = useState(false);
  const [savedEncounterPhotoError, setSavedEncounterPhotoError] = useState('');
  // Replaces window.alert(): styled, non-blocking, and able to link to the
  // record that was just created.
  const [result, setResult] = useState(null);

  const searchParams = new URLSearchParams(location.search);
  const appointmentId = searchParams.get('appointmentId') || location?.state?.appointmentId || '';
  const savedEncounterId = searchParams.get('encounterId') || '';
  const incomingPatientId = location?.state?.patientId || searchParams.get('patientId') || '';
  const incomingPatientName = location?.state?.patientName || searchParams.get('patientName') || '';
  const incomingWalkInAt = location?.state?.walkInAt || searchParams.get('walkInAt') || '';
  const walkInFromStaffModal = Boolean(
    location?.state?.walkInFromStaffModal || searchParams.get('walkIn') === '1'
  );

  useEffect(() => {
    if (!savedEncounterId) {
      setSavedEncounter(null);
      setSavedEncounterError('');
      return undefined;
    }

    let mounted = true;
    const loadSavedEncounter = async () => {
      setSavedEncounterLoading(true);
      setSavedEncounterError('');
      setSavedEncounter(null);
      setSavedEncounterMeds([]);
      setSavedEncounterAppointment(null);
      setSavedEncounterPhotoUrl('');
      setSavedEncounterPhotoError('');
      try {
        const { data: encounter, error } = await supabase
          .from('encounters')
          .select('*')
          .eq('id', savedEncounterId)
          .maybeSingle();
        if (error) throw error;
        if (!encounter) throw new Error('This saved encounter could not be found or is no longer available.');
        if (!mounted) return;
        setSavedEncounter(encounter);
        setSavedEncounterPatientName(encounter.patient_name || incomingPatientName || encounter.patient_id || 'Patient');

        if (!encounter.patient_name) {
          const { data: patient } = await supabase
            .from('patients')
            .select('name')
            .eq('id', encounter.patient_id)
            .maybeSingle();
          let patientName = patient?.name || '';
          if (!patientName) {
            const { data: student } = await supabase
              .from('students')
              .select('name')
              .eq('id', encounter.patient_id)
              .maybeSingle();
            patientName = student?.name || '';
          }
          if (mounted && patientName) setSavedEncounterPatientName(patientName);
        }

        const { data: medications, error: medicationError } = await supabase
          .from('inventory_transactions')
          .select('item_name, quantity')
          .eq('encounter_id', savedEncounterId)
          .eq('transaction_type', 'out')
          .order('created_at', { ascending: true });
        if (medicationError) console.warn('Could not load encounter medications:', medicationError);
        if (mounted) setSavedEncounterMeds(medications || []);

        if (encounter.appointment_id) {
          const { data: appointment, error: appointmentError } = await supabase
            .from('appointments')
            .select('id, photo_path, problem_description, service_type, appointment_date, appointment_time, status')
            .eq('id', encounter.appointment_id)
            .maybeSingle();
          if (appointmentError) throw appointmentError;
          if (mounted && appointment) setSavedEncounterAppointment(appointment);
          if (appointment?.photo_path) {
            if (mounted) setSavedEncounterPhotoLoading(true);
            try {
              const { data: signedPhoto, error: photoError } = await supabase
                .storage
                .from('appointment-photos')
                .createSignedUrl(appointment.photo_path, 3600);
              if (photoError) throw photoError;
              if (mounted) setSavedEncounterPhotoUrl(signedPhoto?.signedUrl || '');
            } catch (photoError) {
              console.error('Could not load the saved encounter appointment photo:', photoError);
              if (mounted) setSavedEncounterPhotoError('The appointment photo could not be loaded. Try again.');
            }
          }
        }
      } catch (error) {
        console.error('Could not load the saved encounter:', error);
        if (mounted) setSavedEncounterError(error?.message || 'Could not load this saved encounter. Please try again.');
      } finally {
        if (mounted) {
          setSavedEncounterLoading(false);
          setSavedEncounterPhotoLoading(false);
        }
      }
    };

    loadSavedEncounter();
    return () => { mounted = false; };
  }, [savedEncounterId, incomingPatientName]);

  // Load appointment details from the URL so a staff member can refresh this
  // page and keep the patient, booking, and private photo linked.
  useEffect(() => {
    let mounted = true;

    const prefillFromNavigation = async () => {
      if (savedEncounterId) return;
      if (appointmentId) {
        setAppointmentLoading(true);
        setAppointmentLoadError('');
        setAppointmentContext(null);
        setAppointmentPhotoUrl('');
        setAppointmentPhotoError('');
        try {
          const { data: appointment, error } = await supabase
            .from('appointments')
            .select('id, patient_id, patient_name, appointment_date, appointment_time, department, service_type, appointment_type, status, photo_path, problem_description')
            .eq('id', appointmentId)
            .maybeSingle();
          if (error) throw error;
          if (!appointment) throw new Error('This appointment could not be found. Return to Appointments and try again.');
          if (appointment.status === 'Cancelled') throw new Error('Cancelled appointments cannot be opened as encounters.');

          let displayName = appointment.patient_name || incomingPatientName || '';
          if (!displayName) {
            const { data: student } = await supabase
              .from('students')
              .select('name')
              .eq('id', appointment.patient_id)
              .maybeSingle();
            displayName = student?.name || '';
          }
          if (!displayName) {
            const { data: patient } = await supabase
              .from('patients')
              .select('name')
              .eq('id', appointment.patient_id)
              .maybeSingle();
            displayName = patient?.name || '';
          }

          if (!mounted) return;
          const visible = displayName ? `${displayName} (${appointment.patient_id})` : appointment.patient_id;
          setAppointmentContext(appointment);
          setForm((prev) => ({
            ...prev,
            patient: appointment.patient_id,
            patientNameVisible: visible,
            patientName: displayName || appointment.patient_id,
            visitType: 'Scheduled',
            date: formatAppointmentDateTime(appointment.appointment_date, appointment.appointment_time),
          }));
          setPatientSearch(visible);
          setPatientSuggestions([]);

          if (appointment.photo_path) {
            setAppointmentPhotoLoading(true);
            try {
              const { data: signedPhoto, error: photoError } = await supabase
                .storage
                .from('appointment-photos')
                .createSignedUrl(appointment.photo_path, 3600);
              if (photoError) throw photoError;
              if (mounted) setAppointmentPhotoUrl(signedPhoto?.signedUrl || '');
            } catch (photoError) {
              console.error('Could not create a private appointment photo preview:', photoError);
              if (mounted) setAppointmentPhotoError('The appointment photo could not be loaded. Try again.');
            }
          }
        } catch (error) {
          console.error('Could not load the appointment for the encounter:', error);
          if (mounted) {
            setAppointmentLoadError(error?.message || 'Could not load this appointment. Return to Appointments and try again.');
            setAppointmentContext(null);
          }
        } finally {
          if (mounted) {
            setAppointmentLoading(false);
            setAppointmentPhotoLoading(false);
          }
        }
        return;
      }

      if (!incomingPatientId) {
        setAppointmentContext(null);
        setAppointmentLoadError('');
        setAppointmentPhotoUrl('');
        return;
      }

      let displayName = incomingPatientName;
      if (!displayName) {
        try {
          const { data } = await supabase
            .from('students')
            .select('id, name')
            .eq('id', incomingPatientId)
            .maybeSingle();
          if (data?.name) displayName = data.name;
        } catch (_) {}
      }

      if (!mounted) return;
      const visible = displayName ? `${displayName} (${incomingPatientId})` : `${incomingPatientId}`;
      setForm((prev) => ({
        ...prev,
        patient: incomingPatientId,
        patientNameVisible: visible,
        patientName: displayName || '',
        ...(walkInFromStaffModal ? {
          visitType: 'Walk-in',
          date: incomingWalkInAt,
        } : {}),
      }));
      setPatientSearch(visible);
      setPatientSuggestions([]);
    };

    prefillFromNavigation();
    return () => { mounted = false; };
  }, [appointmentId, incomingPatientId, incomingPatientName, incomingWalkInAt, walkInFromStaffModal, savedEncounterId]);

  const refreshAppointmentPhoto = async () => {
    const path = appointmentContext?.photo_path;
    if (!path) return;
    setAppointmentPhotoLoading(true);
    setAppointmentPhotoError('');
    try {
      const { data, error } = await supabase
        .storage
        .from('appointment-photos')
        .createSignedUrl(path, 3600);
      if (error) throw error;
      setAppointmentPhotoUrl(data?.signedUrl || '');
    } catch (error) {
      console.error('Could not reload the private appointment photo:', error);
      setAppointmentPhotoError('The appointment photo could not be loaded. Try again.');
    } finally {
      setAppointmentPhotoLoading(false);
    }
  };

  const refreshSavedEncounterPhoto = async () => {
    const path = savedEncounterAppointment?.photo_path;
    if (!path) return;
    setSavedEncounterPhotoLoading(true);
    setSavedEncounterPhotoError('');
    try {
      const { data, error } = await supabase
        .storage
        .from('appointment-photos')
        .createSignedUrl(path, 3600);
      if (error) throw error;
      setSavedEncounterPhotoUrl(data?.signedUrl || '');
    } catch (error) {
      console.error('Could not refresh the saved encounter photo:', error);
      setSavedEncounterPhotoError('The appointment photo could not be loaded. Try again.');
    } finally {
      setSavedEncounterPhotoLoading(false);
    }
  };

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
    if (walkInFromStaffModal && !form.date) return 'Date and time of the walk-in visit are required.';
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

      const encDate = walkInFromStaffModal && form.date
        ? new Date(`${form.date}${form.date.length === 16 ? ':00' : ''}+08:00`).toISOString()
        : form.date || new Date().toISOString();
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

      let sameDayBooking = [];
      if (!appointmentContext && !walkInFromStaffModal) {
        const { data } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', form.patient)
          .eq('appointment_date', manilaVisitDate)
          .neq('status', 'Cancelled')
          .limit(1);
        sameDayBooking = data || [];
      }

      const encounterStatus = walkInFromStaffModal
        ? 'completed'
        : appointmentContext
          ? (appointmentContext.status === 'Completed' ? 'completed' : 'active')
          : sameDayBooking.length ? 'active' : 'completed';

      const { data: inserted, error } = await supabase.from('encounters').insert([{
        appointment_id: appointmentContext?.id || null,
        visit_type: appointmentContext ? 'Scheduled' : walkInFromStaffModal ? 'Walk-in' : null,
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

      await logAudit(
        walkInFromStaffModal ? 'Walk-in Visit Creation' : 'Encounter Creation',
        `Encounter for ${form.patient} - ${form.complaint}`,
        form.clinician
      );
      window.dispatchEvent(new CustomEvent('encounterAdded'));

      // Remember what was just recorded before the form is cleared, so the
      // dialog can say something useful rather than just "saved".
      const savedPatientId = form.patient;
      const savedPatientName = form.patientName || form.patient;
      const savedComplaint = form.complaint;
      const savedMedCount = dispensed.length;
      const savedAppointmentId = appointmentContext?.id || null;

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
      setAppointmentContext(null);
      setAppointmentPhotoUrl('');
      setAppointmentPhotoError('');
      setAppointmentLoadError('');
      if (savedAppointmentId || walkInFromStaffModal) navigate('/encounter', { replace: true });

      // The clinician can open the exact record that was just saved.
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
          {
            label: 'Open saved encounter',
            variant: 'primaryTone',
            onClick: () => {
              setResult(null);
              navigate(`/encounter?encounterId=${encodeURIComponent(encounterId)}`, {
                state: { patientId: savedPatientId, patientName: savedPatientName },
              });
            },
          },
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

  if (savedEncounterId) {
    const recordDate = savedEncounter?.encounter_date
      ? new Date(savedEncounter.encounter_date).toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
      : 'Date not recorded';
    const recordStatus = (savedEncounter?.status || 'recorded').toString();
    const recordVitals = savedEncounter?.vitals && typeof savedEncounter.vitals === 'object'
      ? savedEncounter.vitals
      : {};
    const recordFields = [
      ['Chief complaint', savedEncounter?.chief_complaint],
      ['History of present illness', savedEncounter?.hpi],
      ['Physical exam', savedEncounter?.physical_exam],
      ...(canViewSensitiveField(user, 'assessment_plan', savedEncounter)
        ? [['Assessment / plan', savedEncounter?.assessment_plan]]
        : []),
    ];

    return (
      <main className="main">
        <section className="page encounter-record-page">
          <div className="page-header encounter-record-header">
            <div className="page-header-title-block">
              <h1 className="page-header-title">Patient encounter</h1>
              <p className="page-header-subtitle">Saved clinical record for {savedEncounterPatientName || incomingPatientName || savedEncounter?.patient_id || 'patient'}.</p>
            </div>
            <div className="page-header-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => savedEncounter?.patient_id
                  ? navigate(`/patient-profile?id=${encodeURIComponent(savedEncounter.patient_id)}`)
                  : navigate(-1)}
              >
                Back to patient profile
              </button>
              <button type="button" className="btn" onClick={() => navigate('/encounter')}>
                New Encounter
              </button>
            </div>
          </div>

          {savedEncounterLoading && (
            <div className="encounter-load-state" role="status" aria-live="polite">Loading saved encounter…</div>
          )}

          {savedEncounterError && !savedEncounter && (
            <div className="encounter-load-error" role="alert">
              <span>{savedEncounterError}</span>
              <button type="button" className="btn secondary small" onClick={() => navigate(-1)}>Go back</button>
            </div>
          )}

          {savedEncounter && (
            <>
              <section className="encounter-record-overview" aria-label="Encounter overview">
                <div className="encounter-record-person">
                  <span className="encounter-summary-label">Patient</span>
                  <h2>{savedEncounterPatientName || savedEncounter.patient_id}</h2>
                  <span className="encounter-record-id">{savedEncounter.patient_id}</span>
                </div>
                <div className="encounter-record-overview-facts">
                  <div>
                    <span className="encounter-summary-label">Encounter date</span>
                    <strong>{recordDate}</strong>
                  </div>
                  <div>
                    <span className="encounter-summary-label">Clinician</span>
                    <strong>{savedEncounter.clinician_name || 'Not recorded'}</strong>
                  </div>
                  <span className={`encounter-record-status encounter-record-status-${recordStatus.toLowerCase()}`}>
                    {recordStatus.replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  </span>
                </div>
              </section>

              <div className="encounter-record-grid">
                <div className="encounter-record-main-column">
                  <section className="encounter-record-card" aria-labelledby="encounter-record-notes-title">
                    <div className="encounter-record-section-heading">
                      <div>
                        <h2 id="encounter-record-notes-title">Clinical notes</h2>
                        <p>Saved details from this visit</p>
                      </div>
                    </div>
                    <div className="encounter-record-fields">
                      {recordFields.map(([label, value]) => (
                        <div className="encounter-record-field" key={label}>
                          <h3>{label}</h3>
                          <p>{value?.trim?.() || 'Not recorded'}</p>
                        </div>
                      ))}
                      {!canViewSensitiveField(user, 'assessment_plan', savedEncounter) && (
                        <div className="encounter-record-restricted" role="note">
                          Assessment and plan are available to physicians only.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="encounter-record-card" aria-labelledby="encounter-record-meds-title">
                    <div className="encounter-record-section-heading">
                      <div>
                        <h2 id="encounter-record-meds-title">Medicines dispensed</h2>
                        <p>Items recorded against this encounter</p>
                      </div>
                    </div>
                    {savedEncounterMeds.length ? (
                      <ul className="encounter-record-medications">
                        {savedEncounterMeds.map((medication, index) => (
                          <li key={`${medication.item_name}-${index}`}>
                            <span>{medication.item_name}</span>
                            <strong>×{medication.quantity}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="encounter-record-empty-value">No medicines were recorded for this visit.</p>
                    )}
                  </section>
                </div>

                <aside className="encounter-record-side-column">
                  <section className="encounter-record-card" aria-labelledby="encounter-record-vitals-title">
                    <div className="encounter-record-section-heading">
                      <div>
                        <h2 id="encounter-record-vitals-title">Vitals</h2>
                        <p>Measurements recorded during the visit</p>
                      </div>
                    </div>
                    <dl className="encounter-record-vitals">
                      {[
                        ['Temperature', recordVitals.temp ? `${recordVitals.temp} °C` : '—'],
                        ['Pulse', recordVitals.pulse ? `${recordVitals.pulse} bpm` : '—'],
                        ['Blood pressure', recordVitals.bp || '—'],
                        ['Weight', recordVitals.weight ? `${recordVitals.weight} kg` : '—'],
                      ].map(([label, value]) => (
                        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                      ))}
                    </dl>
                  </section>

                  <section className="encounter-record-card" aria-labelledby="encounter-record-appointment-title">
                    <div className="encounter-record-section-heading">
                      <div>
                        <h2 id="encounter-record-appointment-title">Appointment photo</h2>
                        <p>Optional image shared during appointment booking</p>
                      </div>
                    </div>
                    {savedEncounterPhotoLoading ? (
                      <div className="encounter-photo-empty" role="status">Loading photo…</div>
                    ) : savedEncounterPhotoUrl ? (
                      <div className="encounter-photo-preview">
                        <img
                          src={savedEncounterPhotoUrl}
                          alt={`Photo submitted with ${savedEncounterPatientName || 'the patient'}'s appointment`}
                          onError={() => {
                            setSavedEncounterPhotoUrl('');
                            setSavedEncounterPhotoError('The appointment photo could not be displayed. Try again.');
                          }}
                        />
                        <a href={savedEncounterPhotoUrl} target="_blank" rel="noreferrer" className="encounter-photo-open-link">View full size</a>
                      </div>
                    ) : savedEncounterPhotoError ? (
                      <div className="encounter-photo-error" role="alert">
                        <span>{savedEncounterPhotoError}</span>
                        <button type="button" className="btn secondary small" onClick={refreshSavedEncounterPhoto}>Try again</button>
                      </div>
                    ) : (
                      <div className="encounter-photo-empty">
                        {savedEncounterAppointment
                          ? 'No photo was submitted with this appointment.'
                          : 'This encounter has no linked appointment photo.'}
                      </div>
                    )}
                    {savedEncounterAppointment && (
                      <div className="encounter-record-appointment-meta">
                        <span>{savedEncounterAppointment.service_type || 'Appointment'}</span>
                        <strong>{savedEncounterAppointment.appointment_date || 'Date not recorded'}{savedEncounterAppointment.appointment_time ? ` · ${savedEncounterAppointment.appointment_time}` : ''}</strong>
                      </div>
                    )}
                    {savedEncounterAppointment && (
                      <AppointmentDescription description={savedEncounterAppointment.problem_description} />
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="main">
      <section className="page">
        <div className="page-header" style={{ maxWidth: 1100, margin: '12px auto' }}>
          <div className="page-header-title-block">
            <h1 className="page-header-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>New Encounter</h1>
            <p className="page-header-subtitle" style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-base)', color: 'var(--muted)' }}>
              {appointmentContext
                ? `Recording a visit for ${form.patientName || form.patient}. Add the clinical details below.`
                : walkInFromStaffModal
                  ? `Recording a walk-in visit for ${form.patientName || form.patient}. Add the clinical details below.`
                  : 'Create a new patient encounter. Required: Patient and Chief Complaint.'}
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

        {appointmentLoading && (
          <div className="encounter-load-state" role="status" aria-live="polite">
            Loading appointment details…
          </div>
        )}

        {appointmentLoadError && (
          <div className="encounter-load-error" role="alert">
            <span>{appointmentLoadError}</span>
            <button type="button" className="btn secondary small" onClick={() => navigate('/appointments')}>
              Back to Appointments
            </button>
          </div>
        )}

        {appointmentContext && (
          <section className="encounter-appointment-summary" aria-label="Selected appointment">
            <div className="encounter-appointment-person">
              <span className="encounter-summary-label">Scheduled patient</span>
              <h2>{form.patientName || form.patient}</h2>
              <p>{form.patient}</p>
            </div>
            <div className="encounter-appointment-details">
              <div>
                <span className="encounter-summary-label">Appointment</span>
                <strong>{appointmentContext.service_type || 'Consultation'}</strong>
              </div>
              <div>
                <span className="encounter-summary-label">Date &amp; time</span>
                <strong>{appointmentContext.appointment_date} · {appointmentContext.appointment_time}</strong>
              </div>
              <span className="encounter-appointment-status">{appointmentContext.status}</span>
            </div>
          </section>
        )}

        <div className="card" style={{ maxWidth: 1100, margin: '12px auto', padding: 16 }}>
          <form onSubmit={handleSubmit} className="encounter-form-grid">
            <div>
              {!appointmentContext ? (
                <div className="card encounter-patient-card">
                  <label className="label-muted" htmlFor="patient-search">Patient</label>
                  <div className="encounter-patient-search">
                    <input
                      id="patient-search"
                      className="input"
                      aria-label="Search patient by name or student number"
                      type="text"
                      placeholder="Search patient by name or student ID"
                      value={patientSearch}
                      onChange={e => {
                        setPatientSearch(e.target.value);
                        setField('patient', '');
                        setField('patientNameVisible', '');
                      }}
                      autoComplete="off"
                    />

                    {patientSuggestions.length > 0 && (
                      <div className="encounter-patient-suggestions" role="listbox" aria-label="Matching patients">
                        {patientSuggestions.map(s => (
                          <button
                            type="button"
                            key={s.id}
                            role="option"
                            aria-selected="false"
                            onClick={() => handleSelectSuggestion(s)}
                          >
                            <strong>{s.name}</strong>
                            <span>{s.id} · Year {s.year}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="encounter-selected-patient">
                    Selected patient ID: <strong>{form.patient || 'None'}</strong>
                  </div>
                </div>
              ) : (
                <div className="encounter-patient-locked" aria-label="Patient from appointment">
                  <span className="encounter-summary-label">Patient</span>
                  <strong>{form.patientName || form.patient}</strong>
                  <span>{form.patient}</span>
                </div>
              )}

              {appointmentContext && (
              <section className="encounter-photo-card" aria-labelledby="encounter-photo-title">
                <div className="encounter-photo-header">
                  <div>
                    <h3 id="encounter-photo-title">Appointment photo</h3>
                    <p>Photos shared during booking appear here.</p>
                  </div>
                  {appointmentPhotoUrl && (
                    <a href={appointmentPhotoUrl} target="_blank" rel="noreferrer" className="encounter-photo-open-link">
                      View full size
                    </a>
                  )}
                </div>

                {appointmentPhotoLoading ? (
                  <div className="encounter-photo-empty" role="status">Loading photo…</div>
                ) : appointmentPhotoUrl ? (
                  <div className="encounter-photo-preview">
                    <img
                      src={appointmentPhotoUrl}
                      alt={`Photo submitted with ${form.patientName || form.patient}'s appointment`}
                      onError={() => {
                        setAppointmentPhotoUrl('');
                        setAppointmentPhotoError('The appointment photo could not be displayed. Try again.');
                      }}
                    />
                    <span>Private photo attached to this appointment</span>
                  </div>
                ) : appointmentPhotoError ? (
                  <div className="encounter-photo-error" role="alert">
                    <span>{appointmentPhotoError}</span>
                    <button type="button" className="btn secondary small" onClick={refreshAppointmentPhoto}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="encounter-photo-empty">
                    No photo was submitted with this appointment.
                  </div>
                )}
              </section>
              )}

              {appointmentContext && (
                <AppointmentDescription description={appointmentContext.problem_description} />
              )}

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
                <button type="submit" className="btn" disabled={isSaving || appointmentLoading || Boolean(appointmentLoadError) || !form.patient || !form.complaint}>
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
                  {walkInFromStaffModal ? (
                    <div className="input" aria-label="Visit type" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-raised)' }}>
                      Walk-in
                    </div>
                  ) : (
                    <select className="input" value={form.visitType} onChange={e => setField('visitType', e.target.value)}>
                      <option>Walk-in</option>
                      <option>Scheduled</option>
                      <option>Follow-up</option>
                    </select>
                  )}

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

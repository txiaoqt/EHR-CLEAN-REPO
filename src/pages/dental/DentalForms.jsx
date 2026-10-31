import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon } from '../../components/icons/Icons.jsx';
import CourseSearch from '../../components/CourseSearch.jsx';
import { isValidStudentId } from '../../utils/authValidation.js';
import { composeFullName, toProperName } from '../../utils/nameFormat.js';
import { findSameNamePatients } from '../../utils/duplicatePatients.js';
import { CLASSIFICATIONS, DENTAL_TIMES, EMPTY_RECORD, ageFrom, formatTimeLabel, addDaysIso, todayIso } from './dentalShared.js';

/** Finds a patient in the student directory, or registers one by ID and name. */
// "230123" or "23-0123" -> "23-0123"; the TUPM- prefix is shown, not typed.
const STUDENT_FIELDS = 'id, name, year, first_name, middle_name, surname, suffix';
// "G." or "A. B." is an initial, not the full middle name the pink form asks for.
const isInitialOnly = (text) => /^[A-Za-z]\.?(\s+[A-Za-z]\.?)*$/.test((text || '').trim());

const formatIdDigits = (text) => {
  const digits = text.replace(/\D/g, '').slice(0, 6);
  return digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
};

export const PatientPicker = ({ value, onChange, disabled }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState({ id: '', first: '', middle: '', last: '', suffix: '', year: '1' });
  const [sameName, setSameName] = useState(null); // existing patients with the typed first name + surname
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    let current = true;
    const timer = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('students').select(STUDENT_FIELDS)
        .or(`name.ilike.%${safe}%,id.ilike.%${safe}%`).order('name').limit(8);
      if (current) setResults(data || []);
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query]);

  if (value) {
    return (
      <div className="dental-picker-selected">
        <div>
          <div className="dental-list-title">{value.name}</div>
          <div className="dental-list-sub">{value.id}{value.isNew ? ' · New patient' : ''}</div>
        </div>
        {!disabled && <button type="button" className="btn secondary small" onClick={() => onChange(null)}>Change</button>}
      </div>
    );
  }

  if (manual) {
    const studentId = `TUPM-${draft.id}`;
    const valid = isValidStudentId(studentId) && draft.first.trim() && draft.last.trim();
    const nameInput = (key, label, placeholder, optional) => (
      <label className="dental-field"><span>{label}{optional && ' (optional)'}</span>
        <input className="input" value={draft[key]} maxLength={80} placeholder={placeholder}
          onChange={(e) => { setSameName(null); setDraft({ ...draft, [key]: e.target.value }); }}
          onBlur={(e) => setDraft({ ...draft, [key]: key === 'suffix' ? e.target.value.trim() : toProperName(e.target.value) })} /></label>
    );
    const registerNew = () => {
      const parts = { first_name: toProperName(draft.first), middle_name: toProperName(draft.middle), surname: toProperName(draft.last), suffix: draft.suffix.trim() };
      onChange({ id: studentId, name: composeFullName({ firstName: parts.first_name, middleName: parts.middle_name, lastName: parts.surname, suffix: parts.suffix }),
        ...parts, year: Number(draft.year), isNew: true });
    };
    const checkThenRegister = async () => {
      setChecking(true);
      const matches = await findSameNamePatients({ firstName: draft.first, surname: draft.last, excludeId: studentId });
      setChecking(false);
      if (matches.length) setSameName(matches); else registerNew();
    };
    return (
      <div className="dental-stack" style={{ gap: 12 }}>
        <div className="dental-fields">
          <label className="dental-field"><span>ID Number</span>
            <span className="dental-id-input">
              <span className="dental-id-prefix" aria-hidden="true">TUPM-</span>
              <input className="input" value={draft.id} inputMode="numeric" aria-label="ID number after TUPM-"
                onChange={(e) => setDraft({ ...draft, id: formatIdDigits(e.target.value.replace(/^TUPM-?/i, '')) })} placeholder="23-0123" />
            </span></label>
          <label className="dental-field"><span>Year Level</span>
            <select className="input" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select></label>
        </div>
        <div className="dental-fields">
          {nameInput('last', 'Surname', 'e.g. Dela Cruz')}
          {nameInput('first', 'First Name', 'e.g. Juan')}
          {nameInput('middle', 'Middle Name', 'Full middle name, e.g. Santos', true)}
          {nameInput('suffix', 'Suffix', 'e.g. Jr., III', true)}
        </div>
        {sameName && (
          <div className="dental-alert dental-alert--warn" role="alert">
            <p style={{ margin: '0 0 10px' }}><strong>{sameName[0].name}</strong> is already registered as <strong>{sameName.map((m) => m.id).join(', ')}</strong>. Is this the same person?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sameName.map((m) => <button key={m.id} type="button" className="btn small" onClick={() => onChange(m)}>Use {m.id}</button>)}
              <button type="button" className="btn secondary small" onClick={registerNew}>Register as a different person</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn small" disabled={!valid || checking || Boolean(sameName)}
            onClick={checkThenRegister}>{checking ? 'Checking…' : 'Use This Patient'}</button>
          <button type="button" className="btn secondary small" onClick={() => setManual(false)}>Back to Search</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dental-picker">
      <div className="patients-search-wrapper">
        <span style={{ color: 'var(--text-light)', display: 'inline-flex' }}><SearchIcon size={16} /></span>
        <input type="search" className="patients-search-input" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ID number…" aria-label="Search patients by name or ID number" />
      </div>
      {query.trim().length >= 2 && (
        results.length ? (
          <ul className="dental-picker-results">
            {results.map((s) => (
              <li key={s.id}><button type="button" onClick={() => onChange(s)}>
                <span className="dental-list-title">{s.name}</span><span className="dental-list-sub">{s.id}</span>
              </button></li>
            ))}
          </ul>
        ) : <p className="dental-muted">No patient matches “{query.trim()}”.</p>
      )}
      <button type="button" className="btn secondary small" style={{ marginTop: 10 }} onClick={() => setManual(true)}>Register a New Patient</button>
    </div>
  );
};

/** Starting values for page 1: the saved dental record, else what the patient portal knows. */
export const loadRecordFor = async (patient) => {
  // Every log is a new visit, so the form always starts fresh from the directory,
  // never from the last visit's chart and remarks. `existing` only says whether
  // the patient has been seen before.
  const { data: saved } = await supabase.from('dental_records').select('patient_id').eq('patient_id', patient.id).maybeSingle();
  const { data: profile } = await supabase.from('patient_profiles')
    .select('full_name, sex, course, address, emergency_contact, emergency_contact_number').eq('patient_id', patient.id).maybeSingle();
  let names = patient;
  if (!patient.surname && !patient.isNew) {
    const { data } = await supabase.from('students').select(STUDENT_FIELDS).eq('id', patient.id).maybeSingle();
    if (data) names = data;
  }
  const words = (names.name || profile?.full_name || '').trim().split(/\s+/);
  const surname = names.surname || (words.length > 1 ? words[words.length - 1] : '');
  const firstName = names.surname ? names.first_name : (words.length > 1 ? words.slice(0, -1).join(' ') : words[0] || '');
  const sex = (profile?.sex || '').trim().charAt(0).toUpperCase();
  return {
    existing: Boolean(saved),
    record: {
      ...EMPTY_RECORD,
      surname: surname || '',
      // The pink form has no suffix box; it reads naturally after the given name.
      first_name: [firstName, names.suffix].filter(Boolean).join(' '),
      // Only a full middle name belongs on the form: leave an initial for the dentist to ask.
      middle_name: isInitialOnly(names.middle_name) ? '' : names.middle_name || '',
      college_course_unit: profile?.course || '',
      sex: sex === 'F' || sex === 'M' ? sex : '',
      address: profile?.address || '',
      // N/A marks what the student left blank, as the paper form would.
      emergency_name: profile?.emergency_contact?.trim() || 'N/A',
      emergency_relationship: 'N/A',
      emergency_contact: profile?.emergency_contact_number?.trim() || 'N/A',
      emergency_address: 'N/A',
    },
  };
};

const Field = ({ label, wide, children }) => (
  <label className={`dental-field${wide ? ' dental-field--wide' : ''}`}><span>{label}</span>{children}</label>
);

/** Page 1 of the pink form, up to "In Case of Emergency". */
export const RecordFields = ({ record, onChange, disabled }) => {
  const set = (key) => (e) => onChange({ ...record, [key]: e.target.value });
  const text = (key, label, props = {}) => (
    <Field label={label} wide={props.wide}>
      <input className="input" value={record[key] || ''} onChange={set(key)} disabled={disabled} maxLength={props.max || 160} required={props.required} placeholder={props.placeholder} />
    </Field>
  );
  return (
    <>
      <div className="dental-fields">
        {text('surname', 'Surname', { required: true, max: 80 })}
        {text('first_name', 'Name', { required: true, max: 80 })}
        {text('middle_name', 'Middle Name', { max: 80, placeholder: 'Full middle name, not the initial' })}
      </div>
      <div className="dental-fields" style={{ marginTop: 14 }}>
        <Field label="College / Course / Unit / Department" wide={false}>
          {/* Free text allowed: faculty and staff write their unit or department. */}
          <CourseSearch allowCustom value={record.college_course_unit || ''} disabled={disabled}
            placeholder="Type a program (e.g. BSIT) or a unit" onChange={(v) => onChange({ ...record, college_course_unit: v.slice(0, 160) })} />
        </Field>
        <div className="dental-field">
          <fieldset disabled={disabled}>
            <legend>Classification</legend>
            <div className="dental-choice-row">
              {CLASSIFICATIONS.map((c) => (
                <label key={c} className="dental-choice"><input type="radio" name="classification" value={c} checked={record.classification === c} onChange={set('classification')} />{c}</label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      <div className="dental-fields" style={{ marginTop: 14 }}>
        {text('address', 'Address', { wide: true, max: 300 })}
        <Field label="Date of Birth">
          <input className="input" type="date" value={record.date_of_birth || ''} onChange={set('date_of_birth')} disabled={disabled} max={todayIso()} />
        </Field>
        <Field label="Age"><input className="input" value={ageFrom(record.date_of_birth)} readOnly tabIndex={-1} aria-readonly="true" /></Field>
        <div className="dental-field">
          <fieldset disabled={disabled}>
            <legend>Sex</legend>
            <div className="dental-choice-row">
              {[['F', 'Female'], ['M', 'Male']].map(([v, l]) => (
                <label key={v} className="dental-choice"><input type="radio" name="sex" value={v} checked={record.sex === v} onChange={set('sex')} />{l}</label>
              ))}
            </div>
          </fieldset>
        </div>
        {text('place_of_birth', 'Place of Birth')}
      </div>
      <h3 className="dental-section-title" style={{ marginTop: 22 }}>In Case of Emergency, Please Notify</h3>
      <div className="dental-fields" style={{ marginTop: 10 }}>
        {text('emergency_name', 'Name')}
        {text('emergency_relationship', 'Relationship', { max: 60 })}
        {text('emergency_contact', 'Contact Number', { max: 40 })}
        {text('emergency_address', 'Address', { wide: true, max: 300 })}
      </div>
    </>
  );
};

/** The follow-up visit. Leaving the date empty schedules nothing. */
export const NextAppointmentFields = ({ value, onChange, dentists, disabled, optional }) => {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="dental-fields">
      <Field label={optional ? 'Date (optional)' : 'Date'}>
        <input className="input" type="date" value={value.date} min={addDaysIso(todayIso(), 1)} onChange={set('date')} disabled={disabled} />
      </Field>
      <Field label="Time">
        <select className="input" value={value.time} onChange={set('time')} disabled={disabled || !value.date}>
          {DENTAL_TIMES.map((t) => <option key={t} value={t}>{formatTimeLabel(t)}</option>)}
        </select>
      </Field>
      <Field label="Procedure">
        <input className="input" value={value.procedure} onChange={set('procedure')} disabled={disabled || !value.date} maxLength={160} placeholder="e.g. Oral prophylaxis" />
      </Field>
      <Field label="Dentist">
        <select className="input" value={value.dentist} onChange={set('dentist')} disabled={disabled || !value.date}>
          {dentists.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </Field>
    </div>
  );
};

export const emptyNext = (dentistName = '') => ({ date: '', time: '09:00', procedure: '', dentist: dentistName });
export const nextPayload = (next) => (next.date ? { date: next.date, time: next.time, procedure: next.procedure.trim(), dentist: next.dentist } : null);

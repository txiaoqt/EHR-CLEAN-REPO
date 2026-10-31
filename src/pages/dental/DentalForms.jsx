import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon } from '../../components/icons/Icons.jsx';
import { CLASSIFICATIONS, DENTAL_TIMES, EMPTY_RECORD, ageFrom, formatTimeLabel, addDaysIso, todayIso } from './dentalShared.js';

/** Finds a patient in the student directory, or registers one by ID and name. */
export const PatientPicker = ({ value, onChange, disabled }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState({ id: '', name: '', year: '1' });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    let current = true;
    const timer = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('students').select('id, name, year')
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
    const valid = draft.id.trim().length >= 3 && draft.name.trim().length >= 2;
    return (
      <div className="dental-stack" style={{ gap: 12 }}>
        <div className="dental-fields">
          <label className="dental-field"><span>ID Number</span>
            <input className="input" value={draft.id} maxLength={40} onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="e.g. TUPM-23-0123" /></label>
          <label className="dental-field"><span>Full Name</span>
            <input className="input" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Juan Dela Cruz" /></label>
          <label className="dental-field"><span>Year Level</span>
            <select className="input" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select></label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn small" disabled={!valid}
            onClick={() => onChange({ id: draft.id.trim().toUpperCase(), name: draft.name.trim(), year: Number(draft.year), isNew: true })}>Use This Patient</button>
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
  const { data: saved } = await supabase.from('dental_records').select('*').eq('patient_id', patient.id).maybeSingle();
  if (saved) return { record: saved, existing: true };
  const { data: profile } = await supabase.from('patient_profiles')
    .select('full_name, sex, course, address, emergency_contact, emergency_contact_number').eq('patient_id', patient.id).maybeSingle();
  const parts = (profile?.full_name || patient.name || '').trim().split(/\s+/);
  const sex = (profile?.sex || '').trim().charAt(0).toUpperCase();
  return {
    existing: false,
    record: {
      ...EMPTY_RECORD,
      surname: parts.length > 1 ? parts[parts.length - 1] : '',
      first_name: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '',
      college_course_unit: profile?.course || '',
      sex: sex === 'F' || sex === 'M' ? sex : '',
      address: profile?.address || '',
      emergency_name: profile?.emergency_contact || '',
      emergency_contact: profile?.emergency_contact_number || '',
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
      <input className="input" value={record[key] || ''} onChange={set(key)} disabled={disabled} maxLength={props.max || 160} required={props.required} />
    </Field>
  );
  return (
    <>
      <div className="dental-fields">
        {text('surname', 'Surname', { required: true, max: 80 })}
        {text('first_name', 'Name', { required: true, max: 80 })}
        {text('middle_name', 'Middle Name', { max: 80 })}
      </div>
      <div className="dental-fields" style={{ marginTop: 14 }}>
        {text('college_course_unit', 'College / Course / Unit / Department')}
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

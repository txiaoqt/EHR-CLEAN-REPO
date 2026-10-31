import React, { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { CheckIcon, AlertIcon } from './icons/Icons.jsx';
import CourseSearch from './CourseSearch.jsx';
import { digitsOnly, isValidPhMobile, limitPhone } from '../utils/courses.js';

/**
 * The clinic's paper record, as input fields.
 *
 * Transcribed from the form the clinic uses on paper. The applicant half is
 * everything down to Family History; the bottom of the paper form is marked
 * "ANG NASA IBABA AY SUSULATAN LAMANG NG NURSE O DOKTOR NG TUP-CLINIC", so
 * those three fields are not here — staff complete them on the staff side.
 *
 * Shared by enrollees and patients because the questions are identical and the
 * database stores one row per person either way. A second copy of this form
 * would drift from the first the moment the clinic changed a field.
 *
 * The answers are held in state and submitted in one call. Saving as you type
 * would leave the clinic reading half-answers, and this is a record of medical
 * history, not a draft.
 */

const SECTIONS = [
  {
    id: 'identity',
    title: 'Identity',
    blurb: 'As they appear on your enrolment records.',
    fields: [
      { key: 'form_date', label: 'Date', type: 'date' },
      { key: 'college_course', label: 'College / Course', type: 'course-select' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Female', 'Male'] },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { key: 'cell_phone', label: 'Cell Phone #', type: 'tel', mobileNumber: true, placeholder: '09XX XXX XXXX' },
    ],
  },
  {
    id: 'address',
    title: 'Addresses',
    blurb: 'Where you live, and where you go home to.',
    fields: [
      { key: 'permanent_address', label: 'Permanent Address', type: 'textarea', placeholder: 'Address in the province, or where you go home daily', required: true },
      { key: 'permanent_tel', label: 'Permanent Tel. #', type: 'tel', optional: true },
      { key: 'current_address', label: 'Current Address', type: 'textarea', placeholder: 'Boarding house, or where you stay daily', required: true },
      { key: 'current_tel', label: 'Current Tel. #', type: 'tel', optional: true },
    ],
  },
  {
    id: 'guardian',
    title: 'Guardian',
    blurb: 'The clinic asks for a guardian in Metro Manila so you can be reached quickly.',
    fields: [
      { key: 'guardian_name', label: 'Guardian', type: 'text', placeholder: 'Full name' },
      { key: 'guardian_tel', label: 'Guardian Tel. #', type: 'tel', optional: true },
      { key: 'guardian_cp', label: 'Guardian Cell Phone #', type: 'tel', mobileNumber: true, placeholder: '09XX XXX XXXX' },
      { key: 'guardian_address', label: 'Address of Guardian', type: 'textarea', placeholder: 'In Metro Manila, if possible' },
    ],
  },
  {
    id: 'history',
    title: 'Medical History',
    blurb: 'Written in your own words. There is no wrong answer, and none of this is held against you.',
    fields: [
      {
        key: 'past_medical_history',
        label: 'Past Medical History',
        type: 'textarea',
        rows: 4,
        placeholder: 'Illnesses since birth, and any hospital stays. e.g. Tigdas, Pulmonya, Tuberculosis',
      },
      {
        key: 'vaccinations',
        label: 'Vaccinations Received',
        type: 'textarea',
        rows: 3,
        placeholder: 'e.g. BCG, DPT, Measles',
      },
      {
        key: 'family_history',
        label: 'Family History',
        type: 'textarea',
        rows: 4,
        placeholder: 'Illnesses in your family and who has them. e.g. High Blood — Father',
      },
    ],
  },
];
const FIELD_BY_KEY = new Map(SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, field])));
const SIGNUP_IDENTITY_KEYS = new Set(['college_course', 'sex', 'date_of_birth']);

const formatIdentityValue = (key, value) => {
  if (!value) return 'Not on file';
  if (key !== 'date_of_birth') return value;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const emptyAnswers = () => ({
  form_date: new Date().toISOString().slice(0, 10),
  college_course: '',
  sex: '',
  date_of_birth: '',
  cell_phone: '',
  permanent_address: '',
  permanent_tel: '',
  current_address: '',
  current_tel: '',
  guardian_name: '',
  guardian_tel: '',
  guardian_cp: '',
  guardian_address: '',
  past_medical_history: '',
  vaccinations: '',
  family_history: '',
});

const PatientRecordForm = ({ initial = null, onSaved = null, readOnly = false, identity = null, lockIdentity = false, onCancel = null }) => {
  const [answers, setAnswers] = useState(() => {
    const values = { ...emptyAnswers(), ...(initial || {}) };
    if (lockIdentity) {
      for (const key of SIGNUP_IDENTITY_KEYS) values[key] = identity?.[key] || '';
    }
    for (const field of FIELD_BY_KEY.values()) {
      if (field.type === 'tel') {
        values[field.key] = field.mobileNumber ? limitPhone(values[field.key]) : digitsOnly(values[field.key]);
      }
    }
    return values;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [missing, setMissing] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [open, setOpen] = useState(() => lockIdentity || !initial?.submitted_at);

  // The one list that decides what is required. The database enforces the same
  // set, so this is a courtesy that tells the applicant early rather than a
  // second, competing definition.
  const requiredKeys = useMemo(() => {
    const keys = [];
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        if (!field.optional && !(lockIdentity && SIGNUP_IDENTITY_KEYS.has(field.key))) keys.push(field.key);
      }
    }
    return keys;
  }, [lockIdentity]);

  const set = (key, value) => {
    if (readOnly || (lockIdentity && SIGNUP_IDENTITY_KEYS.has(key))) return;
    const field = FIELD_BY_KEY.get(key);
    const nextValue = field?.mobileNumber
      ? limitPhone(value)
      : field?.type === 'tel'
        ? digitsOnly(value)
        : value;
    setAnswers((prev) => ({ ...prev, [key]: nextValue }));
    if (missing.includes(key)) setMissing((prev) => prev.filter((k) => k !== key));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setMissing([]);

    const emptyRequired = requiredKeys.filter(
      (key) => !String(answers[key] ?? '').trim()
    );
    if (emptyRequired.length) {
      setMissing(emptyRequired);
      setMessage(`Please complete: ${emptyRequired.map(labelFor).join(', ')}.`);
      setSaving(false);
      return;
    }

    const nextFieldErrors = {};
    for (const key of ['cell_phone', 'guardian_cp']) {
      if (!isValidPhMobile(answers[key])) {
        nextFieldErrors[key] = 'Enter 11 digits, starting with 09.';
      }
    }
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setMessage('Check the mobile numbers highlighted below.');
      setSaving(false);
      return;
    }
    setFieldErrors({});
    try {
      const { data, error } = await supabase.rpc('submit_record_form', {
        p_college_course: answers.college_course || null,
        p_sex: answers.sex || null,
        p_date_of_birth: answers.date_of_birth || null,
        p_cell_phone: limitPhone(answers.cell_phone) || null,
        p_permanent_address: answers.permanent_address || null,
        p_permanent_tel: digitsOnly(answers.permanent_tel) || null,
        p_current_address: answers.current_address || null,
        p_current_tel: digitsOnly(answers.current_tel) || null,
        p_guardian_name: answers.guardian_name || null,
        p_guardian_tel: digitsOnly(answers.guardian_tel) || null,
        p_guardian_cp: limitPhone(answers.guardian_cp) || null,
        p_guardian_address: answers.guardian_address || null,
        p_past_medical_history: answers.past_medical_history || null,
        p_vaccinations: answers.vaccinations || null,
        p_family_history: answers.family_history || null,
        p_form_date: answers.form_date || null,
      });

      if (error || !data?.success) {
        // The function reports every missing field at once and names them.
        const list = Array.isArray(data?.missing) ? data.missing : [];
        setMissing(list);
        if (error) {
          console.error('Record form RPC failed:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            status: error.status,
          });
        }
        const serverMessage = data?.error || [
          error?.message,
          error?.details,
          error?.hint,
        ].filter(Boolean).join(' — ');
        setMessage(
          serverMessage
            ? `Your record could not be saved: ${serverMessage}${error?.code ? ` [${error.code}]` : ''}`
            : 'Your record could not be saved. Please try again.'
        );
        return;
      }

      setMessage('Saved.');
      setAnswers((prev) => ({ ...prev, submitted_at: new Date().toISOString() }));
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Record form save error:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        status: err?.status,
      });
      setMessage(err?.message
        ? `Your record could not be saved: ${err.message}`
        : 'Your record could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const labelFor = (key) => {
    for (const section of SECTIONS) {
      const field = section.fields.find((f) => f.key === key);
      if (field) return field.label;
    }
    return key;
  };

  return (
    <div className="record-form">
      {message && (
        <div
          role="status"
          className="record-form-message"
          style={{
            background: message === 'Saved.' ? 'var(--color-emerald-bg)' : 'var(--color-rose-bg)',
            color: message === 'Saved.' ? 'var(--color-emerald-text)' : 'var(--color-rose-text)',
          }}
        >
          {message === 'Saved.' ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
          <span>{message}</span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="settings-row-note" style={{ marginBottom: 12 }}>
          Still needed: {missing.map(labelFor).join(', ')}
        </div>
      )}

      {SECTIONS.map((section, index) => {
        const sectionOpen = open === section.id || open === true;
        return (
          <section className="record-form-section" key={section.id}>
            <button
              type="button"
              className="record-form-head"
              aria-expanded={sectionOpen}
              onClick={() => setOpen(sectionOpen ? null : section.id)}
            >
              <span className="record-form-head-text">
                <span className="record-form-title">{section.title}</span>
                <span className="record-form-blurb">{section.blurb}</span>
              </span>
              <span className="record-form-chevron" aria-hidden="true">{sectionOpen ? '−' : '+'}</span>
            </button>

            {sectionOpen && (
              <div className="record-form-body">
                {section.fields.map((field) => {
                  const isMissing = missing.includes(field.key);
                  const fieldError = fieldErrors[field.key];
                  const isLockedIdentity = lockIdentity && SIGNUP_IDENTITY_KEYS.has(field.key);
                  const common = {
                    id: `record-${field.key}`,
                    disabled: readOnly,
                    'aria-invalid': isMissing || Boolean(fieldError) || undefined,
                    'aria-describedby': fieldError ? `record-${field.key}-error` : undefined,
                  };
                    return (
                    isLockedIdentity ? (
                      <div className="settings-field record-form-identity-field" key={field.key}>
                        <span className="record-form-identity-label">
                          {field.label}
                          <span>From student registration · read-only</span>
                        </span>
                        <div className="record-form-identity-value" aria-readonly="true">
                          {formatIdentityValue(field.key, answers[field.key])}
                        </div>
                      </div>
                    ) : (
                    <div className="settings-field" key={field.key}>
                      <label htmlFor={common.id}>
                        {field.label}
                        {field.optional && (
                          <span style={{ fontWeight: 'var(--font-weight-normal)', opacity: 0.7 }}> (optional)</span>
                        )}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          {...common}
                          className="input"
                          rows={field.rows || 2}
                          placeholder={field.placeholder}
                          value={answers[field.key] || ''}
                          onChange={(e) => set(field.key, e.target.value)}
                          style={isMissing || fieldError ? { borderColor: 'var(--color-rose-text)' } : undefined}
                        />
                      ) : field.type === 'course-select' ? (
                        <CourseSearch
                          id={common.id}
                          disabled={common.disabled}
                          invalid={common['aria-invalid']}
                          describedBy={common['aria-describedby']}
                          value={answers[field.key] || ''}
                          onChange={(course) => set(field.key, course)}
                          inputStyle={isMissing || fieldError ? { borderColor: 'var(--color-rose-text)' } : undefined}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          {...common}
                          className="input"
                          value={answers[field.key] || ''}
                          onChange={(e) => set(field.key, e.target.value)}
                          style={isMissing ? { borderColor: 'var(--color-rose-text)' } : undefined}
                        >
                          <option value="">Select…</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...common}
                          className="input"
                          type={field.type}
                          inputMode={field.mobileNumber ? 'numeric' : undefined}
                          autoComplete={field.mobileNumber ? 'tel-national' : undefined}
                          maxLength={field.mobileNumber ? 11 : undefined}
                          pattern={field.mobileNumber ? '09[0-9]{9}' : undefined}
                          placeholder={field.placeholder}
                          value={answers[field.key] || ''}
                          onChange={(e) => set(field.key, e.target.value)}
                          style={isMissing || fieldError ? { borderColor: 'var(--color-rose-text)' } : undefined}
                        />
                      )}
                      {fieldError && (
                        <span id={`${common.id}-error`} className="record-form-field-error" role="alert">{fieldError}</span>
                      )}
                    </div>
                    )
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {!readOnly && (
        <div className="record-form-actions">
          {onCancel && <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>Cancel</button>}
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Submit record'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PatientRecordForm;

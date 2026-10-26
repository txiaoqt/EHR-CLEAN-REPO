import React, { useId } from 'react';
import { composeFullName, toProperName } from '../utils/nameFormat.js';

export const emptyPersonName = () => ({ firstName: '', middleName: '', lastName: '', suffix: '' });
export const validPersonName = (value) => Boolean(value.firstName.trim() && value.lastName.trim())
  && composeFullName(value).length <= 120;

export default function PersonNameFields({ value, onChange, disabled = false, autoFocus = true, describedBy }) {
  const id = useId();
  const fullName = composeFullName(value);
  const tooLong = fullName.length > 120;
  const fields = [
    ['firstName', 'First Name', 'given-name', false, 'e.g. Juan'],
    ['middleName', 'Middle Name', 'additional-name', true, 'e.g. Santos'],
    ['lastName', 'Last Name', 'family-name', false, 'e.g. Dela Cruz'],
    ['suffix', 'Suffix', 'honorific-suffix', true, 'e.g. Jr., III'],
  ];
  return <div className="system-admin-person-name">
    <div className="system-admin-name-fields">
      {fields.map(([key, label, autoComplete, optional, placeholder]) => <label key={key} htmlFor={`${id}-${key}`}>
        <span>{label}{optional && <span className="system-admin-muted"> (Optional)</span>}</span>
        <input id={`${id}-${key}`} name={key} required={!optional} maxLength={120} value={value[key]}
          disabled={disabled} autoFocus={autoFocus && key === 'firstName'} autoComplete={autoComplete}
          placeholder={placeholder} aria-describedby={[describedBy, tooLong ? `${id}-length` : ''].filter(Boolean).join(' ') || undefined}
          onChange={event => onChange({ ...value, [key]: event.target.value })}
          onBlur={event => onChange({ ...value, [key]: key === 'suffix' ? event.target.value.trim() : toProperName(event.target.value) })} />
      </label>)}
    </div>
    {tooLong && <p className="system-admin-account-field-error" id={`${id}-length`} role="status">The combined name must be 120 characters or fewer.</p>}
  </div>;
}

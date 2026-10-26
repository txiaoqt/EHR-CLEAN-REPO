import React from 'react';
import { passwordCriteria } from '../utils/passwordPolicy.js';
import { CheckIcon } from './icons/Icons.jsx';
import '../styles/passwords.css';

export default function PasswordRequirements({ password, id, inverse = false }) {
  const rules = passwordCriteria(password);
  return <div id={id} className={`password-requirements${inverse ? ' password-requirements-inverse' : ''}`}>
    <p className="password-requirements-title">Password Requirements</p>
    <ul>{rules.map(rule => <li key={rule.id} className={rule.valid ? 'password-rule-met' : ''}>
      <span className="password-rule-icon" aria-hidden="true">{rule.valid ? <CheckIcon size={14} /> : <span />}</span>
      <span><span className="sr-only">{rule.valid ? 'Met: ' : 'Not met: '}</span>{rule.label}</span>
    </li>)}</ul>
    <span className="sr-only" role="status">{rules.filter(rule => rule.valid).length} of {rules.length} password requirements met.</span>
  </div>;
}

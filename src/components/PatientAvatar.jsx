import React from 'react';

// "Juan Dela Cruz" -> "JC"; "Dela Cruz, Juan" -> "JC".
export const initialsOf = (name) => {
  const [last, first] = String(name || '').split(',');
  const words = (first ? `${first} ${last}` : last).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
};

// The patient's photo, or their initials until they upload one.
export default function PatientAvatar({ src, name, className, style, fontSize = 'var(--font-size-sm)' }) {
  if (src) return <img src={src} alt={name} className={className} style={style} />;
  return (
    <span
      role="img"
      aria-label={name}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        borderRadius: '50%', background: 'var(--color-primary, #931b1b)', color: '#fff',
        fontWeight: 'var(--font-weight-bold)', fontSize, letterSpacing: '0.02em', userSelect: 'none',
        ...style,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

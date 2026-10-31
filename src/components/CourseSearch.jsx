import React, { useId, useMemo, useRef, useState } from 'react';
import { COURSE_PROGRAM_OPTIONS as OPTIONS, matchPrograms } from '../utils/courses.js';

/**
 * Searchable TUP Manila degree-program picker. Strict by default: only a listed
 * program can be chosen. `allowCustom` keeps typed text, for forms where faculty
 * and staff write their unit or department instead.
 */
const CourseSearch = ({
  id, value, onChange, allowCustom = false, placeholder = 'Type a program, e.g. BSIT',
  required, disabled, invalid, className = 'input', inputStyle, describedBy,
}) => {
  const listId = useId();
  const [query, setQuery] = useState(null); // null while not editing: the input shows `value`
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const open = query !== null && !disabled;
  const matches = useMemo(() => (open ? matchPrograms(query) : []), [open, query]);

  const choose = (program) => { onChange(program); setQuery(null); };
  const close = () => {
    if (query === null) return;
    const exact = OPTIONS.find((o) => o.program.toLowerCase() === query.trim().toLowerCase());
    if (exact) onChange(exact.program);
    else if (!query.trim()) onChange('');
    setQuery(null);
  };
  const move = (step) => {
    const next = (active + step + matches.length) % matches.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown') { setQuery(value || ''); setActive(0); } return; }
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active].program); }
    else if (e.key === 'Escape') { e.preventDefault(); setQuery(null); }
  };

  return (
    <div className="course-search">
      <input
        id={id}
        className={className}
        style={inputStyle}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={open && value ? value : placeholder}
        required={required}
        disabled={disabled}
        value={query ?? value ?? ''}
        onFocus={() => { setQuery(allowCustom ? (value || '') : ''); setActive(0); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (allowCustom) onChange(e.target.value); }}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <ul className="course-search-list" id={listId} role="listbox" ref={listRef}>
          {matches.map((o, i) => (
            <li
              key={o.program}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => { e.preventDefault(); choose(o.program); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="course-search-program">{o.program}</span>
              <span className="course-search-college">{o.college}</span>
            </li>
          ))}
        </ul>
      )}
      {open && matches.length === 0 && !allowCustom && (
        <div className="course-search-list course-search-empty" role="status">No program matches “{query}”.</div>
      )}
    </div>
  );
};

export default CourseSearch;

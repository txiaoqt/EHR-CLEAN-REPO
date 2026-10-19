import React, { useEffect, useId, useRef, useState } from 'react';

const displayQuantity = (quantity) => quantity === 0 ? '' : String(quantity);

export default function MedicineQuantityCell({ quantity, label, onCommit, onActivate, disabled = false }) {
  const id = useId();
  const [draft, setDraft] = useState(() => displayQuantity(quantity));
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const savedQuantity = useRef(quantity);
  const phaseRef = useRef('idle');
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (savedQuantity.current === quantity) return;
    savedQuantity.current = quantity;
    // A refresh/conflict may update the saved baseline, but must not erase a
    // quantity the staff member is editing or needs to retry.
    if (['idle', 'saved'].includes(phaseRef.current)) {
      setDraft(displayQuantity(quantity));
      phaseRef.current = 'idle';
      setPhase('idle');
    }
  }, [quantity]);

  const save = async () => {
    if (busy.current || disabled) return;
    const text = draft.trim();
    const next = text === '' ? 0 : Number(text);
    if (!/^\d*$/.test(text) || !Number.isSafeInteger(next) || next < 0 || next > 2147483647) {
      phaseRef.current = 'error';
      setPhase('error');
      setError('Enter a whole number of 0 or more, up to 2147483647.');
      return;
    }
    if (next === savedQuantity.current && phaseRef.current !== 'error') {
      setDraft(displayQuantity(next));
      phaseRef.current = 'idle';
      setPhase('idle');
      return;
    }
    busy.current = true;
    phaseRef.current = 'saving';
    setPhase('saving');
    setError('');
    try {
      const result = await onCommit(next, savedQuantity.current);
      if (!mounted.current) return;
      savedQuantity.current = result.quantity;
      setDraft(displayQuantity(result.quantity));
      phaseRef.current = 'saved';
      setPhase('saved');
    } catch (failure) {
      if (!mounted.current) return;
      phaseRef.current = 'error';
      setPhase('error');
      setError(failure.message || 'Could not confirm this save. Retry to check and save your quantity.');
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="medlog-quantity-editor" data-state={phase} onFocusCapture={onActivate}>
      <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft}
        className="medlog-cell-input" aria-label={label} aria-invalid={phase === 'error'}
        aria-describedby={id + '-status'} aria-busy={phase === 'saving'} disabled={disabled || phase === 'saving'}
        onChange={(event) => {
          setDraft(event.target.value);
          phaseRef.current = 'unsaved';
          setPhase('unsaved');
          setError('');
        }}
        onBlur={() => { void save(); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            // Blur owns the save, so Enter cannot submit it a second time.
            event.currentTarget.blur();
          }
        }} />
      <div className="medlog-status-row">
        <div id={id + '-status'} className="medlog-cell-status" role="status" aria-atomic="true">
          {['saving', 'saved'].includes(phase) && <span className="sr-only">{label}: </span>}
          {phase === 'saving' ? 'Saving…' : phase === 'saved' ? 'Saved' : phase === 'unsaved' ? 'Unsaved' : null}
          {phase === 'error' && <span className="sr-only">Not saved. {label}: {error}</span>}
        </div>
        {phase === 'error' && <button type="button" className="medlog-retry" title={error}
          aria-label={`Retry saving ${label}. ${error}`} disabled={disabled} onClick={() => { void save(); }}>Retry save</button>}
      </div>
      {phase === 'error' && <span className="medlog-cell-error" aria-hidden="true">{error}</span>}
    </div>
  );
}

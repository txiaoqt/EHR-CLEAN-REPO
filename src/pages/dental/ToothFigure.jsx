import React, { useId } from 'react';

// One tooth as line art, like the chart printed on the pink form: a single
// outline for crown and roots, plus the neck line, cusp ridges and root forks.
// Each is drawn for the upper orientation in a 40 x 80 box (root tips at the
// top, the neck at y=46, the biting edge at the bottom); the lower row is the
// same drawing flipped, so its crowns face up.
const NECK = 46;

const TEETH = {
  upper: {
    1: { outline: 'M20 4 C16 4 13 30 12 46 C10 54 7 66 8 76 Q20 78 32 76 C33 66 30 54 28 46 C27 30 24 4 20 4 Z',
      details: ['M12 46 Q20 51 28 46', 'M15 57 Q14 66 15 74', 'M25 57 Q26 66 25 74'] },
    2: { outline: 'M20 8 C16 8 14 32 13 46 C11 54 9 64 11 73 Q20 77 29 73 C31 64 29 54 27 46 C26 32 24 8 20 8 Z',
      details: ['M13 46 Q20 50 27 46', 'M16 58 Q15 66 16 72', 'M24 58 Q25 66 24 72'] },
    3: { outline: 'M20 1 C15 2 12 30 12 46 C9 52 7 60 9 65 L20 79 L31 65 C33 60 31 52 28 46 C28 30 25 2 20 1 Z',
      details: ['M12 46 Q20 51 28 46', 'M20 52 L20 76', 'M10 64 Q15 62 20 56 Q25 62 30 64'] },
    4: { outline: 'M12 12 C9 14 9 34 10 46 C6 52 5 62 9 68 L14 77 L20 70 L26 77 L31 68 C35 62 34 52 30 46 C31 34 31 14 28 12 C25 12 23 22 20 28 C17 22 15 12 12 12 Z',
      details: ['M10 46 Q20 51 30 46', 'M10 66 Q20 61 30 66', 'M20 28 L20 44'] },
    5: { outline: 'M20 8 C15 8 11 32 11 46 C6 52 6 64 10 70 Q15 77 20 72 Q25 77 30 70 C34 64 34 52 29 46 C29 32 25 8 20 8 Z',
      details: ['M11 46 Q20 51 29 46', 'M10 67 Q20 62 30 67', 'M20 12 L20 42'] },
    6: { outline: 'M6 10 C3 12 3 34 4 46 C0 52 0 62 3 68 Q6 77 11 72 Q15 78 20 72 Q25 78 29 72 Q34 77 37 68 C40 62 40 52 36 46 C37 34 37 12 34 10 C31 10 29 22 27 30 C26 18 23 4 20 4 C17 4 14 18 13 30 C11 22 9 10 6 10 Z',
      details: ['M4 46 Q20 52 36 46', 'M3 66 Q20 60 37 66', 'M20 62 L20 72', 'M13 30 Q20 36 27 30'] },
    7: { outline: 'M8 12 C5 14 5 34 6 46 C2 52 2 62 5 68 Q9 77 14 72 Q20 78 26 72 Q31 77 35 68 C38 62 38 52 34 46 C35 34 35 14 32 12 C29 12 27 24 25 32 C24 20 22 8 20 8 C18 8 16 20 15 32 C13 24 11 12 8 12 Z',
      details: ['M6 46 Q20 52 34 46', 'M5 66 Q20 60 35 66', 'M20 62 L20 72'] },
    8: { outline: 'M20 16 C13 16 9 34 8 46 C4 52 4 62 7 68 Q13 76 20 72 Q27 76 33 68 C36 62 36 52 32 46 C31 34 27 16 20 16 Z',
      details: ['M8 46 Q20 51 32 46', 'M7 66 Q20 61 33 66', 'M18 20 Q17 32 18 44'] },
  },
  lower: {
    1: { outline: 'M20 5 C17 5 16 30 15 46 C13 56 12 66 13 75 Q20 77 27 75 C28 66 27 56 25 46 C24 30 23 5 20 5 Z',
      details: ['M15 46 Q20 50 25 46', 'M20 56 L20 73'] },
    2: { outline: 'M20 4 C17 4 15 30 14 46 C12 56 11 66 12 75 Q20 77 28 75 C29 66 28 56 26 46 C25 30 23 4 20 4 Z',
      details: ['M14 46 Q20 50 26 46', 'M20 56 L20 73'] },
    3: { outline: 'M20 2 C16 3 13 30 13 46 C10 52 8 60 10 65 L20 79 L30 65 C32 60 30 52 27 46 C27 30 24 3 20 2 Z',
      details: ['M13 46 Q20 51 27 46', 'M20 52 L20 76'] },
    4: { outline: 'M20 6 C16 6 13 32 12 46 C7 52 7 62 10 68 L20 78 L30 68 C33 62 33 52 28 46 C27 32 24 6 20 6 Z',
      details: ['M12 46 Q20 51 28 46', 'M11 65 Q20 61 29 65'] },
    5: { outline: 'M20 6 C15 6 12 32 11 46 C6 52 6 64 10 70 Q15 77 20 72 Q25 77 30 70 C34 64 34 52 29 46 C28 32 25 6 20 6 Z',
      details: ['M11 46 Q20 51 29 46', 'M10 67 Q20 62 30 67'] },
    6: { outline: 'M7 9 C3 11 4 34 4 46 C0 52 0 62 3 68 Q6 77 11 72 Q15 78 20 72 Q25 78 29 72 Q34 77 37 68 C40 62 40 52 36 46 C36 34 37 11 33 9 C29 9 24 22 20 32 C16 22 11 9 7 9 Z',
      details: ['M4 46 Q20 52 36 46', 'M3 66 Q20 60 37 66', 'M14 62 L14 72', 'M26 62 L26 72'] },
    7: { outline: 'M9 11 C5 13 6 34 6 46 C2 52 2 62 5 68 Q9 77 14 72 Q20 78 26 72 Q31 77 35 68 C38 62 38 52 34 46 C34 34 35 13 31 11 C27 11 23 24 20 32 C17 24 13 11 9 11 Z',
      details: ['M6 46 Q20 52 34 46', 'M5 66 Q20 60 35 66', 'M20 62 L20 72'] },
    8: { outline: 'M22 17 C14 17 10 34 8 46 C4 52 4 62 7 68 Q13 76 20 72 Q27 76 33 68 C36 62 36 52 32 46 C31 34 29 17 22 17 Z',
      details: ['M8 46 Q20 51 32 46', 'M7 66 Q20 61 33 66'] },
  },
};

const ToothFigure = ({ tooth, jaw, condition }) => {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shape = TEETH[jaw][tooth % 10];
  return (
    <svg viewBox="0 0 40 80" className={`tooth-figure${condition ? ` tooth-figure--${condition}` : ''}`} focusable="false">
      <g transform={jaw === 'lower' ? 'translate(0 80) scale(1 -1)' : undefined}>
        {/* The one outline, split at the neck so a mark can colour the crown or the roots. */}
        <defs>
          <clipPath id={`${id}r`}><rect x="-2" y="-2" width="44" height={NECK + 2} /></clipPath>
          <clipPath id={`${id}c`}><rect x="-2" y={NECK} width="44" height={82 - NECK} /></clipPath>
        </defs>
        <path className="tooth-figure-root" d={shape.outline} clipPath={`url(#${id}r)`} />
        <path className="tooth-figure-crown" d={shape.outline} clipPath={`url(#${id}c)`} />
        {shape.details.map((d) => <path key={d} className="tooth-figure-detail" d={d} />)}
        {condition === 'decay' && <circle className="tooth-figure-decay-spot" cx="20" cy="62" r="4" />}
      </g>
      {['extract', 'extracted', 'for-extraction'].includes(condition) && (
        <g className="tooth-figure-x"><line x1="7" y1="14" x2="33" y2="66" /><line x1="33" y1="14" x2="7" y2="66" /></g>
      )}
    </svg>
  );
};

export default ToothFigure;

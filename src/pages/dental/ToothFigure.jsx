import React from 'react';

// One tooth, drawn with its crown toward the bite and roots away from it, so
// the upper row hangs down and the lower row stands up, as on the pink form.
// Shapes are drawn for an upper tooth (roots at the top) in a 40 x 80 box.
const SHAPES = {
  incisor: {
    crown: 'M12 44 L28 44 L30 73 Q20 78 10 73 Z',
    roots: ['M13 44 Q15 9 20 4 Q25 9 27 44 Z'],
  },
  canine: {
    crown: 'M11 44 L29 44 L28 64 L20 78 L12 64 Z',
    roots: ['M13 44 Q16 3 20 1 Q24 3 27 44 Z'],
  },
  premolar: {
    crown: 'M8 44 L32 44 Q34 62 30 72 Q25 77 20 73 Q15 77 10 72 Q6 62 8 44 Z',
    roots: ['M12 44 Q15 11 20 7 Q25 11 28 44 Z'],
  },
  molar: {
    crown: 'M3 42 L37 42 Q39 60 36 72 Q30 77 25 73 Q20 77 15 73 Q10 77 4 72 Q1 60 3 42 Z',
    roots: ['M6 42 Q6 15 11 8 Q14 20 16 42 Z', 'M16 42 Q18 17 20 11 Q22 17 24 42 Z', 'M24 42 Q26 20 29 8 Q34 15 34 42 Z'],
  },
};

const kindOf = (tooth) => {
  const position = tooth % 10;
  if (position <= 2) return 'incisor';
  if (position === 3) return 'canine';
  if (position <= 5) return 'premolar';
  return 'molar';
};

const ToothFigure = ({ tooth, jaw, condition }) => {
  const shape = SHAPES[kindOf(tooth)];
  return (
    <svg viewBox="0 0 40 80" className={`tooth-figure${condition ? ` tooth-figure--${condition}` : ''}`} focusable="false">
      <g transform={jaw === 'lower' ? 'translate(0 80) scale(1 -1)' : undefined}>
        {shape.roots.map((d) => <path key={d} className="tooth-figure-root" d={d} />)}
        <path className="tooth-figure-crown" d={shape.crown} />
        {condition === 'decay' && <circle className="tooth-figure-decay-spot" cx="20" cy="60" r="4.5" />}
      </g>
      {['extract', 'extracted', 'for-extraction'].includes(condition) && (
        <g className="tooth-figure-x"><line x1="7" y1="14" x2="33" y2="66" /><line x1="33" y1="14" x2="7" y2="66" /></g>
      )}
    </svg>
  );
};

export default ToothFigure;

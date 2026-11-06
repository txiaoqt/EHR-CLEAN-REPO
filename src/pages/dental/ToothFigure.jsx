import React from 'react';

// One tooth, drawn with its crown toward the bite and roots away from it, so
// the upper row hangs down and the lower row stands up, as on the pink form.
// Every position has its own outline (an upper first molar has three roots, a
// lower one two), drawn for the upper orientation in a 40 x 80 box: roots at
// the top, the neck at y=44, the biting edge at the bottom.
// A root keeps its width most of the way up, then tapers to a rounded tip.
const root = (x1, x2, apexX, apexY) => {
  const shoulder = 44 - (44 - apexY) * 0.55;
  return `M${x1} 44 C${x1} ${shoulder} ${apexX - 3} ${apexY + 2} ${apexX} ${apexY} C${apexX + 3} ${apexY + 2} ${x2} ${shoulder} ${x2} 44 Z`;
};

// Crowns narrow at the neck and swell toward the biting edge, as real ones do.
const CROWNS = {
  centralIncisor: 'M11 44 L29 44 C34 50 34 64 33 74 Q20 77 7 74 C6 64 6 50 11 44 Z',
  lateralIncisor: 'M13 44 L27 44 C31 50 31 62 29 72 Q20 76 11 72 C9 62 9 50 13 44 Z',
  lowerIncisor: 'M14 44 L26 44 C30 52 30 64 29 74 Q20 76 11 74 C10 64 10 52 14 44 Z',
  canine: 'M12 44 L28 44 C33 50 33 58 29 66 L20 78 L11 66 C7 58 7 50 12 44 Z',
  firstPremolar: 'M11 44 L29 44 C35 50 35 60 31 68 L26 76 L20 70 L14 76 L9 68 C5 60 5 50 11 44 Z',
  secondPremolar: 'M11 44 L29 44 C35 50 35 62 30 70 Q25 77 20 72 Q15 77 10 70 C5 62 5 50 11 44 Z',
  firstMolar: 'M6 44 L34 44 C40 48 40 60 37 68 Q34 77 29 72 Q25 78 20 72 Q15 78 11 72 Q6 77 3 68 C0 60 0 48 6 44 Z',
  secondMolar: 'M7 44 L33 44 C39 48 39 60 36 68 Q31 77 26 72 Q20 77 14 72 Q9 77 4 68 C1 60 1 48 7 44 Z',
  thirdMolar: 'M9 44 L31 44 C37 49 37 60 34 68 Q27 76 20 72 Q13 76 6 68 C3 60 3 49 9 44 Z',
};

// FDI position (the tooth number's last digit) to its drawing, per jaw.
const SHAPES = {
  upper: {
    1: { crown: CROWNS.centralIncisor, roots: [root(13, 27, 20, 4)] },
    2: { crown: CROWNS.lateralIncisor, roots: [root(14, 26, 20, 8)] },
    3: { crown: CROWNS.canine, roots: [root(13, 27, 20, 1)] },
    4: { crown: CROWNS.firstPremolar, roots: [root(9, 19, 12, 11), root(21, 31, 28, 11)] },
    5: { crown: CROWNS.secondPremolar, roots: [root(11, 29, 20, 8)] },
    6: { crown: CROWNS.firstMolar, roots: [root(4, 15, 5, 9), root(15, 25, 20, 5), root(25, 36, 35, 9)] },
    7: { crown: CROWNS.secondMolar, roots: [root(5, 16, 8, 11), root(14, 26, 20, 8), root(24, 35, 32, 11)] },
    8: { crown: CROWNS.thirdMolar, roots: [root(8, 32, 20, 15)] },
  },
  lower: {
    1: { crown: CROWNS.lowerIncisor, roots: [root(14, 26, 20, 6)] },
    2: { crown: CROWNS.lowerIncisor, roots: [root(13, 27, 20, 5)] },
    3: { crown: CROWNS.canine, roots: [root(13, 27, 20, 2)] },
    4: { crown: CROWNS.secondPremolar, roots: [root(12, 28, 20, 5)] },
    5: { crown: CROWNS.secondPremolar, roots: [root(11, 29, 20, 6)] },
    6: { crown: CROWNS.firstMolar, roots: [root(4, 18, 6, 9), root(22, 36, 34, 9)] },
    7: { crown: CROWNS.secondMolar, roots: [root(6, 19, 10, 11), root(21, 34, 30, 11)] },
    8: { crown: CROWNS.thirdMolar, roots: [root(8, 32, 22, 17)] },
  },
};

const ToothFigure = ({ tooth, jaw, condition }) => {
  const shape = SHAPES[jaw][tooth % 10];
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

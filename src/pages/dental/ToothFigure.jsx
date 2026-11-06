import React from 'react';

// The teeth are cut from the clinic's reference chart by scripts/cut_dental_teeth.py,
// one transparent image per FDI number with the crown toward the bite. A mark tints
// the tooth itself: the image doubles as the mask, so colour never spills outside it.
const IMAGES = import.meta.glob('./teeth/*.webp', { eager: true, import: 'default' });

// Earlier chart marks still shown on records saved with them.
const LOOK = { caries: 'decay', filled: 'lcf', extracted: 'extract', 'for-extraction': 'extract' };

const ToothFigure = ({ tooth, jaw, condition }) => {
  const src = IMAGES[`./teeth/${tooth}.webp`];
  const look = LOOK[condition] || condition;
  return (
    <span className={`tooth-photo tooth-photo--${jaw}${look ? ` tooth-photo--${look}` : ''}`} style={{ '--tooth': `url("${src}")` }}>
      <img src={src} alt="" draggable={false} />
      {look && <><span className="tooth-photo-layer tooth-photo-fade" /><span className="tooth-photo-layer tooth-photo-tint" /></>}
      {look === 'decay' && <span className="tooth-photo-spot" />}
      {look === 'extract' && (
        <svg className="tooth-photo-x" viewBox="0 0 40 80" preserveAspectRatio="none" focusable="false">
          <line x1="6" y1="10" x2="34" y2="70" /><line x1="34" y1="10" x2="6" y2="70" />
        </svg>
      )}
    </span>
  );
};

export default ToothFigure;

import React, { useState } from 'react';
import { TOOTH_ROWS, TOOTH_CONDITIONS, conditionOf } from './dentalShared.js';

/**
 * The pink form's tooth grid. Editable: pick a condition, then click teeth to mark
 * them (clicking a tooth already marked with it clears it). Read-only without onChange.
 */
const ToothChart = ({ value = {}, onChange, marked = [], label = 'Dental chart' }) => {
  const [brush, setBrush] = useState(TOOTH_CONDITIONS[0].value);
  const editable = typeof onChange === 'function';

  const paint = (tooth) => {
    const next = { ...value };
    if (next[tooth] === brush) delete next[tooth];
    else next[tooth] = brush;
    onChange(next);
  };

  const renderRow = (teeth, side) => (
    <div className={`dental-chart-row dental-chart-row--${side}`}>
      {teeth.map((tooth) => {
        const condition = conditionOf(value[tooth]);
        const name = `Tooth ${tooth}${condition ? `, ${condition.label}` : ''}`;
        const className = `dental-tooth${condition ? ` dental-tooth--${condition.value}` : ''}${marked.includes(String(tooth)) ? ' dental-tooth--marked' : ''}`;
        return editable ? (
          <button key={tooth} type="button" className={className} onClick={() => paint(tooth)} aria-label={name} aria-pressed={Boolean(condition)}>
            <span className="dental-tooth-number">{tooth}</span>
            <span className="dental-tooth-code" aria-hidden="true">{condition?.code || ''}</span>
          </button>
        ) : (
          <div key={tooth} className={className} role="img" aria-label={name}>
            <span className="dental-tooth-number">{tooth}</span>
            <span className="dental-tooth-code" aria-hidden="true">{condition?.code || ''}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="dental-chart" role="group" aria-label={label}>
      {editable && (
        <div className="dental-chart-brushes" role="radiogroup" aria-label="Condition to mark">
          {TOOTH_CONDITIONS.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={brush === c.value}
              className={`dental-brush dental-tooth--${c.value}${brush === c.value ? ' is-active' : ''}`}
              onClick={() => setBrush(c.value)}>
              <span className="dental-brush-code" aria-hidden="true">{c.code}</span>{c.label}
            </button>
          ))}
        </div>
      )}
      <div className="dental-chart-arch">
        <div className="dental-chart-quadrant-labels"><span>Upper Right</span><span>Upper Left</span></div>
        <div className="dental-chart-jaw">{renderRow(TOOTH_ROWS.upper[0], 'right')}{renderRow(TOOTH_ROWS.upper[1], 'left')}</div>
        <div className="dental-chart-jaw dental-chart-jaw--lower">{renderRow(TOOTH_ROWS.lower[0], 'right')}{renderRow(TOOTH_ROWS.lower[1], 'left')}</div>
        <div className="dental-chart-quadrant-labels"><span>Lower Right</span><span>Lower Left</span></div>
      </div>
      {!editable && Object.keys(value).length === 0 && <p className="dental-muted">No conditions charted.</p>}
      {editable && <p className="dental-muted">Choose a condition, then click each tooth. Click a tooth again to clear it.</p>}
    </div>
  );
};

export default ToothChart;

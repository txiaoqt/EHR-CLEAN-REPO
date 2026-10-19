import React from 'react';

/**
 * The placeholder shown when a list has nothing in it.
 *
 * The shape follows lydorg's PortalEmptyState: a title, a sentence saying what
 * will appear here and when, and an optional action. Two things it does that a
 * bare "No records yet." does not:
 *
 *  - It distinguishes "nothing exists" from "nothing matched your search". Those
 *    need different words and different offers — one is a state to explain, the
 *    other is a mistake to undo.
 *  - The dashed border marks the area as a placeholder rather than a card that
 *    failed to load.
 *
 * Styling uses this app's own tokens so it sits in the existing design language
 * rather than importing lydorg's Tailwind classes.
 */
const EmptyState = ({ icon: Icon = null, title, description, action = null, compact = false }) => (
  <div className={`empty-state${compact ? ' empty-state-compact' : ''}`} role="status">
    {Icon && (
      <span className="empty-state-icon" aria-hidden="true">
        <Icon size={compact ? 20 : 26} />
      </span>
    )}
    <p className="empty-state-title">{title}</p>
    {description && <p className="empty-state-desc">{description}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

export default EmptyState;

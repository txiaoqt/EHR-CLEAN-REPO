import React, { useEffect, useRef, useState } from 'react';

/** A small, deliberately un-clinical set — enough warmth without a full picker. */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * Emoji reactions under a message.
 *
 * Reactions are tapped repeatedly, so there is no entrance animation — only a
 * press state, which is the feedback that matters. The picker is always
 * reachable (not hover-only) because this thread is used on tablets too.
 */
const MessageReactions = ({ reactions = [], currentUserId, onToggle, disabled = false, align = 'left' }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // Group by emoji so the row reads "👍 2  ❤️ 1" rather than one chip per tap.
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, mine: false, names: [] };
    acc[r.emoji].count += 1;
    if (r.reactor_auth_user_id === currentUserId) acc[r.emoji].mine = true;
    if (r.reactor_name) acc[r.emoji].names.push(r.reactor_name);
    return acc;
  }, {});

  const chips = Object.values(grouped);

  return (
    <div
      ref={wrapRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        marginTop: 6,
        position: 'relative',
        // Sit under the message on the side it was sent from.
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        maxWidth: '100%',
      }}
    >
      {chips.map((chip) => (
        <button
          key={chip.emoji}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(chip.emoji)}
          aria-pressed={chip.mine}
          title={chip.names.length ? `${chip.names.join(', ')} reacted` : 'React'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 999,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.6,
            background: chip.mine ? 'var(--color-primary-tint)' : 'var(--surface-raised)',
            border: `1px solid ${chip.mine ? 'var(--color-primary)' : 'var(--border)'}`,
            color: 'var(--text)',
          }}
        >
          <span aria-hidden="true">{chip.emoji}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--font-weight-semibold)' }}>{chip.count}</span>
        </button>
      ))}

      {!disabled && (
        <>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Add a reaction"
            aria-expanded={pickerOpen}
            title="Add a reaction"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 22,
              borderRadius: 999,
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 'var(--font-size-xs)',
              lineHeight: 1,
            }}
          >
            +
          </button>

          {pickerOpen && (
            <div
              role="menu"
              aria-label="Choose a reaction"
              style={{
                position: 'absolute',
                bottom: '100%',
                // Anchored to the side the message sits on, so the picker stays
                // inside the chat area instead of overflowing it.
                ...(align === 'right' ? { right: 0 } : { left: 0 }),
                marginBottom: 4,
                zIndex: 20,
                display: 'flex',
                gap: 2,
                padding: 4,
                borderRadius: 12,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggle(emoji);
                    setPickerOpen(false);
                  }}
                  aria-label={`React with ${emoji}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-md)',
                    lineHeight: 1,
                    padding: '4px 6px',
                    borderRadius: 8,
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MessageReactions;

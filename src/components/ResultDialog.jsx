import React, { useEffect, useRef } from 'react';
import { CloseIcon, CheckIcon, AlertIcon, ClockIcon } from './icons/Icons.jsx';

const TONES = {
  success: { accent: 'var(--success, #10b981)', Icon: CheckIcon },
  error: { accent: 'var(--danger)', Icon: AlertIcon },
  info: { accent: 'var(--color-primary)', Icon: ClockIcon },
};

/**
 * A result dialog: what just happened, and what to do next.
 *
 * Replaces window.alert() — which cannot be styled, cannot carry a link to the
 * record, and blocks the page. Flat surfaces and tokens only, no gradients or
 * shadows on anything at rest; a dialog genuinely floats, so it keeps its
 * shadow.
 *
 * Focus moves to the primary action on open, Escape closes, and the entrance
 * scales from 0.95 rather than 0 — nothing in the real world appears from
 * nothing.
 */
const ResultDialog = ({ open, tone = 'info', title, message, details, actions = [], onClose }) => {
  const primaryRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    primaryRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { accent, Icon } = TONES[tone] || TONES.info;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: 'min(94vw, 460px)',
          background: 'var(--panel)',
          color: 'var(--text)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          padding: 24,
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {Icon && (
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-raised)',
                border: `1px solid ${accent}`,
                color: accent,
              }}
            >
              <Icon size={17} />
            </span>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1.3 }}>
              {title}
            </h3>
            {message && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {message}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="modal-close-btn"
            style={{ flexShrink: 0 }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {details?.length > 0 && (
          <div
            style={{
              marginTop: 16,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {details.map((line) => (
              <div key={line} style={{ display: 'flex', gap: 8, fontSize: 'var(--font-size-xs)', color: 'var(--text)' }}>
                <span style={{ color: 'var(--text-light)' }}>•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          {actions.map((action, index) => (
            <button
              key={action.label}
              ref={index === 0 ? primaryRef : undefined}
              type="button"
              className={action.variant === 'secondary' ? 'btn secondary' : 'btn'}
              onClick={action.onClick}
              style={action.variant === 'primaryTone' ? { background: accent, borderColor: accent } : undefined}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResultDialog;

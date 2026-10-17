import React from 'react';

/**
 * A stored signature, on a light surface.
 *
 * The ink is dark (#111827) and the PNG is transparent — a CSS background is
 * not captured by toDataURL — so on a dark panel the strokes are invisible.
 * Every signature therefore sits on its own light backing, in both themes.
 *
 * The transparency is deliberate and worth keeping: the exported PDF draws the
 * same PNG onto a white page, so a baked-in background would print as a grey box.
 */
const SignatureImage = ({ url, alt = 'Signature', height = 26, maxWidth = 110, caption }) => {
  if (!url) return null;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '2px 8px',
          lineHeight: 0,
        }}
      >
        <img
          src={url}
          alt={alt}
          style={{ height, maxWidth, objectFit: 'contain', display: 'block' }}
        />
      </span>
      {caption && (
        <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>{caption}</span>
      )}
    </div>
  );
};

export default SignatureImage;

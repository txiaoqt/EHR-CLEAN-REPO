import React, { useEffect, useState } from 'react';
import { signedMessageAttachmentUrl, RESOLVED_PHOTO_NOTICE } from '../utils/messageAttachments.js';

/**
 * Renders a message's photo attachment.
 *
 * The bucket is private, so the image is read through a short-lived signed URL
 * fetched on mount. Once the conversation is resolved the file is gone and the
 * row carries `removedAt` — in that case the thread says so plainly rather than
 * showing a broken image.
 */
const MessageAttachment = ({ path, name, removedAt, compact = false }) => {
  const [url, setUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | missing

  useEffect(() => {
    if (removedAt || !path) return undefined;
    let cancelled = false;

    setStatus('loading');
    signedMessageAttachmentUrl(path).then((signed) => {
      if (cancelled) return;
      if (signed) {
        setUrl(signed);
        setStatus('ready');
      } else {
        setStatus('missing');
      }
    });

    return () => { cancelled = true; };
  }, [path, removedAt]);

  if (removedAt) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'var(--surface-raised)',
          border: '1px dashed var(--border)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
        }}
      >
        <span aria-hidden="true">🗑</span>
        <span>{RESOLVED_PHOTO_NOTICE}</span>
      </div>
    );
  }

  if (!path) return null;

  if (status === 'missing') {
    return (
      <div style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
        This photo is no longer available.
      </div>
    );
  }

  const size = compact ? 140 : 220;

  return (
    <div style={{ marginTop: 8 }}>
      {status === 'ready' ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open full size"
          style={{ display: 'inline-block', lineHeight: 0 }}
        >
          <img
            src={url}
            alt={name ? `Attachment: ${name}` : 'Message photo'}
            style={{
              maxWidth: size,
              maxHeight: size,
              objectFit: 'cover',
              borderRadius: 10,
              border: '1px solid var(--border)',
              cursor: 'zoom-in',
              display: 'block',
            }}
          />
        </a>
      ) : (
        <div
          aria-live="polite"
          style={{
            width: size,
            height: size * 0.6,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface-raised)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
          }}
        >
          Loading photo…
        </div>
      )}
      {name && (
        <div style={{ marginTop: 4, fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>
          {name}
        </div>
      )}
    </div>
  );
};

export default MessageAttachment;

import React, { useEffect, useRef, useState } from 'react';

/**
 * Signature capture on a canvas.
 *
 * Draws with pointer events (mouse, pen and touch in one path) and captures the
 * pointer on the first stroke, so a signature that leaves the pad keeps drawing
 * instead of stopping mid-line. `touch-action: none` stops the page scrolling
 * underneath a finger.
 *
 * Exposes the PNG through `onChange(dataUrl)`; the parent stores it.
 */
const SignaturePad = ({ onChange, label = 'Signature', disabled = false, height = 130 }) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [hasInk, setHasInk] = useState(false);

  // Size the bitmap to the element's real pixels so strokes are not blurry on a
  // HiDPI screen, then scale the context back to CSS pixels for drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const pointFrom = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    lastRef.current = pointFrom(event);
  };

  const move = (event) => {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const next = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastRef.current = next;
    if (!hasInk) setHasInk(true);
  };

  const end = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current.releasePointerCapture?.(event.pointerId);
    onChange?.(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
          {label}
        </span>
        <button
          type="button"
          className="btn secondary small"
          onClick={clear}
          disabled={disabled || !hasInk}
          style={{ fontSize: 'var(--font-size-2xs)', padding: '2px 8px' }}
        >
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        aria-label={label}
        style={{
          width: '100%',
          height,
          display: 'block',
          // The ink is dark, so the pad must be a light surface in BOTH themes —
          // on the dark panel the strokes were invisible while signing. A CSS
          // background is not captured by toDataURL, so the stored PNG stays
          // transparent and the exported PDF still prints it on a white page.
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: 10,
          touchAction: 'none',
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      />

      <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>
        Sign with a mouse, stylus or finger. The signed name and timestamp are recorded alongside it.
      </p>
    </div>
  );
};

export default SignaturePad;

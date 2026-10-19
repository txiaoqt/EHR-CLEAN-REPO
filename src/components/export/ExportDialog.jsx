import React, { useEffect, useState } from 'react';
import { CloseIcon, ChevronDownIcon } from '../icons/Icons.jsx';
import { PAPER_SIZES } from '../../utils/export/engine.js';

const FORMATS = [
  {
    id: 'csv',
    title: 'CSV',
    description: 'Opens in Excel or Google Sheets. Best for analysis and mail-merge.',
  },
  {
    id: 'pdf',
    title: 'PDF',
    description: 'Selectable, searchable text on a printable page. Best for filing and sign-off.',
  },
];

/**
 * Format picker for a table export. PDF page setup only appears when PDF is
 * selected, so the CSV path stays one click.
 */
const ExportDialog = ({ open, config, rowCount = 0, itemLabel = 'rows', busy = false, onClose, onExport }) => {
  const [format, setFormat] = useState('csv');
  const [paperSize, setPaperSize] = useState('a4');
  const [orientation, setOrientation] = useState('landscape');

  useEffect(() => {
    if (!open) return;
    setFormat('csv');
    setPaperSize(config?.paperSize ?? 'a4');
    setOrientation(config?.orientation ?? 'landscape');
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !config) return null;

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
        padding: 20,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Export ${config.title}`}
        style={{
          width: 520,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--panel)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)' }}>
              Export {config.title}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
              {rowCount.toLocaleString()} {itemLabel} will be included.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close export dialog">
            <CloseIcon size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {FORMATS.map((option) => {
            const selected = format === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormat(option.id)}
                aria-pressed={selected}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: selected ? 'var(--color-primary-tint)' : 'var(--surface-raised)',
                  border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                }}
              >
                <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)' }}>
                  {option.title}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {option.description}
                </div>
              </button>
            );
          })}
        </div>

        {format === 'pdf' && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              PDF page setup
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 6 }}>
                  Paper size
                </span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <select
                    className="input"
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                    style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                  >
                    {PAPER_SIZES.map((size) => (
                      <option key={size.id} value={size.id}>
                        {size.label} — {size.dimensions}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--text-muted)' }} />
                </div>
              </label>

              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 6 }}>
                  Orientation
                </span>
                {config.lockOrientation ? (
                  <div
                    className="input"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                      cursor: 'not-allowed',
                    }}
                    title="This report is only ever printed landscape"
                  >
                    Landscape only
                  </div>
                ) : (
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <select
                      className="input"
                      value={orientation}
                      onChange={(e) => setOrientation(e.target.value)}
                      style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                    >
                      <option value="landscape">Landscape</option>
                      <option value="portrait">Portrait</option>
                    </select>
                    <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--text-muted)' }} />
                  </div>
                )}
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || rowCount === 0}
            onClick={() => onExport({ format, pageConfig: { paperSize, orientation } })}
          >
            {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 'var(--font-size-2xs)', color: 'var(--text-muted)' }}>
          {format === 'pdf' && config.pdfReadOnly
            ? 'The PDF includes the visits matching your selected filters.'
            : 'This export is recorded in the audit trail with your name, the format and the row count.'}
        </p>
      </div>
    </div>
  );
};

export default ExportDialog;

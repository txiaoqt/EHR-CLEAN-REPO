// src/components/PCAccessRequired.jsx
import React from 'react';
import { DesktopIcon } from './icons/Icons.jsx';
import tupehrlogo from '../assets/images/tupehrlogo.jpg';

const PCAccessRequired = ({ onLogout }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          padding: '32px 28px',
          boxShadow: 'var(--shadow-md)',
          textAlign: 'center',
          boxSizing: 'border-box'
        }}
      >
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
          <img
            src={tupehrlogo}
            alt="TUP Clinic Logo"
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              objectFit: 'cover',
              border: '1px solid var(--border-subtle)'
            }}
          />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              TUP CLINIC
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Staff Portal
            </div>
          </div>
        </div>

        {/* Restrained Outline Device Icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--grey-100)',
            color: 'var(--color-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            border: '1px solid var(--border-subtle)'
          }}
        >
          <DesktopIcon size={24} />
        </div>

        {/* Access Warning Title */}
        <h1
          style={{
            margin: '0 0 14px',
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text)',
            letterSpacing: '-0.02em'
          }}
        >
          PC Access Required
        </h1>

        {/* User-Facing Copy */}
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 14.5,
            lineHeight: 1.55,
            color: 'var(--text)',
            fontWeight: 500
          }}
        >
          This Staff Portal is designed for desktop and laptop computers.
        </p>

        <p
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--text)'
          }}
        >
          Please use a PC or laptop to access the Staff Portal.
        </p>

        <p
          style={{
            margin: '0 0 4px',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--text-muted)'
          }}
        >
          Staff Portal access is unavailable on phones and tablets.
        </p>

        {/* Actions */}
        {onLogout && (
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={onLogout}
              style={{
                width: '100%',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 13.5,
                padding: '9px 16px'
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PCAccessRequired;

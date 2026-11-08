import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export const IDLE_LIMIT_MS = 15 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;
const ACTIVITY_KEY = 'tup-last-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

// Shared across this portal's tabs, so working in one tab keeps the others signed in.
const readActivity = () => {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; }
};
const writeActivity = (time) => {
  try { localStorage.setItem(ACTIVITY_KEY, String(time)); } catch { /* private mode: this tab still counts */ }
};

export const idleState = (lastActivity, now) => {
  const idle = now - lastActivity;
  if (idle >= IDLE_LIMIT_MS) return 'expired';
  if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) return 'warning';
  return 'active';
};

// Signs the user out of this browser after 15 minutes without input, warning a minute before.
export default function IdleLogout() {
  const { isAuthenticated, isPasswordRecoverySession, logout } = useAuth();
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastActivity = useRef(Date.now());
  const dialogRef = useRef(null);
  const enabled = isAuthenticated && !isPasswordRecoverySession;

  useEffect(() => {
    if (!enabled) { setSecondsLeft(null); return undefined; }
    let signingOut = false;
    const now = Date.now();
    lastActivity.current = now;
    writeActivity(now);

    const markActive = () => {
      const time = Date.now();
      // Throttled: scroll and wheel fire constantly.
      if (time - lastActivity.current < 5000) return;
      lastActivity.current = time;
      writeActivity(time);
    };
    const check = async () => {
      const last = Math.max(lastActivity.current, readActivity());
      lastActivity.current = last;
      const time = Date.now();
      const state = idleState(last, time);
      if (state === 'expired' && !signingOut) {
        signingOut = true;
        setSecondsLeft(null);
        await logout({ scope: 'local' });
        navigate('/login', { replace: true, state: { sessionMessage: 'You were signed out after 15 minutes of inactivity.' } });
        return;
      }
      setSecondsLeft(state === 'warning' ? Math.max(0, Math.ceil((last + IDLE_LIMIT_MS - time) / 1000)) : null);
    };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true, capture: true }));
    // A laptop waking from sleep or a tab coming back is checked at once.
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive, { capture: true }));
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [enabled, logout, navigate]);

  const warning = secondsLeft !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (warning && !dialog.open) dialog.showModal();
    if (!warning && dialog.open) dialog.close();
  }, [warning]);

  const stay = () => {
    const time = Date.now();
    lastActivity.current = time;
    writeActivity(time);
    setSecondsLeft(null);
  };

  if (!enabled) return null;
  return (
    <dialog
      ref={dialogRef}
      className="idle-logout-dialog"
      aria-labelledby="idle-logout-title"
      aria-describedby="idle-logout-description"
      onCancel={(event) => { event.preventDefault(); stay(); }}
    >
      <h2 id="idle-logout-title">Are you still there?</h2>
      <p id="idle-logout-description" aria-live="polite">
        You will be signed out in {secondsLeft ?? 0} second{secondsLeft === 1 ? '' : 's'} because there has been no activity for a while.
      </p>
      <div className="idle-logout-actions">
        <button type="button" className="btn" onClick={stay} autoFocus>Stay signed in</button>
      </div>
    </dialog>
  );
}

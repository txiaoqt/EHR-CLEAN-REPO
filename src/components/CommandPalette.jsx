import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon, CloseIcon } from './icons/Icons.jsx';
import { NAV_GROUPS } from './sidebar/Sidebar.jsx';
import { translate } from '../utils';
import { useAuth } from '../AuthContext.jsx';
import { canOpenStaffPage } from '../staffPageAccess.mjs';

/**
 * Search pages, opened with Ctrl+K or Cmd+K.
 *
 * Modelled on the reference admin's palette, but built here rather than pulling
 * in a command-menu dependency for one list: the interaction is a filtered list
 * with arrow keys, Enter and Escape.
 *
 * Staff pages come from NAV_GROUPS, including its role gates and translated
 * labels. Other portals can supply their own sidebar destinations.
 */
const CommandPalette = ({ open, onOpenChange, pages: customPages, label = 'Search pages' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dialogRef = useRef(null);

  const role = (user?.role || '').toLowerCase();

  const pages = useMemo(() => {
    if (customPages) return customPages;
    const items = [];
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        // Respect the same role gate the sidebar uses, or the palette would
        // offer a page the sidebar hides.
        if (item.roles && !item.roles.includes(role)) continue;
        if (!canOpenStaffPage(user, item.page)) continue;
        items.push({
          page: item.page,
          icon: item.icon,
          group: group.label,
          label: translate(item.label) || item.label,
        });
      }
    }
    return items;
  }, [role, user?.page_access, customPages]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) => `${p.label} ${p.group} ${p.keywords || ''}`.toLowerCase().includes(q)
    );
  }, [pages, query]);

  // Reset the query and the cursor each time it opens, so it never reopens on a
  // stale filter the user has forgotten about.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const previousFocus = document.activeElement;
      // Focus after paint, or the input is not in the DOM yet.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => {
        cancelAnimationFrame(id);
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          previousFocus.focus({ preventScroll: true });
        }
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Ctrl/Cmd+K toggles from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.max(0, Math.min(i + 1, matches.length - 1)));
        inputRef.current?.focus({ preventScroll: true });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        inputRef.current?.focus({ preventScroll: true });
      } else if (e.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll('input, button:not(:disabled)');
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      } else if (e.key === 'Enter' && e.target === inputRef.current) {
        e.preventDefault();
        const choice = matches[active];
        if (choice) {
          navigate(`/${choice.page}`);
          onOpenChange(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, matches, active, navigate, onOpenChange]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="palette-backdrop"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-input-row">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder={`${label}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={label}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={matches[active] ? `palette-item-${matches[active].page}` : undefined}
          />
          <span className="palette-kbd">ESC</span>
        </div>

        <div className="palette-list" id="palette-results" role="listbox" ref={listRef}>
          {matches.length === 0 ? (
            <div className="palette-empty">No matching pages.</div>
          ) : (
            matches.map((p, index) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.page}
                  id={`palette-item-${p.page}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  className="palette-item"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onClick={() => {
                    navigate(`/${p.page}`);
                    onOpenChange(false);
                  }}
                >
                  <Icon size={16} />
                  <span className="palette-item-label">{p.label}</span>
                  <span className="palette-item-group">{p.group}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

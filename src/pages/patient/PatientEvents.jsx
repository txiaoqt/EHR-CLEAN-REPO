// src/pages/patient/PatientEvents.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import {
  ChevronDownIcon,
  CalendarIcon,
  ClockIcon,
  LocationIcon,
} from '../../components/icons/Icons.jsx';

const CATEGORY_OPTIONS = [
  'All Categories',
  'Blood Drive',
  'Vaccination',
  'Health Seminar',
  'Medical Mission',
  'General',
];

const GoogleCalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="3" stroke="#4285F4" strokeWidth="2" fill="none" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="#4285F4" strokeWidth="2" />
    <line x1="8" y1="2" x2="8" y2="5" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="2" x2="16" y2="5" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
    <circle cx="8" cy="14" r="1.5" fill="#4285F4" />
    <circle cx="12" cy="14" r="1.5" fill="#FBBC05" />
    <circle cx="16" cy="14" r="1.5" fill="#34A853" />
    <circle cx="8" cy="18" r="1.5" fill="#EA4335" />
    <circle cx="12" cy="18" r="1.5" fill="#4285F4" />
    <circle cx="16" cy="18" r="1.5" fill="#FBBC05" />
  </svg>
);

const DownloadCalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const parseEventDate = (dateStr) => {
  if (!dateStr) return { month: 'TBA', day: '--', full: '' };
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, monthIdx, day);
      const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const dayNum = String(day);
      const full = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      return { month, day: dayNum, full };
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const day = String(d.getDate());
      const full = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      return { month, day, full };
    }
  } catch {
    // fallback
  }
  return { month: 'TBA', day: '--', full: dateStr };
};

const formatTimeStr = (timeStr) => {
  if (!timeStr) return '';
  try {
    const parts = String(timeStr).split(':');
    if (parts.length >= 2) {
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
  } catch {
    // fallback
  }
  return timeStr;
};

const formatEventTimes = (startTime, endTime) => {
  const start = formatTimeStr(startTime);
  const end = formatTimeStr(endTime);
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return end;
  return null;
};

const getGoogleCalendarUrl = (ev) => {
  const title = ev.title || 'TUP Clinic Event';
  const desc = ev.description || '';
  const loc = ev.location || 'TUP Manila Clinic';
  const dateStr = (ev.event_date || '').replace(/-/g, '');
  const startTime = (ev.start_time || '09:00:00').replace(/:/g, '').slice(0, 6);
  const endTime = (ev.end_time || '16:00:00').replace(/:/g, '').slice(0, 6);
  const dates = `${dateStr}T${startTime}/${dateStr}T${endTime}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: desc,
    location: loc,
    dates: dates,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const PatientEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All Categories');
  const [activeCalendarMenu, setActiveCalendarMenu] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchPublishedEvents = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('status', 'published')
          .eq('is_published', true)
          .order('event_date', { ascending: true });

        if (!error && mounted) {
          setEvents(data || []);
        }
      } catch (err) {
        console.warn('Fetch patient events error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchPublishedEvents();
    return () => { mounted = false; };
  }, []);

  // Click-outside and Escape key listener for calendar popover dismissal
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.patient-event-calendar-wrapper')) {
        setActiveCalendarMenu(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveCalendarMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const availableCategories = useMemo(() => {
    const distinct = Array.from(
      new Set(events.map((ev) => ev.category && ev.category.trim()).filter(Boolean))
    );
    return ['All Categories', ...distinct];
  }, [events]);

  useEffect(() => {
    if (activeCategory !== 'All Categories' && !availableCategories.includes(activeCategory)) {
      setActiveCategory('All Categories');
    }
  }, [availableCategories, activeCategory]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchesCat =
        activeCategory === 'All Categories' ||
        activeCategory === 'All' ||
        ev.category === activeCategory;
      return matchesCat;
    });
  }, [events, activeCategory]);

  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case 'Blood Drive':
        return 'badge-danger patient-badge-blood';
      case 'Vaccination':
        return 'badge-info patient-badge-vaccine';
      case 'Health Seminar':
        return 'badge-primary patient-badge-seminar';
      case 'Medical Mission':
        return 'badge-success patient-badge-mission';
      default:
        return 'badge-neutral patient-badge-general';
    }
  };

  const downloadIcs = (ev) => {
    const title = ev.title || 'TUP Clinic Event';
    const desc = ev.description || '';
    const loc = ev.location || 'TUP Manila Clinic';
    const dateStr = (ev.event_date || '').replace(/-/g, '');
    const startTime = (ev.start_time || '09:00:00').replace(/:/g, '').slice(0, 6);
    const endTime = (ev.end_time || '16:00:00').replace(/:/g, '').slice(0, 6);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TUP Manila Clinic//EHR Events//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc.replace(/\n/g, '\\n')}`,
      `LOCATION:${loc}`,
      `DTSTART:${dateStr}T${startTime}`,
      `DTEND:${dateStr}T${endTime}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="main">
      <section className="page patient-events-page" style={{ width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>Events</h2>
          <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
            Stay informed about clinic activities, health missions, and university medical announcements.
          </div>
        </div>

        {/* Streamlined Category Filter Pills Strip (Dynamically Derived from Existing Events) */}
        <div className="patient-events-pills-strip" role="tablist" aria-label="Event categories">
          {availableCategories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`patient-event-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            );
          })}
        </div>


        {/* Events Grid / Loading Skeleton / Empty State */}
        {loading ? (
          <div className="patient-events-grid" aria-busy="true" aria-label="Loading events">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className="card patient-event-card patient-event-skeleton-card">
                <div className="patient-event-card-top">
                  <div className="patient-event-skeleton-date" />
                  <div className="patient-event-header-info">
                    <div className="patient-event-skeleton-pill" />
                    <div className="patient-event-skeleton-title" />
                  </div>
                </div>
                <div className="patient-event-skeleton-block" />
                <div className="patient-event-skeleton-line" />
                <div className="patient-event-skeleton-line short" />
                <div className="patient-event-skeleton-btn" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="card patient-events-empty-card">
            <div className="patient-events-empty-icon-wrapper">
              <CalendarIcon size={24} />
            </div>
            <div className="patient-events-empty-title">No events found</div>
            <div className="patient-events-empty-desc">
              {activeCategory !== 'All Categories'
                ? `There are currently no published events in the "${activeCategory}" category.`
                : 'There are currently no published clinic events or announcements.'}
            </div>
            {activeCategory !== 'All Categories' && (
              <button
                type="button"
                className="btn secondary patient-events-reset-btn"
                onClick={() => setActiveCategory('All Categories')}
              >
                View all events
              </button>
            )}
          </div>
        ) : (
          <div className="patient-events-grid">
            {filteredEvents.map((ev) => {
              const dateInfo = parseEventDate(ev.event_date);
              const timeFormatted = formatEventTimes(ev.start_time, ev.end_time);

              return (
                <div key={ev.id} className="card patient-event-card">
                  <div>
                    <div className="patient-event-card-top">
                      {/* Visual Calendar Date Badge */}
                      <div className="patient-event-date-block" aria-label={`Date: ${dateInfo.full}`}>
                        <span className="patient-event-date-month">{dateInfo.month}</span>
                        <span className="patient-event-date-day">{dateInfo.day}</span>
                      </div>

                      {/* Header info: Category badge & org tag */}
                      <div className="patient-event-header-info">
                        <div className="patient-event-badge-row">
                          <span className={`badge ${getCategoryBadgeClass(ev.category)}`}>
                            {ev.category || 'General'}
                          </span>
                          <span className="patient-event-org-label">
                            TUP Manila Clinic
                          </span>
                        </div>
                        <h3 className="patient-event-title">
                          {ev.title}
                        </h3>
                      </div>
                    </div>

                    {/* Clean Meta: Time & Location */}
                    <div className="patient-event-meta-card">
                      <div className="patient-event-meta-item">
                        <ClockIcon size={14} className="patient-event-meta-icon" />
                        <span className="patient-event-meta-text">
                          {timeFormatted ? timeFormatted : (ev.event_date ? dateInfo.full : 'Schedule TBA')}
                        </span>
                      </div>
                      {ev.location && (
                        <div className="patient-event-meta-item">
                          <LocationIcon size={14} className="patient-event-meta-icon" />
                          <span className="patient-event-meta-text">{ev.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Event Description */}
                    {ev.description && (
                      <p className="patient-event-description">
                        {ev.description}
                      </p>
                    )}
                  </div>

                  {/* Elevate "Add to Calendar" UX: Popover with Google Calendar & Apple/Outlook (.ics) */}
                  <div className="patient-event-card-action">
                    <div className="patient-event-calendar-wrapper">
                      <button
                        type="button"
                        className="btn secondary patient-event-calendar-btn"
                        onClick={() => setActiveCalendarMenu(activeCalendarMenu === ev.id ? null : ev.id)}
                        aria-expanded={activeCalendarMenu === ev.id}
                        aria-haspopup="true"
                      >
                        <CalendarIcon size={15} style={{ marginRight: 6 }} />
                        Add to Calendar
                        <ChevronDownIcon
                          size={13}
                          className={`patient-calendar-chevron ${activeCalendarMenu === ev.id ? 'open' : ''}`}
                          style={{ marginLeft: 6 }}
                        />
                      </button>

                      {activeCalendarMenu === ev.id && (
                        <div className="patient-calendar-popover" role="menu">
                          <a
                            href={getGoogleCalendarUrl(ev)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="patient-calendar-popover-item"
                            role="menuitem"
                            onClick={() => setActiveCalendarMenu(null)}
                          >
                            <span className="patient-calendar-popover-icon google">
                              <GoogleCalendarIcon />
                            </span>
                            <div className="patient-calendar-popover-text">
                              <span className="patient-calendar-popover-title">Google Calendar</span>
                              <span className="patient-calendar-popover-sub">Opens web calendar in new tab</span>
                            </div>
                          </a>

                          <button
                            type="button"
                            className="patient-calendar-popover-item"
                            role="menuitem"
                            onClick={() => {
                              downloadIcs(ev);
                              setActiveCalendarMenu(null);
                            }}
                          >
                            <span className="patient-calendar-popover-icon ics">
                              <DownloadCalendarIcon />
                            </span>
                            <div className="patient-calendar-popover-text">
                              <span className="patient-calendar-popover-title">Apple / Outlook (.ics)</span>
                              <span className="patient-calendar-popover-sub">Download file for device calendar</span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientEvents;



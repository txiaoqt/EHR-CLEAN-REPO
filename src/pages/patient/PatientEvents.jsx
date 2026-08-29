// src/pages/patient/PatientEvents.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { SearchIcon, ChevronDownIcon } from '../../components/icons/Icons.jsx';

const CATEGORY_OPTIONS = [
  'All Categories',
  'Blood Drive',
  'Vaccination',
  'Health Seminar',
  'Medical Mission',
  'General',
];

const PatientEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All Categories');
  const [search, setSearch] = useState('');

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

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchesCat =
        activeCategory === 'All Categories' ||
        activeCategory === 'All' ||
        ev.category === activeCategory;
      const matchesSearch =
        !search ||
        ev.title?.toLowerCase().includes(search.toLowerCase()) ||
        ev.location?.toLowerCase().includes(search.toLowerCase()) ||
        ev.description?.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [events, activeCategory, search]);

  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case 'Blood Drive':
        return 'badge-danger';
      case 'Vaccination':
        return 'badge-info';
      case 'Health Seminar':
        return 'badge-primary';
      case 'Medical Mission':
        return 'badge-success';
      default:
        return 'badge-neutral';
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
        <div className="page-header" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>Events</h2>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
            Stay informed about clinic activities, health missions, and university medical announcements.
          </div>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div className="card patient-events-filter-bar" style={{ padding: 14, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 10 }}>
          <div className="patient-events-filter-controls" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="patient-events-search-wrapper" style={{ position: 'relative', flex: '1 1 280px', minWidth: 0 }}>
              <input
                className="input"
                style={{ width: '100%', paddingLeft: 38, height: 40, borderRadius: 10 }}
                placeholder="Search announcements by title, location, or keyword..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search announcements"
              />
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <SearchIcon size={16} />
              </span>
            </div>

            <div className="patient-events-select-wrapper">
              <select
                className="patient-events-filter-select"
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                aria-label="Filter events by category"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <span className="patient-events-filter-chevron">
                <ChevronDownIcon size={13} />
              </span>
            </div>
          </div>
        </div>

        {/* Events Grid */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', borderRadius: 10 }}>
            Loading clinic announcements...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>No events found</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, maxWidth: 400, margin: '4px auto 0' }}>
              No events match your current search or category filter.
            </div>
          </div>
        ) : (
          <div className="patient-events-grid">
            {filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className="card patient-event-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 20,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  boxSizing: 'border-box',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span className={`badge ${getCategoryBadgeClass(ev.category)}`} style={{ fontWeight: 700 }}>
                      {ev.category || 'General'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                      TUP Manila Clinic
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 12px 0', fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
                    {ev.title}
                  </h3>

                  <div style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                      Date: {ev.event_date}
                      {(ev.start_time || ev.end_time) && (
                        <span style={{ color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>
                          ({ev.start_time || ''} {ev.end_time ? `– ${ev.end_time}` : ''})
                        </span>
                      )}
                    </div>
                    {ev.location && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Location: {ev.location}
                      </div>
                    )}
                  </div>

                  {ev.description && (
                    <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                      {ev.description}
                    </div>
                  )}
                </div>

                {/* Single Primary Action: Add to Calendar */}
                <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => downloadIcs(ev)}
                  >
                    Add to Calendar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientEvents;

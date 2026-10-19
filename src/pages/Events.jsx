// src/pages/Events.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { ChevronDownIcon, CalendarIcon, CheckIcon, ClockIcon, HistoryIcon, SearchIcon } from '../components/icons/Icons.jsx';
import KpiCard from '../components/KpiCard.jsx';
import TablePagination from '../components/table/TablePagination.jsx';
import { useTablePagination } from '../hooks/useTablePagination.js';
import { emailEnabled } from '../utils.js';

const CATEGORIES = ['All', 'Blood Drive', 'Vaccination', 'Health Seminar', 'Medical Mission', 'General'];
const STATUSES = ['All', 'published', 'draft', 'cancelled', 'archived'];

const Events = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [form, setForm] = useState({
    title: '',
    category: 'General',
    event_date: '',
    start_time: '',
    end_time: '',
    location: '',
    description: '',
    status: 'published',
    is_published: true,
  });
  const [saving, setSaving] = useState(false);

  // Email blast modal states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailEvent, setEmailEvent] = useState(null);
  const [studentCount, setStudentCount] = useState(0);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState(new Set());
  const [recipientYearFilter, setRecipientYearFilter] = useState('all');
  const [recipientBloodTypeFilter, setRecipientBloodTypeFilter] = useState('all');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [showFullRecipientModal, setShowFullRecipientModal] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Delete / Archive confirmation modal
  const [deleteEvent, setDeleteEvent] = useState(null);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false });

      if (error) {
        console.warn('Load events error:', error);
      } else {
        setEvents(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchesSearch =
        !searchQuery ||
        ev.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = categoryFilter === 'All' || ev.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || ev.status === statusFilter;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [events, searchQuery, categoryFilter, statusFilter]);

  const eventPagination = useTablePagination(filteredEvents, {
    resetKey: `${searchQuery}|${categoryFilter}|${statusFilter}`,
  });

  // KPI calculations
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const total = events.length;
    const published = events.filter((e) => e.status === 'published' && e.is_published).length;
    const upcoming = events.filter((e) => e.event_date >= today && e.status !== 'cancelled').length;
    const drafts = events.filter((e) => e.status === 'draft' || !e.is_published).length;
    return { total, published, upcoming, drafts };
  }, [events]);

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedEvent(null);
    setForm({
      title: '',
      category: 'General',
      event_date: new Date().toISOString().slice(0, 10),
      start_time: '09:00',
      end_time: '16:00',
      location: 'University Clinic Room 102',
      description: '',
      status: 'published',
      is_published: true,
    });
    setShowModal(true);
  };

  const openEditModal = (ev) => {
    setModalMode('edit');
    setSelectedEvent(ev);
    setForm({
      title: ev.title || '',
      category: ev.category || 'General',
      event_date: ev.event_date || '',
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      location: ev.location || '',
      description: ev.description || '',
      status: ev.status || 'published',
      is_published: Boolean(ev.is_published),
    });
    setShowModal(true);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.event_date) return;

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        event_date: form.event_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        status: form.status,
        is_published: form.status === 'published',
        updated_at: new Date().toISOString(),
      };

      if (modalMode === 'create') {
        const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;
        payload.created_by = authUid;
        const { error } = await supabase.from('events').insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').update(payload).eq('id', selectedEvent.id);
        if (error) throw error;
      }

      setShowModal(false);
      await loadEvents();
    } catch (err) {
      console.error('Save event error:', err);
      alert(`Unable to save event: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEvent) return;
    try {
      const { error } = await supabase.from('events').delete().eq('id', deleteEvent.id);
      if (error) throw error;
      setDeleteEvent(null);
      await loadEvents();
    } catch (err) {
      console.error('Delete event error:', err);
      alert(`Error deleting event: ${err.message}`);
    }
  };

  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // 1. Year filter
      const matchesYear =
        recipientYearFilter === 'all' || String(r.year) === String(recipientYearFilter);

      // 2. Blood Type filter
      let matchesBloodType = true;
      if (recipientBloodTypeFilter !== 'all') {
        if (recipientBloodTypeFilter === 'unspecified') {
          matchesBloodType = !r.blood_type;
        } else {
          matchesBloodType =
            (r.blood_type || '').toUpperCase() === recipientBloodTypeFilter.toUpperCase();
        }
      }

      // 3. Search filter
      const q = recipientSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.student_id.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q);

      return matchesYear && matchesBloodType && matchesSearch;
    });
  }, [recipients, recipientYearFilter, recipientBloodTypeFilter, recipientSearch]);

  const visibleSelectedCount = useMemo(() => {
    return filteredRecipients.filter((r) => selectedRecipientIds.has(r.id)).length;
  }, [filteredRecipients, selectedRecipientIds]);

  const isAllVisibleSelected =
    filteredRecipients.length > 0 && visibleSelectedCount === filteredRecipients.length;

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedRecipientIds);
    if (isAllVisibleSelected) {
      filteredRecipients.forEach((r) => next.delete(r.id));
    } else {
      filteredRecipients.forEach((r) => next.add(r.id));
    }
    setSelectedRecipientIds(next);
  };

  const toggleRecipient = (id) => {
    const next = new Set(selectedRecipientIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRecipientIds(next);
  };

  const openEmailBlastModal = async (ev) => {
    setEmailEvent(ev);
    setEmailResult(null);
    setSendingEmail(false);
    setRecipientYearFilter('all');
    setRecipientBloodTypeFilter('all');
    setRecipientSearch('');
    setShowFullRecipientModal(false);
    setShowEmailModal(true);
    setLoadingRecipients(true);

    try {
      // 1. Query registered active patient users
      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select('id, name, student_id, email, patient_id, auth_user_id')
        .eq('role', 'patient')
        .eq('active', true)
        .not('email', 'is', null);

      if (usersErr) throw usersErr;

      // 2. Query authoritative patient_profiles for blood_type and year
      const { data: profilesData } = await supabase
        .from('patient_profiles')
        .select('user_id, student_id, email, blood_type, year');

      // 3. Query students table for year fallback
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, year');

      const yearMap = new Map((studentsData || []).map((s) => [s.id, s.year]));

      const profileByUserMap = new Map();
      const profileByStudentMap = new Map();
      const profileByEmailMap = new Map();

      (profilesData || []).forEach((p) => {
        if (p.user_id) profileByUserMap.set(p.user_id, p);
        if (p.student_id) profileByStudentMap.set(p.student_id.trim().toUpperCase(), p);
        if (p.email) profileByEmailMap.set(p.email.trim().toLowerCase(), p);
      });

      const eligible = (usersData || [])
        .filter((u) => u.email && u.email.trim().toLowerCase().endsWith('@tup.edu.ph'))
        .map((u) => {
          const emailKey = u.email.trim().toLowerCase();
          const studentKey = (u.student_id || '').trim().toUpperCase();
          const profile =
            (u.auth_user_id && profileByUserMap.get(u.auth_user_id)) ||
            (studentKey && profileByStudentMap.get(studentKey)) ||
            profileByEmailMap.get(emailKey);

          return {
            id: u.id,
            name: u.name || 'Student',
            student_id: u.student_id || 'N/A',
            email: emailKey,
            year: profile?.year || yearMap.get(u.student_id) || 1,
            blood_type: profile?.blood_type?.trim() || null,
          };
        });

      setRecipients(eligible);
      setSelectedRecipientIds(new Set(eligible.map((r) => r.id)));
      setStudentCount(eligible.length);
    } catch (err) {
      console.error('Failed to load eligible recipients:', err);
      setRecipients([]);
      setSelectedRecipientIds(new Set());
      setStudentCount(0);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const executeEmailBlast = async () => {
    if (!emailEvent || selectedRecipientIds.size === 0) return;
    setSendingEmail(true);
    setEmailResult(null);

    try {
      // Settings → Notifications can disable blasts. Checked here, at the only
      // place a blast is sent, rather than leaving the toggle decorative.
      if (!emailEnabled('blast')) {
        setEmailResult({ ok: false, message: 'Email blasts are turned off in Settings.' });
        return;
      }
      const selectedIdsArray = Array.from(selectedRecipientIds);
      const { data, error } = await supabase.functions.invoke('send-event-announcement', {
        body: {
          event_id: emailEvent.id,
          selected_user_ids: selectedIdsArray,
        },
      });

      if (error) {
        let msg = error.message || 'Failed to dispatch email announcement.';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errBody = await error.context.json();
            if (errBody?.error) msg = errBody.error;
          }
        } catch (_) {}
        setEmailResult({ error: msg });
        return;
      }

      if (!data) {
        setEmailResult({ error: 'No response received from email announcement service.' });
        return;
      }

      if (data.error && !data.success && !data.partial) {
        setEmailResult({ error: data.error });
        return;
      }

      setEmailResult(data);
    } catch (err) {
      console.error('Email blast error:', err);
      setEmailResult({ error: err.message || 'Dispatch failed' });
    } finally {
      setSendingEmail(false);
    }
  };

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

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'published':
        return 'badge-success';
      case 'draft':
        return 'badge-warning';
      case 'cancelled':
        return 'badge-danger';
      case 'archived':
        return 'badge-neutral';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <main className="main">
      <section className="page events-page">
        {/* Header */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)' }}>Clinic Events & Announcements</h1>
            <p className="page-header-subtitle" style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-base)', color: 'var(--muted)' }}>
              Schedule university health drives, medical missions, and notify registered students.
            </p>
          </div>
          <div className="page-header-actions">
            <button className="btn primary" onClick={openCreateModal}>
              + Create Event
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="events-kpi-grid">
          {[
            { title: 'Total Events', value: stats.total, description: 'Events in the clinic calendar', Icon: CalendarIcon },
            { title: 'Published Events', value: stats.published, description: 'Visible to registered students', Icon: CheckIcon },
            { title: 'Upcoming Events', value: stats.upcoming, description: 'Scheduled and not cancelled', Icon: ClockIcon },
            { title: 'Drafts & Inactive', value: stats.drafts, description: 'Draft or unpublished events', Icon: HistoryIcon },
          ].map((kpi) => (
            <KpiCard
              key={kpi.title}
              title={kpi.title}
              value={kpi.value}
              description={kpi.description}
              Icon={kpi.Icon}
            />
          ))}
        </div>

        {/* Events table and its controls share one continuous workspace. */}
        <div className="card table-section-card events-table-card">
          <div className="table-section-header">
            <div>
              <h2 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Clinic events</h2>
              <span className="card-subtitle">Schedule, publish, and manage university health activities.</span>
            </div>
          </div>

          <div className="table-section-toolbar events-table-toolbar">
            <label className="events-search-wrapper">
              <SearchIcon size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search by title, location, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search events"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', fontWeight: 'var(--font-weight-semibold)' }}>Category:</span>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDownIcon size={13} style={{ position: 'absolute', right: 12, pointerEvents: 'none', color: 'var(--muted)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', fontWeight: 'var(--font-weight-semibold)' }}>Status:</span>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
                <ChevronDownIcon size={13} style={{ position: 'absolute', right: 12, pointerEvents: 'none', color: 'var(--muted)' }} />
              </div>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Event Title & Details</th>
                  <th>Category</th>
                  <th>Date & Schedule</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                      Loading events...
                    </td>
                  </tr>
                ) : filteredEvents.length === 0 ? (
                  <tr className="table-empty-row">
                    <td colSpan={6}>{events.length === 0 ? 'No events yet' : 'No matching events'}</td>
                  </tr>
                ) : (
                  eventPagination.pageRows.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', fontSize: 'var(--font-size-base)' }}>{ev.title}</div>
                        {ev.description && (
                          <div style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', marginTop: 4, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getCategoryBadgeClass(ev.category)}`} style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                          {ev.category || 'General'}
                        </span>
                      </td>
                      <td style={{ fontSize: 'var(--font-size-base)' }}>
                        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{ev.event_date}</div>
                        {(ev.start_time || ev.end_time) && (
                          <div style={{ color: 'var(--muted)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                            {ev.start_time || ''} {ev.end_time ? `– ${ev.end_time}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 'var(--font-size-base)', color: 'var(--muted)' }}>
                        {ev.location || '—'}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(ev.status)}`} style={{ fontWeight: 'var(--font-weight-semibold)', textTransform: 'capitalize' }}>
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {ev.status === 'published' && (
                            <button
                              type="button"
                              className="btn small secondary"
                              title="Email Registered Students"
                              onClick={() => openEmailBlastModal(ev)}
                            >
                              Email Blast
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() => openEditModal(ev)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn small danger"
                            onClick={() => setDeleteEvent(ev)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={eventPagination.page}
            totalPages={eventPagination.totalPages}
            startIndex={eventPagination.startIndex}
            endIndex={eventPagination.endIndex}
            total={eventPagination.total}
            onPageChange={eventPagination.goToPage}
            itemLabel="events"
            showWhenEmpty={!loading}
          />
        </div>

        {/* Create / Edit Modal */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3000,
              padding: 16,
            }}
            onClick={() => setShowModal(false)}
          >
            <div
              style={{
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                width: 'min(92vw, 600px)',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: 24,
                boxShadow: 'var(--shadow-lg)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' }}>
                {modalMode === 'create' ? 'Create New Event' : 'Edit Event'}
              </h3>
              <form onSubmit={handleSaveEvent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                    Event Title *
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Annual Blood Donation Drive 2026"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                      Category
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <select
                        className="input"
                        style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                        value={form.category}
                        onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      >
                        {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--muted)' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                      Event Date *
                    </label>
                    <input
                      type="date"
                      className="input"
                      style={{ width: '100%' }}
                      value={form.event_date}
                      onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="time"
                      className="input"
                      style={{ width: '100%' }}
                      value={form.start_time}
                      onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                      End Time
                    </label>
                    <input
                      type="time"
                      className="input"
                      style={{ width: '100%' }}
                      value={form.end_time}
                      onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                    Location
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. TUP Main Gymnasium or Clinic Room 102"
                    value={form.location}
                    onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                    Description & Instructions
                  </label>
                  <textarea
                    className="input"
                    style={{ width: '100%', minHeight: 90 }}
                    placeholder="Provide details about registration, requirements, reminders..."
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: 4 }}>
                    Publication Status
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <select
                      className="input"
                      style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value, is_published: e.target.value === 'published' }))}
                    >
                      <option value="published">Published (Visible on Patient Portal)</option>
                      <option value="draft">Draft (Staff View Only)</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="archived">Archived</option>
                    </select>
                    <ChevronDownIcon size={13} style={{ position: 'absolute', right: 14, pointerEvents: 'none', color: 'var(--muted)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button type="button" className="btn secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn primary" disabled={saving}>
                    {saving ? 'Saving...' : modalMode === 'create' ? 'Create Event' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Email Blast Modal */}
        {showEmailModal && emailEvent && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3100,
              padding: 16,
            }}
            onClick={() => setShowEmailModal(false)}
          >
            <div
              style={{
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                width: 'min(740px, calc(100vw - 32px))',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px 28px 24px',
                boxShadow: 'var(--shadow-lg)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                Email Registered Students
              </h3>
              <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--text)', marginBottom: 18, lineHeight: 1.5 }}>
                You are about to dispatch an email announcement for:
                <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)', marginTop: 4, color: 'var(--text)' }}>
                  {emailEvent.title}
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 2 }}>
                  Scheduled: {emailEvent.event_date} {emailEvent.start_time ? `at ${emailEvent.start_time}` : ''} ({emailEvent.location || 'TUP Clinic'})
                </div>
              </div>

              {/* Recipient Audience Section */}
              <div style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', fontWeight: 'var(--font-weight-semibold)' }}>Recipient Audience</div>
                    <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)', marginTop: 2 }}>
                      Eligible: {recipients.length} &bull; Selected: {selectedRecipientIds.size}
                    </div>
                  </div>
                  {recipients.length > 0 && (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: 'var(--font-size-xs)', padding: '5px 12px', height: 'auto', borderRadius: 6 }}
                      onClick={() => setShowFullRecipientModal(true)}
                    >
                      View All ({recipients.length})
                    </button>
                  )}
                </div>

                {/* Filter Controls: Searchbar FIRST, Year Filter SECOND, Blood Type Filter THIRD */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by name, ID, or email..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    style={{
                      flex: '1 1 220px',
                      minWidth: '180px',
                      height: '40px',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--panel, #ffffff)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text)',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ position: 'relative', width: '130px', flex: '0 0 130px', minWidth: '120px', height: '40px' }}>
                    <select
                      value={recipientYearFilter}
                      onChange={(e) => setRecipientYearFilter(e.target.value)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--text)',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        display: 'block',
                      }}
                    >
                      <option value="all">All Years</option>
                      <option value="1">Year 1</option>
                      <option value="2">Year 2</option>
                      <option value="3">Year 3</option>
                      <option value="4">Year 4</option>
                      <option value="5">Year 5</option>
                      <option value="6">Year 6</option>
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted, #64748b)',
                        lineHeight: 0,
                      }}
                    >
                      <ChevronDownIcon size={14} />
                    </span>
                  </div>

                  <div style={{ position: 'relative', width: '150px', flex: '0 0 150px', minWidth: '130px', height: '40px' }}>
                    <select
                      value={recipientBloodTypeFilter}
                      onChange={(e) => setRecipientBloodTypeFilter(e.target.value)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--text)',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        display: 'block',
                      }}
                    >
                      <option value="all">All Blood Types</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="unspecified">Not Specified</option>
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted, #64748b)',
                        lineHeight: 0,
                      }}
                    >
                      <ChevronDownIcon size={14} />
                    </span>
                  </div>
                </div>

                {/* Select All Toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(0,0,0,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    marginBottom: 10,
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={filteredRecipients.length === 0}
                    />
                    <span>Select All Visible</span>
                  </label>
                  <span style={{ color: 'var(--muted)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-xs)' }}>
                    {visibleSelectedCount} of {filteredRecipients.length} visible selected
                  </span>
                </div>

                {/* Recipient Preview List */}
                {loadingRecipients ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                    Loading eligible recipients...
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                    No registered students match the selected filters.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                    {filteredRecipients.slice(0, 5).map((r) => {
                      const isSelected = selectedRecipientIds.has(r.id);
                      return (
                        <div
                          key={r.id}
                          onClick={() => toggleRecipient(r.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: isSelected ? 'rgba(139, 0, 0, 0.04)' : 'var(--panel, #ffffff)',
                            border: `1px solid ${isSelected ? 'rgba(139, 0, 0, 0.3)' : 'var(--border)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-base)', color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {r.name}
                              </span>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                {r.blood_type && (
                                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-text, #fda4af)', padding: '2px 8px', background: 'var(--color-rose-bg, rgba(153, 27, 27, 0.08))', border: '1px solid var(--border)', borderRadius: 6 }}>
                                    {r.blood_type}
                                  </span>
                                )}
                                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--muted)', padding: '2px 8px', background: 'var(--surface-raised)', borderRadius: 6 }}>
                                  Year {r.year}
                                </span>
                              </div>
                            </div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span>{r.student_id}</span>
                              <span>&bull;</span>
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.email}</span>
                              <span>&bull;</span>
                              <span style={{ color: r.blood_type ? 'var(--color-primary-text, #fda4af)' : 'var(--muted)', fontWeight: r.blood_type ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)' }}>
                                Blood Type: {r.blood_type || 'Not specified'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredRecipients.length > 5 && (
                      <div style={{ textAlign: 'center', paddingTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setShowFullRecipientModal(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary-text, #fda4af)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-semibold)',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Showing 5 of {filteredRecipients.length} matching students. Click to View All &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Email Result Feedback */}
              {emailResult && (
                <div
                  style={{
                    background: emailResult.error
                      ? 'rgba(239, 68, 68, 0.1)'
                      : emailResult.partial
                      ? 'rgba(234, 179, 8, 0.1)'
                      : 'rgba(34, 197, 94, 0.1)',
                    border: `1px solid ${
                      emailResult.error
                        ? 'var(--danger, #dc2626)'
                        : emailResult.partial
                        ? 'var(--color-amber, #eab308)'
                        : 'var(--success, #16a34a)'
                    }`,
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 18,
                  }}
                >
                  {emailResult.error ? (
                    <div style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--font-size-base)' }}>
                      <strong>Email Announcement Failed:</strong> {emailResult.error}
                    </div>
                  ) : emailResult.partial ? (
                    <div>
                      <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-amber-text, #b45309)', fontSize: 'var(--font-size-base)' }}>
                        Announcement Partially Sent
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4, color: 'var(--text)' }}>
                        <strong>{emailResult.success_count}</strong> of <strong>{emailResult.recipient_count}</strong> emails were sent successfully. (<strong>{emailResult.failed_count}</strong> failed)
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--success, #16a34a)', fontSize: 'var(--font-size-md)' }}>
                        Email sent successfully
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4, color: 'var(--text)' }}>
                        {emailResult.success_count === 1
                          ? 'Email sent successfully to 1 selected recipient.'
                          : `Email sent successfully to all ${emailResult.success_count} selected recipients.`}
                      </div>
                    </div>
                  )}
                  {emailResult.warning && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)', color: 'var(--color-amber-text, #b45309)', fontSize: 'var(--font-size-xs)', lineHeight: 1.4 }}>
                      <strong>Notice:</strong> {emailResult.warning}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={sendingEmail}
                  onClick={() => setShowEmailModal(false)}
                >
                  {emailResult ? 'Close' : 'Cancel'}
                </button>
                {!emailResult && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={sendingEmail || selectedRecipientIds.size === 0}
                    onClick={executeEmailBlast}
                  >
                    {sendingEmail
                      ? 'Email sending...'
                      : `Send to ${selectedRecipientIds.size} Selected Student${selectedRecipientIds.size === 1 ? '' : 's'}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View All Recipients Selection Modal */}
        {showFullRecipientModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3300,
              padding: 16,
            }}
            onClick={() => setShowFullRecipientModal(false)}
          >
            <div
              style={{
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                width: 'min(760px, calc(100vw - 32px))',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                    Select Recipients ({selectedRecipientIds.size} of {recipients.length} Selected)
                  </h3>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                    onClick={() => setShowFullRecipientModal(false)}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 4 }}>
                  Filter and select students eligible to receive this clinic announcement.
                </div>

                {/* Filter and Search Bar: Searchbar FIRST, Year Filter SECOND, Blood Type Filter THIRD */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by name, student ID, or email..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    style={{
                      flex: '1 1 220px',
                      minWidth: '180px',
                      height: '40px',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--panel, #ffffff)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text)',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ position: 'relative', width: '130px', flex: '0 0 130px', minWidth: '120px', height: '40px' }}>
                    <select
                      value={recipientYearFilter}
                      onChange={(e) => setRecipientYearFilter(e.target.value)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--text)',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        display: 'block',
                      }}
                    >
                      <option value="all">All Years</option>
                      <option value="1">Year 1</option>
                      <option value="2">Year 2</option>
                      <option value="3">Year 3</option>
                      <option value="4">Year 4</option>
                      <option value="5">Year 5</option>
                      <option value="6">Year 6</option>
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted, #64748b)',
                        lineHeight: 0,
                      }}
                    >
                      <ChevronDownIcon size={14} />
                    </span>
                  </div>

                  <div style={{ position: 'relative', width: '150px', flex: '0 0 150px', minWidth: '130px', height: '40px' }}>
                    <select
                      value={recipientBloodTypeFilter}
                      onChange={(e) => setRecipientBloodTypeFilter(e.target.value)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--text)',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        display: 'block',
                      }}
                    >
                      <option value="all">All Blood Types</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="unspecified">Not Specified</option>
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted, #64748b)',
                        lineHeight: 0,
                      }}
                    >
                      <ChevronDownIcon size={14} />
                    </span>
                  </div>
                </div>

                {/* Select All Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg, #f8fafc)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    marginTop: 10,
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={filteredRecipients.length === 0}
                    />
                    <span>Select All Visible Students</span>
                  </label>
                  <span style={{ color: 'var(--muted)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-xs)' }}>
                    {visibleSelectedCount} of {filteredRecipients.length} visible selected
                  </span>
                </div>
              </div>

              {/* Scrollable Recipient Grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredRecipients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
                    No registered students match the selected filters.
                  </div>
                ) : (
                  filteredRecipients.map((r) => {
                    const isSelected = selectedRecipientIds.has(r.id);
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleRecipient(r.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: isSelected ? 'rgba(139, 0, 0, 0.04)' : 'var(--panel, #ffffff)',
                          border: `1px solid ${isSelected ? 'rgba(139, 0, 0, 0.3)' : 'var(--border)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-base)', color: 'var(--text)' }}>
                              {r.name}
                            </span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                              {r.blood_type && (
                                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-text, #fda4af)', padding: '2px 8px', background: 'var(--color-rose-bg, rgba(153, 27, 27, 0.08))', border: '1px solid var(--border)', borderRadius: 6 }}>
                                  {r.blood_type}
                                </span>
                              )}
                              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--muted)', padding: '2px 8px', background: 'var(--surface-raised)', borderRadius: 6 }}>
                                Year {r.year}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span><strong>ID:</strong> {r.student_id}</span>
                            <span>&bull;</span>
                            <span>{r.email}</span>
                            <span>&bull;</span>
                            <span style={{ color: r.blood_type ? 'var(--color-primary-text, #fda4af)' : 'var(--muted)', fontWeight: r.blood_type ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)' }}>
                              Blood Type: {r.blood_type || 'Not specified'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg, #f8fafc)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                  Selected: <strong>{selectedRecipientIds.size}</strong> of {recipients.length} students
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setShowFullRecipientModal(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteEvent && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3200,
              padding: 16,
            }}
            onClick={() => setDeleteEvent(null)}
          >
            <div
              style={{
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                width: 'min(92vw, 460px)',
                padding: 24,
                boxShadow: 'var(--shadow-lg)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--danger)' }}>
                Delete Event
              </h3>
              <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--text)', marginBottom: 20 }}>
                Are you sure you want to permanently delete event <strong>"{deleteEvent.title}"</strong>?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn secondary" onClick={() => setDeleteEvent(null)}>
                  Cancel
                </button>
                <button className="btn danger" onClick={handleDelete}>
                  Delete Event
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default Events;

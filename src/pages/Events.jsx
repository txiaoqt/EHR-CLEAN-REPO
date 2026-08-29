// src/pages/Events.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { ChevronDownIcon } from '../components/icons/Icons.jsx';

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
      const matchesYear = recipientYearFilter === 'all' || String(r.year) === String(recipientYearFilter);
      const q = recipientSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.student_id.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q);
      return matchesYear && matchesSearch;
    });
  }, [recipients, recipientYearFilter, recipientSearch]);

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
    setRecipientSearch('');
    setShowFullRecipientModal(false);
    setShowEmailModal(true);
    setLoadingRecipients(true);

    try {
      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select('id, name, student_id, email')
        .eq('role', 'patient')
        .eq('active', true)
        .not('email', 'is', null);

      if (usersErr) throw usersErr;

      const { data: studentsData } = await supabase
        .from('students')
        .select('id, year');

      const yearMap = new Map((studentsData || []).map((s) => [s.id, s.year]));

      const eligible = (usersData || [])
        .filter((u) => u.email && u.email.trim().toLowerCase().endsWith('@tup.edu.ph'))
        .map((u) => ({
          id: u.id,
          name: u.name || 'Student',
          student_id: u.student_id || 'N/A',
          email: u.email.trim().toLowerCase(),
          year: yearMap.get(u.student_id) || 1,
        }));

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
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Clinic Events & Announcements</h2>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
              Schedule university health drives, medical missions, and notify registered students.
            </div>
          </div>
          <button className="btn primary" onClick={openCreateModal}>
            + Create Event
          </button>
        </div>

        {/* KPI Cards */}
        <div className="events-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Total Events</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{stats.total}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Published Events</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--success, #16a34a)', marginTop: 4 }}>{stats.published}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Upcoming Events</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary, #8b0000)', marginTop: 4 }}>{stats.upcoming}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Drafts & Inactive</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--muted)', marginTop: 4 }}>{stats.drafts}</div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              style={{ flex: '1 1 240px', minWidth: 200 }}
              placeholder="Search by title, location, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Category:</span>
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
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Status:</span>
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
        </div>

        {/* Events Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, rgba(0,0,0,0.03))', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Event Title & Details</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Date & Schedule</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Location</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px' }}>Actions</th>
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
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>No events found</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Create a new clinic event or adjust your filters.</div>
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{ev.title}</div>
                        {ev.description && (
                          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`badge ${getCategoryBadgeClass(ev.category)}`} style={{ fontWeight: 600 }}>
                          {ev.category || 'General'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14 }}>
                        <div style={{ fontWeight: 600 }}>{ev.event_date}</div>
                        {(ev.start_time || ev.end_time) && (
                          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                            {ev.start_time || ''} {ev.end_time ? `– ${ev.end_time}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--muted)' }}>
                        {ev.location || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`badge ${getStatusBadgeClass(ev.status)}`} style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {ev.status === 'published' && (
                            <button
                              type="button"
                              className="btn small secondary"
                              style={{ color: '#991b1b', borderColor: '#fee2e2' }}
                              title="Email Registered Students"
                              onClick={() => openEmailBlastModal(ev)}
                            >
                              Email Blast
                            </button>
                          )}
                          <button type="button" className="btn small" onClick={() => openEditModal(ev)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn small secondary"
                            style={{ color: 'var(--danger)' }}
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
        </div>

        {/* Create / Edit Modal */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
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
                background: 'var(--panel, #ffffff)',
                borderRadius: 12,
                width: 'min(92vw, 600px)',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 700 }}>
                {modalMode === 'create' ? 'Create New Event' : 'Edit Event'}
              </h3>
              <form onSubmit={handleSaveEvent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
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
              background: 'rgba(0,0,0,0.5)',
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
                background: 'var(--panel, #ffffff)',
                borderRadius: 14,
                width: 'min(740px, calc(100vw - 32px))',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px 28px 24px',
                boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: 21, fontWeight: 700, color: '#991b1b' }}>
                Email Registered Students
              </h3>
              <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 18, lineHeight: 1.5 }}>
                You are about to dispatch an email announcement for:
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, color: 'var(--text)' }}>
                  {emailEvent.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  Scheduled: {emailEvent.event_date} {emailEvent.start_time ? `at ${emailEvent.start_time}` : ''} ({emailEvent.location || 'TUP Clinic'})
                </div>
              </div>

              {/* Recipient Audience Section */}
              <div style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Recipient Audience</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                      Eligible: {recipients.length} &bull; Selected: {selectedRecipientIds.size}
                    </div>
                  </div>
                  {recipients.length > 0 && (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: 12, padding: '5px 12px', height: 'auto', borderRadius: 6 }}
                      onClick={() => setShowFullRecipientModal(true)}
                    >
                      View All ({recipients.length})
                    </button>
                  )}
                </div>

                {/* Filter Controls: Searchbar FIRST, Year Filter SECOND following Admin filter design system */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by name, ID, or email..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    style={{
                      flex: '1 1 280px',
                      minWidth: '200px',
                      height: '40px',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--panel, #ffffff)',
                      fontSize: 13,
                      color: 'var(--text)',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ position: 'relative', width: '160px', flex: '0 0 160px', minWidth: '140px', height: '40px' }}>
                    <select
                      value={recipientYearFilter}
                      onChange={(e) => setRecipientYearFilter(e.target.value)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel, #ffffff)',
                        fontSize: 13,
                        fontWeight: 500,
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
                    fontSize: 13,
                    fontWeight: 600,
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
                  <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 12 }}>
                    {visibleSelectedCount} of {filteredRecipients.length} visible selected
                  </span>
                </div>

                {/* Recipient Preview List */}
                {loadingRecipients ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--muted)' }}>
                    Loading eligible recipients...
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--muted)' }}>
                    No students match the selected filter.
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
                              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {r.name}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '2px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, flexShrink: 0 }}>
                                Year {r.year}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span>{r.student_id}</span>
                              <span>&bull;</span>
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.email}</span>
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
                            color: '#991b1b',
                            fontSize: 12,
                            fontWeight: 600,
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
                        ? '#eab308'
                        : 'var(--success, #16a34a)'
                    }`,
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 18,
                  }}
                >
                  {emailResult.error ? (
                    <div style={{ color: 'var(--danger, #dc2626)', fontSize: 14 }}>
                      <strong>Email Announcement Failed:</strong> {emailResult.error}
                    </div>
                  ) : emailResult.partial ? (
                    <div>
                      <div style={{ fontWeight: 700, color: '#b45309', fontSize: 15 }}>
                        ⚠️ Announcement Partially Sent
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text)' }}>
                        <strong>{emailResult.success_count}</strong> of <strong>{emailResult.recipient_count}</strong> emails were sent successfully. (<strong>{emailResult.failed_count}</strong> failed)
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--success, #16a34a)', fontSize: 16 }}>
                        ✓ Email sent successfully
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text)' }}>
                        {emailResult.success_count === 1
                          ? 'Email sent successfully to 1 selected recipient.'
                          : `Email sent successfully to all ${emailResult.success_count} selected recipients.`}
                      </div>
                    </div>
                  )}
                  {emailResult.warning && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(0,0,0,0.15)', color: '#b45309', fontSize: 12, lineHeight: 1.4 }}>
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
              background: 'rgba(0,0,0,0.6)',
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
                background: 'var(--panel, #ffffff)',
                borderRadius: 14,
                width: 'min(760px, calc(100vw - 32px))',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                    Select Recipients ({selectedRecipientIds.size} of {recipients.length} Selected)
                  </h3>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12, padding: '4px 8px' }}
                    onClick={() => setShowFullRecipientModal(false)}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Filter and select students eligible to receive this clinic announcement.
                </div>

                {/* Filter and Search Bar: Searchbar FIRST, Year Filter SECOND */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by name, student ID, or email..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    style={{
                      flex: '1 1 280px',
                      minWidth: '200px',
                      height: '40px',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--panel, #ffffff)',
                      fontSize: 13,
                      color: 'var(--text)',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ position: 'relative', width: '160px', flex: '0 0 160px', minWidth: '140px', height: '40px' }}>
                    <select
                      value={recipientYearFilter}
                      onChange={(e) => setRecipientYearFilter(e.target.value)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel, #ffffff)',
                        fontSize: 13,
                        fontWeight: 500,
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
                    fontSize: 13,
                    fontWeight: 600,
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
                  <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 12 }}>
                    {visibleSelectedCount} of {filteredRecipients.length} visible selected
                  </span>
                </div>
              </div>

              {/* Scrollable Recipient Grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredRecipients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 14 }}>
                    No students found matching the selected filter criteria.
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
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                              {r.name}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '2px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, flexShrink: 0 }}>
                              Year {r.year}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span><strong>ID:</strong> {r.student_id}</span>
                            <span>&bull;</span>
                            <span>{r.email}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg, #f8fafc)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
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
              background: 'rgba(0,0,0,0.5)',
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
                background: 'var(--panel, #ffffff)',
                borderRadius: 12,
                width: 'min(92vw, 460px)',
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>
                Delete Event
              </h3>
              <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 20 }}>
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

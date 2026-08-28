// src/pages/Appointments.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { canDeleteRecord, isOwnerOrPrivileged } from '../accessControl.js';
import { SearchIcon, CloseIcon, ChevronDownIcon } from '../components/icons/Icons.jsx';

const Appointments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [tableSearch, setTableSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef(null);

  // modal/new appointment state
  const [showModal, setShowModal] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [newAppt, setNewAppt] = useState({
    patient_id: '',
    appointment_date: '',
    appointment_time: '',
    type: 'Consult',
    clinician_name: user ? user.name : '',
    status: 'Scheduled'
  });
  const [loading, setLoading] = useState(true);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteMessageType, setDeleteMessageType] = useState(''); // 'success'|'error'
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Close date picker on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setShowDatePicker(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDatePicker]);

  // fetch appointments
  useEffect(() => {
    const fetchAppointments = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: true });
      if (!error) setAppointments(data || []);
      else console.error('Error fetching appointments:', error);
      setLoading(false);
    };
    fetchAppointments();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAppointments();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // patient suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!patientSearch) {
        setPatientSuggestions([]);
        return;
      }
      const { data } = await supabase
        .from('students')
        .select('id, name')
        .or(`name.ilike.%${patientSearch}%,id.ilike.%${patientSearch}%`)
        .limit(10);
      setPatientSuggestions(data || []);
    };
    fetchSuggestions();
  }, [patientSearch]);

  // helper map: date -> count
  const buildApptMap = () => {
    const map = {};
    (appointments || []).forEach(appt => {
      const key = appt.appointment_date || todayKey;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  };
  const apptMap = buildApptMap();

  // format time to 12-hr (expects "HH:MM" or similar)
  const formatTime12 = (timeStr) => {
    if (!timeStr) return '—';
    const m = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mm = m[2];
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12 || 12;
      return `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
    }
    try {
      const d = new Date(`1970-01-01T${timeStr}`);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  // format selected date label
  const formatSelectedDateLabel = (dStr) => {
    if (!dStr) return 'Select Date';
    try {
      const [y, m, d] = dStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dStr;
    }
  };

  // 4-dimensional table filter: status + type + date + search
  const filterTable = () => {
    let filtered = appointments || [];

    // 1. Status filter: 'all' | 'Scheduled' | 'Checked-in' | 'Cancelled'
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    // 2. Type filter: 'all' | 'Consult' | 'Follow-up'
    if (typeFilter && typeFilter !== 'all') {
      filtered = filtered.filter(a => (a.type || '').toLowerCase() === typeFilter.toLowerCase());
    }

    // 3. Date filter: selectedDate
    if (selectedDate) {
      filtered = filtered.filter(a => a.appointment_date === selectedDate);
    }

    // 4. Text search
    if (tableSearch && tableSearch.trim() !== '') {
      const q = tableSearch.toLowerCase();
      filtered = filtered.filter(appt => {
        const pid = (appt.patient_id || '').toString().toLowerCase();
        const name = (appt.students?.name || appt.patient_name || '').toString().toLowerCase();
        const clinician = (appt.clinician_name || '').toLowerCase();
        const type = (appt.type || '').toLowerCase();
        return pid.includes(q) || name.includes(q) || clinician.includes(q) || type.includes(q);
      });
    }
    return filtered;
  };

  // KPI counts
  const kpi_today_scheduled = (appointments || []).filter(a => a.appointment_date === todayKey && a.status === 'Scheduled').length;
  const kpi_today_canceled = (appointments || []).filter(a => a.appointment_date === todayKey && a.status === 'Cancelled').length;
  const weekDates = (() => {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay());
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(dateKey(d));
    }
    return arr;
  })();
  const kpi_week_total = (appointments || []).filter(a => weekDates.includes(a.appointment_date)).length;
  const kpi_future = (appointments || []).filter(a => a.appointment_date > todayKey).length;

  // modal handlers
  const openNewModal = () => setShowModal(true);
  const closeNewModal = () => {
    setShowModal(false);
    setPatientSearch('');
    setPatientSuggestions([]);
    setSelectedName('');
    setNewAppt({
      patient_id: '',
      appointment_date: '',
      appointment_time: '',
      type: 'Consult',
      clinician_name: user ? user.name : '',
      status: 'Scheduled'
    });
  };
  const handleNewApptChange = (e) => {
    const { id, value } = e.target;
    setNewAppt(prev => ({ ...prev, [id]: value }));
  };
  const pickPatientSuggestion = (s) => {
    setNewAppt(prev => ({ ...prev, patient_id: s.id }));
    setSelectedName(s.name);
    setPatientSearch(`${s.name} (${s.id})`);
    setPatientSuggestions([]);
  };
  const submitNewAppointment = async () => {
    try {
      if (!newAppt.patient_id || !newAppt.appointment_date || !newAppt.appointment_time) {
        alert('Please fill required fields.');
        return;
      }
      const { data, error } = await supabase.from('appointments').insert([newAppt]).select();
      if (error) throw error;
      const newRecord = { ...data[0], students: { name: selectedName } };
      setAppointments(prev => [...prev, newRecord]);
      await logAudit('Appointment Creation', `Added appointment ${newAppt.patient_id} on ${newAppt.appointment_date} ${newAppt.appointment_time}`);
      closeNewModal();
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving appointment: ' + (err.message || err));
    }
  };

  // update status: debug-friendly, ONLY update DB + local state (no redirect)
  const updateStatus = async (appt, newStatus) => {
    try {
      if (!isOwnerOrPrivileged(user, appt?.clinician_name)) {
        alert('You can only update your own appointments.');
        return;
      }

      if (!appt || !appt.id) {
        console.error('updateStatus: invalid appointment object or missing id', appt);
        alert('Unable to update status: appointment id missing.');
        return;
      }

      // allowed list adjusted to match DB spelling
      const allowed = ['Scheduled', 'Checked-in', 'Cancelled', 'Completed'];
      if (!allowed.includes(newStatus)) {
        console.warn('updateStatus: newStatus not in expected list', newStatus);
      }

      const res = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', appt.id);

      if (res.error) {
        console.error('Supabase update error:', res.error);
        const errText = `Failed to update status: ${res.error.message || JSON.stringify(res.error)}`;
        if (res.error.details) console.info('details:', res.error.details);
        if (res.error.hint) console.info('hint:', res.error.hint);
        alert(errText);
        return;
      }

      // success
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: newStatus } : a));
      await logAudit('Appointment Status Change', `Appointment ${appt.patient_id} status changed to ${newStatus}`);
    } catch (err) {
      console.error('updateStatus unexpected error:', err);
      alert('Unexpected error when updating status: ' + (err.message || JSON.stringify(err)));
    }
  };

  // Delete handlers
  const openDeleteModal = (appt) => {
    setDeleteItem(appt);
    setDeleteConfirmId('');
    setDeleteMessage('');
    setDeleteMessageType('');
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteItem(null);
    setDeleteConfirmId('');
    setDeleteMessage('');
    setDeleteMessageType('');
  };

  const submitDeleteAppointment = async () => {
    if (!canDeleteRecord(user)) {
      setDeleteMessage('Only physicians can delete appointments.');
      setDeleteMessageType('error');
      return;
    }

    if (!deleteItem || !deleteItem.id) {
      setDeleteMessage('Invalid appointment selected.');
      setDeleteMessageType('error');
      return;
    }
    // require exact patient_id typed for safety
    if ((deleteConfirmId || '').trim() !== String(deleteItem.patient_id)) {
      setDeleteMessage('Please type the exact Patient ID to confirm deletion.');
      setDeleteMessageType('error');
      return;
    }

    if (!deletePassword) {
      setDeleteMessage('Password is required.');
      setDeleteMessageType('error');
      return;
    }

    setDeleting(true);
    setDeleteMessage('');
    setDeleteMessageType('');
    try {
      // Verify password with Supabase Auth
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: deletePassword,
      });

      if (verifyError) {
        setDeleteMessage('Incorrect password.');
        setDeleteMessageType('error');
        setDeleting(false);
        return;
      }

      const { error } = await supabase.from('appointments').delete().eq('id', deleteItem.id);
      if (error) throw error;

      // update local state
      setAppointments(prev => (prev || []).filter(a => a.id !== deleteItem.id));
      setDeleteMessage('Appointment deleted successfully.');
      setDeleteMessageType('success');

      try {
        await logAudit('Appointment Deletion', `Deleted appointment ${deleteItem.id} (patient ${deleteItem.patient_id})`, user?.name || null);
      } catch (e) {
        console.warn('audit failed', e);
      }

      setTimeout(() => {
        closeDeleteModal();
      }, 900);
    } catch (err) {
      console.error('Error deleting appointment:', err);
      setDeleteMessage('Error deleting appointment: ' + (err.message || 'Unknown error'));
      setDeleteMessageType('error');
    } finally {
      setDeleting(false);
    }
  };

  // action button only reads current status and redirects accordingly
  const handleAction = (appt) => {
    if (!appt) return;
    if (appt.status === 'Checked-in') {
      navigate(`/patient-profile?id=${appt.patient_id}`);
    } else if (appt.status === 'Scheduled') {
      navigate('/encounter', { state: { patientId: appt.patient_id } });
    } else if (appt.status === 'Cancelled') {
      navigate('/reports');
    } else {
      navigate('/encounter', { state: { patientId: appt.patient_id } });
    }
  };

  // on-demand compact calendar popover render
  const renderCalendarPopover = () => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    for (let day = 1; day <= last.getDate(); day++) days.push(day);

    return (
      <div className="appointments-datepicker-popover" role="dialog" aria-modal="false" aria-label="Appointment date picker">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button
            type="button"
            className="btn secondary small"
            style={{ padding: '3px 8px', fontSize: 12 }}
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <strong style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 700 }}>
            {viewDate.toLocaleString(undefined, { month: 'short', year: 'numeric' })}
          </strong>
          <button
            type="button"
            className="btn secondary small"
            style={{ padding: '3px 8px', fontSize: 12 }}
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, textAlign: 'center', marginBottom: 10 }}>
          {['S','M','T','W','T','F','S'].map((w, i) => (
            <div key={`weekday-${i}-${w}`} style={{ fontSize: 11, fontWeight: 700, color:'var(--text-muted)', padding: '2px 0' }}>{w}</div>
          ))}
          {days.map((day, idx) => {
            if (!day) return <div key={`blank-${idx}`} style={{ height: 26 }}></div>;
            const currentKey = dateKey(new Date(year, month, day));
            const isToday = currentKey === todayKey;
            const isSelected = currentKey === selectedDate;
            const count = apptMap[currentKey] || 0;
            let styles = {
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: (isSelected || isToday) ? 700 : 500,
              transition: 'all 0.1s ease',
              position: 'relative'
            };
            if (isSelected) {
              styles = { ...styles, background: 'var(--color-primary, #c92a2a)', color: '#ffffff' };
            } else if (isToday) {
              styles = { ...styles, border: '1px solid var(--color-primary, #c92a2a)', color: 'var(--color-primary, #c92a2a)' };
            } else {
              styles = { ...styles, color: 'var(--text)' };
            }
            return (
              <div
                key={`day-${day}`}
                style={styles}
                onClick={() => {
                  if (isSelected) {
                    setSelectedDate(null);
                  } else {
                    setSelectedDate(currentKey);
                  }
                  setShowDatePicker(false);
                }}
                title={count > 0 ? `${count} appointment(s) on ${currentKey}` : currentKey}
              >
                {day}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border-subtle)', fontSize: 11.5 }}>
          <button
            type="button"
            className="btn secondary small"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => {
              setSelectedDate(todayKey);
              setViewDate(new Date());
              setShowDatePicker(false);
            }}
          >
            Today
          </button>
          {selectedDate && (
            <button
              type="button"
              className="btn secondary small"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                setSelectedDate(null);
                setShowDatePicker(false);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  };

  // week tracker
  const renderTracker = () => {
    const buttons = [];
    const start = new Date();
    start.setDate(start.getDate() - start.getDay()); // Sunday
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      const count = apptMap[key] || 0;
      const isToday = key === todayKey;
      const isSelected = key === selectedDate;
      const styles = {
        minWidth: 70,
        flex: 1,
        padding: '10px 8px',
        borderRadius: 8,
        border: isSelected ? '2px solid var(--color-primary, #c92a2a)' : '1px solid var(--border-subtle)',
        background: isToday ? 'var(--color-primary, #c92a2a)' : (isSelected ? 'rgba(201, 42, 42, 0.08)' : '#ffffff'),
        color: isToday ? '#ffffff' : 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.12s ease'
      };
      buttons.push(
        <button
          key={key}
          type="button"
          style={styles}
          onClick={() => {
            if (isSelected) {
              setSelectedDate(null);
            } else {
              setSelectedDate(key);
            }
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, opacity: isToday ? 0.9 : 0.7 }}>
            {d.toLocaleDateString(undefined, { weekday: 'short' })}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, margin: '2px 0' }}>{d.getDate()}</div>
          <div style={{ fontSize: 10, fontWeight: 700, opacity: isToday ? 0.95 : 0.8 }}>
            {count} {count === 1 ? 'visit' : 'visits'}
          </div>
        </button>
      );
    }
    return <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>{buttons}</div>;
  };

  return (
    <main className="main">
      <div className="page">
        {/* 1. PAGE HEADER: Clean & focused with primary action only */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Appointments & Scheduling</h1>
            <div className="page-header-subtitle">
              Manage clinic patient queue, schedule appointments, and update visit status.
            </div>
          </div>

          <div className="page-header-actions">
            <button type="button" className="btn" onClick={openNewModal}>
              New Appointment
            </button>
          </div>
        </div>

        {/* 2. SUMMARY METRICS: 4 High-level status cards */}
        <div className="appointments-kpi-grid">
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 16px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Scheduled Today</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--color-blue-text)' }}>{kpi_today_scheduled}</div>
          </div>
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 16px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Cancelled Today</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--danger)' }}>{kpi_today_canceled}</div>
          </div>
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 16px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>This Week</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--color-amber-text)' }}>{kpi_week_total}</div>
          </div>
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 16px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Future Schedules</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--color-emerald-text)' }}>{kpi_future}</div>
          </div>
        </div>

        {/* 3. WEEKLY SCHEDULE CONTEXT (Horizontal Overview) */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div className="card-header" style={{ marginBottom: 10 }}>
            <div>
              <h3 className="card-title" style={{ fontSize: 14.5 }}>Weekly Schedule</h3>
              <span className="card-subtitle" style={{ fontSize: 11.5 }}>Current week volume & day quick-jump</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                {kpi_week_total} total week visits
              </span>
              {selectedDate && (
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => setSelectedDate(null)}
                >
                  Show All Dates
                </button>
              )}
            </div>
          </div>
          <div>{renderTracker()}</div>
        </div>

        {/* 4. PRIMARY APPOINTMENT WORKSPACE: Table with unified toolbar */}
        <div className="card" style={{ padding: '20px 22px' }}>
          {/* Card Header & Dynamic Count */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Appointments Schedule
              </h2>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Live clinical queue and scheduled patient appointments
              </div>
            </div>

            <span className="badge badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
              Showing: <strong>{filterTable().length}</strong>
            </span>
          </div>

          {/* Table Toolbar: Fluid Search + Status Filter + Type Filter + Date Filter */}
          <div className="appointments-toolbar">
            {/* 1. Full-Width Search Input */}
            <div className="appointments-search-wrapper">
              <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center' }}>
                <SearchIcon size={16} />
              </span>
              <input
                type="search"
                className="appointments-search-input"
                placeholder="Search appointments..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                aria-label="Search appointments"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}
                  aria-label="Clear search"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>

            {/* Filter Controls Group */}
            <div className="appointments-filter-group">
              {/* 2. Status Filter */}
              <div className="appointments-select-wrapper">
                <select
                  className="appointments-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by appointment status"
                >
                  <option value="all">All Appointments</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Checked-in">Checked-in</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
                <span className="appointments-filter-chevron">
                  <ChevronDownIcon size={13} />
                </span>
              </div>

              {/* 3. Type Filter */}
              <div className="appointments-select-wrapper">
                <select
                  className="appointments-filter-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Filter by appointment type"
                >
                  <option value="all">All Types</option>
                  <option value="Consult">Consult</option>
                  <option value="Follow-up">Follow-up</option>
                </select>
                <span className="appointments-filter-chevron">
                  <ChevronDownIcon size={13} />
                </span>
              </div>

              {/* 4. Date Filter */}
              <div className="appointments-datepicker-wrapper" ref={datePickerRef}>
                <button
                  type="button"
                  className={`appointments-datepicker-btn ${selectedDate ? 'active' : ''}`}
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  aria-haspopup="dialog"
                  aria-expanded={showDatePicker}
                  aria-label="Select appointment date"
                >
                  <span>{formatSelectedDateLabel(selectedDate)}</span>
                  <span className="appointments-filter-chevron" style={{ position: 'static', transform: 'none', marginLeft: 4 }}>
                    <ChevronDownIcon size={13} />
                  </span>
                </button>

                {showDatePicker && renderCalendarPopover()}
              </div>
            </div>
          </div>

          {/* Active Date Filter Chip (if selected) */}
          {selectedDate && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#ffffff', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Filtered date:</span>
              <strong style={{ color: 'var(--color-primary, #c92a2a)' }}>{formatSelectedDateLabel(selectedDate)}</strong>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}
                title="Clear date filter"
                aria-label="Clear date filter"
              >
                ×
              </button>
            </div>
          )}

          <div className="table-responsive">
            <table className="table" aria-label="Appointments table">
              <thead>
                <tr>
                  <th>Queue #</th>
                  <th>Patient ID</th>
                  <th>Department</th>
                  <th>Service</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Clinician</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading appointments…</td></tr>
                ) : filterTable().length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No appointments found.</td>
                  </tr>
                ) : (
                  filterTable().map((appt, idx) => (
                    <tr key={appt.id} data-date={appt.appointment_date}>
                      <td>
                        <span className="badge badge-neutral" style={{ fontWeight: 700 }}>#{appt.queue_number || (idx + 1)}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{appt.patient_id}</div>
                        {appt.students?.name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{appt.students.name}</div>}
                      </td>
                      <td>{appt.department || 'Medical Clinic'}</td>
                      <td>{appt.service_type || 'Consultation'}</td>
                      <td style={{ fontWeight: 600 }}>{formatTime12(appt.appointment_time)}</td>
                      <td>
                        <span className="badge badge-neutral">{appt.type}</span>
                      </td>
                      <td>{appt.clinician_name || 'Staff'}</td>
                      <td>
                        <select
                          value={appt.status}
                          onChange={(e) => updateStatus(appt, e.target.value)}
                          className="input"
                          style={{
                            minWidth: 130,
                            minHeight: 34,
                            padding: '4px 8px',
                            fontSize: 12.5,
                            fontWeight: 600,
                            background: appt.status === 'Checked-in' ? 'var(--color-emerald-bg)' : (appt.status === 'Cancelled' ? 'rgba(220, 38, 38, 0.08)' : 'var(--color-blue-bg)'),
                            color: appt.status === 'Checked-in' ? 'var(--color-emerald-text)' : (appt.status === 'Cancelled' ? 'var(--danger)' : 'var(--color-blue-text)'),
                            borderColor: 'transparent'
                          }}
                        >
                          <option>Scheduled</option>
                          <option>Checked-in</option>
                          <option>Cancelled</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <button className="btn secondary small" onClick={() => handleAction(appt)}>
                            Open
                          </button>

                          {canDeleteRecord(user) && (
                            <button
                              className="btn danger small"
                              onClick={() => openDeleteModal(appt)}
                              title="Delete this appointment"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Appointment modal */}
        {showModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ width: 640, maxWidth: '95%', background: '#ffffff', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Appointment</h3>
                <button type="button" className="modal-close-btn" onClick={closeNewModal} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Patient</label>
                  <input
                    type="text"
                    placeholder="Search patient name or student ID..."
                    className="input"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  {patientSuggestions.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6, maxHeight: 160, overflowY: 'auto', background: '#ffffff', boxShadow: 'var(--shadow-md)' }}>
                      {patientSuggestions.map(s => (
                        <div key={s.id} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }} onClick={() => pickPatientSuggestion(s)}>
                          <strong>{s.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({s.id})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Date</label>
                  <input id="appointment_date" type="date" className="input" value={newAppt.appointment_date} onChange={handleNewApptChange} style={{ width: '100%' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Time</label>
                  <input id="appointment_time" type="time" className="input" value={newAppt.appointment_time} onChange={handleNewApptChange} style={{ width: '100%' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Type</label>
                  <select id="type" className="input" value={newAppt.type} onChange={handleNewApptChange} style={{ width: '100%' }}>
                    <option>Consult</option>
                    <option>Follow-up</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Clinician</label>
                  <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--grey-100)', fontSize: 13, color: 'var(--text)', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                    <strong>{newAppt.clinician_name || 'Staff Clinician'}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button className="btn secondary" onClick={closeNewModal}>Cancel</button>
                <button className="btn" onClick={submitNewAppointment} disabled={!newAppt.patient_id || !newAppt.appointment_date || !newAppt.appointment_time}>
                  Save Appointment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Appointment modal */}
        {showDeleteModal && deleteItem && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1250
          }}>
            <div style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: '500px',
              width: '100%'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>Delete Appointment</h3>
                <button type="button" className="modal-close-btn" onClick={closeDeleteModal} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
                This will permanently remove the appointment for patient <strong>{deleteItem.patient_id}</strong> on <strong>{deleteItem.appointment_date}</strong> at <strong>{formatTime12(deleteItem.appointment_time)}</strong>.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Type the exact Patient ID to confirm</label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g., TUPM-XX-XXXX"
                  value={deleteConfirmId}
                  onChange={(e) => setDeleteConfirmId(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Enter your password to verify</label>
                <input
                  className="input"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {deleteMessage && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: '14px',
                  borderRadius: '10px',
                  color: deleteMessageType === 'error' ? 'var(--danger)' : '#059669',
                  background: deleteMessageType === 'error' ? '#fef2f2' : 'rgba(5, 150, 105, 0.1)',
                  fontSize: '13px',
                  fontWeight: 600
                }}>
                  {deleteMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn secondary" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
                <button className="btn danger" onClick={submitDeleteAppointment} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Appointments;

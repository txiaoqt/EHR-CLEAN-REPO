// src/pages/Appointments.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { canDeleteRecord, isOwnerOrPrivileged } from '../accessControl.js';

const Appointments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState('all');
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [tableSearch, setTableSearch] = useState('');

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

  // table filter + search
  const filterTable = () => {
    let filtered = appointments || [];
    if (filter === 'selected' && selectedDate) filtered = filtered.filter(a => a.appointment_date === selectedDate);
    if (filter === 'today') filtered = filtered.filter(a => a.appointment_date === todayKey);
    if (filter === 'queued') filtered = filtered.filter(a => a.status === 'Checked-in');

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
        // still attempt update (in case DB allows other values)
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
      // NO navigation here — action button handles redirects
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

  // small square calendar render (kept as is)
  const renderCalendar = () => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    for (let day = 1; day <= last.getDate(); day++) days.push(day);

    return (
      <div style={{ width: '100%', maxWidth: 340, height: 320, display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button className="btn small" onClick={() => setViewDate(new Date(year, month - 1, 1))}>←</button>
          <strong style={{ textAlign: 'center' }}>{viewDate.toLocaleString(undefined, { month: 'short', year: 'numeric' })}</strong>
          <button className="btn small" onClick={() => setViewDate(new Date(year, month + 1, 1))}>→</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, flex: 1 }}>
          {['S','M','T','W','T','F','S'].map((w, i) => (
            <div key={`weekday-${i}-${w}`} style={{ fontSize: 11, textAlign: 'center', color:'var(--muted)' }}>{w}</div>
          ))}
          {days.map((day, idx) => {
            if (!day) return <div key={`blank-${idx}`}></div>;
            const currentKey = dateKey(new Date(year, month, day));
            const isToday = currentKey === todayKey;
            const isSelected = currentKey === selectedDate;
            let styles = { padding: 6, borderRadius: 6, textAlign:'center', cursor:'pointer' };
            if (isSelected) styles = { ...styles, background: 'var(--accent)', color: '#fff', fontWeight:700 };
            else if (isToday) styles = { ...styles, border: '1px solid var(--accent)' };
            return <div key={`day-${day}`} style={styles} onClick={() => { setSelectedDate(currentKey); setFilter(currentKey === todayKey ? 'today' : 'selected'); }}>{day}</div>;
          })}
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
        minWidth: 80, // reduced to avoid overflow
        padding: '12px 10px',
        borderRadius: 10,
        border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
        background: isToday ? 'linear-gradient(90deg,var(--accent),var(--danger))' : 'transparent',
        color: isToday ? '#fff' : 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      };
      buttons.push(
        <button key={key} style={styles} onClick={() => { setSelectedDate(key); setFilter(key === todayKey ? 'today' : 'selected'); }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{d.getDate()}</div>
        </button>
      );
    }
    return <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>{buttons}</div>;
  };

  return (
    // prevent horizontal scrolling at the page level while keeping content responsive
    <main className="main" style={{ overflowX: 'hidden' }}>
      <section className="page">
        {/* Header card with description below header */}
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Appointments</h2>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="search" className="input" placeholder="Search appointments..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} style={{ minWidth: 260 }} />
              <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="today">Today</option>
                <option value="queued">Checked-in</option>
                {selectedDate && <option value="selected">Selected Date</option>}
              </select>
              <button className="btn" onClick={openNewModal}>New Appointment</button>
            </div>
          </div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
            Manage today's queue, schedule new visits, and update appointment status quickly.
          </div>
        </div>

        {/* LEFT: Calendar | RIGHT: Cards above Week (two-row layout beside calendar) */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap' // allow wrapping so items align under header instead of forcing horizontal scroll
        }}>
          {/* Calendar on the left */}
          <div className="card" style={{ padding: 12, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Calendar</h3>
              {renderCalendar()}
            </div>
          </div>

          {/* Right column: top = 2x2 cards; bottom = week tracker */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10, minWidth: 0 }}>
            {/* Cards grid: 2 columns x 2 rows */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 13 }}>Scheduled Today</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi_today_scheduled}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 13 }}>Cancelled Today</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi_today_canceled}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 13 }}>Appointments this Week</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi_week_total}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 13 }}>Future Schedules</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi_future}</div>
              </div>
            </div>

            {/* Week tracker under the cards */}
            <div className="card" style={{ padding: 12 }}>
              <h3 style={{ marginTop: 20 }}>Week</h3>
              <div style={{ marginTop: 8 }}>{renderTracker()}</div>
              <div style={{ marginTop: 20, color: 'var(--muted)', fontSize: 13 }}>
                <div>Selected date: <strong>{selectedDate || '—'}</strong></div>
                <div style={{ marginTop: 6 }}>Appointments this week: <strong>{kpi_week_total}</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* Appointment list */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Appointments List</h3>
            <div style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 13 }}>
              Showing <strong>{filterTable().length}</strong> results
            </div>
          </div>

          <div style={{ overflow: 'auto' }}>
            <table className="table" aria-label="Appointments table">
              <thead>
                <tr>
                  <th>QUEUE</th>
                  <th>ID</th>
                  <th>DEPARTMENT</th>
                  <th>APPT TYPE</th>
                  <th>SERVICE</th>
                  <th>TIME</th>
                  <th>TYPE</th>
                  <th>SOURCE</th>
                  <th>REF</th>
                  <th>CLINICIAN</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center' }}>Loading…</td></tr>
                ) : filterTable().length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No appointments yet.</td>
                  </tr>
                ) : (
                  filterTable().map((appt, idx) => (
                    <tr key={appt.id} data-date={appt.appointment_date}>
                      <td style={{ fontWeight: 700 }}>{appt.queue_number || (idx + 1)}</td>
                      <td>
                        <div>{appt.patient_id}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{appt.students?.name || ''}</div>
                      </td>
                      <td>{appt.department || 'Medical Clinic'}</td>
                      <td>{appt.appointment_type || 'Future Appointment'}</td>
                      <td>{appt.service_type || 'Consultation'}</td>
                      <td>{formatTime12(appt.appointment_time)}</td>
                      <td>{appt.type}</td>
                      <td>{appt.source || 'staff'}</td>
                      <td>{appt.reference_code || '-'}</td>
                      <td>{appt.clinician_name}</td>
                      <td>
                        <select
                          value={appt.status}
                          onChange={(e) => updateStatus(appt, e.target.value)}
                          className="input"
                          style={{ minWidth: 140 }}
                        >
                          <option>Scheduled</option>
                          <option>Checked-in</option>
                          <option>Cancelled</option>
                        </select>
                      </td>
                      <td>
                        {/* explicit, clearer action labels with emoji */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button className="btn" onClick={() => handleAction(appt)}> Open </button>

                          {/* Delete button - only available to physicians */}
                          {canDeleteRecord(user) && (
                            <button
                              className="btn secondary"
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
            position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ width: 720, maxWidth: '95%', background: 'var(--panel)', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>New Appointment</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input
                    type="text"
                    placeholder="Search..."
                    className="input"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                  />
                <div style={{ gridColumn: '1/-1' }}>
        
                  {patientSuggestions.length > 0 && (
                    <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, marginTop: 6, maxHeight: 160, overflowY: 'auto', background: 'var(--panel)' }}>
                      {patientSuggestions.map(s => (
                        <div key={s.id} style={{ padding: 8, cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                          onClick={() => {
                            setPatientSearch(`${s.name} (${s.id})`);
                            setSelectedName(s.name);
                            setNewAppt(prev => ({ ...prev, patient_id: s.id }));
                            setPatientSuggestions([]);
                          }}>
                          {s.name} ({s.id})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <input id="appointment_date" type="date" className="input" value={newAppt.appointment_date} onChange={handleNewApptChange} />
                <input id="appointment_time" type="time" className="input" value={newAppt.appointment_time} onChange={handleNewApptChange} />
                <select id="type" className="input" value={newAppt.type} onChange={handleNewApptChange}>
                  <option>Consult</option>
                  <option>Follow-up</option>
                </select>
                <div style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
                  Clinician: <strong>{newAppt.clinician_name || 'Not logged in'}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn secondary" onClick={closeNewModal}>Cancel</button>
                <button className="btn" onClick={submitNewAppointment} disabled={!newAppt.patient_id}>Save Appointment</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Appointment modal */}
        {showDeleteModal && deleteItem && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1250
          }}>
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              maxWidth: '520px',
              width: '100%'
            }}>
              <h3 style={{ marginTop: 0 }}>Delete Appointment</h3>
              <p style={{ color: 'var(--muted)' }}>
                This will permanently remove the appointment for patient <strong>{deleteItem.patient_id}</strong> on <strong>{deleteItem.appointment_date}</strong> at <strong>{formatTime12(deleteItem.appointment_time)}</strong>.
              </p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6 }}>Type the exact Patient ID to confirm</label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g., TUPM-XX-XXXX"
                  value={deleteConfirmId}
                  onChange={(e) => setDeleteConfirmId(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6 }}>Enter your password to verify</label>
                <input
                  className="input"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>

              {deleteMessage && (
                <div style={{
                  padding: '8px',
                  marginBottom: '12px',
                  borderRadius: '4px',
                  color: deleteMessageType === 'error' ? 'red' : 'green',
                  border: `1px solid ${deleteMessageType === 'error' ? 'red' : 'green'}`,
                  fontSize: '14px'
                }}>
                  {deleteMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
                <button className="btn" onClick={submitDeleteAppointment} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}

      </section>
    </main>
  );
};

export default Appointments;

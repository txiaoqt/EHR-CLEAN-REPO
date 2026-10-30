// src/pages/MyProfile.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { CloseIcon, EncountersIcon, CalendarIcon } from '../components/icons/Icons.jsx';
import KpiCard from '../components/KpiCard.jsx';
import TablePagination from '../components/table/TablePagination.jsx';
import avatarPlaceholder from '../assets/images/avatar-placeholder.jpg';

const MyProfile = () => {
  const { user: authUser, updateUser } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState({ name: '', role: '', email: '', avatar: '' });
  const [editableUser, setEditableUser] = useState({ name: '', avatar: '' });
  const [loading, setLoading] = useState(true);
  // Set once the profile loads; View All Activity filters with the same rule.
  const matchesClinicianRef = useRef(() => false);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState({
    encountersCreated: 0,
    appointmentsScheduled: 0,
    patientsReferred: 0
  });

  // Recent activity entries (merged)
  const [recentActivity, setRecentActivity] = useState([]);

  // Modal for viewing all activity
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [modalTab, setModalTab] = useState('encounters'); // 'encounters' | 'appointments'
  const [modalData, setModalData] = useState({ encounters: [], appointments: [] });
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!authUser) return;

      // Format display name like in sidebar
      let displayName = authUser.name || '';
      const prefix = (authUser.email || '').split('.')[0].toLowerCase();
      if (prefix === 'dr' && displayName && !displayName.startsWith('Dr.')) {
        displayName = `Dr. ${displayName}`;
      } else if (prefix === 'nurse' && displayName && !displayName.startsWith('Nr.')) {
        displayName = `Nr. ${displayName.replace(/^(Nurse\s+)?/, '')}`;
      } else if (prefix === 'admin' && displayName) {
        displayName = `Admin ${displayName}`;
      }

      // Capitalize role
      const roleFormatted = authUser.role ? authUser.role.charAt(0).toUpperCase() + authUser.role.slice(1) : '';

      setUser({ name: displayName, role: roleFormatted, email: authUser.email, avatar: authUser.avatar });
      setEditableUser({ name: displayName, avatar: authUser.avatar });

      try {
        // Fetch statistics
        const { count: encountersCount } = await supabase
          .from('encounters')
          .select('*', { count: 'exact', head: true })
          .eq('clinician_name', displayName);

        const { count: appointmentsCount } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('clinician_name', displayName);

        setStats({
          encountersCreated: encountersCount || 0,
          appointmentsScheduled: appointmentsCount || 0,
          patientsReferred: 0
        });
      } catch (err) {
        console.warn('Error fetching stats for profile:', err);
      }

      // Build merged recent activity feed with robust matching
      try {
        const normalize = (s = '') => {
          if (!s) return '';
          return s.toString().toLowerCase().replace(/\b(dr|nr|nurse|admin)\b\.?/g, '').replace(/[^a-z0-9\s]/g, '').trim();
        };

        const matchesClinician = (clinicianField) => {
          const c = normalize(clinicianField || '');
          // An empty field would match every name below via includes('').
          if (!c) return false;
          const namesToCheck = [
            normalize(displayName),
            normalize(authUser.name),
            normalize(authUser.email),
            (authUser.id || '').toString()
          ].filter(Boolean);

          if (namesToCheck.includes((clinicianField || '').toString())) return true;

          for (const n of namesToCheck) {
            if (!n) continue;
            if (c === n) return true;
            if (c.includes(n) || n.includes(c)) return true;
            const parts = n.split(/\s+/).filter(Boolean);
            for (const p of parts) {
              if (p.length > 2 && c.includes(p)) return true;
            }
          }
          return false;
        };
        matchesClinicianRef.current = matchesClinician;

        // Audit logs are read in the System Admin Portal only.
        // 1) recent encounters (last 50)
        let encounterEntries = [];
        try {
          const { data: encs, error: encErr } = await supabase
            .from('encounters')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

          if (!encErr && Array.isArray(encs)) {
            encounterEntries = encs.filter(e => {
              return matchesClinician(e.clinician_name) || matchesClinician(e.clinician_id) || matchesClinician(e.clinician);
            }).map(e => ({
              id: e.id,
              source: 'encounter',
              action: `Encounter: ${e.chief_complaint || (e.assessment_plan ? e.assessment_plan.split(',')[0] : 'Consult')}`,
              detail: `Patient: ${e.patient_id || e.patient_name || 'Unknown'}`,
              created_at: e.created_at || e.encounter_date || null,
              raw: e
            }));
          }
        } catch (e) {
          console.warn('Error fetching encounters for recent activity', e);
        }

        // 2) recent appointments (last 50)
        let appointmentEntries = [];
        try {
          const { data: appts, error: apptErr } = await supabase
            .from('appointments')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

          if (!apptErr && Array.isArray(appts)) {
            appointmentEntries = appts.filter(a => {
              return matchesClinician(a.clinician_name) || matchesClinician(a.clinician_id) || matchesClinician(a.clinician);
            }).map(a => ({
              id: a.id,
              source: 'appointment',
              action: `Appointment: ${a.type || 'Appointment'} (${a.status || 'Scheduled'})`,
              detail: `Patient: ${a.patient_id || a.patient_name || 'Unknown'} on ${a.appointment_date || ''} ${a.appointment_time || ''}`,
              created_at: a.created_at || (a.appointment_date ? `${a.appointment_date}T00:00:00Z` : null),
              raw: a
            }));
          }
        } catch (e) {
          console.warn('Error fetching appointments for recent activity', e);
        }

        // Merge and sort
        const merged = [
          ...encounterEntries,
          ...appointmentEntries
        ].filter(x => x && x.created_at)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 8);

        setRecentActivity(merged);
      } catch (err) {
        console.warn('Error building recent activity:', err);
        setRecentActivity([]);
      }

      setLoading(false);
    };

    fetchProfileData();
  }, [authUser]);

  // ---------- Modal: load full activity on demand ----------
  // An activity log reads better grouped: a flat list of timestamps makes you
  // scan each one to work out whether it happened today. Grouping by day answers
  // that before you read a single row.
  const groupedActivity = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const groups = [];
    for (const item of recentActivity || []) {
      const when = item.created_at ? new Date(item.created_at) : null;
      let label = 'Earlier';
      if (when) {
        const day = new Date(when.getFullYear(), when.getMonth(), when.getDate());
        if (day.getTime() === today.getTime()) label = 'Today';
        else if (day.getTime() === yesterday.getTime()) label = 'Yesterday';
        else label = when.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
      }
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  })();

  const openActivityModal = async () => {
    setShowActivityModal(true);
    setModalLoading(true);
    try {
      const [eRes, pRes] = await Promise.all([
        supabase.from('encounters').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('appointments').select('*').order('created_at', { ascending: false }).limit(200)
      ]);

      const mine = matchesClinicianRef.current;
      const byClinician = (r) => mine(r.clinician_name) || mine(r.clinician_id) || mine(r.clinician);
      setModalData({
        encounters: (eRes.data || []).filter(byClinician),
        appointments: (pRes.data || []).filter(byClinician)
      });
    } catch (err) {
      console.error('Error loading modal activity data', err);
    } finally {
      setModalLoading(false);
    }
  };

  const closeActivityModal = () => {
    setShowActivityModal(false);
    setModalTab('encounters');
  };

  // Navigate helpers for clickable rows
  const openActivity = (act) => {
    if (!act) return;
    if (act.source === 'encounter') {
      navigate(`/encounter?id=${act.id}`);
    } else if (act.source === 'appointment') {
      navigate(`/appointments?id=${act.id}`);
    }
  };

  const startEdit = () => {
    setEditableUser({ ...user });
    setIsEditing(true);
    setMessage('');
  };

  const cancelEdit = () => {
    setEditableUser({ ...user });
    setIsEditing(false);
    setMessage('');
  };

  const saveProfile = async () => {
    if (!editableUser.name.trim()) {
      setMessage('Name cannot be empty.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const targetTable = (authUser?.role || '').toLowerCase() === 'patient' ? 'users' : 'admins';
      const { error } = await supabase
        .from(targetTable)
        .update({
          name: editableUser.name,
          avatar: editableUser.avatar || null
        })
        .eq('id', authUser.id);

      if (error) throw error;

      setUser(prev => ({
        ...prev,
        name: editableUser.name,
        avatar: editableUser.avatar
      }));

      if (updateUser) {
        updateUser({
          ...authUser,
          name: editableUser.name,
          avatar: editableUser.avatar
        });
      }

      setIsEditing(false);
      setMessage('Profile updated successfully!');
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('Error updating profile.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditableUser(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setMessage('File size too large. Please select an image under 2MB.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setUploading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = event.target.result;
      setEditableUser(prev => ({ ...prev, avatar: base64String }));
      setUploading(false);
      setMessage('Avatar selected successfully!');
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    };
    reader.onerror = () => {
      setMessage('Error reading file.');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const openFileInput = () => {
    const el = document.getElementById('avatarInput');
    if (el) el.click();
  };

  const modalRows = modalData[modalTab] || [];
  const modalItemLabel = modalTab === 'encounters' ? 'encounters' : 'appointments';

  if (loading) return <main className="main"><div className="card">Loading staff profile...</div></main>;

  return (
    <main className="main">
      {message && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 2000,
          padding: '12px 20px',
          borderRadius: 12,
          color: 'var(--text-on-primary)',
          fontWeight: 'var(--font-weight-bold)',
          backgroundColor: messageType === 'error' ? 'var(--danger)' : 'var(--color-emerald)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>{message}</span>
        </div>
      )}

      <div className="page">
        {/* 1. Page Header: Page identity and Edit Profile action */}
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Staff Profile & Account</h1>
            <div className="page-header-subtitle">
              Personal staff details, clinical engagement statistics, and logged operational activity.
            </div>
          </div>

          <div className="page-header-actions">
            {!isEditing ? (
              <button type="button" className="btn" onClick={startEdit}>
                Edit Profile
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn secondary" onClick={cancelEdit}>Cancel</button>
                <button type="button" className="btn" onClick={saveProfile}>Save Changes</button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Clinical engagement, given its own row. It was previously a line
            inside the overview card's metadata list — a statistic buried among
            labels, when it is the most concrete thing on the page. */}
        <div className="profile-kpi-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {[
            { label: 'Encounters recorded', value: stats.encountersCreated, note: 'Clinical notes you have written', Icon: EncountersIcon },
            { label: 'Appointments booked', value: stats.appointmentsScheduled, note: 'Consultations you have scheduled', Icon: CalendarIcon },
          ].map(({ label, value, note, Icon }) => (
            <KpiCard
              key={label}
              title={label}
              value={value}
              description={note}
              Icon={Icon}
            />
          ))}
        </div>

        {/* 3. Main Profile Workspace (Profile Overview + Recent Operational Activity) */}
        <div className="profile-main-grid">
          {/* Left Column: Profile Overview Card */}
          <div className="card" style={{ padding: '22px 20px', textAlign: 'center' }}>
            <div className="card-header" style={{ marginBottom: 16, textAlign: 'left' }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Profile Overview</h3>
                <span className="card-subtitle">Verified staff credentials</span>
              </div>
            </div>

            {/* Avatar Section */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
              <img
                src={isEditing ? (editableUser.avatar || avatarPlaceholder) : (user.avatar || avatarPlaceholder)}
                alt="Profile"
                onClick={isEditing ? openFileInput : undefined}
                style={{
                  width: '92px',
                  height: '92px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2.5px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: isEditing ? 'pointer' : 'default',
                  opacity: uploading ? 0.5 : 1
                }}
              />
              {isEditing && (
                <div style={{ position: 'absolute', bottom: 2, right: 2, background: 'var(--color-primary)', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              )}
            </div>

            {isEditing && (
              <>
                <input
                  id="avatarInput"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-text, #fda4af)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 14, cursor: 'pointer' }} onClick={openFileInput}>
                  Click to change photo
                </div>
              </>
            )}

            {!isEditing ? (
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>{user.name}</h3>
                <div style={{ marginTop: 2, fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-text, #fda4af)' }}>{user.role}</div>
                <div style={{ marginTop: 4, fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>{user.email}</div>

                {/* Structured Metadata Panel */}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-weight-semibold)' }}>Account Status</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-emerald-text)', fontWeight: 'var(--font-weight-bold)' }}>
                      <span className="status-dot" style={{ width: 7, height: 7 }}></span> Active
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-weight-semibold)' }}>Access Level</span>
                    <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>{user.role || 'Staff'}</span>
                  </div>

                  {/* Clinical engagement moved to its own KPI row above — this
                      repeated the same two numbers a second time. */}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'left', marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-muted)', marginBottom: 6 }}>Display Name</label>
                <input
                  type="text"
                  name="name"
                  value={editableUser.name}
                  onChange={handleEditChange}
                  className="input"
                  placeholder="Enter full name"
                  style={{ width: '100%' }}
                />
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-2xs)', marginTop: 6, lineHeight: 1.4 }}>
                  Note: Official email and role changes must be requested through clinic administration.
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Recent Operational Activity */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="card-title" style={{ fontSize: 'var(--font-size-md)' }}>Recent Operational Activity</h3>
                <span className="card-subtitle">Your latest logged actions and consultations</span>
              </div>
              <button type="button" className="btn secondary small" onClick={openActivityModal}>
                View All Activity
              </button>
            </div>

            {recentActivity && recentActivity.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {groupedActivity.map((group) => (
                  <div key={group.label}>
                    <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {group.items.map((act, index) => (
                        <button
                          type="button"
                          /* A stable key: this was `${created_at}-${Math.random()}`,
                             which changed on every render and defeated reconciliation. */
                          key={act.id || `${act.created_at || ''}-${act.detail || act.action || index}`}
                          onClick={() => openActivity(act)}
                          className="profile-activity-row"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 14px',
                            borderRadius: 8,
                            background: 'transparent',
                            border: 'none',
                            borderBottom: index < group.items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            gap: 16,
                            color: 'inherit',
                            font: 'inherit',
                          }}
                          title={act.detail || act.action || ''}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {/* Primary readable action description */}
                            <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {act.detail || act.action || 'Activity'}
                            </div>
                          </div>
                          {/* Timestamp — time only, since the day is now the heading */}
                          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {act.created_at ? new Date(act.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '36px 20px',
                textAlign: 'center',
                background: 'var(--grey-50, #f8fafc)',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)'
              }}>
                <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginBottom: 4 }}>No recent activity</div>
                <div style={{ fontSize: 'var(--font-size-xs)' }}>Recent staff actions and consultations will appear here.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Modal */}
      {showActivityModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--overlay-bg, rgba(0,0,0,0.65))',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 4000,
          padding: 20
        }}>
          <div style={{ width: '96%', maxWidth: 960, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxHeight: '88vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>Activity History Log</h3>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Encounters and appointments recorded under your staff account</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className={`btn small ${modalTab === 'encounters' ? '' : 'secondary'}`} onClick={() => setModalTab('encounters')}>Encounters</button>
                <button className={`btn small ${modalTab === 'appointments' ? '' : 'secondary'}`} onClick={() => setModalTab('appointments')}>Appointments</button>
                <button type="button" className="modal-close-btn" onClick={closeActivityModal} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>
            </div>

            {modalLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading activity records…</div>
            ) : (
              <>
              <div className="table-responsive table-edge-bleed table-edge-bleed--fixed-24">
                {modalTab === 'encounters' && (
                  <table className="table">
                    <thead>
                      <tr><th>Time</th><th>Patient</th><th>Clinician</th><th>Complaint</th></tr>
                    </thead>
                    <tbody>
                      {(modalData.encounters || []).length === 0 ? (
                        <tr className="table-empty-row"><td colSpan={4}>No encounter records yet</td></tr>
                      ) : (modalData.encounters || []).map(row => (
                        <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => { navigate(`/encounter?id=${row.id}`); closeActivityModal(); }}>
                          <td style={{ color: 'var(--text-muted)' }}>{row.created_at ? new Date(row.created_at).toLocaleString() : (row.encounter_date ? new Date(row.encounter_date).toLocaleString() : '')}</td>
                          <td style={{ fontWeight: 'var(--font-weight-bold)' }}>{row.patient_name || row.patient_id}</td>
                          <td>{row.clinician_name || row.clinician}</td>
                          <td style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.chief_complaint || (row.assessment_plan ? row.assessment_plan.split(',')[0] : '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {modalTab === 'appointments' && (
                  <table className="table">
                    <thead>
                      <tr><th>Time</th><th>Patient</th><th>Clinician</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {(modalData.appointments || []).length === 0 ? (
                        <tr className="table-empty-row"><td colSpan={4}>No appointments yet</td></tr>
                      ) : (modalData.appointments || []).map(row => (
                        <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => { navigate(`/appointments?id=${row.id}`); closeActivityModal(); }}>
                          <td style={{ color: 'var(--text-muted)' }}>{row.created_at ? new Date(row.created_at).toLocaleString() : (row.appointment_date ? `${row.appointment_date} ${row.appointment_time || ''}` : '')}</td>
                          <td style={{ fontWeight: 'var(--font-weight-bold)' }}>{row.patient_name || row.patient_id}</td>
                          <td>{row.clinician_name || row.clinician}</td>
                          <td>
                            <span className="badge badge-info">{row.status || 'Scheduled'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <TablePagination
                page={0}
                totalPages={1}
                startIndex={modalRows.length ? 1 : 0}
                endIndex={modalRows.length}
                total={modalRows.length}
                onPageChange={() => {}}
                itemLabel={modalItemLabel}
                showWhenEmpty
              />
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
};

export default MyProfile;

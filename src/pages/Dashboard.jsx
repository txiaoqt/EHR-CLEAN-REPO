// src/pages/Dashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import searchIcon from '../assets/icons/search.png';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { logAudit } from '../utils.js'; // keep if you use it; optional
import { useAuth } from '../AuthContext.jsx'; // <-- ADDED: useAuth (so clinician resolves same as Appointments)

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Dashboard = ({ setSidebarOpen, sidebarOpen }) => {
  const navigate = useNavigate();
  const { user } = useAuth(); // <-- ADDED: get user from AuthContext

  // KPI & data states
  const [currentDateTime, setCurrentDateTime] = useState('');
  const [checkedInToday, setCheckedInToday] = useState(0);
  const [encountersToday, setEncountersToday] = useState(0);
  const [futureScheduledAppointments, setFutureScheduledAppointments] = useState(0);
  const [totalVisitsWeek, setTotalVisitsWeek] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);

  const [recentEncounters, setRecentEncounters] = useState([]);
  const [visitsData, setVisitsData] = useState(null);
  const [complaintsData, setComplaintsData] = useState(null);
  const [diagnosesData, setDiagnosesData] = useState(null);

  const [lowStockItems, setLowStockItems] = useState([]);

  // Alerts modal state
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);

  // weather
  const [weatherState, setWeatherState] = useState({ loading: false, error: null, current: null, daily: null, hourly: null, place: null });
  const [weatherTab, setWeatherTab] = useState('temperature');

  // export modal
  const [showExportSuccessModal, setShowExportSuccessModal] = useState(false);
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);
  const [exportPasswordInput, setExportPasswordInput] = useState('');
  const [exportPasswordError, setExportPasswordError] = useState('');
  const EXPORT_CENSUS_PASSWORD = import.meta.env.VITE_EXPORT_CENSUS_PASSWORD || 'TUPCensus@2026';

  // ---- New appointment modal state (Dashboard) ----
  const [showNewApptModal, setShowNewApptModal] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [newAppt, setNewAppt] = useState({
    patient_id: '',
    appointment_date: '',
    appointment_time: '',
    type: 'Consult',
    clinician_name: '', // will be set by resolveClinicianName()
    status: 'Scheduled'
  });
  const [savingAppt, setSavingAppt] = useState(false);

  // datetime updater
  const updateDateTime = useCallback(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString();
    setCurrentDateTime(`${dateStr} — ${timeStr}`);
  }, []);

  useEffect(() => {
    updateDateTime();
    const id = setInterval(updateDateTime, 1000);
    return () => clearInterval(id);
  }, [updateDateTime]);

  // fetch dashboard data in parallel for high performance
  const fetchDashboardData = useCallback(async () => {
    console.log('[DASHBOARD-DEBUG] fetch started');
    const todayIso = new Date().toISOString().split('T')[0];
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const results = await Promise.allSettled([
        supabase.from('appointments').select('*').eq('appointment_date', todayIso).eq('status', 'Checked-in'),
        supabase.from('encounters').select('*', { head: true, count: 'exact' }).gte('encounter_date', todayIso).lt('encounter_date', tomorrowIso),
        supabase.from('appointments').select('*', { head: true, count: 'exact' }).gt('appointment_date', todayIso).eq('status', 'Scheduled'),
        supabase.from('students').select('*', { head: true, count: 'exact' }),
        supabase.from('encounters').select('*').order('created_at', { ascending: false }).limit(6),
        supabase.from('encounters').select('encounter_date'),
        supabase.from('encounters').select('chief_complaint').not('chief_complaint', 'is', null)
      ]);

      const [
        checkedInRes,
        encTodayRes,
        futureApptsRes,
        patientsCountRes,
        recentEncRes,
        visitsRes,
        complaintsRes
      ] = results.map(r => (r.status === 'fulfilled' ? r.value : { data: null, count: null, error: r.reason }));

      if (checkedInRes?.data) setCheckedInToday(checkedInRes.data.length);
      if (encTodayRes?.count !== undefined && encTodayRes?.count !== null) setEncountersToday(encTodayRes.count);
      if (futureApptsRes?.count !== undefined && futureApptsRes?.count !== null) setFutureScheduledAppointments(futureApptsRes.count);
      if (patientsCountRes?.count !== undefined && patientsCountRes?.count !== null) setTotalPatients(patientsCountRes.count);
      if (recentEncRes?.data) setRecentEncounters(recentEncRes.data);

      console.log('[DASHBOARD-DEBUG] rows received:', {
        students: patientsCountRes?.count,
        encounters: visitsRes?.data?.length,
        recent: recentEncRes?.data?.length,
        checkedIn: checkedInRes?.data?.length
      });

      // Process visits data
      const visits = visitsRes?.data || [];
      const dateCounts = {};
      visits.forEach(enc => {
        if (!enc?.encounter_date) return;
        const date = enc.encounter_date.split('T')[0];
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      });
      const labels = Object.keys(dateCounts).sort();
      setVisitsData({
        labels,
        datasets: [{
          label: 'Visits',
          data: labels.map(l => dateCounts[l]),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75,192,192,0.06)',
          tension: 0.15,
          fill: true
        }]
      });

      // Total visits last week
      const now = new Date();
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        last7.push(d.toISOString().split('T')[0]);
      }
      const weekTotal = last7.reduce((s, d) => s + (dateCounts[d] || 0), 0);
      setTotalVisitsWeek(weekTotal);

      // Process complaints data
      const complaints = complaintsRes?.data || [];
      const compCounts = {};
      complaints.forEach(c => {
        if (c?.chief_complaint) {
          compCounts[c.chief_complaint] = (compCounts[c.chief_complaint] || 0) + 1;
        }
      });
      const top10 = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      setComplaintsData({
        labels: top10.map(([k]) => k),
        datasets: [{
          label: 'Count',
          data: top10.map(([, v]) => v),
          backgroundColor: 'rgba(54,162,235,0.6)',
          borderColor: 'rgba(54,162,235,1)',
          borderWidth: 1
        }]
      });

      // Process diagnoses data
      setDiagnosesData({
        labels: top10.map(([k]) => k),
        datasets: [{
          data: top10.map(([, v]) => v),
          backgroundColor: [
            'rgba(255,99,132,0.6)', 'rgba(54,162,235,0.6)', 'rgba(255,205,86,0.6)', 'rgba(75,192,192,0.6)',
            'rgba(153,102,255,0.6)', 'rgba(255,159,64,0.6)', 'rgba(75,192,192,0.6)', 'rgba(54,162,235,0.6)',
            'rgba(255,205,86,0.6)', 'rgba(255,99,132,0.6)'
          ],
          borderWidth: 1
        }]
      });

      console.log('[DASHBOARD-DEBUG] state updated');
    } catch (err) {
      console.warn('[DASHBOARD-DEBUG] fetch error:', err);
    }
  }, []);

  useEffect(() => {
    console.log('[DASHBOARD-DEBUG] Dashboard mounted');
    fetchDashboardData();
    const handler = () => fetchDashboardData();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
      }
    };
    window.addEventListener('appointmentAdded', handler);
    window.addEventListener('appointmentUpdated', handler);
    window.addEventListener('encounterAdded', handler);
    document.addEventListener('visibilitychange', onVisibility);
    const poll = setInterval(fetchDashboardData, 30000);
    return () => {
      window.removeEventListener('appointmentAdded', handler);
      window.removeEventListener('appointmentUpdated', handler);
      window.removeEventListener('encounterAdded', handler);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(poll);
    };
  }, [fetchDashboardData]);

  // low stock
  useEffect(() => {
    const run = async () => {
      const { data: inventory, error } = await supabase.from('inventory').select('id,item_name,stock_quantity,reorder_level,unit');
      if (!error && inventory) {
        setLowStockItems(inventory.filter(i => Number(i.stock_quantity) <= Number(i.reorder_level)));
      }
    };
    run();
  }, []);

  // search suggestions
  useEffect(() => {
    const run = async () => {
      if (!searchQuery.trim()) { setSearchSuggestions([]); return; }
      const { data } = await supabase.from('students').select('id,name').or(`name.ilike.%${searchQuery}%,id.ilike.%${searchQuery}%`).limit(10);
      setSearchSuggestions(data || []);
    };
    run();
  }, [searchQuery]);

  // patient suggestions for new appointment modal
  useEffect(() => {
    const run = async () => {
      if (!patientSearch) { setPatientSuggestions([]); return; }
      const { data } = await supabase.from('students').select('id,name').or(`name.ilike.%${patientSearch}%,id.ilike.%${patientSearch}%`).limit(10);
      setPatientSuggestions(data || []);
    };
    run();
  }, [patientSearch]);

  // ---------------- weather helpers ----------------
  const weatherCodeToEmoji = (code) => {
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '⛅';
    if (code === 3) return '☁️';
    if ((code >= 45 && code <= 48) || (code >= 51 && code <= 55)) return '🌫️';
    if ((code >= 56 && code <= 57) || (code >= 61 && code <= 65) || (code >= 66 && code <= 67)) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 95) return '⛈️';
    return '⛅';
  };
  const loadWeather = async () => {
    if (!('geolocation' in navigator)) { setWeatherState({ loading:false, error:'Geolocation unavailable', current:null, daily:null, hourly:null, place:null }); return; }
    setWeatherState(s => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&hourly=temperature_2m,precipitation,windgusts_10m&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('bad weather response');
        const json = await res.json();
        setWeatherState({ loading:false, error:null, current: json.current_weather||null, daily: json.daily||null, hourly: json.hourly||null, place: json.timezone||null });
      } catch (err) {
        setWeatherState({ loading:false, error:'Weather unavailable', current:null, daily:null, hourly:null, place:null });
      }
    }, (err) => {
      setWeatherState({ loading:false, error:'Location permission denied', current:null, daily:null, hourly:null, place:null });
    }, { timeout: 10000 });
  };
  useEffect(() => { loadWeather(); }, []);

  const getWeatherSparkline = () => {
    if (!weatherState.hourly) return null;
    const hourly = weatherState.hourly;
    const labels = (hourly.time||[]).slice(0,24).map(t=>{ const d=new Date(t); return d.getHours()===0 ? '12 AM' : (d.getHours()%12===0 ? '12 PM' : `${d.getHours()%12} ${d.getHours()<12?'AM':'PM'}`) });
    let dataPoints = [];
    if (weatherTab === 'temperature') dataPoints = (hourly.temperature_2m||[]).slice(0,24);
    if (weatherTab === 'precipitation') dataPoints = (hourly.precipitation||[]).slice(0,24);
    if (weatherTab === 'wind') dataPoints = (hourly.windgusts_10m||[]).slice(0,24);
    return { labels, datasets:[{ label: weatherTab, data: dataPoints, borderColor:'#f6b21c', backgroundColor:'rgba(246,178,28,0.12)', tension:0.25, fill:true, pointRadius:0 }]};
  };
  const sparkOptions = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ mode:'index', intersect:false } }, scales:{ x:{ display:false }, y:{ display:false } }, elements:{ line:{ borderWidth:2 } } };

  // Pie options to place legend below (we also render a compact custom legend)
  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 8,
          usePointStyle: true
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.label || '';
            const value = ctx.raw ?? '';
            return `${label}: ${value}`;
          }
        }
      }
    }
  };

  // Replace your current exportCensus with this exact function
  const exportCensus = async () => {
    try {
      const { data: encounters } = await supabase
        .from('encounters')
        .select('patient_id, encounter_date, vitals');

      const { data: students } = await supabase
        .from('students')
        .select('id, name');

      const studentMap = {};
      (students || []).forEach(s => studentMap[s.id] = s.name);

      const csvContent = (encounters || []).map(enc => {
        const name = studentMap[enc.patient_id] || enc.patient_id;
        const date = enc.encounter_date ? new Date(enc.encounter_date).toLocaleDateString() : '';
        const vitals = JSON.stringify(enc.vitals || {});
        // escape double quotes inside vitals
        const safeVitals = (`${vitals}`).replace(/"/g, '""');
        return `"${name}","${date}","${safeVitals}"`;
      }).join('\n');

      const csvData = `Name,Date,Vitals\n${csvContent}`;

      // original export call you used earlier:
      if (window.exportCsv) {
        window.exportCsv('census_report.csv', csvData);
        setShowExportSuccessModal(true);
      } else {
        // fallback: create an anchor if window.exportCsv is not present
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'census_report.csv';
        a.click();
        URL.revokeObjectURL(url);
        setShowExportSuccessModal(true);
      }
    } catch (err) {
      console.error('Error exporting census:', err);
      alert('Error exporting census. Please try again.');
    }
  };

  // ---------------- New Appointment modal (Dashboard) ----------------
  // Helper to resolve clinician display name (tries useAuth user first, then supabase auth, then profiles table)
  const resolveClinicianName = async () => {
    try {
      // 1) prefer useAuth user (synchronous)
      if (user) {
        // many apps set user.name; if not, fallback to email
        return user.name || user.full_name || user.email || '';
      }

      // 2) Try Supabase v2 method
      if (supabase.auth && typeof supabase.auth.getUser === 'function') {
        try {
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          const su = userData?.user ?? null;
          if (su) {
            let name = (su.user_metadata && (su.user_metadata.name || su.user_metadata.full_name)) || su.email || '';
            // try profile lookup for nicer name
            try {
              const { data: profile, error: profErr } = await supabase
                .from('profiles')
                .select('full_name, name')
                .eq('id', su.id)
                .single();
              if (!profErr && profile) name = profile.full_name || profile.name || name;
            } catch (e) { /* ignore */ }
            return name;
          }
        } catch (e) {
          // ignore
        }
      }

      // 3) Try older supabase.auth.user() (v1)
      if (supabase.auth && typeof supabase.auth.user === 'function') {
        try {
          const su = supabase.auth.user();
          if (su) {
            const name = (su.user_metadata && (su.user_metadata.name || su.user_metadata.full_name)) || su.email || '';
            try {
              const { data: profile, error: profErr } = await supabase
                .from('profiles')
                .select('full_name, name')
                .eq('id', su.id)
                .single();
              if (!profErr && profile) return profile.full_name || profile.name || name;
            } catch (e) { /* ignore */ }
            return name;
          }
        } catch (e) { /* ignore */ }
      }

      // 4) Local storage fallback (rare)
      try {
        const stored = localStorage.getItem('session') || localStorage.getItem('user') || localStorage.getItem('currentUser');
        if (stored) {
          const parsed = JSON.parse(stored);
          return parsed?.user_metadata?.name || parsed?.name || parsed?.email || '';
        }
      } catch (e) { /* ignore parse errors */ }

      return '';
    } catch (err) {
      console.warn('resolveClinicianName error', err);
      return '';
    }
  };

  // openNewModal: set clinician_name same as Appointments page (prefer useAuth user)
  const openNewModal = async () => {
    try {
      const clinicianName = await resolveClinicianName();
      setNewAppt(p => ({ ...p, clinician_name: clinicianName || '' }));
    } catch (err) {
      console.warn('openNewModal clinician resolution error', err);
    }
    setShowNewApptModal(true);
  };
  const closeNewModal = () => {
    setShowNewApptModal(false);
    setPatientSearch(''); setPatientSuggestions([]); setSelectedName('');
    setNewAppt({ patient_id:'', appointment_date:'', appointment_time:'', type:'Consult', clinician_name: '', status:'Scheduled' });
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
      setSavingAppt(true);
      const { data, error } = await supabase.from('appointments').insert([newAppt]).select();
      if (error) throw error;
      // fire global event so other pages update
      window.dispatchEvent(new Event('appointmentAdded'));
      // audit log if available
      try { await logAudit && logAudit('Appointment Creation', `Added appointment ${newAppt.patient_id} on ${newAppt.appointment_date} ${newAppt.appointment_time}`, user?.name || 'Unknown'); } catch(e){/*ignore*/}

      setSavingAppt(false);
      closeNewModal();
      alert('Appointment saved');
    } catch (err) {
      setSavingAppt(false);
      console.error('Save error:', err);
      alert('Error saving appointment: ' + (err.message || JSON.stringify(err)));
    }
  };

  // small helpers for patient selection inside modal
  const pickPatientSuggestion = (s) => {
    setPatientSearch(`${s.name} (${s.id})`);
    setSelectedName(s.name);
    setNewAppt(prev => ({ ...prev, patient_id: s.id }));
    setPatientSuggestions([]);
  };

  // Handler to open alerts modal
  const openAlertsModal = (e) => {
    e && e.stopPropagation && e.stopPropagation();
    setShowAlertsModal(true);
  };
  const closeAlertsModal = () => setShowAlertsModal(false);

  const confirmExportCensus = async () => {
    const trimmed = (exportPasswordInput || '').trim();
    if (!trimmed) {
      setExportPasswordError('Please enter the export password.');
      return;
    }

    if (trimmed !== EXPORT_CENSUS_PASSWORD) {
      setExportPasswordError('Incorrect export password.');
      return;
    }

    setExportPasswordError('');
    setShowExportPasswordModal(false);
    setExportPasswordInput('');
    await exportCensus();
  };

  const requestExportCensus = async () => {
    if (user?.role !== 'physician') return;
    setExportPasswordInput('');
    setExportPasswordError('');
    setShowExportPasswordModal(true);
  };

  // When clicking a low stock item in the modal or card, navigate to inventory and pass focus
  const goToInventoryItem = (item) => {
    // send state.focus as item id; Inventory can read location.state.focus
    navigate('/inventory', { state: { focus: item.id } });
    setShowAlertsModal(false);
  };

  // ---------------- UI render ----------------
  // smaller square cards: minHeight 170 (removed strict aspectRatio to avoid forced wide boxes)
  const squareCardStyle = {
    minHeight: 170,
    display: 'flex',
    flexDirection: 'column',
    padding: 12,
    boxSizing: 'border-box',
    minWidth: 0,     // prevents overflow within grid cells
  };

  return (
    <main className="main" style={{ padding: 20, minWidth: 0 }}>
      {/* Header card */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: 0.4 }}>Dashboard</h1>
            <div style={{ marginTop: 8, color: 'var(--muted)', fontWeight: 600 }}>{currentDateTime}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="search"
                placeholder="Search patient name or student number..."
                value={searchQuery}
                onChange={(e)=>setSearchQuery(e.target.value)}
                onKeyDown={(e)=>{ if (e.key==='Enter') { const trimmed = searchQuery.trim(); if (trimmed) navigate(`/patients?search=${encodeURIComponent(trimmed)}`); else navigate('/patients'); } }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border)',
                  minWidth: 260,                 // reduced from 320
                  backgroundImage: `url(${searchIcon})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: '12px center',
                  backgroundSize: '16px',
                  paddingLeft: 44
                }}
              />
              {searchSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', maxHeight: '200px', overflowY: 'auto', zIndex: 50, borderRadius: 6, marginTop: 6 }}>
                  {searchSuggestions.map(s => (
                    <div key={s.id} onClick={()=>navigate(`/patient-profile?id=${s.id}`)} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                      {s.name} ({s.id})
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* New Appointment now opens modal directly */}
            <button className="btn" onClick={openNewModal} title="New appointment">New Appointment</button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div className="card" style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Encounters Today</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--muted)"}}>{encountersToday}</div>
        </div>

        <div className="card" style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Appointments Today</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6, color: "var(--muted)" }}>{checkedInToday}</div>
        </div>

        <div className="card" style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Future Scheduled Appointments</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6, color: "var(--muted)" }}>{futureScheduledAppointments}</div>
        </div>

        <div className="card" style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Total Visits Over the Week</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6, color: "var(--muted)" }}>{totalVisitsWeek}</div>
        </div>

        <div className="card" style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Total Patients</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6, color: "var(--muted)" }}>{totalPatients}</div>
        </div>
      </section>

      {/* Main grid */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginTop: 18, alignItems: 'start', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minWidth: 0 }}>
          {/* WEATHER */}
          <div className="card" style={squareCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ margin: 0 }}>Weather</h3>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{weatherState.place || ''}</div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.03)', fontSize: 28 }}>
                  {weatherState.current ? weatherCodeToEmoji(weatherState.current.weathercode) : '⛅'}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>
                  {weatherState.current ? `${Math.round(weatherState.current.temperature)}°C` : '--'}
                </div>
              </div>

              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                <div><strong>Precipitation:</strong> {weatherState.daily && weatherState.daily.precipitation_sum ? `${Math.round((weatherState.daily.precipitation_sum[0] || 0) * 10) / 10} mm` : '—'}</div>
                <div style={{ marginTop: 6 }}><strong>Wind:</strong> {weatherState.current ? `${weatherState.current.windspeed} m/s` : '—'}</div>
                <div style={{ marginTop: 6 }}><strong>Condition:</strong> {weatherState.current ? weatherCodeToEmoji(weatherState.current.weathercode) : '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 8 }}>
              <div onClick={() => setWeatherTab('temperature')} style={{ cursor: 'pointer', paddingBottom: 6, borderBottom: weatherTab === 'temperature' ? '3px solid #f6b21c' : '3px solid transparent', color: weatherTab === 'temperature' ? 'var(--text)' : 'var(--muted)' }}>Temperature</div>
              <div onClick={() => setWeatherTab('precipitation')} style={{ cursor: 'pointer', paddingBottom: 6, borderBottom: weatherTab === 'precipitation' ? '3px solid #f6b21c' : '3px solid transparent', color: weatherTab === 'precipitation' ? 'var(--text)' : 'var(--muted)' }}>Precipitation</div>
              <div onClick={() => setWeatherTab('wind')} style={{ cursor: 'pointer', paddingBottom: 6, borderBottom: weatherTab === 'wind' ? '3px solid #f6b21c' : '3px solid transparent', color: weatherTab === 'wind' ? 'var(--text)' : 'var(--muted)' }}>Wind</div>
            </div>

            <div style={{ height: 120, marginTop: 12, minWidth: 0 }}>
              {weatherState.loading && <div style={{ color: 'var(--muted)' }}>Fetching weather…</div>}
              {!weatherState.loading && weatherState.error && <div style={{ color: 'var(--muted)' }}>{weatherState.error}</div>}
              {!weatherState.loading && !weatherState.error && weatherState.hourly && <Line data={getWeatherSparkline()} options={sparkOptions} />}
            </div>

            <div style={{ marginTop: 8 }}>{weatherState.daily && weatherState.daily.time && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 8 }}>
                {weatherState.daily.time.slice(0,7).map((d,i)=> {
                  const date = new Date(d);
                  const shortDay = date.toLocaleDateString(undefined, { weekday: 'short' });
                  return (
                    <div key={d} style={{ minWidth:68, textAlign:'center', padding:8, borderRadius:8, background:'rgba(0,0,0,0.02)' }}>
                      <div style={{ fontSize:12 }}>{shortDay}</div>
                      <div style={{ fontSize:18, marginTop:6 }}>{weatherCodeToEmoji((weatherState.daily.weathercode||[])[i])}</div>
                      <div style={{ fontSize:12, marginTop:6 }}>{Math.round((weatherState.daily.temperature_2m_max||[])[i]||0)}° / {Math.round((weatherState.daily.temperature_2m_min||[])[i]||0)}°</div>
                    </div>
                  );
                })}
              </div>
            )}</div>
          </div>

          {/* DIAGNOSIS (pie on top, compact legend below) */}
          <div className="card" style={squareCardStyle}>
            <h3 style={{ marginTop: 0 }}>Diagnosis Distribution</h3>

            {/* Chart container: pie on top */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                {diagnosesData ? (
                  <Pie data={diagnosesData} options={pieOptions} />
                ) : (
                  <div style={{ color: 'var(--muted)' }}>No data</div>
                )}
              </div>

              {/* Compact custom legend underneath the pie (shows label + value) */}
              {diagnosesData && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', overflowY: 'auto', maxHeight: 96 }}>
                  {diagnosesData.labels.map((lbl, i) => {
                    const value = (diagnosesData.datasets?.[0]?.data?.[i]) ?? '';
                    const bg = diagnosesData.datasets?.[0]?.backgroundColor?.[i] || 'rgba(0,0,0,0.08)';
                    // we intentionally do not render these extra legend items here to avoid duplication,
                    // but kept structure in case you want to add label items later.
                    return null;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* VISITS */}
          <div className="card" style={squareCardStyle}>
            <h3 style={{ marginTop: 0 }}>Visit Over Time</h3>
            <div style={{ flex: 1, minHeight: 0 }}>
              {visitsData ? <Line data={visitsData} /> : <div style={{ color:'var(--muted)' }}>No data</div>}
            </div>
          </div>

          {/* TOP COMPLAINTS */}
          <div className="card" style={squareCardStyle}>
            <h3 style={{ marginTop: 0 }}>Top 10 Chief Complaints</h3>
            <div style={{ flex: 1, minHeight: 0 }}>
              {complaintsData ? <Bar data={complaintsData} /> : <div style={{ color:'var(--muted)' }}>No data</div>}
            </div>
          </div>
        </div>

        {/* aside */}
        <aside style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Alerts card is clickable: opens the centered modal */}
          <div
            className="card"
            onClick={openAlertsModal}
            style={{ cursor: 'pointer' }}
          >
            <h3 style={{ marginTop:0 }}>Alerts</h3>
            {lowStockItems.length === 0 && <div style={{ color:'var(--muted)' }}>No alerts</div>}
            {lowStockItems.map((it, idx) => (
              <div
                key={idx}
                onClick={(e) => {
                  // prevent outer onClick (which opens modal) from interfering if clicking a specific item;
                  // navigate to inventory focused on this item
                  e.stopPropagation();
                  navigate('/inventory', { state: { focus: it.id } });
                }}
                style={{ color:'var(--muted)', fontSize:15, marginTop: idx>0?8:0, cursor: 'pointer' }}
                title="Go to inventory"
              >
                Low stock: {it.item_name} ({it.stock_quantity} left)
              </div>
            ))}
          </div>

          <div className="card quick">
            <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn" onClick={() => navigate('/patients')}>Register Patient</button>
              <button className="btn" onClick={() => navigate('/encounter')}>New Encounter</button>

              {/* Export Census only available for physicians due to sensitive data */}
              {user?.role === 'physician' && (
                <button className="btn" onClick={requestExportCensus}>Export Census</button>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop:0 }}>Recent Encounters</h3>
            {(recentEncounters||[]).map(enc => (
              <div key={enc.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 6px', borderRadius:8, marginTop:6, background:'rgba(0,0,0,0.01)' }}>
                <div style={{ fontWeight:600 }}>{enc.patient_id}</div>
                <div style={{ color:'var(--muted)', flex:1, marginLeft:12, minWidth:0 }}>{enc.chief_complaint||'N/A'}</div>
                <div style={{ color:'var(--muted)', marginLeft:12 }}>{new Date(enc.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
            {recentEncounters.length===0 && <div style={{ color:'var(--muted)', marginTop:8 }}>No recent encounters</div>}
          </div>
        </aside>
      </section>

      {/* Alerts centered modal (box border at center) */}
      {showAlertsModal && (
        <div
          onClick={closeAlertsModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: '92%',
              borderRadius: 12,
              padding: 18,
              background: 'white',
              border: '3px solid #e74c3c',
              boxShadow: '0 18px 60px rgba(0,0,0,0.28)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Low Stock Alerts</h3>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 6 }}>
              {lowStockItems.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>No low-stock items.</div>
              ) : (
                lowStockItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => goToInventoryItem(item)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: 8,
                      marginBottom: 8,
                      cursor: 'pointer',
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.98), rgba(255,248,248,0.96))',
                      border: '1px solid rgba(231,76,60,0.12)'
                    }}
                    title={`Go to inventory: ${item.item_name}`}
                  >
                    <div style={{ fontWeight: 700 }}>{item.item_name}</div>
                    <div style={{ color: 'var(--muted)' }}>{item.stock_quantity} {item.unit || ''} left</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn secondary" onClick={closeAlertsModal}>Close</button>
              <button
                className="btn"
                onClick={() => {
                  // navigate to inventory page (no specific focus)
                  navigate('/inventory');
                  setShowAlertsModal(false);
                }}
              >
                Go to Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export success */}
      {showExportPasswordModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'white', padding:20, borderRadius:8, maxWidth:420, width:'92%' }}>
            <h3 style={{ marginTop: 0 }}>Export Census Password</h3>
            <p style={{ color: 'var(--muted)' }}>Enter password to export census data.</p>
            <input
              type="password"
              className="input"
              value={exportPasswordInput}
              onChange={(e) => {
                setExportPasswordInput(e.target.value);
                if (exportPasswordError) setExportPasswordError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmExportCensus(); }}
              placeholder="Enter export password"
              autoFocus
            />
            {exportPasswordError && (
              <div style={{ color: '#b42318', marginTop: 8, fontSize: 13 }}>{exportPasswordError}</div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop: 14 }}>
              <button className="btn secondary" onClick={() => setShowExportPasswordModal(false)}>Cancel</button>
              <button className="btn" onClick={confirmExportCensus}>Confirm Export</button>
            </div>
          </div>
        </div>
      )}

      {/* Export success */}
      {showExportSuccessModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'white', padding:20, borderRadius:8, maxWidth:420, textAlign:'center' }}>
            <h3>Census Exported Successfully</h3>
            <p>The census data has been exported.</p>
            <button className="btn" onClick={()=>setShowExportSuccessModal(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ---------- New Appointment Modal (in Dashboard) ---------- */}
      {showNewApptModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1300, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:720, maxWidth:'96%', background:'var(--panel)', borderRadius:12, padding:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ margin:0 }}>New Appointment</h3>
              <button className="btn small secondary" onClick={closeNewModal}>Close</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <input type="text" placeholder="Search patient..." className="input" value={patientSearch} onChange={(e)=>setPatientSearch(e.target.value)} />
                {patientSuggestions.length>0 && (
                  <div style={{ border:'1px solid rgba(0,0,0,0.06)', borderRadius:8, marginTop:6, maxHeight:160, overflowY:'auto', background:'var(--panel)' }}>
                    {patientSuggestions.map(s => (
                      <div key={s.id} style={{ padding:8, cursor:'pointer', borderBottom:'1px solid rgba(0,0,0,0.04)' }} onClick={()=>pickPatientSuggestion(s)}>
                        {s.name} ({s.id})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <input id="appointment_date" type="date" className="input" value={newAppt.appointment_date} onChange={handleNewApptChange} />
                <input id="appointment_time" type="time" className="input" value={newAppt.appointment_time} onChange={handleNewApptChange} />
              </div>

              <select id="type" className="input" value={newAppt.type} onChange={handleNewApptChange}>
                <option>Consult</option>
                <option>Follow-up</option>
              </select>

              <div style={{ padding:8, borderRadius:8, border:'1px solid rgba(0,0,0,0.06)' }}>
                Clinician: <strong>{newAppt.clinician_name || 'Not set'}</strong>
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
              <button className="btn secondary" onClick={closeNewModal}>Cancel</button>
              <button className="btn" onClick={submitNewAppointment} disabled={savingAppt || !newAppt.patient_id || !newAppt.appointment_date || !newAppt.appointment_time}>
                {savingAppt ? 'Saving…' : 'Save Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Dashboard;

// src/pages/Dashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import {
  EncountersIcon,
  CalendarIcon,
  ClockIcon,
  ReportsIcon,
  UsersIcon,
  AlertIcon,
  SearchIcon,
  CloseIcon
} from '../components/icons/Icons.jsx';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
import { logAudit } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';

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

const DONUT_COLORS = [
  '#f43f5e', // Rose
  '#38bdf8', // Sky Blue
  '#fbbf24', // Amber
  '#34d399', // Emerald
  '#818cf8', // Indigo
  '#fb923c', // Orange
  '#2dd4bf', // Teal
  '#a78bfa', // Purple
  '#f472b6', // Pink
  '#94a3b8'  // Slate
];

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();

  const [currentDateTime, setCurrentDateTime] = useState('');
  const [checkedInToday, setCheckedInToday] = useState(0);
  const [encountersToday, setEncountersToday] = useState(0);
  const [futureScheduledAppointments, setFutureScheduledAppointments] = useState(0);
  const [totalVisitsWeek, setTotalVisitsWeek] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  const [todayAppointments, setTodayAppointments] = useState([]);

  const [recentEncounters, setRecentEncounters] = useState([]);
  const [visitsData, setVisitsData] = useState(null);
  const [complaintsData, setComplaintsData] = useState(null);
  const [diagnosesData, setDiagnosesData] = useState(null);
  const [totalComplaintsCount, setTotalComplaintsCount] = useState(0);
  const [topComplaintsList, setTopComplaintsList] = useState([]);

  const [lowStockItems, setLowStockItems] = useState([]);
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);

  const [weatherState, setWeatherState] = useState({ loading: false, error: null, current: null, daily: null, hourly: null, place: null });
  const [weatherTab, setWeatherTab] = useState('temperature');
  const [showWeatherModal, setShowWeatherModal] = useState(false);

  const [showExportSuccessModal, setShowExportSuccessModal] = useState(false);
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);
  const [exportPasswordInput, setExportPasswordInput] = useState('');
  const [exportPasswordError, setExportPasswordError] = useState('');
  const EXPORT_CENSUS_PASSWORD = import.meta.env.VITE_EXPORT_CENSUS_PASSWORD || 'TUPCensus@2026';

  const [showNewApptModal, setShowNewApptModal] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [newAppt, setNewAppt] = useState({
    patient_id: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '09:00',
    reason: 'General Checkup',
    clinician_name: '',
    status: 'Scheduled'
  });
  const [savingAppt, setSavingAppt] = useState(false);

  const updateDateTime = useCallback(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setCurrentDateTime(`${dateStr} • ${timeStr} • Asia/Manila`);
  }, []);

  useEffect(() => {
    updateDateTime();
    const id = setInterval(updateDateTime, 1000);
    return () => clearInterval(id);
  }, [updateDateTime]);

  const fetchDashboardData = useCallback(async () => {
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

      const [checkedInRes, encTodayRes, futureApptsRes, patientsCountRes, recentEncRes, visitsRes, complaintsRes] = results.map(r => (r.status === 'fulfilled' ? r.value : { data: null, count: null }));

      if (checkedInRes?.data) {
        setCheckedInToday(checkedInRes.data.length);
        setTodayAppointments(checkedInRes.data);
      }
      if (encTodayRes?.count !== undefined && encTodayRes?.count !== null) setEncountersToday(encTodayRes.count);
      if (futureApptsRes?.count !== undefined && futureApptsRes?.count !== null) setFutureScheduledAppointments(futureApptsRes.count);
      if (patientsCountRes?.count !== undefined && patientsCountRes?.count !== null) setTotalPatients(patientsCountRes.count);
      if (recentEncRes?.data) setRecentEncounters(recentEncRes.data);

      const visits = visitsRes?.data || [];
      const dateCounts = {};
      visits.forEach(enc => {
        if (!enc?.encounter_date) return;
        const date = enc.encounter_date.split('T')[0];
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      });
      const labels = Object.keys(dateCounts).sort().slice(-7);
      setVisitsData({
        labels: labels.map(l => {
          const d = new Date(l);
          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }),
        datasets: [{
          label: 'Visits',
          data: labels.map(l => dateCounts[l]),
          borderColor: '#c92a2a',
          backgroundColor: 'rgba(201, 42, 42, 0.08)',
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#c92a2a',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      });

      const now = new Date();
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        last7.push(d.toISOString().split('T')[0]);
      }
      const weekTotal = last7.reduce((s, d) => s + (dateCounts[d] || 0), 0);
      setTotalVisitsWeek(weekTotal);

      const complaints = complaintsRes?.data || [];
      setTotalComplaintsCount(complaints.length);
      const compCounts = {};
      complaints.forEach(c => {
        if (c?.chief_complaint) {
          compCounts[c.chief_complaint] = (compCounts[c.chief_complaint] || 0) + 1;
        }
      });
      const top10 = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      setTopComplaintsList(top10.map(([k, v]) => ({ label: k, value: v })));

      setComplaintsData({
        labels: top10.map(([k]) => k),
        datasets: [{
          label: 'Encounters',
          data: top10.map(([, v]) => v),
          backgroundColor: '#c92a2a',
          borderRadius: 4,
          borderSkipped: false
        }]
      });

      setDiagnosesData({
        labels: top10.map(([k]) => k),
        datasets: [{
          data: top10.map(([, v]) => v),
          backgroundColor: DONUT_COLORS.slice(0, top10.length),
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      });
    } catch (err) {
      console.warn('Error fetching dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const poll = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(poll);
  }, [fetchDashboardData]);

  useEffect(() => {
    const run = async () => {
      const { data: inventory, error } = await supabase.from('inventory').select('id,item_name,stock_quantity,reorder_level,unit');
      if (!error && inventory) {
        setLowStockItems(inventory.filter(i => Number(i.stock_quantity) <= Number(i.reorder_level)));
      }
    };
    run();
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!searchQuery.trim()) { setSearchSuggestions([]); return; }
      const { data } = await supabase.from('students').select('id,name').or(`name.ilike.%${searchQuery}%,id.ilike.%${searchQuery}%`).limit(10);
      setSearchSuggestions(data || []);
    };
    run();
  }, [searchQuery]);

  useEffect(() => {
    const run = async () => {
      if (!patientSearch) { setPatientSuggestions([]); return; }
      const { data } = await supabase.from('students').select('id,name').or(`name.ilike.%${patientSearch}%,id.ilike.%${patientSearch}%`).limit(10);
      setPatientSuggestions(data || []);
    };
    run();
  }, [patientSearch]);

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

  const weatherCodeToText = (code) => {
    if (code === 0) return 'Clear Sky';
    if (code === 1 || code === 2) return 'Partly Cloudy';
    if (code === 3) return 'Overcast';
    if (code >= 45 && code <= 48) return 'Foggy';
    if (code >= 51 && code <= 67) return 'Light Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain Showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Partly Cloudy';
  };

  const loadWeather = async () => {
    if (!('geolocation' in navigator)) return;
    setWeatherState(s => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&hourly=temperature_2m,precipitation,windgusts_10m,relativehumidity_2m&timezone=auto`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('bad weather response');
        const json = await res.json();
        setWeatherState({ loading:false, error:null, current: json.current_weather||null, daily: json.daily||null, hourly: json.hourly||null, place: json.timezone||'Asia/Manila' });
      } catch (err) {
        clearTimeout(timeoutId);
        setWeatherState({ loading:false, error:'Weather unavailable', current:null, daily:null, hourly:null, place:null });
      }
    }, () => setWeatherState({ loading:false, error:'Location permission denied', current:null, daily:null, hourly:null, place:'Asia/Manila' }), { timeout: 10000 });
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
    return {
      labels,
      datasets:[{
        label: weatherTab,
        data: dataPoints,
        borderColor: '#c92a2a',
        backgroundColor: 'rgba(201, 42, 42, 0.08)',
        tension: 0.35,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#c92a2a'
      }]
    };
  };
  const sparkOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
      y: { grid: { color: isDark ? '#334155' : 'rgba(0,0,0,0.03)' }, ticks: { font: { size: 11 }, color: '#94a3b8' } }
    },
    elements: { line: { borderWidth: 2 } }
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${totalComplaintsCount > 0 ? ((ctx.raw / totalComplaintsCount) * 100).toFixed(1) : 0}%)`
        }
      }
    }
  };

  const horizontalBarOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: isDark ? '#334155' : 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11.5 }, color: '#94a3b8', stepSize: 2 }, beginAtZero: true },
      y: { grid: { display: false }, ticks: { font: { size: 11.5 }, color: isDark ? '#cbd5e1' : '#475569' } }
    }
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11.5 }, color: '#94a3b8' } },
      y: { grid: { color: isDark ? '#334155' : 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11.5 }, color: '#94a3b8', stepSize: 0.2 }, beginAtZero: true }
    }
  };

  const exportCensus = async () => {
    try {
      const { data: encounters } = await supabase.from('encounters').select('patient_id, encounter_date, vitals');
      const { data: students } = await supabase.from('students').select('id, name');
      const studentMap = {};
      (students || []).forEach(s => studentMap[s.id] = s.name);
      const csvContent = (encounters || []).map(enc => {
        const name = studentMap[enc.patient_id] || enc.patient_id;
        const date = enc.encounter_date ? new Date(enc.encounter_date).toLocaleDateString() : '';
        const vitals = JSON.stringify(enc.vitals || {}).replace(/"/g, '""');
        return `"${name}","${date}","${vitals}"`;
      }).join('\n');
      const csvData = `Name,Date,Vitals\n${csvContent}`;
      if (window.exportCsv) {
        window.exportCsv('census_report.csv', csvData);
        setShowExportSuccessModal(true);
      } else {
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
      alert('Error exporting census.');
    }
  };

  const resolveClinicianName = async () => {
    try {
      if (user) return user.name || user.full_name || user.email || '';
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const su = userData.user;
        let name = (su.user_metadata?.name || su.user_metadata?.full_name) || su.email || '';
        try {
          const { data: profile } = await supabase.from('profiles').select('full_name, name').eq('id', su.id).single();
          if (profile) name = profile.full_name || profile.name || name;
        } catch (e) {}
        return name;
      }
      return '';
    } catch (err) { return ''; }
  };

  const openNewModal = async () => {
    const clinicianName = await resolveClinicianName();
    setNewAppt(p => ({ ...p, clinician_name: clinicianName || '' }));
    setShowNewApptModal(true);
  };

  const closeNewModal = () => {
    setShowNewApptModal(false);
    setNewAppt({ patient_id:'', appointment_date:'', appointment_time:'', type:'Consult', clinician_name: '', status:'Scheduled' });
  };

  const submitNewAppointment = async () => {
    if (!newAppt.patient_id || !newAppt.appointment_date || !newAppt.appointment_time) return;
    setSavingAppt(true);
    const { error } = await supabase.from('appointments').insert([newAppt]);
    if (error) {
      const errMsg = String(error.message || '').toLowerCase();
      if (error.code === '23505' && (errMsg.includes('slot') || errMsg.includes('idx_appointments_one_active_per_slot') || errMsg.includes('check_slot_capacity'))) {
        alert('Failed to save appointment: This time slot is no longer available. Please select another available slot.');
        setSavingAppt(false);
        return;
      }
      if (error.code === '23505' || errMsg.includes('active appointment') || errMsg.includes('duplicate')) {
        alert('Failed to save appointment: This student already has an active (Scheduled or Checked-in) appointment.');
        setSavingAppt(false);
        return;
      }
      alert('Error saving appointment: ' + (error.message || error));
      setSavingAppt(false);
      return;
    }
    window.dispatchEvent(new Event('appointmentAdded'));
    setSavingAppt(false);
    closeNewModal();
  };

  const pickPatientSuggestion = (s) => {
    setPatientSearch(`${s.name} (${s.id})`);
    setNewAppt(prev => ({ ...prev, patient_id: s.id }));
    setPatientSuggestions([]);
  };

  const openAlertsModal = (e) => { e?.stopPropagation?.(); setShowAlertsModal(true); };
  const closeAlertsModal = () => setShowAlertsModal(false);

  const confirmExportCensus = async () => {
    if (exportPasswordInput.trim() !== EXPORT_CENSUS_PASSWORD) {
      setExportPasswordError('Incorrect export password.');
      return;
    }
    setShowExportPasswordModal(false);
    await exportCensus();
  };

  const requestExportCensus = () => { if (user?.role === 'physician') setShowExportPasswordModal(true); };

  const goToInventoryItem = (item) => {
    navigate('/inventory', { state: { focus: item.id } });
    setShowAlertsModal(false);
  };

  return (
    <main className="main">
      <div className="page">
        <div className="dashboard-topbar">
          <div className="dashboard-header-title-block">
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.025em' }}>Dashboard</h1>
            <div className="dashboard-header-meta">
              <span>{currentDateTime}</span>
              <span style={{ color: 'var(--border)' }}>•</span>
              <button
                type="button"
                onClick={() => setShowWeatherModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--grey-100)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, border-color 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--grey-100)'; }}
                title="Click to view detailed weather forecast"
                aria-label="View Weather Forecast Details"
              >
                <span>{weatherState.current ? weatherCodeToEmoji(weatherState.current.weathercode) : '⛅'}</span>
                <span>{weatherState.current ? `${Math.round(weatherState.current.temperature)}°C` : '27°C'} · {weatherState.current ? weatherCodeToText(weatherState.current.weathercode) : 'Light Rain'}</span>
              </button>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <div className="dashboard-search-container">
              <div className="search-pill" style={{ height: 42, width: '100%' }}>
                <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center', marginRight: 8 }}>
                  <SearchIcon size={16} />
                </span>
                <input type="search" placeholder="Search patient, appointment, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ fontSize: 13.5, width: '100%' }} />
              </div>
              {searchSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', maxHeight: '220px', overflowY: 'auto', zIndex: 50, borderRadius: 12, marginTop: 6, boxShadow: 'var(--shadow-lg)' }}>
                  {searchSuggestions.map(s => (
                    <div key={s.id} onClick={() => navigate(`/patient-profile?id=${s.id}`)} style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}>
                      <strong>{s.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({s.id})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn" onClick={openNewModal} style={{ height: 42, padding: '0 20px', fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap' }}>
              New Appointment
            </button>
          </div>
        </div>

        <section className="dashboard-kpis-grid">
          {[
            { title: 'Encounters Today', val: encountersToday, sub: encountersToday === 0 ? 'No encounters today' : `${encountersToday} encounter${encountersToday > 1 ? 's' : ''}`, Icon: EncountersIcon },
            { title: 'Appointments Today', val: checkedInToday, sub: checkedInToday === 0 ? 'No appointments today' : `${checkedInToday} checked-in`, Icon: CalendarIcon },
            { title: 'Future Appointments', val: futureScheduledAppointments, sub: futureScheduledAppointments === 0 ? 'No future appointments' : `${futureScheduledAppointments} scheduled`, Icon: ClockIcon },
            { title: 'Visits This Week', val: totalVisitsWeek, sub: totalVisitsWeek === 0 ? 'No visits this week' : `${totalVisitsWeek} total visits`, Icon: ReportsIcon },
            { title: 'Total Patients', val: totalPatients, sub: 'Registered patients', Icon: UsersIcon }
          ].map((kpi, i) => (
            <div className="kpi-card" key={i} style={{ padding: '16px 18px', minHeight: 98, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div className="kpi-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{kpi.title}</div>
                <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center' }}>
                  <kpi.Icon size={18} />
                </span>
              </div>
              <div className="kpi-value" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, margin: '4px 0 2px', color: 'var(--text)' }}>{kpi.val}</div>
              <div className="kpi-subtitle" style={{ fontSize: 12, color: 'var(--text-light)' }}>{kpi.sub}</div>
            </div>
          ))}
        </section>

        <section className="dashboard-main-grid">
          <div className="dashboard-analytics-grid">
            <div className="card" style={{ padding: '20px 22px', minHeight: 310, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header" style={{ marginBottom: 14 }}>
                  <div>
                    <h3 className="card-title" style={{ fontSize: 17.5 }}>Upcoming Schedule</h3>
                    <span className="card-subtitle" style={{ fontSize: 13 }}>Next scheduled consultations</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/appointments')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--color-primary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    View all →
                  </button>
                </div>

                {todayAppointments.length === 0 ? (
                  <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--grey-100)', borderRadius: 10, border: '1px solid var(--border-subtle)', margin: '8px 0' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No upcoming appointments scheduled</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Check the Appointments page to view the full schedule and active queue.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {todayAppointments.slice(0, 4).map((appt, idx) => (
                      <div key={appt.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--grey-100)', borderRadius: 8, fontSize: 13, gap: 8, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 68, flexShrink: 0 }}>{appt.appointment_time || '09:00 AM'}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{appt.patient_id}</span>
                          <span style={{ color: 'var(--text-light)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.reason || 'Consultation'}</span>
                        </div>
                        <span className="badge badge-info" style={{ fontSize: 11, flexShrink: 0 }}>{appt.status || 'Scheduled'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                <span>Scheduled Consultations</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/appointments')}>
                  Manage Schedule & Queue →
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: '20px 22px', minHeight: 310, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <h3 className="card-title" style={{ fontSize: 17.5 }}>Diagnosis Distribution</h3>
                <span className="card-subtitle" style={{ fontSize: 13 }}>Clinical Assessment Breakdown</span>
              </div>

              <div className="diagnosis-card-body">
                <div className="diagnosis-donut-wrapper">
                  {diagnosesData ? (
                    <>
                      <Doughnut data={diagnosesData} options={donutOptions} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalComplaintsCount}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>Total Encounters</div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>No data</div>
                  )}
                </div>

                <div
                  className="diagnosis-legend-grid"
                  tabIndex={0}
                  role="region"
                  aria-label="Diagnosis distribution list"
                >
                  {topComplaintsList.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text)', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[idx % DONUT_COLORS.length], flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      </div>
                      <span style={{ fontWeight: 700, marginLeft: 6, flexShrink: 0 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '20px 22px', minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <h3 className="card-title" style={{ fontSize: 17.5 }}>Visit Over Time</h3>
                <span className="card-subtitle" style={{ fontSize: 13 }}>Monthly Consult Volume</span>
              </div>
              <div className="dashboard-chart-wrapper">
                {visitsData ? <Line data={visitsData} options={lineChartOptions} /> : <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 75, fontSize: 13 }}>No visit trends available</div>}
              </div>
            </div>

            <div className="card" style={{ padding: '20px 22px', minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <h3 className="card-title" style={{ fontSize: 17.5 }}>Top 10 Chief Complaints</h3>
                <span className="card-subtitle" style={{ fontSize: 13 }}>Most Frequent Cases</span>
              </div>
              <div className="dashboard-chart-wrapper">
                {complaintsData ? <Bar data={complaintsData} options={horizontalBarOptions} /> : <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 75, fontSize: 13 }}>No complaint data</div>}
              </div>
            </div>
          </div>

          <div className="dashboard-operations-column">
            <div className="card" style={{ padding: '18px 20px', cursor: lowStockItems.length > 0 ? 'pointer' : 'default' }} onClick={lowStockItems.length > 0 ? openAlertsModal : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--text-light)', display: 'inline-flex', alignItems: 'center' }}>
                  <AlertIcon size={18} />
                </span>
                <h3 className="card-title" style={{ fontSize: 17.5, margin: 0 }}>Alerts</h3>
              </div>
              {lowStockItems.length === 0 ? (
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>All systems normal</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>No alerts at this time.</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>{lowStockItems.length} Low Stock Alert{lowStockItems.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>Click to review and reorder low inventory items</div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '18px 20px' }}>
              <h3 className="card-title" style={{ fontSize: 17.5, marginBottom: 12 }}>Quick Actions</h3>
              <div className="quick-actions-grid">
                <button className="btn secondary" style={{ justifyContent: 'center', fontSize: 13.5, fontWeight: 600, padding: '10px 12px', minHeight: 42 }} onClick={() => navigate('/patients')}>
                  Register Patient
                </button>
                <button className="btn secondary" style={{ justifyContent: 'center', fontSize: 13.5, fontWeight: 600, padding: '10px 12px', minHeight: 42 }} onClick={() => navigate('/encounter')}>
                  New Encounter
                </button>
                <button className="btn secondary" style={{ justifyContent: 'center', fontSize: 13.5, fontWeight: 600, padding: '10px 12px', minHeight: 42 }} onClick={requestExportCensus}>
                  Export Census
                </button>
                <button className="btn secondary" style={{ justifyContent: 'center', fontSize: 13.5, fontWeight: 600, padding: '10px 12px', minHeight: 42 }} onClick={() => navigate('/reports')}>
                  View Reports
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="card-header" style={{ marginBottom: 10 }}>
                <h3 className="card-title" style={{ fontSize: 17.5 }}>Recent Encounters</h3>
                <span className="card-subtitle" style={{ fontSize: 13 }}>Latest Consults</span>
              </div>
              {recentEncounters.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No recent encounters</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentEncounters.map((enc, idx) => {
                    const timeStr = enc.encounter_date ? new Date(enc.encounter_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: idx < recentEncounters.length - 1 ? '1px solid var(--border-subtle)' : 'none', minWidth: 0, gap: 8 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)', width: 90, flexShrink: 0 }}>{enc.patient_id || 'Unknown'}</span>
                        <span style={{ color: 'var(--text-muted)', flex: 1, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{enc.chief_complaint || 'General Checkup'}</span>
                        <span style={{ color: 'var(--text-light)', fontSize: 11.5, flexShrink: 0 }}>{timeStr}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-light)' }}>
          <div>© {new Date().getFullYear()} TUP Clinic. All rights reserved.</div>
          <div>Staff Portal v1.0.0</div>
        </footer>

        {/* New Appointment Modal */}
        {showNewApptModal && (
          <div style={{ position:'fixed', inset:0, zIndex:1300, background:'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width: 560, maxWidth:'94%', background:'var(--panel)', color:'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>New Appointment</h3>
                <button type="button" className="modal-close-btn" onClick={closeNewModal} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Search Patient (ID or Name)</label>
                <input className="input" placeholder="Type name or student ID..." value={patientSearch} onChange={(e)=>setPatientSearch(e.target.value)} style={{ width: '100%' }} />
                {patientSuggestions.length > 0 && (
                  <div style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                    {patientSuggestions.map(p => (
                      <div key={p.id} onClick={() => pickPatientSuggestion(p)} style={{ padding: '8px 12px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}>
                        <strong>{p.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({p.id})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Date</label>
                  <input id="appointment_date" type="date" className="input" value={newAppt.appointment_date} onChange={(e) => setNewAppt(prev => ({ ...prev, appointment_date: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Time</label>
                  <input id="appointment_time" type="time" className="input" value={newAppt.appointment_time} onChange={(e) => setNewAppt(prev => ({ ...prev, appointment_time: e.target.value }))} style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn secondary" onClick={closeNewModal}>Cancel</button>
                <button className="btn" onClick={submitNewAppointment} disabled={savingAppt || !newAppt.patient_id || !newAppt.appointment_date || !newAppt.appointment_time}>
                  {savingAppt ? 'Saving...' : 'Save Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Password Modal */}
        {showExportPasswordModal && (
          <div style={{ position:'fixed', inset:0, zIndex:1400, background:'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width: 420, maxWidth:'92%', background:'var(--panel)', color:'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Census Export Authorization</h3>
                <button type="button" className="modal-close-btn" onClick={() => { setShowExportPasswordModal(false); setExportPasswordInput(''); setExportPasswordError(''); }} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>Enter staff export password to download the clinic census report.</p>
              <input
                type="password"
                className="input"
                value={exportPasswordInput}
                onChange={(e) => { setExportPasswordInput(e.target.value); if (exportPasswordError) setExportPasswordError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmExportCensus(); }}
                placeholder="Enter password..."
                style={{ width: '100%', marginBottom: 12 }}
                autoFocus
              />
              {exportPasswordError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{exportPasswordError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn secondary" onClick={() => { setShowExportPasswordModal(false); setExportPasswordInput(''); setExportPasswordError(''); }}>Cancel</button>
                <button className="btn" onClick={confirmExportCensus}>Confirm & Export</button>
              </div>
            </div>
          </div>
        )}

        {/* Export Success Modal */}
        {showExportSuccessModal && (
          <div style={{ position:'fixed', inset:0, zIndex:1400, background:'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width: 380, maxWidth:'92%', background:'var(--panel)', color:'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: 'var(--shadow-lg)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 16, right: 16 }}>
                <button type="button" className="modal-close-btn" onClick={() => setShowExportSuccessModal(false)} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>
              <div style={{ fontSize: 32, marginBottom: 8, color: 'var(--color-emerald-text)' }}>✓</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Census Exported</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>The census CSV file has been generated and downloaded successfully.</p>
              <button className="btn" style={{ width: '100%' }} onClick={() => setShowExportSuccessModal(false)}>Done</button>
            </div>
          </div>
        )}

        {/* Low Stock Alerts Modal */}
        {showAlertsModal && (
          <div style={{ position:'fixed', inset:0, zIndex:1400, background:'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width: 500, maxWidth:'94%', background:'var(--panel)', color:'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Low Stock Alert Items</h3>
                <button type="button" className="modal-close-btn" onClick={closeAlertsModal} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>
              {lowStockItems.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>All inventory levels are adequate.</div>
              ) : (
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lowStockItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'var(--color-rose-bg)', border: '1px solid var(--color-rose-border, var(--border))' }}>
                      <div>
                        <strong style={{ fontSize: 13, color: 'var(--text)' }}>{item.item_name}</strong>
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                          Remaining: {item.stock_quantity} {item.unit || 'units'} (Reorder at {item.reorder_level})
                        </div>
                      </div>
                      <button className="btn secondary small" onClick={() => goToInventoryItem(item)}>Restock</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Weather Forecast Modal */}
        {showWeatherModal && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'var(--overlay-bg, rgba(0,0,0,0.65))', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowWeatherModal(false); }}
          >
            <div style={{ width: 680, maxWidth: '94%', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-lg)' }} role="dialog" aria-modal="true" aria-labelledby="weather-modal-title">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 id="weather-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Weather & Meteorological Outlook</h3>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Location: {weatherState.place || 'Asia/Manila'}</span>
                </div>
                <button type="button" className="modal-close-btn" onClick={() => setShowWeatherModal(false)} aria-label="Close weather modal">
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 36 }}>{weatherState.current ? weatherCodeToEmoji(weatherState.current.weathercode) : '⛅'}</div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
                      {weatherState.current ? `${Math.round(weatherState.current.temperature)}°C` : '27°C'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>
                      {weatherState.current ? weatherCodeToText(weatherState.current.weathercode) : 'Light Rain'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 16, rowGap: 4, fontSize: 13, textAlign: 'right' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Precipitation</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{weatherState.daily?.precipitation_sum?.[0] ? `${weatherState.daily.precipitation_sum[0]} mm` : '41.7 mm'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Wind Speed</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{weatherState.current?.windspeed ? `${weatherState.current.windspeed} m/s` : '25.6 m/s'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Weather Status</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{weatherState.current ? weatherCodeToText(weatherState.current.weathercode) : 'Light rain'}</span>
                </div>
              </div>

              {/* 24-Hour Sparkline Chart */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>24-Hour Temperature Forecast</div>
                <div style={{ height: 110, minWidth: 0 }}>
                  {weatherState.hourly && <Line data={getWeatherSparkline()} options={sparkOptions} />}
                </div>
              </div>

              {/* 7-Day Forecast Row */}
              {weatherState.daily && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>7-Day Weather Outlook</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, textAlign: 'center' }}>
                    {(weatherState.daily.time || []).slice(0, 7).map((t, idx) => {
                      const dayName = new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
                      const maxT = Math.round(weatherState.daily.temperature_2m_max?.[idx] || 0);
                      const minT = Math.round(weatherState.daily.temperature_2m_min?.[idx] || 0);
                      const code = weatherState.daily.weathercode?.[idx] || 0;
                      return (
                        <div key={idx} style={{ flex: 1, padding: '8px 4px', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{dayName}</div>
                          <div style={{ fontSize: 18, margin: '4px 0' }}>{weatherCodeToEmoji(code)}</div>
                          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{maxT}° / {minT}°</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Dashboard;

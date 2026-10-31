import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import KpiCard from '../../components/KpiCard.jsx';
import { CalendarIcon, ClockIcon, EncountersIcon, InventoryIcon } from '../../components/icons/Icons.jsx';
import { formatDay, formatTimeLabel, todayIso } from './dentalShared.js';
import './dental.css';

const DentalDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    const today = todayIso();
    const monthStart = `${today.slice(0, 8)}01`;
    Promise.all([
      supabase.from('appointments').select('id, patient_id, patient_name, appointment_time, service_type, clinician_name, status')
        .eq('department', 'Dental Clinic').eq('appointment_date', today).neq('status', 'Cancelled').order('appointment_time'),
      supabase.from('appointments').select('id', { head: true, count: 'exact' })
        .eq('department', 'Dental Clinic').gt('appointment_date', today).eq('status', 'Scheduled'),
      supabase.from('dental_services').select('id, patient_id, service_date, service_rendered, dentist_name')
        .gte('service_date', monthStart).order('service_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('inventory').select('id, item_name, stock_quantity, reorder_level, unit'),
    ]).then(([todayRes, upcomingRes, servicesRes, inventoryRes]) => {
      const services = servicesRes.data || [];
      setData({
        today: todayRes.data || [],
        upcoming: upcomingRes.count || 0,
        servicesThisMonth: services.length,
        consultationsThisMonth: services.filter((s) => /consult/i.test(s.service_rendered)).length,
        recent: services.slice(0, 6),
        lowStock: (inventoryRes.data || []).filter((i) => i.stock_quantity <= i.reorder_level),
        failed: [todayRes, upcomingRes, servicesRes, inventoryRes].some((r) => r.error),
      });
    });
  }, []);

  const first = (user?.name || '').split(' ')[0];
  const waiting = data?.today.filter((a) => a.status === 'Scheduled') || [];

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">{first ? `Good day, ${first}` : 'Dental Clinic'}</h1>
            <div className="page-header-subtitle">{formatDay(todayIso())} · Dental Clinic</div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn" onClick={() => navigate('/consultation-log?new=1')}>Log Consultation</button>
          </div>
        </div>

        {data?.failed && <p className="dental-alert" role="alert">Some figures could not be loaded. Refresh the page to try again.</p>}

        <div className="dental-kpis">
          <KpiCard title="Today’s Appointments" value={data ? data.today.length : '—'} description={data ? `${waiting.length} still to be seen` : 'Loading…'} Icon={ClockIcon} />
          <KpiCard title="Upcoming" value={data ? data.upcoming : '—'} description="Scheduled after today" Icon={CalendarIcon} />
          <KpiCard title="Visits This Month" value={data ? data.servicesThisMonth : '—'} description={data ? `${data.consultationsThisMonth} consultations` : 'Loading…'} Icon={EncountersIcon} />
          <KpiCard title="Low Stock" value={data ? data.lowStock.length : '—'} description="At or below reorder level" Icon={InventoryIcon} />
        </div>

        <div className="dental-two-col">
          <section className="card" style={{ padding: 0 }} aria-labelledby="dash-today">
            <div className="dental-section" style={{ paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 className="dental-section-title" id="dash-today" style={{ margin: 0 }}>Today’s Schedule</h2>
              <button type="button" className="btn secondary small" onClick={() => navigate('/appointments')}>All Appointments</button>
            </div>
            {!data ? <div className="dental-empty" role="status">Loading…</div>
              : data.today.length === 0 ? <div className="dental-empty">No dental appointments today.</div> : (
                <ul className="dental-list">
                  {data.today.map((a) => (
                    <li key={a.id}>
                      <span className="dental-time" style={{ minWidth: 72 }}>{formatTimeLabel(a.appointment_time)}</span>
                      <div className="dental-list-main" style={{ flex: 1 }}>
                        <div className="dental-list-title">{a.patient_name || a.patient_id}</div>
                        <div className="dental-list-sub">{[a.service_type, a.clinician_name].filter(Boolean).join(' · ')}</div>
                      </div>
                      {a.status === 'Scheduled'
                        ? <button type="button" className="btn small" onClick={() => navigate(`/dental-encounter?appointment=${a.id}`)}>Open Encounter</button>
                        : <span className="badge badge-success">{a.status}</span>}
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <div className="dental-stack">
            <section className="card" style={{ padding: 0 }} aria-labelledby="dash-recent">
              <div className="dental-section" style={{ paddingBottom: 8 }}><h2 className="dental-section-title" id="dash-recent" style={{ margin: 0 }}>Recent Visits</h2></div>
              {!data ? <div className="dental-empty" role="status">Loading…</div>
                : data.recent.length === 0 ? <div className="dental-empty">No visits logged this month.</div> : (
                  <ul className="dental-list">
                    {data.recent.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="dental-list-main" onClick={() => navigate(`/dental-record?id=${encodeURIComponent(s.patient_id)}`)}
                          style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                          <div className="dental-list-title">{s.service_rendered}</div>
                          <div className="dental-list-sub">{s.patient_id} · {s.dentist_name}</div>
                        </button>
                        <span className="dental-list-sub" style={{ whiteSpace: 'nowrap' }}>{formatDay(s.service_date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
            {data?.lowStock.length > 0 && (
              <section className="card" style={{ padding: 0 }} aria-labelledby="dash-stock">
                <div className="dental-section" style={{ paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <h2 className="dental-section-title" id="dash-stock" style={{ margin: 0 }}>Low Stock</h2>
                  <button type="button" className="btn secondary small" onClick={() => navigate('/inventory')}>Inventory</button>
                </div>
                <ul className="dental-list">
                  {data.lowStock.map((i) => (
                    <li key={i.id}>
                      <div className="dental-list-main"><div className="dental-list-title">{i.item_name}</div><div className="dental-list-sub">Reorder at {i.reorder_level} {i.unit}</div></div>
                      <span className="badge badge-warning">{i.stock_quantity} {i.unit}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default DentalDashboard;

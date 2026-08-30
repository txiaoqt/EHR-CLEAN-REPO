// src/pages/patient/AppointmentBookingFlow.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons/Icons.jsx';

const SLOT_TIMES = ['09:00-12:00', '13:00-16:00', '16:00-19:00'];
const SLOT_CAPACITY = 1;
const DAILY_PATIENT_LIMIT = SLOT_TIMES.length * SLOT_CAPACITY;
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const SERVICES = {
  'Medical Clinic': ['Consultation', 'Check-up'],
  'Dental Clinic': ['Dental cleaning', 'Tooth extraction/bunot', 'Dental check-up'],
};

const pad = (v) => String(v).padStart(2, '0');
const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addDays = (d, n) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};
const formatLongDate = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const createReferenceCode = (dateKey) => {
  const raw = `${dateKey.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  return `APT-${raw}`;
};

const AppointmentBookingFlow = ({ source = 'portal', kioskMode = false }) => {
  const { user } = useAuth();
  const today = toDateKey(new Date());
  const [appointments, setAppointments] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [form, setForm] = useState({
    department: 'Medical Clinic',
    appointment_type: 'Same-day Appointment',
    appointment_date: today,
    appointment_time: '',
    clinician_name: '',
    service_type: 'Consultation',
    patient_id: user?.patient_id || '',
    patient_name: user?.name || '',
  });

  const loadAppointments = async () => {
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .gte('appointment_date', today)
      .order('appointment_date', { ascending: true });
    setAppointments(data || []);
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data, error } = await supabase
          .from('staff_directory')
          .select('name, role')
          .order('name', { ascending: true });
        if (!error && data && data.length > 0) {
          setStaffList(data);
          return;
        }
      } catch (_) {}

      const { data } = await supabase
        .from('admins')
        .select('name, role')
        .eq('active', true)
        .order('name', { ascending: true });
      setStaffList(data || []);
    };
    loadStaff();
  }, []);

  useEffect(() => {
    if (user?.patient_id && !kioskMode) {
      setForm((p) => ({ ...p, patient_id: user.patient_id, patient_name: user.name || p.patient_name }));
    }
  }, [user?.patient_id, user?.name, kioskMode]);

  useEffect(() => {
    setForm((p) => ({
      ...p,
      appointment_date: p.appointment_type === 'Same-day Appointment' ? today : (p.appointment_date < today ? today : p.appointment_date),
      service_type: SERVICES[p.department][0],
      appointment_time: p.appointment_type === 'Same-day Appointment' && p.appointment_date !== today ? '' : p.appointment_time,
    }));
  }, [form.department, form.appointment_type, today]);

  const visibleStaff = useMemo(() => {
    if (form.department === 'Dental Clinic') {
      return staffList.filter((s) => /dent/i.test(s.name || ''));
    }
    return staffList;
  }, [staffList, form.department]);

  const selectedWeekDay = new Date(`${form.appointment_date}T00:00:00`).getDay();

  const isDateSelectable = (dateKey) => {
    if (form.appointment_type === 'Same-day Appointment') return dateKey === today;
    return dateKey >= today;
  };

  const calendarCells = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const last = endOfMonth(viewMonth);
    const startWeekDay = first.getDay();
    const daysInMonth = last.getDate();
    const cells = [];
    for (let i = 0; i < startWeekDay; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const dayAvailability = useMemo(() => {
    const map = new Map();
    const first = startOfMonth(viewMonth);
    const last = endOfMonth(viewMonth);
    for (let day = 1; day <= last.getDate(); day += 1) {
      const d = new Date(first.getFullYear(), first.getMonth(), day);
      const key = toDateKey(d);
      if (!isDateSelectable(key)) continue;
      const booked = appointments.filter((a) =>
        a.appointment_date === key &&
        a.department === form.department &&
        a.status !== 'Cancelled',
      ).length;
      const dayCapacity = DAILY_PATIENT_LIMIT;
      const available = Math.max(dayCapacity - booked, 0);
      const pct = dayCapacity ? Math.round((available / dayCapacity) * 100) : 0;
      map.set(key, pct);
    }
    return map;
  }, [appointments, form.department, form.appointment_type, today, viewMonth]);

  const availableSlots = useMemo(() => {
    return SLOT_TIMES.filter((time) => {
      const slotBookedCount = appointments.filter((a) =>
        a.appointment_date === form.appointment_date &&
        a.department === form.department &&
        (a.appointment_time || '') === time &&
        a.status !== 'Cancelled',
      ).length;
      const dailyBookedCount = appointments.filter((a) =>
        a.appointment_date === form.appointment_date &&
        a.department === form.department &&
        a.status !== 'Cancelled',
      ).length;
      return dailyBookedCount < DAILY_PATIENT_LIMIT && slotBookedCount < SLOT_CAPACITY;
    });
  }, [appointments, form.appointment_date, form.department]);

  const sameDayHasAvailableSlot = useMemo(() => {
    return SLOT_TIMES.some((time) => {
      const slotBookedCount = appointments.filter((a) =>
        a.appointment_date === today &&
        a.department === form.department &&
        (a.appointment_time || '') === time &&
        a.status !== 'Cancelled',
      ).length;
      return slotBookedCount < SLOT_CAPACITY;
    });
  }, [appointments, form.department, today]);

  const nextAvailableFutureDate = useMemo(() => {
    for (let i = 1; i <= 30; i += 1) {
      const dateKey = toDateKey(addDays(new Date(), i));
      const dayBookedCount = appointments.filter((a) =>
        a.appointment_date === dateKey &&
        a.department === form.department &&
        a.status !== 'Cancelled',
      ).length;
      if (dayBookedCount < DAILY_PATIENT_LIMIT) return dateKey;
    }
    return '';
  }, [appointments, form.department]);

  useEffect(() => {
    if (form.appointment_type === 'Same-day Appointment' && !sameDayHasAvailableSlot) {
      setForm((p) => ({
        ...p,
        appointment_type: 'Future Appointment',
        appointment_date: nextAvailableFutureDate || p.appointment_date,
        appointment_time: '',
      }));
      setNotice(nextAvailableFutureDate
        ? `Same-day slots are full. Switched to next available date (${nextAvailableFutureDate}).`
        : 'Same-day slots are full. Please choose a future appointment date.');
    }
  }, [form.appointment_type, sameDayHasAvailableSlot, nextAvailableFutureDate]);

  const slotRows = useMemo(() => {
    const dailyBookedCount = appointments.filter((a) =>
      a.appointment_date === form.appointment_date &&
      a.department === form.department &&
      a.status !== 'Cancelled',
    ).length;
    const dailyRemaining = Math.max(DAILY_PATIENT_LIMIT - dailyBookedCount, 0);

    return SLOT_TIMES.map((time) => {
      const windowBookedCount = appointments.filter((a) =>
        a.appointment_date === form.appointment_date &&
        a.department === form.department &&
        (a.appointment_time || '') === time &&
        a.status !== 'Cancelled',
      ).length;
      const availableCount = Math.max(SLOT_CAPACITY - windowBookedCount, 0);
      const pct = SLOT_CAPACITY ? Math.round((availableCount / SLOT_CAPACITY) * 100) : 0;
      return { time, availableCount, pct, disabled: dailyRemaining <= 0 || availableCount <= 0, windowBookedCount };
    });
  }, [appointments, form.appointment_date, form.department]);

  const submit = async () => {
    if (!form.patient_id || !form.patient_name || !form.appointment_date || !form.appointment_time || !form.service_type) {
      setNotice('Please complete all required fields (time slot and service).');
      return;
    }
    const dayBookedCount = appointments.filter((a) =>
      a.appointment_date === form.appointment_date &&
      a.department === form.department &&
      a.status !== 'Cancelled',
    ).length;
    if (dayBookedCount >= DAILY_PATIENT_LIMIT) {
      setNotice(`Selected date is fully booked (${DAILY_PATIENT_LIMIT}/${DAILY_PATIENT_LIMIT} patients). Please choose another date.`);
      return;
    }
    const selectedSlotBookedCount = appointments.filter((a) =>
      a.appointment_date === form.appointment_date &&
      a.department === form.department &&
      (a.appointment_time || '') === form.appointment_time &&
      a.status !== 'Cancelled',
    ).length;
    if (selectedSlotBookedCount >= SLOT_CAPACITY) {
      setNotice('Selected timeframe is no longer available. Please select another slot.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      let queueNumber = null;
      let referenceCode = null;
      let status = 'Scheduled';

      if (form.appointment_type === 'Same-day Appointment') {
        const sameDayRows = appointments.filter((a) =>
          a.appointment_date === form.appointment_date &&
          a.department === form.department &&
          a.appointment_type === 'Same-day Appointment' &&
          typeof a.queue_number === 'number',
        );
        const maxQueue = sameDayRows.reduce((m, a) => Math.max(m, a.queue_number || 0), 0);
        queueNumber = maxQueue + 1;
        status = 'Checked-in';
      } else {
        referenceCode = createReferenceCode(form.appointment_date);
      }

      const payload = {
        patient_id: form.patient_id.trim(),
        patient_name: form.patient_name.trim(),
        clinician_name: form.clinician_name || 'To be assigned',
        appointment_date: form.appointment_date,
        appointment_time: form.appointment_time,
        type: form.department === 'Dental Clinic' ? 'Follow-up' : 'Consult',
        source,
        department: form.department,
        appointment_type: form.appointment_type,
        service_type: form.service_type,
        queue_number: queueNumber,
        reference_code: referenceCode,
        status,
      };

      const { error } = await supabase.from('appointments').insert([payload]);
      if (error) throw error;

      setNotice(
        form.appointment_type === 'Same-day Appointment'
          ? `Appointment reserved! Queue Number: #${queueNumber}. Please proceed to the clinic waiting area.`
          : `Appointment confirmed! Reference Code: ${referenceCode}.`,
      );
      setForm((p) => ({ ...p, appointment_time: '' }));
      await loadAppointments();
    } catch (e) {
      console.error(e);
      setNotice(`Booking failed: ${e.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (notice) setNoticeOpen(true);
  }, [notice]);

  return (
    <main className="main">
      <section className="page patient-schedule-page" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>
            {kioskMode ? 'Clinic Kiosk Booking' : 'Schedule'}
          </h2>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
            Manage your appointments and available clinic schedules.
          </div>
        </div>

        <div className="card booking-flow-card" style={{ padding: 24, border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Department & Appointment Mode Segmented Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                  Select Clinic Department
                </label>
                <div style={{ display: 'flex', background: 'var(--bg, #f1f5f9)', padding: 4, borderRadius: 10, gap: 4, flexWrap: 'wrap' }}>
                  {['Medical Clinic', 'Dental Clinic'].map((dept) => {
                    const active = form.department === dept;
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, department: dept }))}
                        style={{
                          flex: 1,
                          minWidth: 120,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: active ? '1px solid var(--border)' : '1px solid transparent',
                          background: active ? '#ffffff' : 'transparent',
                          color: active ? 'var(--primary, #8b0000)' : 'var(--muted)',
                          fontWeight: active ? 700 : 500,
                          fontSize: 14,
                          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                  Appointment Mode
                </label>
                <div style={{ display: 'flex', background: 'var(--bg, #f1f5f9)', padding: 4, borderRadius: 10, gap: 4, flexWrap: 'wrap' }}>
                  {['Same-day Appointment', 'Future Appointment'].map((kind) => {
                    const active = form.appointment_type === kind;
                    const disabled = kind === 'Same-day Appointment' && !sameDayHasAvailableSlot;
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={disabled}
                        onClick={() => setForm((p) => ({ ...p, appointment_type: kind }))}
                        style={{
                          flex: 1,
                          minWidth: 130,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: active ? '1px solid var(--border)' : '1px solid transparent',
                          background: active ? '#ffffff' : 'transparent',
                          color: active ? 'var(--primary, #8b0000)' : 'var(--muted)',
                          fontWeight: active ? 700 : 500,
                          fontSize: 14,
                          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.45 : 1,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {kind}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {!sameDayHasAvailableSlot && (
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>
                Same-day slots are currently full for {form.department}. Please select a date for a Future Appointment below.
              </div>
            )}

            {/* Calendar & Available Time Slots Grid */}
            <div className="booking-two-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20 }}>
              {/* Calendar Card */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--panel)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <button
                    className="btn secondary small"
                    type="button"
                    style={{ padding: '6px 10px' }}
                    onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  >
                    <ChevronLeftIcon size={14} />
                  </button>
                  <strong style={{ fontSize: 16, color: 'var(--text)' }}>
                    {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                  </strong>
                  <button
                    className="btn secondary small"
                    type="button"
                    style={{ padding: '6px 10px' }}
                    onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  >
                    <ChevronRightIcon size={14} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
                  {DAYS_SHORT.map((day, i) => (
                    <div
                      key={day}
                      style={{
                        textAlign: 'center',
                        padding: '4px 0',
                        fontWeight: 700,
                        fontSize: 12,
                        color: i === selectedWeekDay ? 'var(--primary, #8b0000)' : 'var(--muted)',
                      }}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {calendarCells.map((cell, idx) => {
                    if (!cell) {
                      return <div key={`empty-${idx}`} style={{ height: 50, borderRadius: 6, background: 'var(--bg, #f8fafc)' }} />;
                    }
                    const key = toDateKey(cell);
                    const selected = key === form.appointment_date;
                    const selectable = isDateSelectable(key);
                    const pct = dayAvailability.get(key);

                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!selectable}
                        onClick={() => {
                          setForm((p) => ({ ...p, appointment_date: key, appointment_time: '' }));
                          setNotice('');
                        }}
                        style={{
                          height: 50,
                          borderRadius: 6,
                          border: selected
                            ? '2px solid var(--primary, #8b0000)'
                            : '1px solid var(--border)',
                          background: selected
                            ? 'rgba(140,21,21,0.08)'
                            : selectable
                            ? '#ffffff'
                            : 'var(--bg, #f8fafc)',
                          color: selected
                            ? 'var(--primary, #8b0000)'
                            : selectable
                            ? 'var(--text)'
                            : 'var(--muted)',
                          opacity: selectable ? 1 : 0.4,
                          cursor: selectable ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 2,
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        <div style={{ fontWeight: selected ? 800 : 600, fontSize: 13 }}>{cell.getDate()}</div>
                        {typeof pct === 'number' && (
                          <div style={{ fontSize: 10, color: pct === 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: 500 }}>
                            {pct}% free
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slots Container */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                  Selected Date: {formatLongDate(form.appointment_date)}
                </div>

                {/* Desktop/Tablet Table View (>= 768px) */}
                <div className="patient-slots-table-view" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    <div style={{ padding: '10px 14px' }}>Time Slot</div>
                    <div style={{ padding: '10px 14px' }}>Capacity</div>
                    <div style={{ padding: '10px 14px' }}>Availability</div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {slotRows.map((row) => {
                      const selected = form.appointment_time === row.time;
                      const isAvailable = availableSlots.includes(row.time) && !row.disabled;

                      return (
                        <div
                          key={row.time}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.4fr 1fr 1fr',
                            borderBottom: '1px solid var(--border)',
                            alignItems: 'center',
                            background: selected ? 'var(--primary-light, rgba(140,21,21,0.08))' : 'var(--panel)',
                          }}
                        >
                          <div style={{ padding: '8px 12px' }}>
                            <button
                              type="button"
                              disabled={!isAvailable}
                              className={`btn small ${selected ? 'primary' : 'secondary'}`}
                              onClick={() => setForm((p) => ({ ...p, appointment_time: row.time }))}
                              style={{
                                width: '100%',
                                justifyContent: 'center',
                                fontWeight: selected ? 700 : 500,
                                fontSize: 13,
                              }}
                            >
                              {row.time}
                            </button>
                          </div>
                          <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>
                            {row.availableCount} of {SLOT_CAPACITY} slot
                          </div>
                          <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: row.pct > 0 ? '#16a34a' : 'var(--danger)' }}>
                            {row.pct}% Free
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Cards View (< 768px) */}
                <div className="patient-slots-cards-view" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {slotRows.map((row) => {
                    const selected = form.appointment_time === row.time;
                    const isAvailable = availableSlots.includes(row.time) && !row.disabled;

                    return (
                      <div
                        key={row.time}
                        style={{
                          background: selected ? 'rgba(140,21,21,0.04)' : 'var(--bg, #f8fafc)',
                          border: selected ? '2px solid var(--primary, #8b0000)' : '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: 14, color: 'var(--text)' }}>{row.time}</strong>
                          <span style={{ fontSize: 12, fontWeight: 700, color: row.pct > 0 ? '#16a34a' : 'var(--danger)' }}>
                            {row.pct}% Free
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {row.availableCount} of {SLOT_CAPACITY} slot available
                        </div>
                        <button
                          type="button"
                          disabled={!isAvailable}
                          className={`btn small ${selected ? 'primary' : 'secondary'}`}
                          onClick={() => setForm((p) => ({ ...p, appointment_time: row.time }))}
                          style={{
                            width: '100%',
                            justifyContent: 'center',
                            fontWeight: selected ? 700 : 500,
                            fontSize: 13,
                          }}
                        >
                          {selected ? 'Selected Slot' : isAvailable ? 'Select Slot' : 'Slot Full'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Clinician & Service Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Preferred Attending Clinician
                </label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={form.clinician_name}
                  onChange={(e) => setForm((p) => ({ ...p, clinician_name: e.target.value }))}
                >
                  <option value="">Any available medical personnel</option>
                  {visibleStaff.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Service Type
                </label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={form.service_type}
                  onChange={(e) => setForm((p) => ({ ...p, service_type: e.target.value }))}
                >
                  {SERVICES[form.department].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Student ID
                </label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Student ID"
                  value={form.patient_id}
                  onChange={(e) => setForm((p) => ({ ...p, patient_id: e.target.value }))}
                  disabled={!kioskMode}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Patient Full Name
                </label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Full Name"
                  value={form.patient_name}
                  onChange={(e) => setForm((p) => ({ ...p, patient_name: e.target.value }))}
                  disabled={!kioskMode && !!user?.name}
                />
              </div>
            </div>

            {/* Review Summary Card */}
            <div style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Booking Summary: {form.department} • {form.appointment_type}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                Schedule: <strong>{form.appointment_date}</strong> {form.appointment_time ? `at ${form.appointment_time}` : '(Please select a time slot above)'} • Service: {form.service_type || 'Consultation'} • Clinician: {form.clinician_name || 'Any available'}
              </div>
            </div>

            {/* Submit Action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
              <button
                type="button"
                className="btn primary"
                onClick={submit}
                disabled={saving || !form.appointment_time}
                style={{ padding: '10px 24px', fontSize: 15 }}
              >
                {saving ? 'Submitting...' : 'Confirm & Book Appointment'}
              </button>
            </div>
          </div>
        </div>

        {/* Notice Dialog Modal */}
        {noticeOpen && (
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
            onClick={() => setNoticeOpen(false)}
          >
            <div
              style={{
                width: 'min(92vw, 480px)',
                background: 'var(--panel, #ffffff)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                padding: 24,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('unable') ? 'Booking Notice' : 'Appointment Confirmed'}
              </h3>
              <div style={{ color: notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('unable') ? 'var(--danger)' : 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>
                {notice}
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn secondary" onClick={() => setNoticeOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default AppointmentBookingFlow;

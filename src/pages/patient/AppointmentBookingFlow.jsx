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

// Asia/Manila timezone-aware date & time helpers
const getManilaToday = () => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch (_) {
    return toDateKey(new Date());
  }
};

const getManilaTime = () => {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(new Date());
  } catch (_) {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
};

const getSlotEndTime = (slotTimeStr) => {
  if (!slotTimeStr) return '23:59:59';
  if (slotTimeStr.includes('-')) {
    const parts = slotTimeStr.split('-');
    return parts[1].trim();
  }
  return slotTimeStr.trim();
};

const isSlotExpiredForDate = (dateKey, slotTimeStr, manilaToday, manilaTime) => {
  if (dateKey !== manilaToday) return false;
  const endTime = getSlotEndTime(slotTimeStr);
  const normEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;
  const normCurrentTime = manilaTime.length === 5 ? `${manilaTime}:00` : manilaTime;
  return normCurrentTime >= normEndTime;
};

const getManilaTomorrow = (baseDateStr) => {
  const base = baseDateStr || getManilaToday();
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
};

const createReferenceCode = (dateKey) => {
  const raw = `${dateKey.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  return `APT-${raw}`;
};

const AppointmentBookingFlow = ({ source = 'portal', kioskMode = false }) => {
  const { user } = useAuth();
  const [today, setToday] = useState(() => getManilaToday());
  const [currentTime, setCurrentTime] = useState(() => getManilaTime());
  const [appointments, setAppointments] = useState([]);
  const [slotOccupancy, setSlotOccupancy] = useState(new Map());
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [loadingActiveAppt, setLoadingActiveAppt] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [form, setForm] = useState(() => {
    const initialToday = getManilaToday();
    return {
      department: 'Medical Clinic',
      appointment_type: 'Same-day Appointment',
      appointment_date: initialToday,
      appointment_time: '',
      clinician_name: '',
      service_type: 'Consultation',
      patient_id: user?.patient_id || '',
      patient_name: user?.name || '',
    };
  });

  const loadActiveAppointment = async (patientId) => {
    if (!patientId) {
      setActiveAppointment(null);
      setLoadingActiveAppt(false);
      return null;
    }
    setLoadingActiveAppt(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patientId.trim())
        .in('status', ['Scheduled', 'Checked-in'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setActiveAppointment(data[0]);
        return data[0];
      } else {
        setActiveAppointment(null);
        return null;
      }
    } catch (err) {
      console.warn('Error loading active appointment:', err);
      setActiveAppointment(null);
      return null;
    } finally {
      setLoadingActiveAppt(false);
    }
  };

  const loadAppointments = async () => {
    setAvailabilityLoading(true);
    try {
      // 1. Fetch global slot occupancy across all students via secure RPC (privacy-preserving, works with RLS)
      const maxDate = toDateKey(addMonths(new Date(), 3));
      const { data: occupancyRows, error: rpcErr } = await supabase.rpc('get_slot_occupancy', {
        p_start_date: today,
        p_end_date: maxDate,
      });

      const map = new Map();
      if (!rpcErr && Array.isArray(occupancyRows)) {
        occupancyRows.forEach((row) => {
          const dept = row.department || 'Medical Clinic';
          const key = `${dept}|${row.appointment_date}|${row.appointment_time}`;
          map.set(key, Number(row.occupied_count || 0));
        });
        setSlotOccupancy(map);
        setAvailabilityError(false);
      } else {
        // Fallback: direct select if RPC is unavailable or user has staff clearance
        const { data: directRows, error: directErr } = await supabase
          .from('appointments')
          .select('department, appointment_date, appointment_time, status')
          .gte('appointment_date', today)
          .in('status', ['Scheduled', 'Checked-in']);

        if (!directErr && directRows) {
          directRows.forEach((row) => {
            const dept = row.department || 'Medical Clinic';
            const key = `${dept}|${row.appointment_date}|${row.appointment_time}`;
            map.set(key, (map.get(key) || 0) + 1);
          });
          setSlotOccupancy(map);
          setAvailabilityError(false);
        } else {
          console.warn('Slot availability query failed:', rpcErr || directErr);
          setAvailabilityError(true);
        }
      }

      // 2. Fetch student's own appointments
      const { data: userAppts } = await supabase
        .from('appointments')
        .select('*')
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true });
      setAppointments(userAppts || []);

      if (form.patient_id) {
        await loadActiveAppointment(form.patient_id);
      }
    } catch (err) {
      console.warn('loadAppointments error:', err);
      setAvailabilityError(true);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  // Lifecycle synchronization triggers: initial load, focus, visibility, and Realtime subscription
  useEffect(() => {
    const syncTodayAndAvailability = () => {
      const currentManila = getManilaToday();
      const currentMTime = getManilaTime();
      setToday((prev) => (prev !== currentManila ? currentManila : prev));
      setCurrentTime(currentMTime);
      loadAppointments();
    };

    syncTodayAndAvailability();

    const handleFocus = () => {
      syncTodayAndAvailability();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        syncTodayAndAvailability();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    // Periodic clock and midnight rollover check (every 10s for live time updates)
    const timer = setInterval(() => {
      const currentManila = getManilaToday();
      const currentMTime = getManilaTime();
      setToday((prev) => {
        if (prev !== currentManila) {
          loadAppointments();
          return currentManila;
        }
        return prev;
      });
      setCurrentTime((prev) => (prev !== currentMTime ? currentMTime : prev));
    }, 10000);

    // Supabase Realtime channel subscription for instant multi-student updates
    const channel = supabase
      .channel('public:appointments:slot-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          loadAppointments();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [today]);

  useEffect(() => {
    if (form.patient_id) {
      loadActiveAppointment(form.patient_id);
    }
  }, [form.patient_id]);

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
      } catch (_) { }

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

  const visibleStaff = useMemo(() => {
    if (form.department === 'Dental Clinic') {
      return staffList.filter((s) => /dent/i.test(s.name || ''));
    }
    return staffList;
  }, [staffList, form.department]);

  const selectedWeekDay = new Date(`${form.appointment_date}T00:00:00`).getDay();

  const isDateSelectable = (dateKey) => {
    if (form.appointment_type === 'Same-day Appointment') {
      return dateKey === today;
    }
    // Future Appointment: must be strictly greater than today (tomorrow onward in Asia/Manila)
    return dateKey > today;
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

      if (availabilityError) {
        map.set(key, 0);
        continue;
      }

      let availableCount = 0;
      SLOT_TIMES.forEach((time) => {
        const slotKey = `${form.department}|${key}|${time}`;
        const slotBooked = slotOccupancy.get(slotKey) || 0;
        const isExpired = isSlotExpiredForDate(key, time, today, currentTime);
        if (!isExpired && slotBooked < SLOT_CAPACITY) {
          availableCount += (SLOT_CAPACITY - slotBooked);
        }
      });

      const dayCapacity = DAILY_PATIENT_LIMIT;
      const pct = dayCapacity ? Math.round((availableCount / dayCapacity) * 100) : 0;
      map.set(key, pct);
    }
    return map;
  }, [slotOccupancy, availabilityError, form.department, form.appointment_type, today, currentTime, viewMonth]);

  const availableSlots = useMemo(() => {
    if (availabilityError) return [];

    let dailyBooked = 0;
    SLOT_TIMES.forEach((time) => {
      const slotKey = `${form.department}|${form.appointment_date}|${time}`;
      dailyBooked += (slotOccupancy.get(slotKey) || 0);
    });

    return SLOT_TIMES.filter((time) => {
      const slotKey = `${form.department}|${form.appointment_date}|${time}`;
      const slotBooked = slotOccupancy.get(slotKey) || 0;
      const isExpired = isSlotExpiredForDate(form.appointment_date, time, today, currentTime);
      return !isExpired && dailyBooked < DAILY_PATIENT_LIMIT && slotBooked < SLOT_CAPACITY;
    });
  }, [slotOccupancy, availabilityError, form.appointment_date, form.department, today, currentTime]);

  const sameDayHasAvailableSlot = useMemo(() => {
    if (availabilityError) return false;

    return SLOT_TIMES.some((time) => {
      const slotKey = `${form.department}|${today}|${time}`;
      const slotBooked = slotOccupancy.get(slotKey) || 0;
      const isExpired = isSlotExpiredForDate(today, time, today, currentTime);
      return !isExpired && slotBooked < SLOT_CAPACITY;
    });
  }, [slotOccupancy, availabilityError, form.department, today, currentTime]);

  const nextAvailableFutureDate = useMemo(() => {
    if (availabilityError) return '';

    for (let i = 1; i <= 30; i += 1) {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() + i);
      const dateKey = toDateKey(d);
      let dayBooked = 0;
      SLOT_TIMES.forEach((time) => {
        const slotKey = `${form.department}|${dateKey}|${time}`;
        dayBooked += (slotOccupancy.get(slotKey) || 0);
      });
      if (dayBooked < DAILY_PATIENT_LIMIT) return dateKey;
    }
    return '';
  }, [slotOccupancy, availabilityError, form.department, today]);

  const slotRows = useMemo(() => {
    let dailyBooked = 0;
    SLOT_TIMES.forEach((time) => {
      const slotKey = `${form.department}|${form.appointment_date}|${time}`;
      dailyBooked += (slotOccupancy.get(slotKey) || 0);
    });
    const dailyRemaining = Math.max(DAILY_PATIENT_LIMIT - dailyBooked, 0);

    return SLOT_TIMES.map((time) => {
      const slotKey = `${form.department}|${form.appointment_date}|${time}`;
      const isExpired = isSlotExpiredForDate(form.appointment_date, time, today, currentTime);
      const windowBookedCount = availabilityError ? SLOT_CAPACITY : (slotOccupancy.get(slotKey) || 0);
      const availableCount = isExpired ? 0 : Math.max(SLOT_CAPACITY - windowBookedCount, 0);
      const pct = isExpired ? 0 : (SLOT_CAPACITY ? Math.round((availableCount / SLOT_CAPACITY) * 100) : 0);
      return {
        time,
        availableCount,
        pct,
        isExpired,
        disabled: availabilityError || isExpired || dailyRemaining <= 0 || availableCount <= 0,
        windowBookedCount,
      };
    });
  }, [slotOccupancy, availabilityError, form.appointment_date, form.department, today, currentTime]);

  // Mode switching and date normalization (Same-day -> Today only; Future -> Tomorrow or later)
  useEffect(() => {
    setForm((p) => {
      let newDate = p.appointment_date;
      let newTime = p.appointment_time;

      if (p.appointment_type === 'Same-day Appointment') {
        newDate = today;
        if (p.appointment_date !== today) {
          newTime = '';
        }
      } else if (p.appointment_type === 'Future Appointment') {
        if (p.appointment_date <= today) {
          newDate = nextAvailableFutureDate || getManilaTomorrow(today);
          newTime = '';
        }
      }

      return {
        ...p,
        appointment_date: newDate,
        appointment_time: newTime,
        service_type: SERVICES[p.department][0],
      };
    });
  }, [form.department, form.appointment_type, today, nextAvailableFutureDate]);

  // Deselect currently selected time slot if it becomes occupied or expires
  useEffect(() => {
    if (form.appointment_time && form.appointment_date && form.department) {
      const key = `${form.department}|${form.appointment_date}|${form.appointment_time}`;
      const occupied = slotOccupancy.get(key) || 0;
      const isExpired = isSlotExpiredForDate(form.appointment_date, form.appointment_time, today, currentTime);
      if (occupied >= SLOT_CAPACITY || isExpired) {
        setForm((p) => ({ ...p, appointment_time: '' }));
      }
    }
  }, [slotOccupancy, form.department, form.appointment_date, form.appointment_time, today, currentTime]);

  useEffect(() => {
    if (form.appointment_type === 'Same-day Appointment' && !sameDayHasAvailableSlot && !availabilityLoading) {
      setForm((p) => ({
        ...p,
        appointment_type: 'Future Appointment',
        appointment_date: nextAvailableFutureDate || getManilaTomorrow(today),
        appointment_time: '',
      }));
      setNotice(nextAvailableFutureDate
        ? `Same-day slots are full or have ended. Switched to next available date (${nextAvailableFutureDate}).`
        : 'Same-day slots are full or have ended. Please choose a future appointment date.');
    }
  }, [form.appointment_type, sameDayHasAvailableSlot, nextAvailableFutureDate, availabilityLoading, today]);

  const submit = async () => {
    if (!form.patient_id || !form.patient_name || !form.appointment_date || !form.appointment_time || !form.service_type) {
      setNotice('Please complete all required fields (time slot and service).');
      return;
    }

    // Validate Same-day vs Future date rules relative to current Asia/Manila date & time
    const currentManilaToday = getManilaToday();
    const currentManilaTime = getManilaTime();

    if (form.appointment_type === 'Same-day Appointment') {
      if (form.appointment_date !== currentManilaToday) {
        setNotice('Same-day appointments are only available for today.');
        return;
      }
      if (isSlotExpiredForDate(form.appointment_date, form.appointment_time, currentManilaToday, currentManilaTime)) {
        setNotice('This time slot has already ended. Please select another available slot.');
        return;
      }
    }
    if (form.appointment_type === 'Future Appointment' && form.appointment_date <= currentManilaToday) {
      setNotice('Future appointments must be scheduled for tomorrow or a later date.');
      return;
    }

    // Level 1: Client state guard
    if (activeAppointment) {
      setNotice('You already have an active appointment. Please complete or cancel your current appointment before booking another.');
      return;
    }

    setSaving(true);
    setNotice('');

    try {
      // Level 2: Authoritative pre-insert database verification (guards against multi-tab stale state)
      const { data: activeRows, error: activeErr } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, department, service_type, status, queue_number, reference_code')
        .eq('patient_id', form.patient_id.trim())
        .in('status', ['Scheduled', 'Checked-in'])
        .limit(1);

      if (!activeErr && activeRows && activeRows.length > 0) {
        setActiveAppointment(activeRows[0]);
        setNotice('You already have an active appointment. Please complete or cancel your current appointment before booking another.');
        setSaving(false);
        return;
      }

      // Level 2b: Re-verify slot capacity from server to guard against stale local client state
      const { data: latestOccupancy } = await supabase.rpc('get_slot_occupancy', {
        p_start_date: form.appointment_date,
        p_end_date: form.appointment_date,
      });

      let currentSlotOccupied = false;
      if (Array.isArray(latestOccupancy)) {
        const match = latestOccupancy.find(
          (r) =>
            (r.department || 'Medical Clinic') === form.department &&
            r.appointment_date === form.appointment_date &&
            r.appointment_time === form.appointment_time
        );
        if (match && Number(match.occupied_count || 0) >= SLOT_CAPACITY) {
          currentSlotOccupied = true;
        }
      } else {
        // Fallback check if RPC returned null
        const { data: slotOccupants } = await supabase
          .from('appointments')
          .select('id')
          .eq('department', form.department)
          .eq('appointment_date', form.appointment_date)
          .eq('appointment_time', form.appointment_time)
          .in('status', ['Scheduled', 'Checked-in'])
          .limit(1);
        if (slotOccupants && slotOccupants.length >= SLOT_CAPACITY) {
          currentSlotOccupied = true;
        }
      }

      if (currentSlotOccupied) {
        setForm((p) => ({ ...p, appointment_time: '' }));
        await loadAppointments();
        setNotice('This time slot is no longer available. Please select another available slot.');
        setSaving(false);
        return;
      }

      // Verify overall day capacity from slotOccupancy
      let dayBookedCount = 0;
      SLOT_TIMES.forEach((time) => {
        const slotKey = `${form.department}|${form.appointment_date}|${time}`;
        dayBookedCount += (slotOccupancy.get(slotKey) || 0);
      });

      if (dayBookedCount >= DAILY_PATIENT_LIMIT) {
        setNotice(`Selected date is fully booked (${DAILY_PATIENT_LIMIT}/${DAILY_PATIENT_LIMIT} patients). Please choose another date.`);
        setSaving(false);
        return;
      }

      let queueNumber = null;
      let referenceCode = null;
      const status = 'Scheduled'; // All new appointments consistently start as Scheduled

      if (form.appointment_type === 'Same-day Appointment') {
        const sameDayRows = appointments.filter((a) =>
          a.appointment_date === form.appointment_date &&
          a.department === form.department &&
          a.appointment_type === 'Same-day Appointment' &&
          typeof a.queue_number === 'number',
        );
        const maxQueue = sameDayRows.reduce((m, a) => Math.max(m, a.queue_number || 0), 0);
        queueNumber = maxQueue + 1;
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
      if (error) {
        const errMsg = String(error.message || '').toLowerCase();

        // Catch database date/mode and slot-expiration rule validation
        if (
          errMsg.includes('this time slot has already ended') ||
          errMsg.includes('slot has already ended')
        ) {
          setForm((p) => ({ ...p, appointment_time: '' }));
          await loadAppointments();
          setNotice('This time slot has already ended. Please select another available slot.');
          return;
        }

        if (
          errMsg.includes('same-day appointments are only available') ||
          errMsg.includes('future appointments must be scheduled') ||
          errMsg.includes('check_appointment_date_mode')
        ) {
          setNotice(
            form.appointment_type === 'Future Appointment'
              ? 'Future appointments must be scheduled for tomorrow or a later date.'
              : 'Same-day appointments are only available for today.'
          );
          return;
        }

        // Level 3: Handle database unique index / trigger violation (code 23505) cleanly
        if (
          error.code === '23505' &&
          (errMsg.includes('slot') || errMsg.includes('idx_appointments_one_active_per_slot') || errMsg.includes('check_slot_capacity'))
        ) {
          setForm((p) => ({ ...p, appointment_time: '' }));
          await loadAppointments();
          setNotice('This time slot is no longer available. Please select another available slot.');
          return;
        }
        if (
          error.code === '23505' ||
          errMsg.includes('active appointment') ||
          errMsg.includes('idx_appointments_one_active_per_student') ||
          errMsg.includes('duplicate')
        ) {
          await loadActiveAppointment(form.patient_id);
          setNotice('You already have an active appointment. Please complete or cancel your current appointment before booking another.');
          return;
        }
        throw error;
      }

      setNotice(
        form.appointment_type === 'Same-day Appointment'
          ? `Appointment reserved! Queue Number: #${queueNumber}. Status: Scheduled. Please proceed to the clinic waiting area.`
          : `Appointment confirmed! Reference Code: ${referenceCode}. Status: Scheduled.`,
      );
      setForm((p) => ({ ...p, appointment_time: '' }));
      await loadAppointments();
      await loadActiveAppointment(form.patient_id);
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
            {/* Availability Error Banner (if offline or query fails) */}
            {availabilityError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  color: 'var(--danger, #dc2626)',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span>Unable to retrieve real-time slot availability. Please check your connection and try again.</span>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => loadAppointments()}
                  style={{ flexShrink: 0 }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Active Appointment Notice Card (if student already has Scheduled or Checked-in appointment) */}
            {activeAppointment && (
              <div
                className="patient-active-appointment-card"
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 10,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong style={{ fontSize: 15, color: 'var(--text)' }}>
                      Active Appointment in Progress
                    </strong>
                    <span
                      style={{
                        background: activeAppointment.status === 'Checked-in' ? 'var(--color-emerald-bg)' : 'var(--color-blue-bg)',
                        color: activeAppointment.status === 'Checked-in' ? 'var(--color-emerald-text)' : 'var(--color-blue-text)',
                        fontWeight: 700,
                        fontSize: 12,
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {activeAppointment.status}
                    </span>
                  </div>
                  {activeAppointment.queue_number && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>
                      Queue #{activeAppointment.queue_number}
                    </span>
                  )}
                  {activeAppointment.reference_code && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>
                      Ref: {activeAppointment.reference_code}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                  Schedule: <strong>{activeAppointment.appointment_date}</strong> at <strong>{activeAppointment.appointment_time}</strong> • Department: <strong>{activeAppointment.department}</strong> ({activeAppointment.service_type || 'Consultation'})
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginTop: 2 }}>
                  You already have an active appointment. Please complete or cancel your current appointment before booking another.
                </div>
              </div>
            )}

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
                Same-day slots are currently unavailable for {form.department}. Please select a date for a Future Appointment below.
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
                    const selectable = isDateSelectable(key) && !activeAppointment;
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
                      const isAvailable = availableSlots.includes(row.time) && !row.disabled && !activeAppointment;

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
                            {row.isExpired ? '0 of 1 slot (Ended)' : `${row.availableCount} of ${SLOT_CAPACITY} slot`}
                          </div>
                          <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: row.pct > 0 ? '#16a34a' : 'var(--danger)' }}>
                            {row.isExpired ? '0% Free (Ended)' : `${row.pct}% Free`}
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
                    const isAvailable = availableSlots.includes(row.time) && !row.disabled && !activeAppointment;

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
                            {row.isExpired ? '0% Free (Ended)' : `${row.pct}% Free`}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {row.isExpired ? 'Slot ended' : `${row.availableCount} of ${SLOT_CAPACITY} slot available`}
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
                          {selected ? 'Selected Slot' : row.isExpired ? 'Slot Ended' : isAvailable ? 'Select Slot' : 'Slot Full'}
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
                disabled={saving || !form.appointment_time || !isDateSelectable(form.appointment_date) || !!activeAppointment}
                style={{ padding: '10px 24px', fontSize: 15, opacity: (saving || !form.appointment_time || !isDateSelectable(form.appointment_date) || !!activeAppointment) ? 0.6 : 1 }}
                title={activeAppointment ? 'You already have an active appointment' : !isDateSelectable(form.appointment_date) ? 'Selected date is not valid for this appointment mode' : undefined}
              >
                {saving ? 'Submitting...' : activeAppointment ? 'Active Appointment Exists' : 'Confirm & Book Appointment'}
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
                {notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('already') || notice.toLowerCase().includes('unable')
                  ? 'Booking Notice'
                  : 'Appointment Confirmed'}
              </h3>
              <div style={{ color: notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('already') || notice.toLowerCase().includes('unable') ? 'var(--danger)' : 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>
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

// src/pages/patient/AppointmentBookingFlow.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from '../../components/icons/Icons.jsx';
import { emailEnabled } from '../../utils.js';

const SLOT_TIMES = ['09:00-12:00', '13:00-16:00', '16:00-19:00'];
const SLOT_CAPACITY = 1;
const DAILY_PATIENT_LIMIT = SLOT_TIMES.length * SLOT_CAPACITY;
const APPOINTMENT_PHOTO_BUCKET = 'appointment-photos';
const MAX_APPOINTMENT_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_APPOINTMENT_DESCRIPTION_LENGTH = 1000;
const APPOINTMENT_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const SERVICES = {
  'Medical Clinic': ['Consultation', 'Check-up'],
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
  const [appointmentDescription, setAppointmentDescription] = useState('');
  const [appointmentPhoto, setAppointmentPhoto] = useState(null);
  const [appointmentPhotoPreview, setAppointmentPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  const appointmentPhotoInputRef = useRef(null);
  const [showSlotModal, setShowSlotModal] = useState(false);
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

  useEffect(() => {
    if (!appointmentPhoto) {
      setAppointmentPhotoPreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(appointmentPhoto);
    setAppointmentPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [appointmentPhoto]);

  const handleAppointmentPhotoChange = (event) => {
    const file = event.target.files?.[0];
    setPhotoError('');
    if (!file) return;

    if (!APPOINTMENT_PHOTO_TYPES.has(file.type)) {
      setPhotoError('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_APPOINTMENT_PHOTO_BYTES) {
      setPhotoError('The image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    setAppointmentPhoto(file);
  };

  const removeAppointmentPhoto = () => {
    setAppointmentPhoto(null);
    setPhotoError('');
    if (appointmentPhotoInputRef.current) appointmentPhotoInputRef.current.value = '';
  };

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
        .eq('department', 'Medical Clinic')
        .eq('status', 'Scheduled')
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
          .eq('status', 'Scheduled');

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
        .eq('department', 'Medical Clinic')
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

  const visibleStaff = staffList;

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
    let stagedPhotoPath = null;

    try {
      // Level 2: Authoritative pre-insert database verification (guards against multi-tab stale state)
      const { data: activeRows, error: activeErr } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, department, service_type, status, queue_number, reference_code')
        .eq('patient_id', form.patient_id.trim())
        .eq('department', 'Medical Clinic')
        .eq('status', 'Scheduled')
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
          .eq('status', 'Scheduled')
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

      let referenceCode = null;
      const status = 'Scheduled'; // All new appointments consistently start as Scheduled

      // Same-day queue numbers are allocated server-side by the
      // assign_same_day_queue_number() trigger. The client cannot compute them:
      // this list is RLS-scoped to the signed-in patient's own rows, so a
      // client-side MAX() never sees other patients' bookings.
      if (form.appointment_type !== 'Same-day Appointment') {
        referenceCode = createReferenceCode(form.appointment_date);
      }

      const appointmentId = crypto.randomUUID();
      if (appointmentPhoto && source === 'portal' && !kioskMode) {
        const authUserId = user?.auth_user_id || (await supabase.auth.getUser()).data?.user?.id;
        if (!authUserId) throw new Error('Your session expired. Sign in again before uploading a photo.');

        const extension = appointmentPhoto.type === 'image/png'
          ? 'png'
          : appointmentPhoto.type === 'image/webp'
            ? 'webp'
            : 'jpg';
        stagedPhotoPath = `${authUserId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase
          .storage
          .from(APPOINTMENT_PHOTO_BUCKET)
          .upload(stagedPhotoPath, appointmentPhoto, {
            cacheControl: '3600',
            contentType: appointmentPhoto.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error('The photo could not be uploaded. Your appointment was not submitted; please try again.');
        }
      }

      const payload = {
        id: appointmentId,
        patient_id: form.patient_id.trim(),
        patient_name: form.patient_name.trim(),
        clinician_name: form.clinician_name || 'To be assigned',
        appointment_date: form.appointment_date,
        appointment_time: form.appointment_time,
        type: 'Consult',
        source,
        department: form.department,
        appointment_type: form.appointment_type,
        service_type: form.service_type,
        reference_code: referenceCode,
        status,
        photo_path: stagedPhotoPath,
        problem_description: appointmentDescription.trim() || null,
      };

      const { error } = await supabase.from('appointments').insert([payload]);
      if (error) {
        if (stagedPhotoPath) {
          const { error: cleanupError } = await supabase.storage.from(APPOINTMENT_PHOTO_BUCKET).remove([stagedPhotoPath]);
          if (cleanupError) console.warn('Could not remove the unlinked appointment photo:', cleanupError);
          stagedPhotoPath = null;
        }
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

      // The private photo is now linked to its appointment row and may be read
      // by the patient and authorized clinic staff.
      stagedPhotoPath = null;
      setAppointmentPhoto(null);
      setPhotoError('');
      setAppointmentDescription('');
      if (appointmentPhotoInputRef.current) appointmentPhotoInputRef.current.value = '';

      setForm((p) => ({ ...p, appointment_time: '' }));
      await loadAppointments();
      // The queue number is assigned by the database trigger — read it back
      // rather than trusting a client-side guess.
      const booked = await loadActiveAppointment(form.patient_id);
      const assignedQueue = booked?.queue_number ?? null;

      if (form.appointment_type === 'Same-day Appointment') {
        setNotice(
          assignedQueue != null
            ? `Appointment reserved! Queue Number: #${assignedQueue}. Status: Scheduled. Please proceed to the clinic waiting area.`
            : 'Appointment reserved! Status: Scheduled. Please proceed to the clinic waiting area.',
        );
      } else {
        setNotice(`Appointment confirmed! Reference Code: ${referenceCode}. Status: Scheduled.`);
      }

      // Asynchronously trigger appointment reminder/confirmation notification (evaluates patient_settings preferences)
      try {
        // Settings → Notifications can turn email off; without this the toggle
        // would be decorative.
        if (emailEnabled()) {
        supabase.functions.invoke('send-patient-notification', {
          body: {
            type: 'appointment_confirmation',
            patient_id: form.patient_id.trim(),
            recipient_email: user?.email || '',
            appointment_data: {
              patient_name: form.patient_name.trim(),
              appointment_date: form.appointment_date,
              appointment_time: form.appointment_time,
              department: form.department,
              service_type: form.service_type,
              appointment_type: form.appointment_type,
              queue_number: assignedQueue,
              reference_code: referenceCode,
              clinician_name: form.clinician_name || 'To be assigned',
            },
          },
        }).catch((fnErr) => {
          console.warn('Edge function notification error (non-blocking):', fnErr);
        });
        }
      } catch (invokeErr) {
        console.warn('Error initiating appointment notification:', invokeErr);
      }
    } catch (e) {
      console.error(e);
      if (stagedPhotoPath) {
        const { error: cleanupError } = await supabase.storage.from(APPOINTMENT_PHOTO_BUCKET).remove([stagedPhotoPath]);
        if (cleanupError) console.warn('Could not remove the unlinked appointment photo:', cleanupError);
      }
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
        <div className="page-header" style={{ marginBottom: 24 }}>
          <div className="page-header-title-block">
            <h2 className="patient-page-title" style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}>
              {kioskMode ? 'Clinic Kiosk Booking' : 'Schedule'}
            </h2>
            <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
              Manage your appointments and available clinic schedules.
            </div>
          </div>
        </div>

        <div className="card booking-flow-card" style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}>
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
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
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

            {/* Active Appointment Notice Card (if student already has a Scheduled appointment) */}
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
                    <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--text)' }}>
                      Active Appointment in Progress
                    </strong>
                    <span
                      style={{
                        background: 'var(--color-blue-bg)',
                        color: 'var(--color-blue-text)',
                        fontWeight: 'var(--font-weight-bold)',
                        fontSize: 'var(--font-size-xs)',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {activeAppointment.status}
                    </span>
                  </div>
                  {activeAppointment.queue_number && (
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                      Queue #{activeAppointment.queue_number}
                    </span>
                  )}
                  {activeAppointment.reference_code && (
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                      Ref: {activeAppointment.reference_code}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--text-muted)' }}>
                  Schedule: <strong>{activeAppointment.appointment_date}</strong> at <strong>{activeAppointment.appointment_time}</strong> • Department: <strong>{activeAppointment.department}</strong> ({activeAppointment.service_type || 'Consultation'})
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text)', fontWeight: 'var(--font-weight-medium)', marginTop: 2 }}>
                  You already have an active appointment. Please complete or cancel your current appointment before booking another.
                </div>
              </div>
            )}

            {/* TWO-COLUMN BOOKING WORKSPACE */}
            <div
              className="booking-two-col"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
                gap: 28,
                alignItems: 'start',
              }}
            >
              {/* LEFT COLUMN: Select Clinic Department & Preferred Date */}
              <div
                className="booking-col-card booking-col-left"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 26,
                  background: 'var(--panel, #ffffff)',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)', letterSpacing: '-0.2px' }}>
                    Select Appointment Type &amp; Preferred Date
                  </h3>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 3 }}>
                    Medical Clinic appointments. Dental visits begin onsite at the Dental Clinic, and the dentist schedules your follow-ups under Dental Appointment.
                  </div>
                </div>

                {/* Segmented Control for Mode */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
                  {/* Appointment Mode */}
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                      Appointment Mode
                    </label>
                    <div className="segmented-control-container">
                      {[
                        { id: 'Same-day Appointment', label: 'Same-day' },
                        { id: 'Future Appointment', label: 'Future' },
                      ].map((kind) => {
                        const active = form.appointment_type === kind.id;
                        const disabled = kind.id === 'Same-day Appointment' && !sameDayHasAvailableSlot;
                        return (
                          <button
                            key={kind.id}
                            type="button"
                            disabled={disabled}
                            className={`segmented-tab-btn ${active ? 'active' : ''}`}
                            onClick={() => setForm((p) => ({ ...p, appointment_type: kind.id }))}
                            style={{
                              opacity: disabled ? 0.45 : 1,
                              cursor: disabled ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {kind.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {!sameDayHasAvailableSlot && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
                    Same-day slots are currently unavailable for {form.department}. Switched to Future Appointment.
                  </div>
                )}

                {/* Calendar View Container */}
                <div className="booking-calendar-card" style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel, #ffffff)' }}>
                  {/* Month Navigator */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <button
                      className="calendar-nav-btn"
                      type="button"
                      aria-label="Previous Month"
                      onClick={() => setViewMonth((m) => addMonths(m, -1))}
                    >
                      <ChevronLeftIcon size={14} />
                    </button>
                    <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)', letterSpacing: '-0.2px' }}>
                      {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                    </div>
                    <button
                      className="calendar-nav-btn"
                      type="button"
                      aria-label="Next Month"
                      onClick={() => setViewMonth((m) => addMonths(m, 1))}
                    >
                      <ChevronRightIcon size={14} />
                    </button>
                  </div>

                  {/* Weekday headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
                    {DAYS_SHORT.map((day) => (
                      <div
                        key={day}
                        className="calendar-weekday-header"
                        style={{
                          textAlign: 'center',
                          padding: '4px 0',
                          fontWeight: 'var(--font-weight-bold)',
                          fontSize: 'var(--font-size-2xs)',
                          letterSpacing: '0.6px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                        }}
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {calendarCells.map((cell, idx) => {
                      if (!cell) {
                        return <div key={`empty-${idx}`} className="calendar-empty-cell" style={{ height: 54, borderRadius: 10, background: 'var(--surface-raised, #f8fafc)' }} />;
                      }
                      const key = toDateKey(cell);
                      const selected = key === form.appointment_date;
                      const isToday = key === today;
                      const selectable = isDateSelectable(key) && !activeAppointment;
                      const pct = dayAvailability.get(key);

                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={!selectable}
                          className={`calendar-cell-btn ${selected ? 'selected' : ''}`}
                          onClick={() => {
                            // On date click (initial or re-click), update date and immediately show time slot availability modal
                            setForm((p) => ({ ...p, appointment_date: key }));
                            setNotice('');
                            setShowSlotModal(true);
                          }}
                          style={{
                            border: selected
                              ? '1px solid var(--primary, #8b0000)'
                              : '1px solid var(--border)',
                            background: selected
                              ? 'var(--primary, #8b0000)'
                              : selectable
                                ? 'var(--panel, #ffffff)'
                                : 'var(--surface-raised, #f8fafc)',
                            color: selected
                              ? '#ffffff'
                              : selectable
                                ? 'var(--text)'
                                : 'var(--muted)',
                            opacity: selectable ? 1 : 0.38,
                            cursor: selectable ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: selected ? 'var(--font-weight-extrabold)' : isToday ? 'var(--font-weight-extrabold)' : 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
                              {cell.getDate()}
                            </span>
                            {isToday && (
                              <span
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: 9999,
                                  background: selected ? '#ffffff' : 'var(--primary, #8b0000)',
                                }}
                                title="Today"
                              />
                            )}
                          </div>
                          {typeof pct === 'number' && (
                            <div
                              className="calendar-cell-pct"
                              style={{
                                fontSize: 'var(--font-size-2xs)',
                                fontWeight: 'var(--font-weight-bold)',
                                marginTop: 2,
                                padding: '1px 6px',
                                borderRadius: 6,
                                background: selected
                                  ? 'rgba(255, 255, 255, 0.2)'
                                  : pct === 0
                                    ? 'rgba(220, 38, 38, 0.08)'
                                    : 'rgba(22, 163, 74, 0.08)',
                                color: selected
                                  ? '#ffffff'
                                  : pct === 0
                                    ? 'var(--danger, #dc2626)'
                                    : '#16a34a',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {pct === 0 ? 'Full' : (
                                <>
                                  {pct}%<span className="desktop-free-word"> free</span>
                                </>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Slot Selection State: Prompt Hint or Selected Slot Pill */}
                {form.appointment_time ? (
                  <div
                    className="booking-hint-banner"
                    style={{
                      padding: '14px 18px',
                      borderRadius: 12,
                      background: 'var(--surface-raised, #f8fafc)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
                        Selected Time Slot
                      </div>
                      <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginTop: 2 }}>
                        {form.appointment_time}{' '}
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--muted)' }}>
                          ({formatLongDate(form.appointment_date)})
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => setShowSlotModal(true)}
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-semibold)',
                        padding: '6px 14px',
                        borderRadius: 8,
                        flexShrink: 0,
                      }}
                    >
                      Change Slot
                    </button>
                  </div>
                ) : (
                  <div
                    className="booking-hint-banner"
                    style={{
                      padding: '14px 18px',
                      borderRadius: 12,
                      background: 'var(--surface-raised, #f8fafc)',
                      border: '1px dashed var(--border)',
                      color: 'var(--muted)',
                      fontSize: 'var(--font-size-sm)',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: 'var(--text)', display: 'block', fontSize: 'var(--font-size-sm)', marginBottom: 2 }}>
                      Click any date on the calendar above
                    </strong>
                    Choose a date to open the real-time time slot availability picker.
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Additional Information & Booking Summary */}
              <div
                className="booking-col-card booking-col-right"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 26,
                  background: 'var(--panel, #ffffff)',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)', letterSpacing: '-0.2px' }}>
                    Additional Information
                  </h3>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 3 }}>
                    Choose your service and share details for your visit.
                  </div>
                </div>

                {/* Service Type and Visit Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Service Type */}
                  <div>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', display: 'block', marginBottom: 6, color: 'var(--text)' }}>
                      Service Type
                    </label>
                    <div className="patient-select-wrapper" style={{ position: 'relative' }}>
                      <select
                        className="patient-input-accessible"
                        style={{
                          width: '100%',
                          fontSize: 'var(--font-size-base)',
                          padding: '10px 36px 10px 14px',
                          borderRadius: 10,
                          background: 'var(--panel, #ffffff)',
                          border: '1px solid var(--border)',
                          fontWeight: 'var(--font-weight-medium)',
                        }}
                        value={form.service_type}
                        onChange={(e) => setForm((p) => ({ ...p, service_type: e.target.value }))}
                      >
                        {SERVICES[form.department].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <span className="patient-select-chevron" aria-hidden="true">
                        <ChevronDownIcon size={14} />
                      </span>
                    </div>
                  </div>

                </div>

                {source === 'portal' && !kioskMode && (
                  <section className="appointment-description-field" aria-labelledby="appointment-description-title">
                    <div className="appointment-description-heading">
                      <div className="appointment-photo-heading">
                        <label id="appointment-description-title" htmlFor="appointment-description-input">
                          What would you like the clinic to know?
                        </label>
                        <span className="appointment-photo-optional">Optional</span>
                      </div>
                      <span className="appointment-description-count" aria-live="polite">
                        {appointmentDescription.length}/{MAX_APPOINTMENT_DESCRIPTION_LENGTH}
                      </span>
                    </div>
                    <p id="appointment-description-help" className="appointment-description-help">
                      Briefly describe what you’re feeling or what you’d like help with. Clinic staff can read this before your visit.
                    </p>
                    <textarea
                      id="appointment-description-input"
                      className="appointment-description-input"
                      value={appointmentDescription}
                      onChange={(event) => setAppointmentDescription(event.target.value)}
                      maxLength={MAX_APPOINTMENT_DESCRIPTION_LENGTH}
                      rows={4}
                      placeholder="For example: I’ve had a headache since yesterday..."
                      aria-describedby="appointment-description-help"
                      disabled={saving || Boolean(activeAppointment)}
                    />
                  </section>
                )}

                {source === 'portal' && !kioskMode && (
                  <section className="appointment-photo-upload" aria-labelledby="appointment-photo-title">
                    <div className="appointment-photo-copy">
                      <div className="appointment-photo-heading">
                        <label id="appointment-photo-title" htmlFor="appointment-photo-input">
                          Photo for the clinic
                        </label>
                        <span className="appointment-photo-optional">Optional</span>
                      </div>
                      <p id="appointment-photo-help">
                        Share a photo that may help the clinic prepare for your visit. JPG, PNG, or WebP up to 5 MB.
                      </p>
                    </div>

                    <input
                      ref={appointmentPhotoInputRef}
                      id="appointment-photo-input"
                      className="appointment-photo-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-describedby={`appointment-photo-help${photoError ? ' appointment-photo-error' : ''}`}
                      disabled={saving || Boolean(activeAppointment)}
                      onChange={handleAppointmentPhotoChange}
                    />

                    {photoError && (
                      <p id="appointment-photo-error" className="appointment-photo-error" role="alert">
                        {photoError}
                      </p>
                    )}

                    {appointmentPhoto && appointmentPhotoPreview && (
                      <div className="appointment-photo-preview">
                        <img src={appointmentPhotoPreview} alt="Selected photo for your appointment" />
                        <div className="appointment-photo-file-details">
                          <strong title={appointmentPhoto.name}>{appointmentPhoto.name}</strong>
                          <span>{(appointmentPhoto.size / (1024 * 1024)).toFixed(1)} MB</span>
                        </div>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={removeAppointmentPhoto}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* Booking Summary: Removed per user request to streamline confirmation */}

                {/* Confirmation Action Button */}
                <div>
                  <button
                    type="button"
                    disabled={saving || availabilityLoading || !form.appointment_date || !form.appointment_time || !isDateSelectable(form.appointment_date) || Boolean(activeAppointment)}
                    className="btn primary booking-submit-btn"
                    onClick={submit}
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '14px 20px',
                      fontSize: 'var(--font-size-base)',
                      fontWeight: 'var(--font-weight-bold)',
                      borderRadius: 10,
                      background: (!form.appointment_time || activeAppointment)
                        ? 'var(--surface-raised, #f1f5f9)'
                        : 'var(--primary, #8b0000)',
                      color: (!form.appointment_time || activeAppointment)
                        ? 'var(--muted, #94a3b8)'
                        : '#ffffff',
                      border: (!form.appointment_time || activeAppointment)
                        ? '1px solid var(--border)'
                        : 'none',
                      boxShadow: 'none',
                      transition: 'all 160ms cubic-bezier(0.16, 1, 0.3, 1)',
                      cursor: (!form.appointment_time || activeAppointment) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving
                      ? 'Confirming Appointment...'
                      : form.appointment_type === 'Same-day Appointment'
                        ? 'Reserve Same-day Appointment'
                        : 'Confirm & Book Appointment'}
                  </button>
                  {!form.appointment_time && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', textAlign: 'center', marginTop: 10, fontWeight: 'var(--font-weight-medium)' }}>
                      Select an available time slot on the calendar to activate confirmation.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Universal Time Slot Availability Modal (Desktop Centered Dialog & Mobile Bottom-Sheet) */}
        {showSlotModal && (
          <div
            className="patient-slots-modal-backdrop"
            onClick={() => setShowSlotModal(false)}
          >
            <div
              className="patient-slots-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile Tactile Grab Handle */}
              <div className="patient-slots-drag-handle" />

              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px 14px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 'var(--font-size-2xs)',
                      fontWeight: 'var(--font-weight-bold)',
                      letterSpacing: '0.6px',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      marginBottom: 2,
                    }}
                  >
                    APPOINTMENT TIME AVAILABILITY
                  </div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: 'var(--font-weight-extrabold)',
                      color: 'var(--text)',
                      lineHeight: 1.25,
                    }}
                  >
                    {formatLongDate(form.appointment_date)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotModal(false)}
                  aria-label="Close"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--surface-raised, rgba(0, 0, 0, 0.05))',
                    border: 'none',
                    fontSize: 'var(--font-size-md)',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    padding: 0,
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Embedded Table View for Desktop / Hidden Table for Compatibility */}
              <div className="patient-slots-table-view" style={{ display: 'none' }} />

              {/* Scrollable Slot Cards List */}
              <div
                className="patient-slots-cards-view"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  overflowY: 'auto',
                  flex: 1,
                }}
              >
                {slotRows.map((row) => {
                  const selected = form.appointment_time === row.time;
                  const isAvailable = availableSlots.includes(row.time) && !row.disabled && !activeAppointment;

                  return (
                    <button
                      key={row.time}
                      type="button"
                      disabled={!isAvailable}
                      className={`patient-slot-tile-btn ${selected ? 'selected' : ''}`}
                      onClick={() => {
                        setForm((p) => ({ ...p, appointment_time: row.time }));
                        setShowSlotModal(false);
                      }}
                      style={{
                        background: selected
                          ? 'var(--primary-light, rgba(140,21,21,0.06))'
                          : !isAvailable
                            ? 'var(--bg, #f8fafc)'
                            : 'var(--panel, #ffffff)',
                        border: selected
                          ? '2px solid var(--primary, #8b0000)'
                          : '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                        opacity: isAvailable ? 1 : 0.5,
                        transition: 'all 160ms cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    >
                      {/* Left: Time & Remaining Capacity */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                            {row.time}
                          </span>
                          {selected && (
                            <span
                              style={{
                                fontSize: 'var(--font-size-2xs)',
                                fontWeight: 'var(--font-weight-extrabold)',
                                color: 'var(--primary, #8b0000)',
                                background: 'rgba(140, 21, 21, 0.12)',
                                padding: '2px 8px',
                                borderRadius: 9999,
                              }}
                            >
                              ✓ Selected
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>
                          {row.isExpired
                            ? 'Slot ended'
                            : !isAvailable
                              ? 'Slot full'
                              : `${row.availableCount} of ${SLOT_CAPACITY} slot available`}
                        </div>
                      </div>

                      {/* Right: Availability Badge */}
                      <div>
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-bold)',
                            borderRadius: 9999,
                            padding: '4px 10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: row.isExpired
                              ? 'rgba(100, 116, 139, 0.12)'
                              : row.pct > 0
                                ? 'rgba(22, 163, 74, 0.1)'
                                : 'rgba(239, 68, 68, 0.1)',
                            color: row.isExpired
                              ? 'var(--muted)'
                              : row.pct > 0
                                ? '#16a34a'
                                : 'var(--danger, #dc2626)',
                          }}
                        >
                          {row.isExpired ? 'Ended' : `${row.pct}% Free`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Modal Action Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--panel, #ffffff)',
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowSlotModal(false)}
                  style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 'var(--font-weight-semibold)',
                    padding: '8px 18px',
                    borderRadius: 8,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

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
              <h3 style={{ margin: '0 0 10px 0', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                {notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('already') || notice.toLowerCase().includes('unable')
                  ? 'Booking Notice'
                  : 'Appointment Confirmed'}
              </h3>
              <div style={{ color: notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('already') || notice.toLowerCase().includes('unable') ? 'var(--danger)' : 'var(--text)', fontSize: 'var(--font-size-base)', lineHeight: 1.5 }}>
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

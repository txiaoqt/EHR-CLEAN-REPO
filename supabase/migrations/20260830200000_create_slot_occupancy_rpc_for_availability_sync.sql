-- ============================================================================
-- Migration: 20260830200000_create_slot_occupancy_rpc_for_availability_sync.sql
-- Description:
--   1. Provides secure, privacy-preserving RPC public.get_slot_occupancy()
--      returning aggregated active slot counts (Scheduled, Checked-in) across all
--      students without exposing any personal health information (PHI).
--   2. Ensures all patients and kiosk clients receive real-time, global slot
--      occupancy data regardless of RLS restrictions on personal records.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_slot_occupancy(
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT (CURRENT_DATE + 90)
)
RETURNS TABLE (
  department text,
  appointment_date text,
  appointment_time text,
  occupied_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    COALESCE(a.department, 'Medical Clinic')::text AS department,
    a.appointment_date::text AS appointment_date,
    a.appointment_time::text AS appointment_time,
    COUNT(*)::bigint AS occupied_count
  FROM public.appointments a
  WHERE a.appointment_date >= p_start_date
    AND a.appointment_date <= p_end_date
    AND a.status IN ('Scheduled', 'Checked-in')
  GROUP BY COALESCE(a.department, 'Medical Clinic'), a.appointment_date, a.appointment_time;
$$;

GRANT EXECUTE ON FUNCTION public.get_slot_occupancy(date, date) TO authenticated, anon;

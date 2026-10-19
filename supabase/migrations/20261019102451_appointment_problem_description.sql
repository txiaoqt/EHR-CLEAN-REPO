-- Store the optional reason for booking with the appointment so clinic staff
-- can review it when opening the linked encounter.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS problem_description text
  CHECK (problem_description IS NULL OR char_length(problem_description) <= 1000);

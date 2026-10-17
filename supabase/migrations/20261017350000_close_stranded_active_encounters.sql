-- ============================================================================
-- Migration: close the encounters left stranded as 'active'
-- ============================================================================
--
-- The Clinic Queue page is gone. It was the only place an encounter could be
-- marked complete by hand, and with it removed any note still sitting at
-- 'active' has no way to be closed.
--
-- 73 encounters are in that state, and all but one are dated in the past — they
-- are records of visits that already happened. Their status was simply never
-- updated, because nothing required it while the queue existed.
--
-- Only PAST-dated rows are closed. A note dated today may still belong to a
-- visit in progress, and for a booked visit the appointment's completion closes
-- it anyway.
-- ============================================================================

UPDATE public.encounters
   SET status = 'completed',
       updated_at = now()
 WHERE lower(status) = 'active'
   AND (encounter_date AT TIME ZONE 'Asia/Manila')::date < (now() AT TIME ZONE 'Asia/Manila')::date;

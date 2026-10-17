-- ============================================================================
-- Migration: one dispensing row per (encounter, medicine)
-- ============================================================================
--
-- The Medical Log renders the clinic's form as a grid: one row per visit, one
-- column per medicine, a numeric cell holding the quantity given. Typing in a
-- cell has to upsert, so (encounter_id, item_name) must be unique — otherwise a
-- second save would silently add a duplicate row and double-count the dose.
--
-- Verified before creating: 0 existing (encounter_id, item_name) pairs are
-- duplicated, so the index builds cleanly.
--
-- Partial on encounter_id IS NOT NULL: stock adjustments and stock-in are not
-- tied to a visit and may legitimately repeat for the same item.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_transactions_unique_dispense
  ON public.inventory_transactions (encounter_id, item_name)
  WHERE encounter_id IS NOT NULL;

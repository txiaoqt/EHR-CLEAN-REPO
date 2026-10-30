-- staff_directory calls private.account_is_suspended(). A view checks table
-- access as its owner but EXECUTE on functions as the caller, and
-- 20261021135313 revoked every private function from authenticated, so each
-- read of the view failed with "permission denied for function
-- account_is_suspended" (patient booking, staff presence).
--
-- The function only answers whether a given account id is suspended; for staff
-- the view already exposes that as `active`.
grant execute on function private.account_is_suspended(uuid) to authenticated;

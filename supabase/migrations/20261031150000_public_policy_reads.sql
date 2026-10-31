-- The active policy text is public, but this function ran as the caller, so the
-- account_access_gate hid it from any signed-in session that cannot use the
-- portal yet — such as a sign-up whose code was verified but whose account is
-- not finished. Sign-up then showed "The policies could not be loaded".
-- Reading only the active version's public text as the owner fixes that.
create or replace function public.get_active_app_policy()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('version', version, 'title', title, 'effective_date', effective_date,
    'terms', terms, 'privacy', privacy)
  from public.app_policy_versions where is_active;
$$;
revoke all on function public.get_active_app_policy() from public;
grant execute on function public.get_active_app_policy() to anon, authenticated;

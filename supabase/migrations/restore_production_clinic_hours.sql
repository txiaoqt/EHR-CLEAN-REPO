create or replace function public.is_within_clinic_hours()
returns boolean
language plpgsql
stable
as $$
declare
  v_manila_now time;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return true;
  end if;
  if coalesce(current_setting('app.bypass_clinic_hours', true), 'off') = 'on' then
    return true;
  end if;
  v_manila_now := (now() at time zone 'Asia/Manila')::time;
  return v_manila_now >= time '07:00' and v_manila_now < time '19:00';
end;
$$;

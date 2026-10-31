-- Page 1 of the pink form (details, chart, remarks) is one row per patient, so a
-- second consultation overwrote the first. Every save now also keeps a copy, so
-- the dentist can step back through earlier visits' charts and remarks.
create table public.dental_record_versions (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.dental_records(patient_id) on delete cascade,
  record jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid default auth.uid() references auth.users(id) on delete set null
);
create index dental_record_versions_patient_idx on public.dental_record_versions(patient_id, saved_at desc);

alter table public.dental_record_versions enable row level security;
-- Read-only to dentists: versions are written by the trigger below, never edited.
create policy dentist_dental_record_versions on public.dental_record_versions for select to authenticated
  using ((select public.current_app_role()) = 'dentist');
grant select on public.dental_record_versions to authenticated;

create or replace function private.keep_dental_record_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.dental_record_versions (patient_id, record, saved_by)
  values (new.patient_id, to_jsonb(new) - 'updated_by', auth.uid());
  return null;
end;
$$;
create trigger dental_records_keep_version after insert or update on public.dental_records
  for each row execute function private.keep_dental_record_version();

-- Today's records become each patient's first kept version.
insert into public.dental_record_versions (patient_id, record, saved_at, saved_by)
select r.patient_id, to_jsonb(r) - 'updated_by', coalesce(r.updated_at, r.created_at), r.updated_by
from public.dental_records r;

-- PSA-style name parts on the patient directory. `name` stays the display name
-- every page reads; it is composed from the parts whenever they are given, so
-- forms that need surname / first / middle (the dental pink form) never have to
-- guess where one part ends and the next begins.
alter table public.students
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists surname text,
  add column if not exists suffix text;

-- Best-effort split of a stored full name, for rows saved before the parts existed:
-- a trailing Jr./Sr./III is the suffix, "dela"/"de los"-style particles join the
-- surname, and single-letter initials just before the surname are the middle.
create or replace function private.split_person_name(p_name text,
  out first_name text, out middle_name text, out surname text, out suffix text)
language plpgsql immutable set search_path = '' as $$
declare
  t text[] := regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ');
  n int := coalesce(array_length(t, 1), 0);
  s int;
  m int;
begin
  if n = 0 or t[1] = '' then return; end if;
  if n > 1 and t[n] ~* '^(jr\.?|sr\.?|i{2,3}|iv|v)$' then suffix := t[n]; n := n - 1; end if;
  if n = 1 then first_name := t[1]; return; end if;
  s := n;
  while s > 2 and lower(t[s - 1]) in ('de','del','dela','delas','delos','de la','la','las','los','san','santa','sto','sta','van','von','da','di','dos') loop
    s := s - 1;
  end loop;
  surname := array_to_string(t[s:n], ' ');
  m := s;
  while m > 2 and t[m - 1] ~ '^[A-Za-z]\.?$' loop m := m - 1; end loop;
  if m < s then middle_name := array_to_string(t[m:s - 1], ' '); end if;
  first_name := array_to_string(t[1:m - 1], ' ');
end;
$$;

create or replace function private.students_name_parts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb;
  parts record;
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.middle_name := nullif(btrim(new.middle_name), '');
  new.surname := nullif(btrim(new.surname), '');
  new.suffix := nullif(btrim(new.suffix), '');
  if new.first_name is not null and new.surname is not null then
    new.name := concat_ws(' ', new.first_name, new.middle_name, new.surname, new.suffix);
    return new;
  end if;
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then return new; end if;
  -- Sign-up keeps the parts the student typed on their Auth account.
  select u.raw_user_meta_data into meta from auth.users u
  where u.raw_user_meta_data->>'patient_id' = new.id and coalesce(u.raw_user_meta_data->>'surname', '') <> ''
  order by u.created_at desc limit 1;
  if meta is not null then
    new.first_name := nullif(btrim(meta->>'first_name'), '');
    new.middle_name := nullif(btrim(meta->>'middle_name'), '');
    new.surname := nullif(btrim(meta->>'surname'), '');
    new.suffix := nullif(btrim(meta->>'suffix'), '');
  else
    parts := private.split_person_name(new.name);
    new.first_name := parts.first_name; new.middle_name := parts.middle_name;
    new.surname := parts.surname; new.suffix := parts.suffix;
  end if;
  return new;
end;
$$;

drop trigger if exists students_name_parts on public.students;
create trigger students_name_parts before insert or update on public.students
  for each row execute function private.students_name_parts();

-- Backfill rows saved before the parts existed. Rows with a surname are
-- recomposed by the trigger, in the same first-middle-surname order as before.
update public.students s
set first_name = p.first_name, middle_name = p.middle_name, surname = p.surname, suffix = p.suffix
from public.students src cross join lateral private.split_person_name(src.name) p
where s.id = src.id and s.first_name is null;

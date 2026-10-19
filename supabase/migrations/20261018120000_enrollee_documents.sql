-- =============================================================================
-- Medical certificates — the documents the clinic reviews
-- =============================================================================
--
-- The file itself lives in a PRIVATE storage bucket; this table holds its
-- metadata and its review state. Health data does not belong in a public bucket,
-- and a signed URL is the only way a file should ever be read.
--
-- Status is deliberately narrow: pending, approved, needs_revision. There is no
-- 'rejected' — the clinic asked for that, and it is the right call. Rejecting an
-- applicant's one submission with no path back is a dead end, and the person on
-- the other end is a student trying to enrol, not an adversary. When a
-- submission is beyond saving, staff delete it instead, behind a confirmation.

create table if not exists public.enrollee_documents (
  id uuid primary key default gen_random_uuid(),
  enrollee_id uuid not null references public.enrollees(id) on delete cascade,

  -- Path within the private bucket. Kept separate from the display name so a
  -- crafted filename can never influence where the object lands.
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,

  status text not null default 'pending' check (status in ('pending', 'approved', 'needs_revision')),
  revision_note text,

  -- Five days to resubmit, matching the reference implementation, with the
  -- deadline stored rather than derived so staff can extend it.
  revision_due_at timestamptz,

  reviewed_by text,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enrollee_documents_enrollee_idx
  on public.enrollee_documents (enrollee_id);
create index if not exists enrollee_documents_status_idx
  on public.enrollee_documents (status, submitted_at desc);

-- -----------------------------------------------------------------------------
-- The private bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'enrollee-documents',
  'enrollee-documents',
  false,
  10485760, -- 10 MB, enforced by storage rather than only by the browser
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Column guards — a submitted document is not the applicant's to change
-- -----------------------------------------------------------------------------
--
-- Once submitted, an applicant cannot alter a document unless the clinic has
-- asked for a revision. Without this, a certificate the clinic is midway through
-- reviewing could change underneath them.
create or replace function public.guard_enrollee_document_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := public.current_app_role();
begin
  if current_setting('app.allow_enrollee_document_review', true) = 'on' then
    return new;
  end if;

  -- Clinic staff review freely.
  if actor in ('admin', 'physician', 'nurse') then
    return new;
  end if;

  -- The applicant: only while a revision has been requested, and never the
  -- review fields.
  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.revision_note is distinct from old.revision_note
     or new.enrollee_id is distinct from old.enrollee_id then
    raise exception 'Only clinic staff can change the review status of a document';
  end if;

  if old.status <> 'needs_revision' then
    raise exception 'This document has already been submitted. The clinic must request a revision before it can be replaced.';
  end if;

  return new;
end;
$$;

drop trigger if exists enrollee_documents_guard on public.enrollee_documents;
create trigger enrollee_documents_guard
  before update on public.enrollee_documents
  for each row execute function public.guard_enrollee_document_updates();

create or replace function public.touch_enrollee_document_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enrollee_documents_touch on public.enrollee_documents;
create trigger enrollee_documents_touch
  before update on public.enrollee_documents
  for each row execute function public.touch_enrollee_document_updated_at();

-- -----------------------------------------------------------------------------
-- Recording a submission
-- -----------------------------------------------------------------------------
--
-- The browser uploads the file to storage first, then calls this to record it.
-- Doing it the other way round would leave a row pointing at an object that
-- never arrived.
create or replace function public.record_enrollee_document(
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_enrollee uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  select id into v_enrollee from public.enrollees where auth_user_id = v_uid limit 1;
  if v_enrollee is null then
    return jsonb_build_object('success', false, 'error', 'No enrollee account is linked to this sign-in.');
  end if;

  -- The record form gates the upload. Checked here as well as in the browser,
  -- because a hidden button is not a rule.
  if not public.record_form_complete('enrollee', v_enrollee::text) then
    return jsonb_build_object('success', false, 'error', 'Complete your clinic record before submitting a certificate.');
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    return jsonb_build_object('success', false, 'error', 'Each file must be 10 MB or smaller.');
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    return jsonb_build_object('success', false, 'error', 'Please upload a photo (JPG, PNG, WEBP) or a PDF.');
  end if;

  -- The path must belong to this enrollee's folder. A path from somewhere else
  -- would let one applicant attach another's file.
  if p_storage_path is null or p_storage_path not like v_enrollee::text || '/%' then
    return jsonb_build_object('success', false, 'error', 'Invalid upload path.');
  end if;

  insert into public.enrollee_documents (
    enrollee_id, storage_path, file_name, mime_type, size_bytes, status, submitted_at
  )
  values (
    v_enrollee, p_storage_path, p_file_name, p_mime_type, p_size_bytes, 'pending', now()
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.record_enrollee_document(text, text, text, bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- Reviewing — staff only, and the only way status changes
-- -----------------------------------------------------------------------------
create or replace function public.review_enrollee_document(
  p_document_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.current_app_role();
  v_reviewer text;
begin
  if v_actor not in ('admin', 'physician', 'nurse') then
    return jsonb_build_object('success', false, 'error', 'Only clinic staff can review documents.');
  end if;

  if p_decision not in ('approved', 'needs_revision') then
    return jsonb_build_object('success', false, 'error', 'A decision must be either approved or needs revision.');
  end if;

  if p_decision = 'needs_revision' and nullif(trim(coalesce(p_note, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'Please say what needs changing — the applicant sees this note.');
  end if;

  select name into v_reviewer from public.admins where auth_user_id = auth.uid() limit 1;

  -- The guard reads this setting; without it, the trigger would refuse the very
  -- update this function exists to make.
  perform set_config('app.allow_enrollee_document_review', 'on', true);

  update public.enrollee_documents
     set status = p_decision,
         revision_note = case when p_decision = 'needs_revision' then trim(p_note) else null end,
         revision_due_at = case when p_decision = 'needs_revision' then now() + interval '5 days' else null end,
         reviewed_by = coalesce(v_reviewer, 'Clinic staff'),
         reviewed_at = now()
   where id = p_document_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'That document no longer exists.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.review_enrollee_document(uuid, text, text) to authenticated;

-- Staff may reopen a revision whose deadline has passed.
create or replace function public.extend_document_revision(p_document_id uuid, p_days integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.current_app_role();
begin
  if v_actor not in ('admin', 'physician', 'nurse') then
    return jsonb_build_object('success', false, 'error', 'Only clinic staff can extend a revision.');
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    return jsonb_build_object('success', false, 'error', 'Choose between 1 and 60 days.');
  end if;

  perform set_config('app.allow_enrollee_document_review', 'on', true);

  update public.enrollee_documents
     set revision_due_at = greatest(coalesce(revision_due_at, now()), now()) + (p_days || ' days')::interval
   where id = p_document_id and status = 'needs_revision';

  if not found then
    return jsonb_build_object('success', false, 'error', 'That document is not awaiting a revision.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.extend_document_revision(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.enrollee_documents enable row level security;

drop policy if exists enrollee_documents_self on public.enrollee_documents;
create policy enrollee_documents_self on public.enrollee_documents
  for select using (
    enrollee_id in (select e.id from public.enrollees e where e.auth_user_id = auth.uid())
  );

drop policy if exists enrollee_documents_staff on public.enrollee_documents;
create policy enrollee_documents_staff on public.enrollee_documents
  for all using (public.current_app_role() in ('admin', 'physician', 'nurse'))
  with check (public.current_app_role() in ('admin', 'physician', 'nurse'));

-- Storage: an enrollee writes only inside their own folder, and reads only their
-- own files. Staff read everything.
drop policy if exists enrollee_docs_self_read on storage.objects;
create policy enrollee_docs_self_read on storage.objects
  for select using (
    bucket_id = 'enrollee-documents'
    and (storage.foldername(name))[1] in (
      select e.id::text from public.enrollees e where e.auth_user_id = auth.uid()
    )
  );

drop policy if exists enrollee_docs_self_write on storage.objects;
create policy enrollee_docs_self_write on storage.objects
  for insert with check (
    bucket_id = 'enrollee-documents'
    and (storage.foldername(name))[1] in (
      select e.id::text from public.enrollees e where e.auth_user_id = auth.uid()
    )
  );

drop policy if exists enrollee_docs_staff_read on storage.objects;
create policy enrollee_docs_staff_read on storage.objects
  for select using (
    bucket_id = 'enrollee-documents'
    and public.current_app_role() in ('admin', 'physician', 'nurse')
  );

comment on table public.enrollee_documents is
  'Medical certificates awaiting or holding a clinic decision. Files live in the private enrollee-documents bucket; read them through a signed URL.';

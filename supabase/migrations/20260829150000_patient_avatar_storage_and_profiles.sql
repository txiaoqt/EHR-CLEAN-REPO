-- Migration: 20260829150000_patient_avatar_storage_and_profiles.sql
-- Goal: Student Profile Photo Storage Bucket & Patient Profiles Avatar Integration
-- Safe, idempotent migration strictly for avatar persistence.

-- 1. Ensure avatar_url column exists on public.patient_profiles
alter table if exists public.patient_profiles
  add column if not exists avatar_url text;

-- 2. Ensure avatar column exists on public.users
alter table if exists public.users
  add column if not exists avatar text;

-- 3. Configure Supabase Storage 'avatars' bucket if storage schema is available
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'avatars',
      'avatars',
      true,
      5242880, -- 5 MB limit
      array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    on conflict (id) do update set
      public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  end if;
end $$;

-- 4. Set up Storage RLS policies for avatars bucket
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    -- Public Read
    drop policy if exists "Avatar Public Read" on storage.objects;
    create policy "Avatar Public Read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'avatars');

    -- Authenticated User Upload (scoped to user folder or authenticated access)
    drop policy if exists "Avatar User Upload" on storage.objects;
    create policy "Avatar User Upload"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'avatars');

    -- Authenticated User Update
    drop policy if exists "Avatar User Update" on storage.objects;
    create policy "Avatar User Update"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'avatars');

    -- Authenticated User Delete
    drop policy if exists "Avatar User Delete" on storage.objects;
    create policy "Avatar User Delete"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'avatars');
  end if;
end $$;

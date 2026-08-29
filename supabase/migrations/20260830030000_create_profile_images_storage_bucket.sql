-- Migration: 20260830030000_create_profile_images_storage_bucket.sql
-- Goal: Persistent Supabase Storage 'profile-images' Bucket & RLS Policies for Patient Avatars
-- Idempotent, safe migration for user profile photo persistence.

-- 1. Ensure avatar columns exist on public.patient_profiles and public.users
alter table if exists public.patient_profiles
  add column if not exists avatar_url text;

alter table if exists public.users
  add column if not exists avatar text;

-- 2. Create 'profile-images' bucket in Supabase storage if storage schema exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'profile-images',
      'profile-images',
      true,
      5242880, -- 5 MB limit
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update set
      public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  end if;
end $$;

-- 3. Configure storage RLS policies for 'profile-images' bucket
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    -- Public Read (allows cross-device display of user avatars)
    drop policy if exists "Profile Images Public Read" on storage.objects;
    create policy "Profile Images Public Read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'profile-images');

    -- Authenticated User Upload (scoped strictly to own auth UID folder)
    drop policy if exists "Profile Images User Upload" on storage.objects;
    create policy "Profile Images User Upload"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'profile-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    -- Authenticated User Update (scoped strictly to own auth UID folder)
    drop policy if exists "Profile Images User Update" on storage.objects;
    create policy "Profile Images User Update"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'profile-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    -- Authenticated User Delete (scoped strictly to own auth UID folder)
    drop policy if exists "Profile Images User Delete" on storage.objects;
    create policy "Profile Images User Delete"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'profile-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

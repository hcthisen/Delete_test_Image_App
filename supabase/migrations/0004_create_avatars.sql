-- Avatars and avatar_images schema for Human Forge
create extension if not exists "uuid-ossp";

-- Helper trigger to refresh updated_at
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- Avatars table
create table if not exists public.avatars (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age int2 not null,
  height_cm int2 null,
  skin_tone text null,
  hair_color text null,
  marital_status text null,
  job_title text null,
  industry text null,
  address_line text null,
  city text null,
  region text null,
  country text null,
  hobbies text[] null,
  political_orientation text null,
  other_traits text null,
  persona_summary text null,
  profile_image_path text null,
  status text not null default 'pending',
  n8n_job_id text null,
  extra_attributes jsonb null
);

create index if not exists avatars_user_id_idx on public.avatars (user_id);
create index if not exists avatars_status_idx on public.avatars (status);

create trigger set_avatars_updated_at
before update on public.avatars
for each row
execute function public.set_current_timestamp_updated_at();

-- Avatar images table
create table if not exists public.avatar_images (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default timezone('utc', now()),
  avatar_id uuid not null references public.avatars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  label text null,
  description text null,
  storage_path text not null,
  is_primary boolean not null default false
);

create index if not exists avatar_images_avatar_id_idx on public.avatar_images (avatar_id);
create index if not exists avatar_images_user_id_idx on public.avatar_images (user_id);

-- Row Level Security
alter table public.avatars enable row level security;
alter table public.avatar_images enable row level security;

create policy "Users can select their avatars" on public.avatars
  for select using (auth.uid() = user_id);

create policy "Users can insert their avatars" on public.avatars
  for insert with check (auth.uid() = user_id);

create policy "Users can update their avatars" on public.avatars
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their avatars" on public.avatars
  for delete using (auth.uid() = user_id);

create policy "Users can select their avatar images" on public.avatar_images
  for select using (auth.uid() = user_id);

create policy "Users can insert their avatar images" on public.avatar_images
  for insert with check (auth.uid() = user_id);

create policy "Users can update their avatar images" on public.avatar_images
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their avatar images" on public.avatar_images
  for delete using (auth.uid() = user_id);

-- Storage bucket for avatar assets
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Ensure RLS is enabled for the avatars bucket
update storage.buckets set public = false where id = 'avatars';

create policy "Users can upload their avatar assets" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read their avatar assets" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their avatar assets" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their avatar assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

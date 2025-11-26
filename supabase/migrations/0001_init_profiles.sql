create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.profiles enable row level security;

create policy "Users can view their profile" on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can update their profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- TODO: Consider adding an update trigger to refresh updated_at automatically.

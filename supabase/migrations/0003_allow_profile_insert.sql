-- Allow authenticated users to insert or upsert their own profile row
create policy "Users can insert their profile" on public.profiles
  for insert
  with check (auth.uid() = id);

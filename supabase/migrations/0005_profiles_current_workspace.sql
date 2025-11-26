-- Migration 0005_profiles_current_workspace — track the active workspace per profile
set check_function_bodies = off;
set search_path = public;

-- Ensure the column exists (nullable is fine for now)
alter table public.profiles
  add column if not exists current_workspace uuid
  references public.workspaces(id);

-- Make sure RLS is enabled (safe if already enabled)
alter table public.profiles enable row level security;

-- Drop any prior version of the policy
drop policy if exists profiles_update on public.profiles;

-- Re-create the policy only if it doesn't already exist
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and policyname = 'profiles_update'
  ) then
    create policy profiles_update on public.profiles
      for update
      using (auth.uid() = id)
      with check (
        auth.uid() = id
        and (
          current_workspace is null
          or public.is_workspace_member(current_workspace)
        )
      );
  end if;
end
$$;

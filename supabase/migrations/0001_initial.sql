-- Migration 0001_initial — Journal.Vet schema (fixed for cascade deletion, owner_id, and safe RLS)
set check_function_bodies = off;
set search_path = public;

create extension if not exists "pgcrypto" with schema "public";

-- --------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- --------------------------------------------------------------------
-- Profiles mirror auth.users
-- --------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  default_language_code text,
  default_template_id uuid,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------
-- Workspaces (explicit owner_id, decoupled from profiles.id cascade)
-- --------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);

-- --------------------------------------------------------------------
-- Workspace memberships
-- --------------------------------------------------------------------
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()) not null,
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

-- --------------------------------------------------------------------
-- Templates
-- --------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  kind text not null check (kind in ('Std', 'Custom')),
  language_code text,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists templates_workspace_kind_idx on public.templates(workspace_id, kind);

create trigger templates_set_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------
-- Vocabulary dictionary
-- --------------------------------------------------------------------
create table if not exists public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  term text not null,
  replacement text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists vocabulary_entries_workspace_term_idx
  on public.vocabulary_entries(workspace_id, term);

-- --------------------------------------------------------------------
-- Journals
-- --------------------------------------------------------------------
create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('draft', 'processed', 'error')) default 'draft',
  language_code text,
  template_id uuid references public.templates(id) on delete set null,
  audio_path text not null,
  transcript text,
  summary text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists journals_workspace_created_at_idx
  on public.journals(workspace_id, created_at desc);

create trigger journals_set_updated_at
before update on public.journals
for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------
-- Invites
-- --------------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  status text not null check (status in ('pending', 'accepted', 'revoked', 'expired')) default 'pending',
  token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc', now()) not null,
  expires_at timestamptz
);

create index if not exists invites_workspace_status_idx on public.invites(workspace_id, status);

-- --------------------------------------------------------------------
-- Languages
-- --------------------------------------------------------------------
create table if not exists public.languages (
  code text primary key,
  label text not null
);

-- --------------------------------------------------------------------
-- Late FK on profiles.default_template_id (needs templates)
-- --------------------------------------------------------------------
alter table public.profiles
  add constraint if not exists profiles_default_template_id_fkey
  foreign key (default_template_id) references public.templates(id) on delete set null;

-- --------------------------------------------------------------------
-- Core helper functions
-- --------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
security invoker
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace
      and wm.user_id = auth.uid()
  );
$$;

-- Updated: "core member" == workspace owner
create or replace function public.is_core_member(p_workspace uuid)
returns boolean
language sql
security invoker
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace
      and w.owner_id = auth.uid()
  );
$$;

-- --------------------------------------------------------------------
-- Signup automation
-- --------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id)
  values (new.id);

  insert into public.workspaces(id, name, owner_id)
  values (new.id, concat(new.raw_user_meta_data->>'full_name', '''s Workspace'), new.id);

  insert into public.workspace_members(workspace_id, user_id)
  values (new.id, new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --------------------------------------------------------------------
-- Invite acceptance flow
-- --------------------------------------------------------------------
create or replace function public.accept_invite(invite_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record record;
begin
  select * into invite_record
  from public.invites
  where token = invite_token
    and status = 'pending'
    and (expires_at is null or expires_at > timezone('utc', now()))
  for update;

  if invite_record.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into public.workspace_members(workspace_id, user_id)
  values (invite_record.workspace_id, auth.uid());

  update public.invites
  set status = 'accepted'
  where id = invite_record.id;
end;
$$;

-- --------------------------------------------------------------------
-- RLS & Policies
-- --------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.templates enable row level security;
alter table public.vocabulary_entries enable row level security;
alter table public.journals enable row level security;
alter table public.invites enable row level security;
alter table public.languages enable row level security;

create policy if not exists profiles_select on public.profiles
  for select using (auth.uid() = id);

create policy if not exists profiles_update on public.profiles
  for update using (auth.uid() = id);

create policy if not exists "Members can view their workspaces" on public.workspaces
  for select using (public.is_workspace_member(id));

-- Non-recursive membership policies
create policy if not exists "Users can read their own memberships"
  on public.workspace_members
  for select using (user_id = auth.uid());

create policy if not exists "Owners can read all workspace members"
  on public.workspace_members
  for select using (public.is_core_member(workspace_id));

create policy if not exists "Core members can add members"
  on public.workspace_members
  for insert with check (public.is_core_member(workspace_id));

create policy if not exists "Core members can update members"
  on public.workspace_members
  for update using (public.is_core_member(workspace_id))
  with check (public.is_core_member(workspace_id));

create policy if not exists "Cannot delete owner membership"
  on public.workspace_members
  for delete
  using (
    public.is_core_member(workspace_id)
    and not exists (
      select 1 from public.workspaces w
      where w.id = workspace_id
        and w.owner_id = user_id
    )
  );

create policy if not exists templates_select_global on public.templates
  for select using (kind = 'Std' or (workspace_id is not null and public.is_workspace_member(workspace_id)));

create policy if not exists templates_insert_workspace on public.templates
  for insert with check (
    (kind = 'Std' and auth.role() = 'service_role') or
    (workspace_id is not null and public.is_workspace_member(workspace_id))
  );

create policy if not exists templates_update_workspace on public.templates
  for update using (
    (kind = 'Std' and auth.role() = 'service_role') or
    (workspace_id is not null and (public.is_core_member(workspace_id) or created_by = auth.uid()))
  );

create policy if not exists templates_delete_workspace on public.templates
  for delete using (workspace_id is not null and public.is_core_member(workspace_id));

create policy if not exists vocabulary_entries_rw on public.vocabulary_entries
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy if not exists journals_select on public.journals
  for select using (public.is_workspace_member(workspace_id));

create policy if not exists journals_insert on public.journals
  for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

create policy if not exists journals_update on public.journals
  for update using (
    public.is_workspace_member(workspace_id) and
    (public.is_core_member(workspace_id) or created_by = auth.uid())
  );

create policy if not exists journals_delete on public.journals
  for delete using (public.is_core_member(workspace_id));

create policy if not exists invites_core_only on public.invites
  for all using (public.is_core_member(workspace_id))
  with check (public.is_core_member(workspace_id));

create policy if not exists languages_read_public on public.languages
  for select using (true);

-- --------------------------------------------------------------------
-- Seed standard templates
-- --------------------------------------------------------------------
insert into public.templates (id, name, body, kind)
values
  (gen_random_uuid(), 'Bulleted Points', 'Standard bullet summary template placeholder.', 'Std'),
  (gen_random_uuid(), 'Clean Transcript', 'Clean transcript template placeholder.', 'Std'),
  (gen_random_uuid(), 'Email', 'Email summary template placeholder.', 'Std'),
  (gen_random_uuid(), 'Post-Operative Report', 'Post-operative report template placeholder.', 'Std'),
  (gen_random_uuid(), 'Client Callback', 'Client callback template placeholder.', 'Std'),
  (gen_random_uuid(), 'Physical Exam', 'Physical exam template placeholder.', 'Std'),
  (gen_random_uuid(), 'SOAP Ezyvet', 'SOAP Ezyvet template placeholder.', 'Std'),
  (gen_random_uuid(), 'SOAP Framework', 'SOAP framework template placeholder.', 'Std')
on conflict do nothing;

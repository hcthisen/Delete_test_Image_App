-- Journal.Vet Supabase schema (consolidated, self-hosted friendly)

-- Make function bodies skip validation during creation (useful when objects are created later in the script)
set check_function_bodies = off;

-- IMPORTANT: Keep extensions on the path so pgcrypto functions (e.g., gen_random_uuid) are visible
set search_path = public, extensions;

-- Ensure the "extensions" schema exists (common on self-hosted)
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create schema extensions';
  end if;
end $$;

-- Install pgcrypto in the "extensions" schema (no-op if already installed elsewhere)
create extension if not exists pgcrypto with schema extensions;

--------------------------------------------------------------------------------
-- Helper functions
--------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

--------------------------------------------------------------------------------
-- Tables
--------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  default_language_code text,
  default_template_id uuid,
  current_workspace uuid,
  email text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.workspaces (
  id uuid primary key,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()) not null,
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

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

create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft',
  language_code text,
  template_id uuid references public.templates(id) on delete set null,
  audio_path text not null,
  transcript text,
  summary text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,
  created_by_email text
);

create index if not exists journals_workspace_created_at_idx
  on public.journals(workspace_id, created_at desc);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  status text not null check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')) default 'pending',
  token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc', now()) not null,
  expires_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null
);

create index if not exists invites_workspace_status_idx on public.invites(workspace_id, status);

create table if not exists public.languages (
  code text primary key,
  label text not null
);

--------------------------------------------------------------------------------
-- FKs added after table creation (to avoid dependency tangles)
--------------------------------------------------------------------------------


-- default_template_id → templates(id)
alter table public.profiles
  drop constraint if exists profiles_default_template_id_fkey,
  add  constraint        profiles_default_template_id_fkey
    foreign key (default_template_id)
    references public.templates(id)
    on delete set null;

-- current_workspace → workspaces(id)
alter table public.profiles
  drop constraint if exists profiles_current_workspace_fkey,
  add  constraint        profiles_current_workspace_fkey
    foreign key (current_workspace)
    references public.workspaces(id);


--------------------------------------------------------------------------------
-- Backfill / maintenance updates (run as a role with access to auth.users)
--------------------------------------------------------------------------------

update public.invites i
set accepted_by = u.id
from auth.users u
where i.status = 'accepted'
  and i.accepted_by is null
  and lower(i.email) = lower(u.email);

update public.profiles as p
set email = u.email
from auth.users as u
where p.id = u.id
  and (p.email is distinct from u.email);

update public.journals as j
set created_by_email = u.email
from auth.users as u
where j.created_by = u.id
  and (j.created_by_email is null or j.created_by_email = '');

update public.workspaces as w
set name = concat(split_part(u.email, '@', 1), ' Workspace')
from auth.users as u
where w.id = u.id
  and w.owner_id = u.id
  and w.name = concat(coalesce(u.raw_user_meta_data ->> 'full_name', ''), '''s Workspace');

--------------------------------------------------------------------------------
-- Helper predicates (RLS helpers)
--------------------------------------------------------------------------------

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace
      and wm.user_id = auth.uid()
  );
$$;

-- Make this SECURITY DEFINER so membership/owner checks won't be blocked by RLS on workspaces,
-- provided the function owner also owns the table (typical in migrations).
create or replace function public.is_core_member(p_workspace uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace
      and w.owner_id = auth.uid()
  );
$$;

--------------------------------------------------------------------------------
-- User bootstrap + invite management
--------------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_local text;
begin
  email_local := coalesce(nullif(split_part(new.email, '@', 1), ''), 'Default');

  insert into public.profiles(id, email)
  values (new.id, new.email);

  insert into public.workspaces(id, name, owner_id)
  values (new.id, concat(email_local, ' Workspace'), new.id);

  insert into public.workspace_members(workspace_id, user_id)
  values (new.id, new.id);

  return new;
end;
$$;

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
  values (invite_record.workspace_id, auth.uid())
  on conflict (workspace_id, user_id) do nothing;

  update public.invites
  set status = 'accepted',
      accepted_by = auth.uid()
  where id = invite_record.id;
end;
$$;

create or replace function public.get_pending_invites_for_user()
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  status text,
  created_at timestamptz,
  token text
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.workspace_id,
    w.name as workspace_name,
    i.status,
    i.created_at,
    case when i.status = 'pending' then i.token else null end as token
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  where (
      i.status = 'pending'
      and (i.expires_at is null or i.expires_at > timezone('utc', now()))
      and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or (
      i.status = 'accepted'
      and i.accepted_by = auth.uid()
    )
  order by i.created_at desc;
$$;

create or replace function public.decline_invite(p_invite_id uuid)
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
  where id = p_invite_id
    and status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (expires_at is null or expires_at > timezone('utc', now()))
  for update;

  if invite_record.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  update public.invites
  set status = 'declined'
  where id = invite_record.id;
end;
$$;

create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record record;
  can_manage boolean;
  is_invitee boolean;
begin
  select
    i.*,
    public.is_core_member(i.workspace_id) as is_core_member,
    w.owner_id as workspace_owner
  into invite_record
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.id = p_invite_id
  for update;

  if invite_record.id is null then
    raise exception 'Invite not found';
  end if;

  is_invitee := invite_record.accepted_by = auth.uid();
  can_manage := is_invitee or invite_record.is_core_member;

  if not can_manage then
    raise exception 'You do not have permission to revoke this invite.';
  end if;

  if invite_record.status = 'revoked' then
    return;
  end if;

  if invite_record.accepted_by is not null then
    if invite_record.accepted_by = invite_record.workspace_owner then
      raise exception 'Cannot revoke the workspace owner.';
    end if;

    delete from public.workspace_members
    where workspace_id = invite_record.workspace_id
      and user_id = invite_record.accepted_by;
  end if;

  update public.invites
  set status = 'revoked'
  where id = invite_record.id;
end;
$$;

--------------------------------------------------------------------------------
-- Journals helper (created_by_email resolution)
--------------------------------------------------------------------------------

create or replace function public.set_journal_created_by_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_email text;
begin
  resolved_email := coalesce(
    nullif(new.created_by_email, ''),
    nullif(auth.jwt() ->> 'email', ''),
    (select email from auth.users where id = new.created_by)
  );

  new.created_by_email := resolved_email;
  return new;
end;
$$;

--------------------------------------------------------------------------------
-- Journals helper (created_by_email resolution)
--------------------------------------------------------------------------------

create or replace function public.set_journal_created_by_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_email text;
begin
  resolved_email := coalesce(
    nullif(new.created_by_email, ''),
    nullif(auth.jwt() ->> 'email', ''),
    (select email from auth.users where id = new.created_by)
  );

  new.created_by_email := resolved_email;
  return new;
end;
$$;

--------------------------------------------------------------------------------
-- Triggers
--------------------------------------------------------------------------------

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

drop trigger if exists journals_set_updated_at on public.journals;
create trigger journals_set_updated_at
before update on public.journals
for each row execute function public.set_updated_at();

drop trigger if exists journals_set_created_by_email on public.journals;
create trigger journals_set_created_by_email
before insert on public.journals
for each row execute function public.set_journal_created_by_email();

-- NOTE: run this migration as a role that owns auth.users (e.g., postgres/supabase_admin)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.templates enable row level security;
alter table public.vocabulary_entries enable row level security;
alter table public.journals enable row level security;
alter table public.invites enable row level security;
alter table public.languages enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
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

-- workspaces
drop policy if exists "Members can view their workspaces" on public.workspaces;
create policy "Members can view their workspaces" on public.workspaces
  for select using (public.is_workspace_member(id));

-- workspace_members
drop policy if exists "Users can read their own memberships" on public.workspace_members;
create policy "Users can read their own memberships"
  on public.workspace_members
  for select using (user_id = auth.uid());

drop policy if exists "Owners can read all workspace members" on public.workspace_members;
create policy "Owners can read all workspace members"
  on public.workspace_members
  for select using (public.is_core_member(workspace_id));

drop policy if exists "Core members can add members" on public.workspace_members;
create policy "Core members can add members"
  on public.workspace_members
  for insert with check (public.is_core_member(workspace_id));

drop policy if exists "Core members can update members" on public.workspace_members;
create policy "Core members can update members"
  on public.workspace_members
  for update
  using (public.is_core_member(workspace_id))
  with check (public.is_core_member(workspace_id));

drop policy if exists "Cannot delete owner membership" on public.workspace_members;
create policy "Cannot delete owner membership"
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

-- templates
drop policy if exists templates_select_global on public.templates;
create policy templates_select_global on public.templates
  for select using (kind = 'Std' or (workspace_id is not null and public.is_workspace_member(workspace_id)));

drop policy if exists templates_insert_workspace on public.templates;
create policy templates_insert_workspace on public.templates
  for insert with check (
    (kind = 'Std' and auth.role() = 'service_role') or
    (workspace_id is not null and public.is_workspace_member(workspace_id))
  );

drop policy if exists templates_update_workspace on public.templates;
create policy templates_update_workspace on public.templates
  for update
  using (
    (kind = 'Std' and auth.role() = 'service_role') or
    (workspace_id is not null and (public.is_core_member(workspace_id) or created_by = auth.uid()))
  );

drop policy if exists templates_delete_workspace on public.templates;
create policy templates_delete_workspace on public.templates
  for delete using (workspace_id is not null and public.is_core_member(workspace_id));

-- vocabulary_entries
drop policy if exists vocabulary_entries_rw on public.vocabulary_entries;
create policy vocabulary_entries_rw on public.vocabulary_entries
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- journals
drop policy if exists journals_select on public.journals;
create policy journals_select on public.journals
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists journals_insert on public.journals;
create policy journals_insert on public.journals
  for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists journals_update on public.journals;
create policy journals_update on public.journals
  for update
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_core_member(workspace_id) or created_by = auth.uid())
  );

drop policy if exists journals_delete on public.journals;
create policy journals_delete on public.journals
  for delete using (public.is_core_member(workspace_id));

-- invites
drop policy if exists invites_core_only on public.invites;
create policy invites_core_only on public.invites
  for all using (public.is_core_member(workspace_id))
  with check (public.is_core_member(workspace_id));

-- languages (public read)
drop policy if exists languages_read_public on public.languages;
create policy languages_read_public on public.languages
  for select using (true);

--------------------------------------------------------------------------------
-- Storage (guarded: only run if storage schema/tables exist)
--------------------------------------------------------------------------------

do $$
begin
  -- create bucket if buckets table exists
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('audio', 'audio', false)
    on conflict (id) do nothing;
  end if;

  -- enable RLS and create policy if objects table exists
  if to_regclass('storage.objects') is not null then
    -- enable RLS (idempotent)
    execute 'alter table storage.objects enable row level security';

    -- create policy once
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename  = 'objects'
        and policyname = 'audio_members_manage'
    ) then
      create policy audio_members_manage on storage.objects
        for all
        using (
          bucket_id = 'audio'
          and (
            auth.role() = 'service_role'
            or exists (
              select 1
              from public.workspace_members wm
              where wm.user_id = auth.uid()
                and wm.workspace_id::text = split_part(name, '/', 1)
            )
          )
        )
        with check (
          bucket_id = 'audio'
          and (
            auth.role() = 'service_role'
            or exists (
              select 1
              from public.workspace_members wm
              where wm.user_id = auth.uid()
                and wm.workspace_id::text = split_part(name, '/', 1)
            )
          )
        );
    end if;
  end if;
end $$;


--------------------------------------------------------------------------------
-- Seed standard templates (idempotent)
--------------------------------------------------------------------------------

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


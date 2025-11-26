-- Migration 0010_journal_author_email — store journal author emails and update workspace defaults
set check_function_bodies = off;
set search_path = public;

-- Ensure profiles can store the email address for future joins.
alter table public.profiles
  add column if not exists email text;

update public.profiles as p
set email = u.email
from auth.users as u
where p.id = u.id
  and (p.email is distinct from u.email);

-- Persist the author email on journal rows for easier display.
alter table public.journals
  add column if not exists created_by_email text;

update public.journals as j
set created_by_email = u.email
from auth.users as u
where j.created_by = u.id
  and (j.created_by_email is null or j.created_by_email = '');

-- Keep the author email in sync for new journal inserts.
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

drop trigger if exists journals_set_created_by_email on public.journals;
create trigger journals_set_created_by_email
before insert on public.journals
for each row execute function public.set_journal_created_by_email();

-- Update the signup automation to use email-based workspace defaults.
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

-- Refresh any existing default workspace names that still use the old pattern.
update public.workspaces as w
set name = concat(split_part(u.email, '@', 1), ' Workspace')
from auth.users as u
where w.id = u.id
  and w.owner_id = u.id
  and w.name = concat(coalesce(u.raw_user_meta_data ->> 'full_name', ''), '''s Workspace');

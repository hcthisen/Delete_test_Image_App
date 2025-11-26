-- Adds support for declining invites and allows invited users to manage their pending invitations.

-- Extend invite status enum to include declined responses.
alter table public.invites
  drop constraint if exists invites_status_check;

alter table public.invites
  add constraint invites_status_check
  check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired'));

-- Function to list pending invites for the authenticated user, including workspace names.
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
    i.token
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.status = 'pending'
    and (i.expires_at is null or i.expires_at > timezone('utc', now()))
    and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by i.created_at desc;
$$;

-- Allow invited users to decline their own invitations without exposing the invites table directly.
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

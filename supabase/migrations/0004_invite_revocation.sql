-- Support revoking invites after acceptance and allowing members to leave workspaces.

-- Track which user accepted an invite so we can revoke memberships later.
alter table public.invites
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null;

-- Backfill accepted invites using the email address on file.
update public.invites i
set accepted_by = u.id
from auth.users u
where i.status = 'accepted'
  and i.accepted_by is null
  and lower(i.email) = lower(u.email);

-- Update invite acceptance flow to remember the accepting account.
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

-- Allow users to see accepted invites they can leave.
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

-- Allow workspace owners to revoke invites and members to leave.
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

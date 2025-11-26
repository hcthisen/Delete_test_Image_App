-- Ensure workspace membership checks bypass RLS so invited members can load workspace metadata.
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

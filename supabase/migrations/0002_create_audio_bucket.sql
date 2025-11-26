-- Create the private storage bucket for browser recordings.
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

-- Ensure RLS is enabled on storage.objects (no-op if already enabled)
alter table storage.objects enable row level security;

-- Create/ensure the policy exists without using IF NOT EXISTS (not supported)
do $$
begin
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
end
$$;

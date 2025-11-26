-- Redefine delete_journal_audio to trim the leading audio/ prefix from object keys.
create or replace function public.delete_journal_audio()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  object_key text;
begin
  if old.audio_path is not null then
    object_key := regexp_replace(old.audio_path, '^audio/', '');
    if object_key is not null and object_key <> '' then
      -- Ignore result; storage.delete returns void
      perform storage.delete('audio', array[object_key]);
    end if;
  end if;
  return old;
exception
  when others then
    -- Avoid blocking journal deletion if the storage entry is missing or delete fails.
    return old;
end;
$$;

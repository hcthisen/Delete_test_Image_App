-- Ensure delete_journal_audio casts parameters to the expected types for storage.delete.
create or replace function public.delete_journal_audio()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  object_key text;
begin
  if old.audio_path is null then
    return old;
  end if;

  object_key := old.audio_path;

  -- Trim any leading storage prefixes.
  object_key := regexp_replace(object_key, '.*?/storage/v1/object/(?:sign|public)/audio/', '');
  object_key := regexp_replace(object_key, '^audio/', '');

  object_key := nullif(object_key, '');
  if object_key is null then
    return old;
  end if;

  -- Cast parameters explicitly so storage.delete resolves correctly.
  perform storage.delete('audio'::text, array[object_key]::text[]);

  return old;
exception
  when others then
    raise notice 'delete_journal_audio: failed to delete %: [%] %',
      object_key, SQLSTATE, SQLERRM;
    return old;
end;
$$;

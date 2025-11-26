-- Ensure journal audio files are removed from storage when the journal row is deleted.
create or replace function public.delete_journal_audio()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.audio_path is not null then
    -- Ignore result; storage.delete returns void
    perform storage.delete('audio', array[old.audio_path]);
  end if;
  return old;
exception
  when others then
    -- Avoid blocking journal deletion if the storage entry is missing or delete fails.
    return old;
end;
$$;

create trigger journals_delete_audio
after delete on public.journals
for each row execute function public.delete_journal_audio();

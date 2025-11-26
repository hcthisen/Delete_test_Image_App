-- Fix delete_journal_audio to reliably remove objects from the "audio" bucket
-- and ensure it runs with appropriate privileges.

-- 1) Create or replace the function with SECURITY DEFINER and safer normalization.
create or replace function public.delete_journal_audio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  key text;
begin
  key := coalesce(old.audio_path, '');

  -- Nothing to do if empty
  if key = '' then
    return old;
  end if;

  -- Normalize to a storage object key (relative path inside the "audio" bucket)

  -- Strip full URL prefixes like:
  --   .../storage/v1/object/public/audio/...
  --   .../storage/v1/object/sign/audio/...
  --   .../storage/v1/object/authenticated/audio/...
  key := regexp_replace(
           key,
           '^https?://[^?]*/storage/v1/object/(public|sign|authenticated)/audio/',
           ''
         );

  -- If someone stored a path starting with "audio/", remove it
  key := regexp_replace(key, '^audio/', '');

  -- Strip query string (signed URLs, etc.)
  key := split_part(key, '?', 1);

  -- Strip any leading slash
  key := regexp_replace(key, '^/', '');

  -- After normalization, if it's empty, bail out gracefully
  if key = '' then
    return old;
  end if;

  -- Perform deletion
  perform storage.delete('audio', array[key]::text[]);

  return old;
exception
  when others then
    -- Optional: send a NOTIFY so you can see failures in logs/listeners
    perform pg_notify(
      'journal_audio_delete_failed',
      format('path=%s code=%s msg=%s', key, SQLSTATE, SQLERRM)
    );
    return old;
end;
$$;

-- 2) Make sure only intended roles can execute the function directly (not necessary for triggers, but good hygiene).
revoke all on function public.delete_journal_audio() from public;
grant execute on function public.delete_journal_audio() to postgres, supabase_admin, service_role;

-- 3) Drop duplicate triggers and re-create a single AFTER DELETE trigger.
drop trigger if exists journals_delete_audio on public.journals;
drop trigger if exists trg_delete_journal_audio on public.journals;

create trigger journals_delete_audio
after delete on public.journals
for each row execute function public.delete_journal_audio();

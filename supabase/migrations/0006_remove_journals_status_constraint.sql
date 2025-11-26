-- Remove status check constraint on public.journals to allow new status values
alter table public.journals
  drop constraint if exists journals_status_check;

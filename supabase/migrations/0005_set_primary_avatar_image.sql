-- Function to set an avatar image as primary
create or replace function public.set_primary_avatar_image(target_image_id uuid)
returns avatar_images
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record avatar_images%rowtype;
begin
  select * into target_record from public.avatar_images where id = target_image_id;
  if not found then
    raise exception 'Avatar image not found';
  end if;

  if auth.uid() is null or auth.uid() <> target_record.user_id then
    raise exception 'Not authorized to update this avatar image';
  end if;

  update public.avatar_images
    set is_primary = false
    where avatar_id = target_record.avatar_id
      and user_id = target_record.user_id
      and id <> target_image_id;

  update public.avatar_images
    set is_primary = true
    where id = target_image_id
    returning * into target_record;

  return target_record;
end;
$$;

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Avatar, AvatarImage } from "@/lib/types/avatars";

export const AVATAR_BUCKET = "avatars";

export async function getAvatarsForUser(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("avatars")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export async function getAvatarById(supabase: SupabaseClient, avatarId: string, userId: string) {
  return supabase
    .from("avatars")
    .select("*")
    .eq("id", avatarId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function createAvatar(
  supabase: SupabaseClient,
  payload: Omit<Avatar, "id" | "created_at" | "updated_at" | "persona_summary" | "profile_image_path" | "status"> &
    Partial<Pick<Avatar, "persona_summary" | "profile_image_path" | "status">>
) {
  return supabase.from("avatars").insert(payload).select("*").single();
}

export async function getAvatarImages(supabase: SupabaseClient, avatarId: string, userId: string) {
  return supabase
    .from("avatar_images")
    .select("*")
    .eq("avatar_id", avatarId)
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
}

export async function getPrimaryAvatarImages(
  supabase: SupabaseClient,
  avatarIds: string[],
  userId: string
) {
  if (avatarIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from("avatar_images")
    .select("*")
    .in("avatar_id", avatarIds)
    .eq("user_id", userId)
    .eq("is_primary", true);
}

export async function getPublicAvatarUrl(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function getPublicAvatarUrls(
  supabase: SupabaseClient,
  images: AvatarImage[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    images.map(async (image) => {
      const url = await getPublicAvatarUrl(supabase, image.storage_path);
      return [image.id, url] as const;
    })
  );
  return Object.fromEntries(entries.filter(([, url]) => Boolean(url)) as [string, string][]);
}

export async function setPrimaryAvatarImage(supabase: SupabaseClient, targetImageId: string) {
  return supabase.rpc("set_primary_avatar_image", { target_image_id: targetImageId });
}

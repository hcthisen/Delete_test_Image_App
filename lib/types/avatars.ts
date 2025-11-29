export type AvatarStatus = "pending" | "generating" | "ready" | "failed";

export interface Avatar {
  id: string;
  user_id: string;
  name: string;
  age: number;
  height_cm?: number | null;
  skin_tone?: string | null;
  hair_color?: string | null;
  marital_status?: string | null;
  job_title?: string | null;
  industry?: string | null;
  address_line?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  hobbies?: string[] | null;
  political_orientation?: string | null;
  other_traits?: string | null;
  persona_summary?: string | null;
  profile_image_path?: string | null;
  status: AvatarStatus;
  n8n_job_id?: string | null;
  extra_attributes?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface AvatarImage {
  id: string;
  avatar_id: string;
  user_id: string;
  type: "profile" | "scenario";
  label?: string | null;
  description?: string | null;
  storage_path: string;
  is_primary: boolean;
  created_at: string;
}

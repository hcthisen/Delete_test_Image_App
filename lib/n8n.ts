import type { Avatar } from "@/lib/types/avatars";

type N8nPayload = Record<string, unknown>;

async function postToWebhook(url: string | undefined, payload: N8nPayload) {
  if (!url) {
    throw new Error("Webhook URL is not configured.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`n8n webhook error: ${response.status} ${text}`);
  }
}

export async function triggerAvatarGeneration(avatar: Avatar) {
  const payload: N8nPayload = {
    avatar_id: avatar.id,
    user_id: avatar.user_id,
    profile: avatar,
  };

  await postToWebhook(process.env.NEXT_PUBLIC_N8N_AVATAR_WEBHOOK_URL, payload);
}

export async function triggerScenarioGeneration(avatar: Avatar, scenarioPrompt?: string) {
  const payload: N8nPayload = {
    avatar_id: avatar.id,
    user_id: avatar.user_id,
    profile: avatar,
    persona_summary: avatar.persona_summary,
    profile_image_path: avatar.profile_image_path,
    scenario_prompt: scenarioPrompt ?? null,
  };

  await postToWebhook(process.env.NEXT_PUBLIC_N8N_SCENES_WEBHOOK_URL, payload);
}

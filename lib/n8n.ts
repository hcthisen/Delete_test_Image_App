import type { Avatar } from "@/lib/types/avatars";

import { createRequestId, logger, safeSummary } from "./logger";

interface WebhookContext {
  requestId?: string;
  userId?: string;
  avatarId?: string;
  eventType: string;
  operation?: string;
}

type N8nPayload = Record<string, unknown>;

async function postToWebhook(url: string | undefined, payload: N8nPayload, context: WebhookContext) {
  if (!url) {
    const error = new Error("Webhook URL is not configured.");
    logger.error({
      scope: "webhook.error",
      msg: "Webhook URL missing",
      requestId: context.requestId,
      userId: context.userId,
      avatarId: context.avatarId,
      eventType: context.eventType,
      err: error,
    });
    throw error;
  }

  const requestId = context.requestId ?? createRequestId();
  const start = Date.now();
  const targetUrl = (() => {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch (error) {
      return url.slice(0, 120);
    }
  })();

  logger.info({
    scope: "webhook.call",
    msg: "Calling outgoing webhook",
    requestId,
    userId: context.userId,
    avatarId: context.avatarId,
    eventType: context.eventType,
    targetUrl,
    payloadSummary: safeSummary(payload),
    operation: context.operation,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const durationMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`n8n webhook error: ${response.status} ${text}`);
      logger.error({
        scope: "webhook.error",
        msg: "Webhook call failed",
        requestId,
        userId: context.userId,
        avatarId: context.avatarId,
        eventType: context.eventType,
        statusCode: response.status,
        durationMs,
        targetUrl,
        err: error,
      });
      throw error;
    }

    logger.info({
      scope: "webhook.response",
      msg: "Webhook responded",
      requestId,
      userId: context.userId,
      avatarId: context.avatarId,
      eventType: context.eventType,
      statusCode: response.status,
      durationMs,
      targetUrl,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error({
        scope: "webhook.error",
        msg: "Webhook call threw",
        requestId,
        userId: context.userId,
        avatarId: context.avatarId,
        eventType: context.eventType,
        err: error,
      });
    }
    throw error;
  }
}

export async function triggerAvatarGeneration(avatar: Avatar, requestId?: string) {
  const context: WebhookContext = {
    requestId,
    userId: avatar.user_id,
    avatarId: avatar.id,
    eventType: "avatar.generation",
    operation: "avatar.generation.request",
  };

  const payload: N8nPayload = {
    avatar_id: avatar.id,
    user_id: avatar.user_id,
    profile: avatar,
  };

  await postToWebhook(process.env.NEXT_PUBLIC_N8N_AVATAR_WEBHOOK_URL, payload, context);
}

export async function triggerScenarioGeneration(avatar: Avatar, scenarioPrompt?: string, requestId?: string) {
  const context: WebhookContext = {
    requestId,
    userId: avatar.user_id,
    avatarId: avatar.id,
    eventType: "avatar.scenario",
    operation: "avatar.scenario.request",
  };

  const payload: N8nPayload = {
    avatar_id: avatar.id,
    user_id: avatar.user_id,
    profile: avatar,
    persona_summary: avatar.persona_summary,
    profile_image_path: avatar.profile_image_path,
    scenario_prompt: scenarioPrompt ?? null,
  };

  await postToWebhook(process.env.NEXT_PUBLIC_N8N_SCENES_WEBHOOK_URL, payload, context);
}

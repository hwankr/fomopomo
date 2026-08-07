import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push";
import {
  isAuthorizedWebhook,
  isJsonContentType,
  isSafePushEndpoint,
  isStudyStartTransition,
  MAX_WEBHOOK_BODY_BYTES,
  parseContentLength,
  parsePushWebhookPayload,
  resolveServiceApiKey,
  sanitizeError,
  sanitizeWebPushError,
  shouldDeleteSubscription,
  validateRuntimeConfig,
} from "./helpers.ts";

const EVENT_KIND = "study_started";
const COOLDOWN_SECONDS = 60;

const serviceApiKey = resolveServiceApiKey(
  Deno.env.get("SUPABASE_SECRET_KEYS"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
);

let cachedSupabaseClient:
  | ReturnType<typeof createClient>
  | null = null;

function getSupabaseClient() {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }

  cachedSupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceApiKey,
  );
  return cachedSupabaseClient;
}

type NotificationSubscription = {
  endpoint: string;
  id: string;
  keys: Record<string, string>;
  user_id: string;
};

type NotificationProfile = {
  current_task: string | null;
  email: string | null;
  id: string;
  nickname: string | null;
  status: string | null;
};

type DeliveryCounts = {
  delivered: number;
  failed: number;
  skipped: number;
};

type ClaimRpcResponse =
  | { status?: unknown }
  | Array<{ status?: unknown }>
  | null;

type SupabaseMutationResult = {
  error: unknown;
};

type PushRuntimeRepo = {
  claimEvent: (input: {
    cooldownSeconds: number;
    eventId: string;
    eventKind: string;
    userId: string;
  }) => Promise<"claimed" | "cooldown" | "duplicate">;
  deleteSubscription: (
    subscription: Pick<NotificationSubscription, "endpoint" | "id" | "user_id">,
  ) => Promise<void>;
  getEligibleRecipientIds: (actorUserId: string) => Promise<string[]>;
  getProfile: (userId: string) => Promise<NotificationProfile | null>;
  getSubscriptions: (
    userIds: string[],
  ) => Promise<NotificationSubscription[]>;
  insertDebugLog: (
    message: string,
    details?: Record<string, unknown>,
  ) => Promise<void>;
  markEventOutcome: (input: {
    eventId: string;
    outcome: string;
  }) => Promise<void>;
};

type HandlerDependencies = {
  loadRuntimeConfig?: typeof loadRuntimeConfig;
  repo?: PushRuntimeRepo;
  webPush?: Pick<typeof webpush, "sendNotification" | "setVapidDetails">;
};

function unauthorizedResponse() {
  return new Response("Unauthorized", { status: 401 });
}

function serviceUnavailableResponse() {
  return new Response("Service Unavailable", { status: 503 });
}

function internalServerErrorResponse() {
  return new Response("Internal Server Error", { status: 500 });
}

function badRequestResponse() {
  return new Response("Bad Request", { status: 400 });
}

function unsupportedMediaTypeResponse() {
  return new Response("Unsupported Media Type", { status: 415 });
}

function payloadTooLargeResponse() {
  return new Response("Payload Too Large", { status: 413 });
}

function successResponse(counts: DeliveryCounts) {
  return new Response(
    JSON.stringify({
      ok: true,
      delivered: counts.delivered,
      failed: counts.failed,
      skipped: counts.skipped,
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
    },
  );
}

const defaultRepo: PushRuntimeRepo = {
  async claimEvent({ cooldownSeconds, eventId, eventKind, userId }) {
    const { data, error } = await getSupabaseClient().rpc(
      "claim_push_notification_event",
      {
        p_cooldown_seconds: cooldownSeconds,
        p_event_id: eventId,
        p_event_kind: eventKind,
        p_user_id: userId,
      } as never,
    ) as unknown as {
      data: ClaimRpcResponse;
      error: unknown;
    };

    if (error) {
      throw error;
    }

    const status = Array.isArray(data)
      ? data[0]?.status
      : typeof data === "object" && data !== null && "status" in data
      ? (data as { status?: unknown }).status
      : undefined;

    if (
      status === "claimed" ||
      status === "duplicate" ||
      status === "cooldown"
    ) {
      return status;
    }

    throw new Error("Invalid claim_push_notification_event result");
  },

  async deleteSubscription({ endpoint, id, user_id }) {
    const { error } = await getSupabaseClient()
      .from("push_subscriptions")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id)
      .eq("endpoint", endpoint) as unknown as SupabaseMutationResult;

    if (error) {
      throw error;
    }
  },

  async getEligibleRecipientIds(actorUserId) {
    const { data, error } = await getSupabaseClient()
      .from("friendships")
      .select("user_id")
      .eq("friend_id", actorUserId)
      .eq("is_notification_enabled", true) as unknown as {
        data: Array<{ user_id: string }> | null;
        error: unknown;
      };

    if (error) {
      throw error;
    }

    return [
      ...new Set(
        (data ?? [])
          .map((row) => row.user_id)
          .filter((value): value is string =>
            typeof value === "string" && value.length > 0
          ),
      ),
    ];
  },

  async getProfile(userId) {
    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .select("id, status, nickname, email, current_task")
      .eq("id", userId)
      .maybeSingle() as unknown as {
        data: NotificationProfile | null;
        error: unknown;
      };

    if (error) {
      throw error;
    }

    return data as NotificationProfile | null;
  },

  async getSubscriptions(userIds) {
    if (userIds.length === 0) {
      return [];
    }

    const { data, error } = await getSupabaseClient()
      .from("push_subscriptions")
      .select("id, user_id, endpoint, keys")
      .in("user_id", userIds) as unknown as {
        data: NotificationSubscription[] | null;
        error: unknown;
      };

    if (error) {
      throw error;
    }

    return (data ?? []) as NotificationSubscription[];
  },

  async insertDebugLog(message, details) {
    try {
      await getSupabaseClient().from("debug_logs").insert({
        details,
        message,
      } as never);
    } catch {
      // Avoid cascading failures if debug logging itself is unavailable.
    }
  },

  async markEventOutcome({ eventId, outcome }) {
    const { error } = await getSupabaseClient().rpc(
      "complete_push_notification_event",
      {
        p_event_id: eventId,
        p_outcome: outcome,
      } as never,
    ) as unknown as {
      error: unknown;
    };

    if (error) {
      throw error;
    }
  },
};

function loadRuntimeConfig() {
  return validateRuntimeConfig({
    serviceApiKey,
    webhookSecret: Deno.env.get("WEBHOOK_SECRET"),
    vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
    vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
    vapidSubject: Deno.env.get("VAPID_SUBJECT"),
  });
}

function getNotificationDisplayName(profile: NotificationProfile): string {
  const nickname = profile.nickname?.trim();
  if (nickname) {
    return nickname;
  }

  const emailName = profile.email?.split("@")[0]?.trim();
  return emailName || "친구";
}

function buildNotificationPayload(profile: NotificationProfile): string {
  const taskName = profile.current_task?.trim();

  return JSON.stringify({
    body: `${getNotificationDisplayName(profile)}님이 ${
      taskName ? `"${taskName}" ` : ""
    }공부를 시작했습니다! 🔥`,
    title: "fomopomo",
    url: "/",
  });
}

async function finalizeEventOutcome(
  repo: PushRuntimeRepo,
  eventId: string,
  outcome: string,
): Promise<void> {
  try {
    await repo.markEventOutcome({ eventId, outcome });
  } catch (error) {
    await repo.insertDebugLog(
      "Push event finalization failed",
      sanitizeError(error),
    );
  }
}

async function readWebhookPayload(req: Request) {
  if (!isJsonContentType(req.headers.get("content-type"))) {
    return { ok: false as const, response: unsupportedMediaTypeResponse() };
  }

  const contentLengthHeader = req.headers.get("content-length");
  const contentLength = parseContentLength(contentLengthHeader);
  if (contentLengthHeader !== null && contentLength === null) {
    return { ok: false as const, response: badRequestResponse() };
  }

  if (
    typeof contentLength === "number" &&
    contentLength > MAX_WEBHOOK_BODY_BYTES
  ) {
    return { ok: false as const, response: payloadTooLargeResponse() };
  }

  const rawBodyResult = await readRequestTextWithinLimit(
    req,
    MAX_WEBHOOK_BODY_BYTES,
  );
  if (!rawBodyResult.ok) {
    return { ok: false as const, response: payloadTooLargeResponse() };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBodyResult.text);
  } catch {
    return { ok: false as const, response: badRequestResponse() };
  }

  const payload = parsePushWebhookPayload(parsedBody);
  if (!payload || !isStudyStartTransition(payload)) {
    return { ok: false as const, response: badRequestResponse() };
  }

  return { ok: true as const, payload };
}

async function readRequestTextWithinLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; text: string }
  | { ok: false }
> {
  const reader = req.body?.getReader();
  if (!reader) {
    return { ok: true, text: "" };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false };
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(merged) };
}

export function createHandler({
  loadRuntimeConfig: loadConfig = loadRuntimeConfig,
  repo = defaultRepo,
  webPush = webpush,
}: HandlerDependencies = {}) {
  return async function handler(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const runtimeConfig = loadConfig();
    if (runtimeConfig.ok === false) {
      await repo.insertDebugLog("Push notification unavailable", {
        reason: runtimeConfig.reason,
      });
      return serviceUnavailableResponse();
    }

    if (!isAuthorizedWebhook(req.headers, runtimeConfig.config.webhookSecret)) {
      return unauthorizedResponse();
    }

    let eventId: string | null = null;
    let eventClaimed = false;

    try {
      const parsedPayload = await readWebhookPayload(req);
      if (!parsedPayload.ok) {
        return parsedPayload.response;
      }

      const payload = parsedPayload.payload;
      eventId = payload.event_id;

      try {
        webPush.setVapidDetails(
          runtimeConfig.config.vapidSubject,
          runtimeConfig.config.vapidPublicKey,
          runtimeConfig.config.vapidPrivateKey,
        );
      } catch (error) {
        await repo.insertDebugLog(
          "Push notification unavailable",
          sanitizeError(error),
        );
        return serviceUnavailableResponse();
      }

      const claimResult = await repo.claimEvent({
        cooldownSeconds: COOLDOWN_SECONDS,
        eventId: payload.event_id,
        eventKind: EVENT_KIND,
        userId: payload.record.id,
      });

      if (claimResult === "duplicate" || claimResult === "cooldown") {
        return successResponse({ delivered: 0, failed: 0, skipped: 0 });
      }

      eventClaimed = true;

      const profile = await repo.getProfile(payload.record.id);
      if (!profile || profile.status !== "studying") {
        await finalizeEventOutcome(
          repo,
          payload.event_id,
          "profile_not_studying",
        );
        return successResponse({ delivered: 0, failed: 0, skipped: 0 });
      }

      const recipientIds = await repo.getEligibleRecipientIds(
        payload.record.id,
      );
      if (recipientIds.length === 0) {
        await finalizeEventOutcome(repo, payload.event_id, "no_recipients");
        return successResponse({ delivered: 0, failed: 0, skipped: 0 });
      }

      const subscriptions = await repo.getSubscriptions(recipientIds);
      if (subscriptions.length === 0) {
        await finalizeEventOutcome(repo, payload.event_id, "no_subscriptions");
        return successResponse({ delivered: 0, failed: 0, skipped: 0 });
      }

      const safeSubscriptions = subscriptions.filter((subscription) =>
        isSafePushEndpoint(subscription.endpoint)
      );
      const skipped = subscriptions.length - safeSubscriptions.length;

      if (safeSubscriptions.length === 0) {
        await finalizeEventOutcome(
          repo,
          payload.event_id,
          "no_safe_subscriptions",
        );
        return successResponse({ delivered: 0, failed: 0, skipped });
      }

      const notificationPayload = buildNotificationPayload(profile);
      let delivered = 0;
      let failed = 0;

      await Promise.all(safeSubscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            notificationPayload,
          );
          delivered += 1;
        } catch (error) {
          failed += 1;

          await repo.insertDebugLog("Push delivery failed", {
            eventId: payload.event_id,
            subscriptionId: subscription.id,
            userId: subscription.user_id,
            ...sanitizeWebPushError(error),
          });

          if (shouldDeleteSubscription(error)) {
            try {
              await repo.deleteSubscription({
                endpoint: subscription.endpoint,
                id: subscription.id,
                user_id: subscription.user_id,
              });
            } catch (deleteError) {
              await repo.insertDebugLog(
                "Stale push subscription cleanup failed",
                {
                  subscriptionId: subscription.id,
                  userId: subscription.user_id,
                  ...sanitizeError(deleteError),
                },
              );
            }
          }
        }
      }));

      const outcome = delivered > 0
        ? failed > 0 ? "delivered_partial" : "delivered"
        : "delivery_failed";

      await finalizeEventOutcome(repo, payload.event_id, outcome);
      return successResponse({ delivered, failed, skipped });
    } catch (error) {
      if (eventClaimed && eventId) {
        await finalizeEventOutcome(repo, eventId, "internal_error");
      }

      await repo.insertDebugLog("Push notification handler failed", {
        eventId,
        ...sanitizeError(error),
      });
      return internalServerErrorResponse();
    }
  };
}

const handler = createHandler();

if (import.meta.main) {
  Deno.serve(handler);
}

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push";
import {
  isAuthorizedWebhook,
  sanitizeError,
  sanitizeWebPushError,
  shouldDeleteSubscription,
  validateRuntimeConfig,
} from "./helpers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const unauthorizedResponse = () =>
  new Response("Unauthorized", { status: 401 });
const serviceUnavailableResponse = () =>
  new Response("Service Unavailable", { status: 503 });
const internalServerErrorResponse = () =>
  new Response("Internal Server Error", { status: 500 });

type NotificationSubscription = {
  endpoint: string;
  keys: Record<string, string>;
  id: string;
};

async function insertDebugLog(
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("debug_logs").insert({ message, details });
  } catch {
    // Avoid cascading failures if debug logging itself is unavailable.
  }
}

function loadRuntimeConfig() {
  return validateRuntimeConfig({
    webhookSecret: Deno.env.get("WEBHOOK_SECRET"),
    vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
    vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
    vapidSubject: Deno.env.get("VAPID_SUBJECT"),
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const runtimeConfig = loadRuntimeConfig();
  if (runtimeConfig.ok === false) {
    await insertDebugLog("Push notification unavailable", {
      reason: runtimeConfig.reason,
    });
    return serviceUnavailableResponse();
  }

  if (!isAuthorizedWebhook(req.headers, runtimeConfig.config.webhookSecret)) {
    return unauthorizedResponse();
  }

  try {
    webpush.setVapidDetails(
      runtimeConfig.config.vapidSubject,
      runtimeConfig.config.vapidPublicKey,
      runtimeConfig.config.vapidPrivateKey,
    );
  } catch (error) {
    await insertDebugLog(
      "Push notification unavailable",
      sanitizeError(error),
    );
    return serviceUnavailableResponse();
  }

  try {
    const payload = await req.json();
    const { record, old_record } = payload;

    let isStudyStart = false;
    if (record.status === "studying") {
      if (!old_record || old_record.status !== "studying") {
        isStudyStart = true;
      }
    }

    if (!isStudyStart && record.user_id && !record.status) {
      return new Response("Not a study start event", { status: 200 });
    }

    if (!isStudyStart) {
      return new Response("Status not changed to studying", {
        status: 200,
      });
    }

    const userId = record.id;

    const { data: friends, error: friendsError } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", userId);

    if (friendsError) {
      await insertDebugLog(
        "Error fetching friends",
        sanitizeError(friendsError),
      );
      return internalServerErrorResponse();
    }

    if (!friends || friends.length === 0) {
      return new Response("No friends found", { status: 200 });
    }

    const friendIds = friends.map((friend) => friend.friend_id);

    const { data: subscriptions, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys, id")
      .in("user_id", friendIds);

    if (subsError) {
      await insertDebugLog(
        "Error fetching subscriptions",
        sanitizeError(subsError),
      );
      return internalServerErrorResponse();
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response("No subscriptions found", { status: 200 });
    }

    const displayName = record.nickname ||
      record.email?.split("@")[0] ||
      "\uCE5C\uAD6C";
    const taskName = record.current_task ? `"${record.current_task}" ` : "";

    const notificationPayload = JSON.stringify({
      title: "fomopomo",
      body: `${displayName}\uB2D8\uC774 ${taskName}` +
        `\uACF5\uBD80\uB97C \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4! \u{1F525}`,
      url: "/",
    });

    const notificationPromises = (
      subscriptions as NotificationSubscription[]
    ).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          subscription,
          notificationPayload,
        );
      } catch (error) {
        await insertDebugLog("Error sending notification", {
          subId: subscription.id,
          ...sanitizeWebPushError(error),
        });

        if (shouldDeleteSubscription(error)) {
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);

          if (deleteError) {
            await insertDebugLog(
              "Error deleting stale subscription",
              {
                subId: subscription.id,
                ...sanitizeError(deleteError),
              },
            );
          }
        }
      }
    });

    await Promise.all(notificationPromises);

    return new Response(`Notified ${subscriptions.length} devices`, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await insertDebugLog("Unhandled error", sanitizeError(error));
    return internalServerErrorResponse();
  }
}

Deno.serve(handler);

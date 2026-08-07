import { assertEquals } from "jsr:@std/assert@1";

import { createHandler } from "./index.ts";

const validPayload = {
  event_id: "11111111-1111-4111-8111-111111111111",
  old_record: {
    status: "online",
  },
  record: {
    id: "22222222-2222-4222-8222-222222222222",
    status: "studying",
  },
} as const;

function createRuntimeConfig() {
  return {
    config: {
      serviceApiKey: "service-role-key",
      vapidPrivateKey: "private",
      vapidPublicKey: "public",
      vapidSubject: "mailto:test@example.com",
      webhookSecret: "expected-secret",
    },
    ok: true as const,
  };
}

function createRequest(
  body: string | Record<string, unknown>,
  init?: {
    contentType?: string;
    headers?: HeadersInit;
    method?: string;
  },
) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);

  return new Request("https://example.test/push-notification", {
    body: rawBody,
    headers: {
      "content-type": init?.contentType ?? "application/json",
      "x-webhook-secret": "expected-secret",
      ...(init?.headers ?? {}),
    },
    method: init?.method ?? "POST",
  });
}

function createRepo(overrides: Partial<{
  claimEvent: (input: {
    cooldownSeconds: number;
    eventId: string;
    eventKind: string;
    userId: string;
  }) => Promise<"claimed" | "cooldown" | "duplicate">;
  deleteSubscription: (subscription: {
    endpoint: string;
    id: string;
    user_id: string;
  }) => Promise<void>;
  getEligibleRecipientIds: (actorUserId: string) => Promise<string[]>;
  getProfile: (userId: string) => Promise<
    {
      current_task: string | null;
      email: string | null;
      id: string;
      nickname: string | null;
      status: string | null;
    } | null
  >;
  getSubscriptions: (
    userIds: string[],
  ) => Promise<
    Array<{
      endpoint: string;
      id: string;
      keys: Record<string, string>;
      user_id: string;
    }>
  >;
  insertDebugLog: (
    message: string,
    details?: Record<string, unknown>,
  ) => Promise<void>;
  markEventOutcome: (input: {
    eventId: string;
    outcome: string;
  }) => Promise<void>;
}> = {}) {
  const state = {
    claimCalls: [] as Array<{
      cooldownSeconds: number;
      eventId: string;
      eventKind: string;
      userId: string;
    }>,
    deleteCalls: [] as Array<{ endpoint: string; id: string; user_id: string }>,
    getSubscriptionsCalls: [] as string[][],
    logCalls: [] as Array<
      { details?: Record<string, unknown>; message: string }
    >,
    markedOutcomes: [] as Array<{ eventId: string; outcome: string }>,
    recipientCalls: [] as string[],
  };

  const repo = {
    claimEvent: async (input: {
      cooldownSeconds: number;
      eventId: string;
      eventKind: string;
      userId: string;
    }) => {
      state.claimCalls.push(input);
      return "claimed" as const;
    },
    deleteSubscription: async (subscription: {
      endpoint: string;
      id: string;
      user_id: string;
    }) => {
      state.deleteCalls.push(subscription);
    },
    getEligibleRecipientIds: async (actorUserId: string) => {
      state.recipientCalls.push(actorUserId);
      return ["33333333-3333-4333-8333-333333333333"];
    },
    getProfile: async () => ({
      current_task: "Focus mode",
      email: "friend@example.com",
      id: validPayload.record.id,
      nickname: "Friend",
      status: "studying",
    }),
    getSubscriptions: async (userIds: string[]) => {
      state.getSubscriptionsCalls.push(userIds);
      return [{
        endpoint: "https://fcm.googleapis.com/fcm/send/token",
        id: "sub-1",
        keys: { auth: "auth", p256dh: "p256dh" },
        user_id: userIds[0],
      }];
    },
    insertDebugLog: async (
      message: string,
      details?: Record<string, unknown>,
    ) => {
      state.logCalls.push({ details, message });
    },
    markEventOutcome: async (input: { eventId: string; outcome: string }) => {
      state.markedOutcomes.push(input);
    },
    ...overrides,
  };

  return { repo, state };
}

function createWebPush(
  sendImplementation: (
    subscription: Record<string, unknown>,
    payload: string,
  ) => Promise<void> = async () => undefined,
) {
  const state = {
    sendCalls: [] as Array<
      { payload: string; subscription: Record<string, unknown> }
    >,
    vapidCalls: [] as Array<[string, string, string]>,
  };

  return {
    state,
    webPush: {
      sendNotification: async (
        subscription: Record<string, unknown>,
        payload: string,
      ) => {
        state.sendCalls.push({ payload, subscription });
        await sendImplementation(subscription, payload);
      },
      setVapidDetails: (
        subject: string,
        publicKey: string,
        privateKey: string,
      ) => {
        state.vapidCalls.push([subject, publicKey, privateKey]);
      },
    },
  };
}

Deno.test("handler rejects requests without the webhook secret header", async () => {
  const { repo, state } = createRepo();
  const { webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(
    new Request("https://example.test/push", {
      body: JSON.stringify(validPayload),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(state.claimCalls.length, 0);
});

Deno.test("handler rejects requests with the wrong webhook secret header", async () => {
  const { repo, state } = createRepo();
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload, {
    headers: {
      "x-webhook-secret": "wrong-secret",
    },
  }));

  assertEquals(response.status, 401);
  assertEquals(state.claimCalls.length, 0);
  assertEquals(webPushState.sendCalls.length, 0);
});

Deno.test("handler returns 503 when runtime config is incomplete", async () => {
  const { repo, state } = createRepo();
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: () => ({
      ok: false as const,
      reason: "missing_webhook_secret" as const,
    }),
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 503);
  assertEquals(state.claimCalls.length, 0);
  assertEquals(webPushState.sendCalls.length, 0);
});

Deno.test("handler does not accept a normal JWT without the webhook secret", async () => {
  const { repo, state } = createRepo();
  const { webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(
    new Request("https://example.test/push", {
      body: JSON.stringify(validPayload),
      headers: {
        authorization: "Bearer user-jwt",
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(state.claimCalls.length, 0);
});

Deno.test("handler rejects oversized bodies before any event claim", async () => {
  const { repo, state } = createRepo();
  const { webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload, {
    headers: {
      "content-length": "20000",
    },
  }));

  assertEquals(response.status, 413);
  assertEquals(state.claimCalls.length, 0);
});

Deno.test("handler rejects oversized chunked bodies before any event claim", async () => {
  const { repo, state } = createRepo();
  const { webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const oversizedChunk = "x".repeat(17 * 1024);
  const request = new Request("https://example.test/push-notification", {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversizedChunk));
        controller.close();
      },
    }),
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": "expected-secret",
    },
    method: "POST",
  });

  const response = await handler(request);

  assertEquals(response.status, 413);
  assertEquals(state.claimCalls.length, 0);
});

Deno.test("handler rejects invalid JSON payloads", async () => {
  const { repo, state } = createRepo();
  const { webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest("{invalid-json"));

  assertEquals(response.status, 400);
  assertEquals(state.claimCalls.length, 0);
});

Deno.test("handler no-ops duplicate events without sending notifications", async () => {
  const { repo } = createRepo({
    claimEvent: async () => "duplicate",
  });
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    delivered: 0,
    failed: 0,
    ok: true,
    skipped: 0,
  });
  assertEquals(webPushState.sendCalls.length, 0);
});

Deno.test("handler suppresses forged or stale payloads when the current profile is not studying", async () => {
  const { repo, state } = createRepo({
    getProfile: async () => ({
      current_task: "Should not trust",
      email: "friend@example.com",
      id: validPayload.record.id,
      nickname: "Forged",
      status: "offline",
    }),
  });
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 200);
  assertEquals(webPushState.sendCalls.length, 0);
  assertEquals(state.markedOutcomes, [{
    eventId: validPayload.event_id,
    outcome: "profile_not_studying",
  }]);
});

Deno.test("handler applies the cooldown to distinct recent events", async () => {
  const { repo, state } = createRepo({
    claimEvent: async (input) => {
      state.claimCalls.push(input);
      return "cooldown";
    },
  });
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 200);
  assertEquals(webPushState.sendCalls.length, 0);
  assertEquals(state.markedOutcomes, []);
});

Deno.test("handler treats replay of a previously cooled-down event as duplicate", async () => {
  let seenCooldownEvent = false;
  const { repo, state } = createRepo({
    claimEvent: async (input) => {
      state.claimCalls.push(input);

      if (!seenCooldownEvent) {
        seenCooldownEvent = true;
        return "cooldown";
      }

      return "duplicate";
    },
  });
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const [firstResponse, secondResponse] = await Promise.all([
    handler(createRequest(validPayload)),
    handler(createRequest(validPayload)),
  ]);

  assertEquals(firstResponse.status, 200);
  assertEquals(secondResponse.status, 200);
  assertEquals(webPushState.sendCalls.length, 0);
  assertEquals(state.claimCalls.length, 2);
  assertEquals(state.markedOutcomes, []);
});

Deno.test("handler respects the atomic claim contract under concurrent requests", async () => {
  let claimed = false;
  const { repo, state } = createRepo({
    claimEvent: async (input) => {
      state.claimCalls.push(input);
      if (!claimed) {
        claimed = true;
        return "claimed";
      }

      return "cooldown";
    },
  });
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const secondPayload = {
    ...validPayload,
    event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };

  const [firstResponse, secondResponse] = await Promise.all([
    handler(createRequest(validPayload)),
    handler(createRequest(secondPayload)),
  ]);

  assertEquals(firstResponse.status, 200);
  assertEquals(secondResponse.status, 200);
  assertEquals(webPushState.sendCalls.length, 1);
  assertEquals(state.claimCalls.length, 2);
  assertEquals(state.markedOutcomes, [{
    eventId: validPayload.event_id,
    outcome: "delivered",
  }]);
});

Deno.test("handler respects friendship notification direction and opt-outs", async () => {
  const { repo, state } = createRepo({
    getEligibleRecipientIds: async () => [],
  });
  const { state: webPushState, webPush } = createWebPush();
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 200);
  assertEquals(state.getSubscriptionsCalls.length, 0);
  assertEquals(webPushState.sendCalls.length, 0);
  assertEquals(state.markedOutcomes, [{
    eventId: validPayload.event_id,
    outcome: "no_recipients",
  }]);
});

Deno.test("handler deletes only the exact stale subscription row and skips unsafe endpoints", async () => {
  const { repo, state } = createRepo({
    getSubscriptions: async (userIds: string[]) => {
      state.getSubscriptionsCalls.push(userIds);
      return [
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/stale-token",
          id: "sub-stale",
          keys: { auth: "auth", p256dh: "p256dh" },
          user_id: userIds[0],
        },
        {
          endpoint: "https://localhost/push",
          id: "sub-unsafe",
          keys: { auth: "auth", p256dh: "p256dh" },
          user_id: userIds[0],
        },
      ];
    },
  });
  const { state: webPushState, webPush } = createWebPush(async () => {
    throw {
      endpoint: "https://fcm.googleapis.com/fcm/send/stale-token",
      statusCode: 410,
    };
  });
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    delivered: 0,
    failed: 1,
    ok: true,
    skipped: 1,
  });
  assertEquals(webPushState.sendCalls.length, 1);
  assertEquals(state.deleteCalls, [{
    endpoint: "https://fcm.googleapis.com/fcm/send/stale-token",
    id: "sub-stale",
    user_id: "33333333-3333-4333-8333-333333333333",
  }]);
  assertEquals(state.markedOutcomes, [{
    eventId: validPayload.event_id,
    outcome: "delivery_failed",
  }]);
});

Deno.test("handler deletes the exact subscription row on a 404 gone response", async () => {
  const { repo, state } = createRepo();
  const { state: webPushState, webPush } = createWebPush(async () => {
    throw {
      endpoint: "https://fcm.googleapis.com/fcm/send/token",
      statusCode: 404,
    };
  });
  const handler = createHandler({
    loadRuntimeConfig: createRuntimeConfig,
    repo,
    webPush,
  });

  const response = await handler(createRequest(validPayload));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    delivered: 0,
    failed: 1,
    ok: true,
    skipped: 0,
  });
  assertEquals(webPushState.sendCalls.length, 1);
  assertEquals(state.deleteCalls, [{
    endpoint: "https://fcm.googleapis.com/fcm/send/token",
    id: "sub-1",
    user_id: "33333333-3333-4333-8333-333333333333",
  }]);
  assertEquals(state.markedOutcomes, [{
    eventId: validPayload.event_id,
    outcome: "delivery_failed",
  }]);
});

import {
  extractWebhookSecret,
  isAllowedPushHost,
  isAuthorizedWebhook,
  isJsonContentType,
  isSafePushEndpoint,
  isStudyStartTransition,
  isValidProfileStatus,
  isValidUuid,
  MAX_WEBHOOK_BODY_BYTES,
  parseContentLength,
  parsePushWebhookPayload,
  resolveServiceApiKey,
  sanitizeError,
  sanitizeWebPushError,
  shouldDeleteSubscription,
  timingSafeEqualText,
  validateRuntimeConfig,
} from "./helpers.ts";
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";

Deno.test("validateRuntimeConfig rejects missing webhook secret", () => {
  const result = validateRuntimeConfig({
    serviceApiKey: "secret-api-key",
    vapidPublicKey: "public",
    vapidPrivateKey: "private",
    vapidSubject: "mailto:test@example.com",
  });

  assertEquals(result, { ok: false, reason: "missing_webhook_secret" });
});

Deno.test("validateRuntimeConfig rejects missing vapid values", () => {
  const result = validateRuntimeConfig({
    serviceApiKey: "secret-api-key",
    webhookSecret: "secret",
    vapidPublicKey: "public",
    vapidPrivateKey: "",
    vapidSubject: "mailto:test@example.com",
  });

  assertEquals(result, { ok: false, reason: "missing_vapid_config" });
});

Deno.test("validateRuntimeConfig trims and accepts complete config", () => {
  const result = validateRuntimeConfig({
    serviceApiKey: " secret-api-key ",
    webhookSecret: " secret ",
    vapidPublicKey: " public ",
    vapidPrivateKey: " private ",
    vapidSubject: " mailto:test@example.com ",
  });

  assert(result.ok);
  if (result.ok) {
    assertEquals(result.config, {
      serviceApiKey: "secret-api-key",
      webhookSecret: "secret",
      vapidPublicKey: "public",
      vapidPrivateKey: "private",
      vapidSubject: "mailto:test@example.com",
    });
  }
});

Deno.test("validateRuntimeConfig rejects a missing service API key", () => {
  const result = validateRuntimeConfig({
    webhookSecret: "secret",
    vapidPublicKey: "public",
    vapidPrivateKey: "private",
    vapidSubject: "mailto:test@example.com",
  });

  assertEquals(result, { ok: false, reason: "missing_service_api_key" });
});

Deno.test("resolveServiceApiKey prefers the dedicated backend key", () => {
  assertEquals(
    resolveServiceApiKey(
      JSON.stringify({ default: "default-key", backend_api: " backend-key " }),
      "legacy-key",
    ),
    "backend-key",
  );
});

Deno.test("resolveServiceApiKey supports default and legacy transitions", () => {
  assertEquals(
    resolveServiceApiKey(JSON.stringify({ default: "default-key" }), undefined),
    "default-key",
  );
  assertEquals(resolveServiceApiKey("not-json", " legacy-key "), "legacy-key");
  assertEquals(resolveServiceApiKey(undefined, undefined), "");
});

Deno.test("extractWebhookSecret reads only x-webhook-secret", () => {
  const headers = new Headers({
    "x-webhook-secret": " secret ",
    authorization: "Bearer ignored",
    "x-fomopomo-webhook-secret": "ignored",
  });

  assertEquals(extractWebhookSecret(headers), "secret");
});

Deno.test("timingSafeEqualText compares equal and unequal strings", () => {
  assert(timingSafeEqualText("same", "same"));
  assertFalse(timingSafeEqualText("same", "different"));
  assertFalse(timingSafeEqualText("short", "shorter"));
});

Deno.test("isAuthorizedWebhook requires exact header match", () => {
  const authorizedHeaders = new Headers({ "x-webhook-secret": "secret" });
  const unauthorizedHeaders = new Headers({ authorization: "secret" });

  assert(isAuthorizedWebhook(authorizedHeaders, "secret"));
  assertFalse(isAuthorizedWebhook(authorizedHeaders, "Secret"));
  assertFalse(isAuthorizedWebhook(unauthorizedHeaders, "secret"));
});

Deno.test("sanitizeWebPushError keeps only non-sensitive metadata", () => {
  const sanitized = sanitizeWebPushError({
    name: "WebPushError",
    code: "ERR_GONE",
    statusCode: 410,
    message: "https://push.example/subscriptions/abc",
    endpoint: "https://push.example/subscriptions/abc",
    headers: { authorization: "Bearer secret" },
  });

  assertEquals(sanitized, {
    name: "WebPushError",
    code: "ERR_GONE",
    statusCode: 410,
  });
});

Deno.test("sanitizeError ignores unsupported fields", () => {
  const sanitized = sanitizeError({
    message: "do not keep me",
    cause: "ignored",
  });

  assertEquals(sanitized, {});
});

Deno.test("shouldDeleteSubscription only matches stale status codes", () => {
  assert(shouldDeleteSubscription({ statusCode: 404 }));
  assert(shouldDeleteSubscription({ statusCode: 410 }));
  assertFalse(shouldDeleteSubscription({ statusCode: 500 }));
});

Deno.test("isJsonContentType accepts JSON with charset only", () => {
  assert(isJsonContentType("application/json"));
  assert(isJsonContentType("application/json; charset=utf-8"));
  assertFalse(isJsonContentType("text/plain"));
  assertFalse(isJsonContentType(null));
});

Deno.test("parseContentLength validates integers within header format", () => {
  assertEquals(parseContentLength("0"), 0);
  assertEquals(
    parseContentLength(`${MAX_WEBHOOK_BODY_BYTES}`),
    MAX_WEBHOOK_BODY_BYTES,
  );
  assertEquals(parseContentLength(null), null);
  assertEquals(parseContentLength(""), null);
  assertEquals(parseContentLength("12.5"), null);
  assertEquals(parseContentLength("-1"), null);
});

Deno.test("parsePushWebhookPayload requires the exact database trigger shape", () => {
  const validPayload = parsePushWebhookPayload({
    event_id: "11111111-1111-4111-8111-111111111111",
    record: {
      id: "22222222-2222-4222-8222-222222222222",
      status: "studying",
    },
    old_record: {
      status: "online",
    },
  });

  assert(validPayload);
  assert(isStudyStartTransition(validPayload));
  assertEquals(validPayload.record.status, "studying");
  assertEquals(
    parsePushWebhookPayload({
      event_id: "11111111-1111-4111-8111-111111111111",
      record: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "studying",
        nickname: "attacker",
      },
      old_record: {
        status: "online",
      },
    }),
    null,
  );
  assertEquals(
    parsePushWebhookPayload({
      event_id: "not-a-uuid",
      record: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "studying",
      },
      old_record: {
        status: "online",
      },
    }),
    null,
  );
});

Deno.test("status and uuid validators accept only supported values", () => {
  assert(isValidUuid("11111111-1111-4111-8111-111111111111"));
  assertFalse(isValidUuid("11111111"));
  assert(isValidProfileStatus("online"));
  assert(isValidProfileStatus("offline"));
  assert(isValidProfileStatus("studying"));
  assert(isValidProfileStatus("paused"));
  assertFalse(isValidProfileStatus("busy"));
});

Deno.test("isSafePushEndpoint only allows standard browser push providers", () => {
  assert(isAllowedPushHost("fcm.googleapis.com"));
  assert(isAllowedPushHost("updates.push.services.mozilla.com"));
  assert(isAllowedPushHost("web.push.apple.com"));
  assert(isAllowedPushHost("db5p.notify.windows.com"));

  assert(isSafePushEndpoint("https://fcm.googleapis.com/fcm/send/token"));
  assert(
    isSafePushEndpoint(
      "https://updates.push.services.mozilla.com/wpush/v2/token",
    ),
  );
  assert(isSafePushEndpoint("https://web.push.apple.com/3/device/token"));
  assert(isSafePushEndpoint("https://db5p.notify.windows.com/?token=abc"));

  assertFalse(isSafePushEndpoint("http://fcm.googleapis.com/fcm/send/token"));
  assertFalse(
    isSafePushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send/token"),
  );
  assertFalse(isSafePushEndpoint("https://localhost/push"));
  assertFalse(isSafePushEndpoint("https://127.0.0.1/push"));
  assertFalse(isSafePushEndpoint("https://[::1]/push"));
  assertFalse(isSafePushEndpoint("https://192.168.0.15/push"));
  assertFalse(isSafePushEndpoint("https://evil.example.com/push"));
});

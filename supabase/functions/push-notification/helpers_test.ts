import {
  extractWebhookSecret,
  isAuthorizedWebhook,
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

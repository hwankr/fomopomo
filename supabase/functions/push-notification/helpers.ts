const textEncoder = new TextEncoder();
export const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_STATUSES = ["online", "offline", "studying", "paused"] as const;
const EXACT_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "notify.windows.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
const PUSH_HOST_SUFFIXES = [
  ".notify.windows.com",
  ".push.apple.com",
  ".push.services.mozilla.com",
] as const;

export type RuntimeConfig = {
  serviceApiKey: string;
  webhookSecret: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
};

export type RuntimeConfigValidation =
  | { ok: true; config: RuntimeConfig }
  | {
    ok: false;
    reason:
      | "missing_service_api_key"
      | "missing_webhook_secret"
      | "missing_vapid_config";
  };

export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export type PushWebhookPayload = {
  event_id: string;
  record: {
    id: string;
    status: ProfileStatus;
  };
  old_record: {
    status: ProfileStatus;
  };
};

export function resolveServiceApiKey(
  secretKeysJson: string | undefined,
  legacyServiceRoleKey: string | undefined,
): string {
  if (secretKeysJson?.trim()) {
    try {
      const secretKeys = JSON.parse(secretKeysJson) as Record<string, unknown>;

      for (const keyName of ["backend_api", "default"]) {
        const value = secretKeys[keyName];
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    } catch {
      // Fall through to the legacy key during the zero-downtime migration.
    }
  }

  return legacyServiceRoleKey?.trim() ?? "";
}

export function validateRuntimeConfig(
  input: Partial<RuntimeConfig>,
): RuntimeConfigValidation {
  const config: RuntimeConfig = {
    serviceApiKey: input.serviceApiKey?.trim() ?? "",
    webhookSecret: input.webhookSecret?.trim() ?? "",
    vapidPublicKey: input.vapidPublicKey?.trim() ?? "",
    vapidPrivateKey: input.vapidPrivateKey?.trim() ?? "",
    vapidSubject: input.vapidSubject?.trim() ?? "",
  };

  if (!config.serviceApiKey) {
    return { ok: false, reason: "missing_service_api_key" };
  }

  if (!config.webhookSecret) {
    return { ok: false, reason: "missing_webhook_secret" };
  }

  if (
    !config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject
  ) {
    return { ok: false, reason: "missing_vapid_config" };
  }

  return { ok: true, config };
}

export function extractWebhookSecret(
  headers: Pick<Headers, "get">,
): string | null {
  const secret = headers.get("x-webhook-secret")?.trim();
  return secret ? secret : null;
}

export function timingSafeEqualText(a: string, b: string): boolean {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  const maxLength = Math.max(aBytes.length, bBytes.length);

  let mismatch = aBytes.length === bBytes.length ? 0 : 1;

  for (let i = 0; i < maxLength; i += 1) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return mismatch === 0;
}

export function isAuthorizedWebhook(
  headers: Pick<Headers, "get">,
  expectedSecret: string,
): boolean {
  const providedSecret = extractWebhookSecret(headers);

  if (!providedSecret || !expectedSecret) {
    return false;
  }

  return timingSafeEqualText(providedSecret, expectedSecret);
}

type SanitizedError = {
  name?: string;
  code?: string;
  statusCode?: number;
};

export function sanitizeError(error: unknown): SanitizedError {
  if (!error || typeof error !== "object") {
    return {};
  }

  const candidate = error as Record<string, unknown>;
  const sanitized: SanitizedError = {};

  if (typeof candidate.name === "string") {
    sanitized.name = candidate.name;
  }

  if (typeof candidate.code === "string") {
    sanitized.code = candidate.code;
  }

  if (typeof candidate.statusCode === "number") {
    sanitized.statusCode = candidate.statusCode;
  }

  return sanitized;
}

export function sanitizeWebPushError(error: unknown): SanitizedError {
  return sanitizeError(error);
}

export function shouldDeleteSubscription(error: unknown): boolean {
  const { statusCode } = sanitizeWebPushError(error);
  return statusCode === 404 || statusCode === 410;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();

  if (actualKeys.length !== sortedExpected.length) {
    return false;
  }

  return actualKeys.every((key, index) => key === sortedExpected[index]);
}

export function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const [mediaType] = contentType.split(";", 1);
  return mediaType.trim().toLowerCase() === "application/json";
}

export function parseContentLength(
  contentLength: string | null,
): number | null {
  if (contentLength === null) {
    return null;
  }

  const trimmed = contentLength.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function isValidProfileStatus(value: string): value is ProfileStatus {
  return PROFILE_STATUSES.includes(value as ProfileStatus);
}

export function parsePushWebhookPayload(
  value: unknown,
): PushWebhookPayload | null {
  if (
    !isPlainObject(value) || !hasExactKeys(value, [
      "event_id",
      "old_record",
      "record",
    ])
  ) {
    return null;
  }

  const { event_id, old_record, record } = value;

  if (typeof event_id !== "string" || !isValidUuid(event_id)) {
    return null;
  }

  if (
    !isPlainObject(record) || !hasExactKeys(record, ["id", "status"]) ||
    typeof record.id !== "string" || !isValidUuid(record.id) ||
    typeof record.status !== "string" || !isValidProfileStatus(record.status)
  ) {
    return null;
  }

  if (
    !isPlainObject(old_record) || !hasExactKeys(old_record, ["status"]) ||
    typeof old_record.status !== "string" ||
    !isValidProfileStatus(old_record.status)
  ) {
    return null;
  }

  return {
    event_id: event_id.trim(),
    old_record: {
      status: old_record.status,
    },
    record: {
      id: record.id.trim(),
      status: record.status,
    },
  };
}

export function isStudyStartTransition(payload: PushWebhookPayload): boolean {
  return payload.record.status === "studying" &&
    payload.old_record.status !== "studying";
}

function parseIpv4Octets(hostname: string): number[] | null {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  return octets;
}

function isPrivateIpv4Literal(hostname: string): boolean {
  const octets = parseIpv4Octets(hostname);
  if (!octets) {
    return false;
  }

  return octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function isIpv6Literal(hostname: string): boolean {
  return hostname.includes(":");
}

function isPrivateIpv6Literal(hostname: string): boolean {
  if (!isIpv6Literal(hostname)) {
    return false;
  }

  const normalized = hostname.toLowerCase();

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  const ipv4MappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return ipv4MappedMatch ? isPrivateIpv4Literal(ipv4MappedMatch[1]) : false;
}

function isIpLiteral(hostname: string): boolean {
  return parseIpv4Octets(hostname) !== null || isIpv6Literal(hostname);
}

export function isAllowedPushHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return EXACT_PUSH_HOSTS.has(normalized) ||
    PUSH_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function isSafePushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }

  const hostname = url.hostname.trim().toLowerCase();
  if (
    !hostname || hostname === "localhost" || hostname.endsWith(".localhost")
  ) {
    return false;
  }

  if (
    isPrivateIpv4Literal(hostname) ||
    isPrivateIpv6Literal(hostname)
  ) {
    return false;
  }

  if (isIpLiteral(hostname)) {
    return false;
  }

  return isAllowedPushHost(hostname);
}

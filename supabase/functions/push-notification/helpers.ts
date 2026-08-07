const textEncoder = new TextEncoder();

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

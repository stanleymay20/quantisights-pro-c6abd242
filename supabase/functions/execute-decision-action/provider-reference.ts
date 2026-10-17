const MAX_PROVIDER_REFERENCE_LENGTH = 500;
const MAX_PROVIDER_COMPONENT_LENGTH = 200;

function boundedOpaqueComponent(value: unknown, maxLength = MAX_PROVIDER_COMPONENT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  // Provider identifiers are treated as opaque evidence, never as URLs or
  // executable material. Reject control characters, whitespace and delimiter
  // characters used by our own reference format.
  if (!/^[A-Za-z0-9._:@+=/-]+$/.test(normalized)) return null;
  return normalized;
}

function boundedReference(prefix: string, components: string[]): string | null {
  const candidate = [prefix, ...components].join(":");
  return candidate.length <= MAX_PROVIDER_REFERENCE_LENGTH ? candidate : null;
}

/**
 * Slack chat.postMessage returns a provider-owned channel ID and message `ts`.
 * We only record a reference when both are present and bounded; user-supplied
 * channel text is never substituted for missing provider evidence.
 */
export function extractSlackExternalReference(data: Record<string, unknown>): string | null {
  const providerChannel = boundedOpaqueComponent(data.channel, 100);
  const messageTs = boundedOpaqueComponent(data.ts, 100);
  if (!providerChannel || !messageTs) return null;
  if (!/^\d{1,20}\.\d{1,20}$/.test(messageTs)) return null;
  return boundedReference("slack-message", [providerChannel, messageTs]);
}

const WEBHOOK_REFERENCE_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-trace-id",
  "request-id",
] as const;

export interface WebhookReferenceEvidence {
  externalReference: string | null;
  sourceHeader: string | null;
}

/**
 * Generic webhooks have no universal provider receipt ID. Record only an
 * explicit opaque request/correlation identifier actually returned by the
 * remote server. Never synthesize an ID from HTTP status, URL, time or request
 * payload, and never record Location or other potentially sensitive headers.
 */
export function extractWebhookExternalReference(headers: Headers): WebhookReferenceEvidence {
  for (const headerName of WEBHOOK_REFERENCE_HEADERS) {
    const value = boundedOpaqueComponent(headers.get(headerName));
    if (!value) continue;
    return {
      externalReference: boundedReference("webhook-response", [headerName, value]),
      sourceHeader: headerName,
    };
  }
  return { externalReference: null, sourceHeader: null };
}

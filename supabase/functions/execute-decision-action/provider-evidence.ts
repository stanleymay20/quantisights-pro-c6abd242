type JsonRecord = Record<string, unknown>;

export interface ProviderEvidence {
  externalReference: string | null;
  evidenceDigest: string;
  identifiers: Record<string, string>;
  selectedHeaders: Record<string, string>;
  bodyInspected: boolean;
  bodyTruncated: boolean;
}

const MAX_BODY_BYTES = 64 * 1024;
const SAFE_RESPONSE_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-amzn-requestid",
  "x-amz-request-id",
  "x-ms-request-id",
  "traceparent",
  "location",
  "etag",
] as const;

const IDENTIFIER_KEYS = new Set([
  "id",
  "request_id",
  "requestId",
  "correlation_id",
  "correlationId",
  "ts",
  "message_ts",
  "messageTs",
  "channel",
  "reference",
  "reference_id",
  "referenceId",
]);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as JsonRecord)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
  return `{${entries.join(",")}}`;
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeScalar(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 500) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function collectIdentifiers(value: unknown, depth = 0, out: Record<string, string> = {}): Record<string, string> {
  if (!value || typeof value !== "object" || depth > 2) return out;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 5)) collectIdentifiers(entry, depth + 1, out);
    return out;
  }

  for (const [key, nested] of Object.entries(value as JsonRecord)) {
    if (IDENTIFIER_KEYS.has(key) && !(key in out)) {
      const scalar = safeScalar(nested);
      if (scalar) out[key] = scalar;
    }
    if (nested && typeof nested === "object") collectIdentifiers(nested, depth + 1, out);
  }
  return out;
}

function collectHeaders(headers: Headers): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers.get(name)?.trim();
    if (value) selected[name] = value.slice(0, 1000);
  }
  return selected;
}

async function readBoundedJson(response: Response): Promise<{
  body: unknown;
  inspected: boolean;
  truncated: boolean;
}> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json") || !response.body) {
    return { body: null, inspected: false, truncated: false };
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { body: null, inspected: false, truncated: true };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > MAX_BODY_BYTES) {
        const remaining = Math.max(0, MAX_BODY_BYTES - total);
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        total = MAX_BODY_BYTES;
        truncated = true;
        await reader.cancel("provider evidence body limit reached").catch(() => undefined);
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  if (truncated) return { body: null, inspected: false, truncated: true };

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(merged);
  if (!text.trim()) return { body: null, inspected: true, truncated: false };

  try {
    return { body: JSON.parse(text), inspected: true, truncated: false };
  } catch {
    return { body: null, inspected: true, truncated: false };
  }
}

function chooseExternalReference(
  headers: Record<string, string>,
  identifiers: Record<string, string>,
): string | null {
  const requestReference = headers["x-request-id"]
    ?? headers["x-correlation-id"]
    ?? headers["x-amzn-requestid"]
    ?? headers["x-amz-request-id"]
    ?? headers["x-ms-request-id"];
  if (requestReference) return requestReference.slice(0, 500);

  if (identifiers.channel && identifiers.ts) {
    return `${identifiers.channel}:${identifiers.ts}`.slice(0, 500);
  }

  for (const key of ["id", "request_id", "requestId", "correlation_id", "correlationId", "ts", "reference", "reference_id", "referenceId"]) {
    if (identifiers[key]) return identifiers[key].slice(0, 500);
  }

  if (headers.location) return headers.location.slice(0, 500);
  if (headers.etag) return headers.etag.slice(0, 500);
  return null;
}

export async function captureProviderEvidence(
  response: Response,
  parsedBody?: unknown,
): Promise<ProviderEvidence> {
  const selectedHeaders = collectHeaders(response.headers);

  let body = parsedBody;
  let bodyInspected = parsedBody !== undefined;
  let bodyTruncated = false;

  if (parsedBody === undefined) {
    const bounded = await readBoundedJson(response.clone());
    body = bounded.body;
    bodyInspected = bounded.inspected;
    bodyTruncated = bounded.truncated;
  }

  const identifiers = collectIdentifiers(body);
  const externalReference = chooseExternalReference(selectedHeaders, identifiers);
  const evidenceDigest = await sha256Hex({
    status: response.status,
    headers: selectedHeaders,
    identifiers,
    body_inspected: bodyInspected,
    body_truncated: bodyTruncated,
  });

  return {
    externalReference,
    evidenceDigest,
    identifiers,
    selectedHeaders,
    bodyInspected,
    bodyTruncated,
  };
}

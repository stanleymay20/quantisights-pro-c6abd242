export function toDateOnly(value: string): string {
  return new Date(value).toISOString().split("T")[0];
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeDateInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}$/.test(raw)) {
    return `${raw}-01-01`;
  }

  if (Number.isNaN(Date.parse(raw))) {
    return null;
  }

  return raw;
}

/**
 * Parse JSON with an optional hard byte ceiling.
 *
 * When maxBytes is provided we stream the body and stop reading as soon as the
 * ceiling is crossed. This protects ingestion functions from allocating an
 * unbounded string/object merely because a request contains fewer than the
 * configured record-count limit.
 */
export async function parseJsonBody(
  req: Request,
  maxBytes?: number,
): Promise<{ body?: unknown; error?: string }> {
  try {
    if (maxBytes === undefined) {
      const body = await req.json();
      return { body };
    }

    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      return { error: "Invalid JSON body size limit" };
    }

    const declaredLength = req.headers.get("content-length");
    if (declaredLength) {
      const declared = Number(declaredLength);
      if (Number.isFinite(declared) && declared > maxBytes) {
        return { error: `Payload exceeds maximum size of ${maxBytes} bytes` };
      }
    }

    if (!req.body) return { error: "Invalid JSON body" };

    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel("payload too large"); } catch { /* noop */ }
        return { error: `Payload exceeds maximum size of ${maxBytes} bytes` };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder().decode(bytes);
    return { body: JSON.parse(text) };
  } catch {
    return { error: "Invalid JSON body" };
  }
}

const HUBSPOT_CURSOR_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HUBSPOT_CURSOR_EPOCH = /^\d{10,13}$/;
const HUBSPOT_OBJECTS = ["companies", "contacts", "deals", "pipelines", "activities"] as const;
const HUBSPOT_AFTER = /^[A-Za-z0-9_~.%+/=-]{1,256}$/;

export type HubSpotPullMode = "historical_backfill" | "incremental_sync";
export type HubSpotPullObject = (typeof HUBSPOT_OBJECTS)[number];

export interface HubSpotPullRequest {
  connectorId: string;
  mode?: HubSpotPullMode;
}

export interface HubSpotCollectionPage {
  results: Record<string, unknown>[];
  after: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHubSpotPullRequest(value: unknown): HubSpotPullRequest {
  if (!isRecord(value)) throw new Error("valid JSON object required");
  const connectorId = typeof value.connector_id === "string" ? value.connector_id.trim() : "";
  if (!connectorId) throw new Error("connector_id required");

  const rawMode = value.mode;
  let mode: HubSpotPullMode | undefined;
  if (rawMode !== undefined) {
    if (rawMode !== "historical_backfill" && rawMode !== "incremental_sync") {
      throw new Error("mode must be historical_backfill or incremental_sync");
    }
    mode = rawMode;
  }
  return mode ? { connectorId, mode } : { connectorId };
}

export function normalizeHubSpotObjects(value: unknown): HubSpotPullObject[] {
  const source: readonly unknown[] = value === undefined ? HUBSPOT_OBJECTS : Array.isArray(value) ? value : [];
  if (value !== undefined && !Array.isArray(value)) throw new Error("config.objects must be an array");

  const allowed = new Set<string>(HUBSPOT_OBJECTS);
  const output: HubSpotPullObject[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    if (typeof item !== "string" || !allowed.has(item)) {
      throw new Error(`HubSpot object not allowed: ${typeof item === "string" ? item.slice(0, 80) : "(invalid)"}`);
    }
    if (!seen.has(item)) {
      seen.add(item);
      output.push(item as HubSpotPullObject);
    }
  }
  return output;
}

export function normalizeHubSpotPageSize(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return Math.min(100, Math.max(1, Math.floor(fallback)));
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error("config.page_size must be an integer");
  }
  if (value < 1 || value > 100) throw new Error("config.page_size must be between 1 and 100");
  return value;
}

/** Persisted HubSpot date cursors are allowed only as UTC ISO timestamps or epoch-second/millisecond strings. */
export function validateHubSpotCursor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("HubSpot checkpoint cursor must be a string");
  if (HUBSPOT_CURSOR_EPOCH.test(value)) return value;
  if (HUBSPOT_CURSOR_ISO.test(value) && Number.isFinite(Date.parse(value))) return value;
  throw new Error("HubSpot checkpoint cursor is not a safe timestamp");
}

export function parseHubSpotCollectionPage(value: unknown): HubSpotCollectionPage {
  if (!isRecord(value)) throw new Error("HubSpot response must be an object");
  if (!Array.isArray(value.results)) throw new Error("HubSpot response missing results array");
  const results = value.results.map((entry, index): Record<string, unknown> => {
    if (!isRecord(entry)) throw new Error(`HubSpot result[${index}] must be an object`);
    return entry;
  });

  let after: string | null = null;
  const paging = value.paging;
  if (paging !== undefined && paging !== null) {
    if (!isRecord(paging)) throw new Error("HubSpot paging must be an object");
    const next = paging.next;
    if (next !== undefined && next !== null) {
      if (!isRecord(next)) throw new Error("HubSpot paging.next must be an object");
      const rawAfter = next.after;
      if (rawAfter !== undefined && rawAfter !== null) {
        const candidate = typeof rawAfter === "number" && Number.isSafeInteger(rawAfter)
          ? String(rawAfter)
          : typeof rawAfter === "string"
            ? rawAfter
            : "";
        if (!HUBSPOT_AFTER.test(candidate)) throw new Error("HubSpot paging cursor is invalid");
        after = candidate;
      }
    }
  }
  return { results, after };
}

export function safeHubSpotHttpError(resource: string, status: number, payload: unknown): string {
  let category: string | null = null;
  if (isRecord(payload) && typeof payload.category === "string") {
    const candidate = payload.category.trim();
    if (/^[A-Z0-9_.-]{1,80}$/i.test(candidate)) category = candidate;
  }
  const safeResource = /^[a-z]{1,40}$/i.test(resource) ? resource : "resource";
  return `HubSpot ${safeResource} ${status}${category ? ` ${category}` : ""}`;
}

const SALESFORCE_OBJECT = /^[A-Za-z][A-Za-z0-9_]*$/;
const SALESFORCE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SALESFORCE_NEXT_PATH = /^\/services\/data\/v\d+(?:\.\d+)?\/query\/[A-Za-z0-9_-]+$/;

export type SalesforcePullMode = "historical_backfill" | "incremental_sync";

export interface SalesforcePullRequest {
  connectorId: string;
  mode?: SalesforcePullMode;
}

export interface SalesforceQueryPage {
  records: Record<string, unknown>[];
  nextRecordsUrl: string | null;
  done: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSalesforcePullRequest(value: unknown): SalesforcePullRequest {
  if (!isRecord(value)) throw new Error("valid JSON object required");
  const connectorId = typeof value.connector_id === "string" ? value.connector_id.trim() : "";
  if (!connectorId) throw new Error("connector_id required");

  const requestedMode = value.mode;
  if (
    requestedMode !== undefined &&
    requestedMode !== "historical_backfill" &&
    requestedMode !== "incremental_sync"
  ) {
    throw new Error("mode must be historical_backfill or incremental_sync");
  }

  return {
    connectorId,
    ...(requestedMode ? { mode: requestedMode } : {}),
  };
}

export function normalizeSalesforceObjects(
  value: unknown,
  defaults: readonly string[],
  allowedObjects: readonly string[],
): string[] {
  const source = value === undefined ? defaults : value;
  if (!Array.isArray(source)) throw new Error("config.objects must be an array");

  const allowed = new Map(allowedObjects.map((name) => [name.toLowerCase(), name]));
  const output: string[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    if (typeof item !== "string" || !SALESFORCE_OBJECT.test(item)) {
      throw new Error("config.objects contains an invalid Salesforce object name");
    }
    const canonical = allowed.get(item.toLowerCase());
    if (!canonical) throw new Error(`Salesforce object not allowed: ${item}`);
    const key = canonical.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      output.push(canonical);
    }
  }
  return output;
}

/**
 * Salesforce SystemModstamp/LastModifiedDate cursor values are SOQL datetime literals.
 * Validate them before interpolation so corrupted checkpoint data cannot become query text.
 */
export function validateSalesforceCursor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !SALESFORCE_DATETIME.test(value)) {
    throw new Error("Salesforce checkpoint cursor is not a valid UTC datetime literal");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Salesforce checkpoint cursor is not parseable");
  return value;
}

export function parseSalesforceQueryPage(value: unknown): SalesforceQueryPage {
  if (!isRecord(value)) throw new Error("Salesforce query response must be an object");
  if (!Array.isArray(value.records)) throw new Error("Salesforce query response missing records array");

  const records: Record<string, unknown>[] = value.records.map((record, index) => {
    if (!isRecord(record)) throw new Error(`Salesforce query record[${index}] must be an object`);
    return record;
  });

  const nextRaw = value.nextRecordsUrl;
  let nextRecordsUrl: string | null = null;
  if (nextRaw !== null && nextRaw !== undefined) {
    if (typeof nextRaw !== "string" || !SALESFORCE_NEXT_PATH.test(nextRaw)) {
      throw new Error("Salesforce nextRecordsUrl is invalid");
    }
    nextRecordsUrl = nextRaw;
  }

  const done = typeof value.done === "boolean" ? value.done : null;
  if (done === true && nextRecordsUrl) {
    throw new Error("Salesforce query response is inconsistent: done=true with nextRecordsUrl");
  }

  return { records, nextRecordsUrl, done };
}

export function safeSalesforceHttpError(status: number, payload: unknown): string {
  let code: string | null = null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (isRecord(item) && typeof item.errorCode === "string") {
        const candidate = item.errorCode.trim();
        if (/^[A-Z0-9_]{1,80}$/.test(candidate)) {
          code = candidate;
          break;
        }
      }
    }
  } else if (isRecord(payload) && typeof payload.errorCode === "string") {
    const candidate = payload.errorCode.trim();
    if (/^[A-Z0-9_]{1,80}$/.test(candidate)) code = candidate;
  }
  return `Salesforce SOQL ${status}${code ? ` ${code}` : ""}`;
}

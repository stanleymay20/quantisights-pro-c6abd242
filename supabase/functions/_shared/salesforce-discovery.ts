const SALESFORCE_OBJECT_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const DEFAULT_MAX_OBJECTS = 100;

export interface SalesforceFieldMetadata {
  name: string;
  type: string;
  nillable: boolean;
  length: number | null;
  custom: boolean;
  referenceTo: string[];
  relationshipName: string | null;
}

export interface SalesforceChildRelationshipMetadata {
  relationshipName: string | null;
  childSObject: string;
  field: string;
  cascadeDelete: boolean;
}

export interface SalesforceDescribeMetadata {
  custom: boolean;
  fields: SalesforceFieldMetadata[];
  relationships: SalesforceChildRelationshipMetadata[];
}

export interface SalesforceDiscoveryTargets {
  objects: string[];
  skipped: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseReferenceTargets(value: unknown, context: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${context}.referenceTo must be an array`);
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !SALESFORCE_OBJECT_NAME.test(item)) {
      throw new Error(`${context}.referenceTo contains an invalid object name`);
    }
    if (!output.includes(item)) output.push(item);
  }
  return output;
}

/**
 * Normalize user-supplied discovery targets without allowing unbounded describe fan-out.
 * Invalid object identifiers are reported as skipped; non-string values are represented safely
 * instead of being stringified from attacker-controlled objects.
 */
export function normalizeSalesforceDiscoveryObjects(
  value: unknown,
  defaults: readonly string[],
  maxObjects = DEFAULT_MAX_OBJECTS,
): SalesforceDiscoveryTargets {
  const cap = Number.isFinite(maxObjects)
    ? Math.min(500, Math.max(1, Math.floor(maxObjects)))
    : DEFAULT_MAX_OBJECTS;
  const source: readonly unknown[] = Array.isArray(value) && value.length > 0 ? value : defaults;
  if (source.length > cap) throw new Error(`Salesforce discovery supports at most ${cap} objects per request`);

  const objects: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    if (typeof item !== "string" || !SALESFORCE_OBJECT_NAME.test(item)) {
      skipped.push(typeof item === "string" ? item.slice(0, 120) : "(invalid object name)");
      continue;
    }
    const key = item.toLowerCase();
    if (seen.has(key)) {
      skipped.push(`${item}(duplicate)`);
      continue;
    }
    seen.add(key);
    objects.push(item);
  }

  return { objects, skipped };
}

/** Parse and validate a Salesforce `/sobjects/{Object}/describe` response before persistence. */
export function parseSalesforceDescribe(payload: unknown): SalesforceDescribeMetadata {
  if (!isRecord(payload)) throw new Error("Salesforce describe response must be an object");
  if (!Array.isArray(payload.fields)) throw new Error("Salesforce describe response missing fields array");

  const fields = payload.fields.map((rawField, index): SalesforceFieldMetadata => {
    if (!isRecord(rawField)) throw new Error(`Salesforce describe field[${index}] must be an object`);
    const context = `Salesforce describe field[${index}]`;
    const name = requireString(rawField, "name", context);
    const type = requireString(rawField, "type", context);
    const nillable = rawField.nillable;
    const custom = rawField.custom;
    if (typeof nillable !== "boolean") throw new Error(`${context}.nillable must be boolean`);
    if (typeof custom !== "boolean") throw new Error(`${context}.custom must be boolean`);
    const rawLength = rawField.length;
    const length = rawLength == null ? null : finiteNonNegativeInteger(rawLength);
    if (rawLength != null && length == null) throw new Error(`${context}.length must be a non-negative integer`);

    return {
      name,
      type,
      nillable,
      length,
      custom,
      referenceTo: parseReferenceTargets(rawField.referenceTo, context),
      relationshipName: optionalString(rawField.relationshipName),
    };
  });

  const rawRelationships = payload.childRelationships ?? [];
  if (!Array.isArray(rawRelationships)) {
    throw new Error("Salesforce describe childRelationships must be an array");
  }
  const relationships = rawRelationships.map((rawRelationship, index): SalesforceChildRelationshipMetadata => {
    if (!isRecord(rawRelationship)) {
      throw new Error(`Salesforce childRelationship[${index}] must be an object`);
    }
    const context = `Salesforce childRelationship[${index}]`;
    const childSObject = requireString(rawRelationship, "childSObject", context);
    const field = requireString(rawRelationship, "field", context);
    if (!SALESFORCE_OBJECT_NAME.test(childSObject)) {
      throw new Error(`${context}.childSObject contains invalid characters`);
    }
    if (!SALESFORCE_OBJECT_NAME.test(field)) {
      throw new Error(`${context}.field contains invalid characters`);
    }
    if (typeof rawRelationship.cascadeDelete !== "boolean") {
      throw new Error(`${context}.cascadeDelete must be boolean`);
    }
    return {
      relationshipName: optionalString(rawRelationship.relationshipName),
      childSObject,
      field,
      cascadeDelete: rawRelationship.cascadeDelete,
    };
  });

  return {
    custom: payload.custom === true,
    fields,
    relationships,
  };
}

const CONNECTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTOR_TYPE = /^[a-z][a-z0-9_]{0,63}$/;

export interface ConnectorDispatchRequest {
  connectorId: string;
  requestedType: string | null;
  requestedOrganizationId: string | null;
  datasetId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface StoredConnectorIdentity {
  id: string;
  organizationId: string;
  connectorType: string;
  dataSourceId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseConnectorDispatchRequest(value: unknown): ConnectorDispatchRequest {
  if (!isRecord(value)) throw new Error("valid JSON object required");
  const connectorId = optionalString(value.connector_id) ?? optionalString(value.data_source_id);
  if (!connectorId) throw new Error("connector_id required");
  if (!CONNECTOR_ID.test(connectorId)) throw new Error("connector_id must be a UUID");

  const requestedType = optionalString(value.connector_type);
  if (requestedType && !CONNECTOR_TYPE.test(requestedType)) {
    throw new Error("connector_type is invalid");
  }

  const requestedOrganizationId = optionalString(value.organization_id);
  if (requestedOrganizationId && !CONNECTOR_ID.test(requestedOrganizationId)) {
    throw new Error("organization_id must be a UUID");
  }

  return {
    connectorId,
    requestedType,
    requestedOrganizationId,
    datasetId: optionalString(value.dataset_id),
    dateFrom: optionalString(value.date_from),
    dateTo: optionalString(value.date_to),
  };
}

export function deriveStoredConnectorIdentity(value: unknown): StoredConnectorIdentity {
  if (!isRecord(value)) throw new Error("stored connector record is invalid");
  const id = optionalString(value.id);
  const organizationId = optionalString(value.organization_id);
  const storedType = optionalString(value.connector_type);
  const dataSourceId = optionalString(value.data_source_id);
  const config = isRecord(value.config) ? value.config : null;
  const typeDetail = config ? optionalString(config.connector_type_detail) : null;

  if (!id || !CONNECTOR_ID.test(id)) throw new Error("stored connector id is invalid");
  if (!organizationId || !CONNECTOR_ID.test(organizationId)) {
    throw new Error("stored connector organization is invalid");
  }
  if (!storedType || !CONNECTOR_TYPE.test(storedType)) throw new Error("stored connector type is invalid");

  // Legacy fallback records may be stored as rest_api when an old database lacked an enum value.
  // Only in that narrow case may the non-sensitive config detail define the effective type.
  const connectorType = storedType === "rest_api" && typeDetail ? typeDetail : storedType;
  if (!CONNECTOR_TYPE.test(connectorType)) throw new Error("effective connector type is invalid");
  if (dataSourceId && !CONNECTOR_ID.test(dataSourceId)) throw new Error("stored data_source_id is invalid");

  return { id, organizationId, connectorType, dataSourceId };
}

/** Client identity fields are compatibility hints only; disagreement with stored identity is rejected. */
export function assertDispatchIdentityMatches(
  request: ConnectorDispatchRequest,
  stored: StoredConnectorIdentity,
): void {
  if (request.connectorId !== stored.id) throw new Error("connector identity mismatch");
  if (request.requestedType && request.requestedType !== stored.connectorType) {
    throw new Error("connector_type does not match stored connector");
  }
  if (request.requestedOrganizationId && request.requestedOrganizationId !== stored.organizationId) {
    throw new Error("organization_id does not match stored connector");
  }
}

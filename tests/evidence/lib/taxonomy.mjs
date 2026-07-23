// tests/evidence/lib/taxonomy.mjs
// Standardized failure taxonomy for the Quantivis Enterprise Evidence framework.
// Every pipeline MUST return one of these statuses; the runner refuses unknown values.

export const STATUS = Object.freeze({
  PASS: "PASS",
  WARNING: "WARNING",
  EXPECTED_DENIAL: "EXPECTED_DENIAL",
  FRAMEWORK_INVALID: "FRAMEWORK_INVALID",
  API_FAILURE: "API_FAILURE",
  PERFORMANCE_FAILURE: "PERFORMANCE_FAILURE",
  SECURITY_FAILURE: "SECURITY_FAILURE",
  CRITICAL_LEAK: "CRITICAL_LEAK",
  CRITICAL_FAILURE: "CRITICAL_FAILURE",
});

export const BLOCKING = new Set([
  STATUS.FRAMEWORK_INVALID,
  STATUS.API_FAILURE,
  STATUS.PERFORMANCE_FAILURE,
  STATUS.SECURITY_FAILURE,
  STATUS.CRITICAL_LEAK,
  STATUS.CRITICAL_FAILURE,
]);

export function isBlocking(status) {
  return BLOCKING.has(status);
}

export function assertKnown(status) {
  if (!Object.values(STATUS).includes(status)) {
    throw new Error(`FRAMEWORK_INVALID: unknown status "${status}"`);
  }
}

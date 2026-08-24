// tests/evidence/pipelines/authentication.mjs
// EE-1: Authentication & Identity — evidence consumer.
//
// EVIDENCE_AUTH_RESULTS must point at the execution adapter output. A critical
// authentication control is only green when it is actually exercised and
// passes. Missing or skipped critical controls are release-blocking because
// "not tested" is not evidence of authentication safety.

import { readFileSync, existsSync } from "node:fs";
import { STATUS } from "../lib/taxonomy.mjs";
import { AUTH_CONTROLS, CONTROL_INDEX, REQUIRED_CONTROL_IDS } from "./lib/auth-controls.mjs";

export const meta = {
  name: "authentication",
  gate: "Authentication",
};

const VALID_ADAPTER_STATUSES = new Set(["PASS", "FAIL", "SKIP"]);

function loadAdapterResults(resultsPath) {
  if (!resultsPath) {
    return { ok: false, code: "MISSING_ADAPTER_RESULTS", message: "EVIDENCE_AUTH_RESULTS env var not set" };
  }
  if (!existsSync(resultsPath)) {
    return { ok: false, code: "MISSING_ADAPTER_RESULTS", message: `Adapter results file not found: ${resultsPath}` };
  }

  let raw;
  try {
    raw = readFileSync(resultsPath, "utf8");
  } catch (error) {
    return { ok: false, code: "ADAPTER_READ_ERROR", message: String(error?.message ?? error) };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, code: "ADAPTER_PARSE_ERROR", message: String(error?.message ?? error) };
  }

  if (!parsed || typeof parsed !== "object" || !parsed.controls || typeof parsed.controls !== "object") {
    return { ok: false, code: "ADAPTER_SCHEMA_ERROR", message: "Adapter results missing controls{} object" };
  }

  return { ok: true, data: parsed };
}

/**
 * Fold adapter results into the standard evidence artifact schema.
 * Exported for regression tests; the runner calls verify() below.
 */
export function buildEvidence(adapterResults) {
  const positive = [];
  const negative = [];
  const warnings = [];
  const failures = [];
  const evidence_files = [];
  const seen = new Set();

  for (const control of AUTH_CONTROLS) {
    const raw = adapterResults?.controls?.[control.control_id];
    if (!raw) {
      failures.push({
        code: "MISSING_CONTROL",
        control_id: control.control_id,
        control_name: control.control_name,
        blocking: true,
        message: `Adapter did not report result for ${control.control_id}`,
        recommendation: control.recommendation,
      });
      continue;
    }

    seen.add(control.control_id);
    const status = String(raw.status || "").toUpperCase();
    if (!VALID_ADAPTER_STATUSES.has(status)) {
      failures.push({
        code: "INVALID_CONTROL_STATUS",
        control_id: control.control_id,
        control_name: control.control_name,
        blocking: true,
        message: `Adapter reported unknown status "${raw.status}"`,
        recommendation: "Adapter must emit PASS | FAIL | SKIP.",
      });
      continue;
    }

    const record = {
      control_id: control.control_id,
      control_name: control.control_name,
      status,
      execution_time_ms: Number(raw.execution_time_ms ?? 0),
      evidence: raw.evidence ?? {},
      blocking: control.blocking === "critical",
      warnings: Array.isArray(raw.evidence?.warnings) ? raw.evidence.warnings : [],
      recommendation: control.recommendation,
    };

    const screenshots = raw.evidence?.screenshots;
    if (Array.isArray(screenshots)) {
      for (const screenshot of screenshots) {
        if (typeof screenshot === "string" && screenshot) evidence_files.push(screenshot);
      }
    }

    if (status === "PASS") {
      positive.push({ name: control.control_id, status: STATUS.PASS, detail: record });
      continue;
    }

    if (status === "SKIP") {
      if (control.blocking === "critical") {
        failures.push({
          code: "UNVERIFIED_CRITICAL_CONTROL",
          control_id: control.control_id,
          control_name: control.control_name,
          blocking: true,
          message: raw.error?.message || raw.error || `Critical authentication control ${control.control_id} was skipped`,
          expected_outcome: control.expected_outcome,
          recommendation: control.recommendation,
          evidence: record.evidence,
        });
        negative.push({ name: control.control_id, status: STATUS.SECURITY_FAILURE, detail: record });
      } else {
        warnings.push({
          code: "CONTROL_SKIPPED",
          control_id: control.control_id,
          control_name: control.control_name,
          message: raw.error?.message || raw.error || "Adapter skipped this control",
          recommendation: control.recommendation,
        });
        negative.push({ name: control.control_id, status: STATUS.WARNING, detail: record });
      }
      continue;
    }

    // FAIL
    failures.push({
      code: control.failure_code,
      control_id: control.control_id,
      control_name: control.control_name,
      blocking: control.blocking === "critical",
      message: raw.error?.message || raw.error || "Control asserted FAIL by adapter",
      expected_outcome: control.expected_outcome,
      failure_condition: control.failure_condition,
      recommendation: control.recommendation,
      evidence: record.evidence,
    });
    negative.push({
      name: control.control_id,
      status: control.blocking === "critical" ? STATUS.SECURITY_FAILURE : STATUS.WARNING,
      detail: record,
    });
  }

  const hasFrameworkFailure = failures.some(
    (failure) => failure.code === "MISSING_CONTROL" || failure.code === "INVALID_CONTROL_STATUS",
  );
  const anyBlockingFailure = failures.some((failure) => failure.blocking !== false);
  const hasFailures = failures.length > 0;
  const missingControls = REQUIRED_CONTROL_IDS.some(
    (id) => !seen.has(id) && !failures.find((failure) => failure.control_id === id && failure.code === "MISSING_CONTROL"),
  );

  let status;
  if (missingControls || hasFrameworkFailure) {
    status = STATUS.FRAMEWORK_INVALID;
  } else if (anyBlockingFailure) {
    status = STATUS.SECURITY_FAILURE;
  } else if (hasFailures) {
    status = STATUS.WARNING;
  } else if (positive.length === 0) {
    status = STATUS.FRAMEWORK_INVALID;
  } else if (warnings.some((warning) => warning.code === "CONTROL_SKIPPED")) {
    status = STATUS.WARNING;
  } else {
    status = STATUS.PASS;
  }

  return {
    pipeline: meta.name,
    status,
    positive_controls: positive,
    negative_controls: negative,
    warnings,
    failures,
    evidence_files,
  };
}

export async function verify(_ctx) {
  const resultsPath = process.env.EVIDENCE_AUTH_RESULTS;
  const loaded = loadAdapterResults(resultsPath);
  if (!loaded.ok) {
    return {
      pipeline: meta.name,
      status: STATUS.FRAMEWORK_INVALID,
      positive_controls: [],
      negative_controls: [],
      warnings: [
        {
          code: loaded.code,
          message: loaded.message,
          recommendation: "Run the auth execution adapter and set EVIDENCE_AUTH_RESULTS to its output path.",
        },
      ],
      failures: [
        {
          code: loaded.code,
          message: loaded.message,
          blocking: true,
          recommendation: "Provide EVIDENCE_AUTH_RESULTS pointing at the adapter's JSON output.",
        },
      ],
      evidence_files: [],
    };
  }

  return buildEvidence(loaded.data);
}

export const CONTROLS = AUTH_CONTROLS;
export const CONTROLS_BY_ID = CONTROL_INDEX;

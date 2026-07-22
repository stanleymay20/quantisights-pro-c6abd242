// tests/evidence/pipelines/lib/evidence-audit-pipeline.mjs
// Shared builder for EE-4 Evidence & Audit Trail pipeline projections.

import { readFileSync, existsSync } from "node:fs";
import { STATUS } from "../../lib/taxonomy.mjs";
import {
  EVIDENCE_AUDIT_CONTROL_INDEX,
  PIPELINE_CONTROL_IDS,
} from "./evidence-audit-controls.mjs";

const VALID_ADAPTER_STATUSES = new Set(["PASS", "FAIL", "SKIP"]);

function loadAdapterResults(resultsPath) {
  if (!resultsPath) {
    return {
      ok: false,
      code: "MISSING_ADAPTER_RESULTS",
      message: "EVIDENCE_AUDIT_RESULTS env var not set",
    };
  }
  if (!existsSync(resultsPath)) {
    return {
      ok: false,
      code: "MISSING_ADAPTER_RESULTS",
      message: `Adapter results file not found: ${resultsPath}`,
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(resultsPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.controls || typeof parsed.controls !== "object") {
      return {
        ok: false,
        code: "ADAPTER_SCHEMA_ERROR",
        message: "Adapter results missing controls{} object",
      };
    }
    return { ok: true, data: parsed };
  } catch (err) {
    return {
      ok: false,
      code: "ADAPTER_PARSE_ERROR",
      message: String(err?.message ?? err),
    };
  }
}

function frameworkInvalid(pipeline, code, message) {
  return {
    pipeline,
    status: STATUS.FRAMEWORK_INVALID,
    positive_controls: [],
    negative_controls: [],
    warnings: [],
    failures: [{ code, reason: message, blocking: true }],
    evidence_files: [],
  };
}

function projectFailureStatus(failures, warnings) {
  if (failures.some((f) => f.status === STATUS.FRAMEWORK_INVALID)) return STATUS.FRAMEWORK_INVALID;
  if (failures.some((f) => f.status === STATUS.CRITICAL_FAILURE)) return STATUS.CRITICAL_FAILURE;
  if (failures.some((f) => f.status === STATUS.SECURITY_FAILURE)) return STATUS.SECURITY_FAILURE;
  if (warnings.length) return STATUS.WARNING;
  return STATUS.PASS;
}

export function buildPipelineEvidence(pipeline, adapterResults) {
  if (!adapterResults || typeof adapterResults !== "object" || !adapterResults.controls) {
    return frameworkInvalid(pipeline, "ADAPTER_SCHEMA_ERROR", "Adapter results missing controls{} object");
  }

  const required = PIPELINE_CONTROL_IDS[pipeline] ?? [];
  const positive_controls = [];
  const negative_controls = [];
  const warnings = [];
  const failures = [];

  for (const controlId of required) {
    const control = EVIDENCE_AUDIT_CONTROL_INDEX[controlId];
    const rec = adapterResults.controls[controlId];

    if (!rec) {
      failures.push({
        control_id: controlId,
        code: "MISSING_CONTROL",
        status: STATUS.FRAMEWORK_INVALID,
        reason: `Missing required EE-4 control ${controlId}`,
        blocking: true,
      });
      continue;
    }

    const adapterStatus = String(rec.status ?? "");
    if (!VALID_ADAPTER_STATUSES.has(adapterStatus)) {
      failures.push({
        control_id: controlId,
        code: "INVALID_CONTROL_STATUS",
        status: STATUS.FRAMEWORK_INVALID,
        reason: `Invalid EE-4 control status "${adapterStatus}"`,
        blocking: true,
      });
      continue;
    }

    const base = {
      control_id: controlId,
      name: control.title,
      status: adapterStatus,
      execution_time_ms: Number(rec.execution_time_ms ?? 0),
      evidence: rec.evidence ?? {},
    };

    if (adapterStatus === "PASS") {
      if (control.type === "negative") negative_controls.push(base);
      else positive_controls.push(base);
      continue;
    }

    if (adapterStatus === "SKIP") {
      warnings.push({
        control_id: controlId,
        code: "CONTROL_SKIPPED",
        message: `${controlId} skipped; cannot claim full evidence/audit coverage`,
      });
      continue;
    }

    const status =
      control.severity === "critical_failure"
        ? STATUS.CRITICAL_FAILURE
        : STATUS.SECURITY_FAILURE;
    failures.push({
      control_id: controlId,
      code: control.failure_code,
      status,
      severity: control.severity,
      reason: rec.error?.message ?? rec.error ?? `${control.title} failed`,
      recommendation: control.recommendation,
      blocking: true,
    });
  }

  return {
    pipeline,
    status: projectFailureStatus(failures, warnings),
    positive_controls,
    negative_controls,
    warnings,
    failures: failures.map(({ status, ...failure }) => failure),
    evidence_files: Object.values(adapterResults.sources ?? {}).filter(Boolean),
  };
}

export async function verifyPipeline(pipeline) {
  const loaded = loadAdapterResults(process.env.EVIDENCE_AUDIT_RESULTS);
  if (!loaded.ok) return frameworkInvalid(pipeline, loaded.code, loaded.message);
  return buildPipelineEvidence(pipeline, loaded.data);
}

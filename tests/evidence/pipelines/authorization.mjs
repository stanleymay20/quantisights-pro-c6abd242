// tests/evidence/pipelines/authorization.mjs
// EE-2: Authorization & Tenant Isolation — real evidence pipeline.
//
// This pipeline is an EVIDENCE CONSUMER. It does not launch Playwright,
// tenant-isolation probes, or route probes itself. Adapters produce a
// results JSON that this module validates against AUTHZ_CONTROLS and folds
// into the standard evidence artifact schema (see tests/evidence/lib/artifact.mjs).
//
// Adapter contract (JSON at $EVIDENCE_AUTHZ_RESULTS):
// {
//   "adapter": "authz-adapter" | "manual" | ...,
//   "collected_at": "<ISO-8601>",
//   "environment": "preview" | "staging",
//   "sources": {
//     "tenant_isolation": "<path or run_tag>",
//     "browser":          "<path or run_tag>",
//     "route_probes":     "<path or run_tag>"
//   },
//   "controls": {
//     "AUTHZ-001": {
//       "status": "PASS" | "FAIL" | "SKIP",
//       "execution_time_ms": 1234,
//       "evidence": {
//         "route": "/dashboard",
//         "role": "member",
//         "organization_id": "org_a",
//         "user_id": "user_a",
//         "table": null,
//         "policy": null,
//         "request": { "method": "GET", "url": "/dashboard" },
//         "response": { "status": 200, "body_snippet": null },
//         "status_code": 200,
//         "redirect_chain": ["/dashboard"],
//         "console_errors": [],
//         "network_failures": [],
//         "screenshots": [],
//         "recommendation": null
//       },
//       "error": null
//     },
//     ...
//   }
// }
//
// Status projection (per control):
//   FAIL + severity=critical_leak     → STATUS.CRITICAL_LEAK   (blocking)
//   FAIL + severity=security_failure  → STATUS.SECURITY_FAILURE (blocking)
//   FAIL + blocking=warning           → STATUS.WARNING          (non-blocking)
//   SKIP                              → STATUS.WARNING          (never fake PASS)
//
// Overall pipeline status:
//   Any CRITICAL_LEAK                 → STATUS.CRITICAL_LEAK
//   Else any blocking failure         → STATUS.SECURITY_FAILURE
//   Else any warning/skip             → STATUS.WARNING
//   Else missing controls / bad file  → STATUS.FRAMEWORK_INVALID
//   Else                              → STATUS.PASS

import { readFileSync, existsSync } from "node:fs";
import { STATUS } from "../lib/taxonomy.mjs";
import {
  AUTHZ_CONTROLS,
  AUTHZ_CONTROL_INDEX,
  AUTHZ_REQUIRED_CONTROL_IDS,
} from "./lib/authz-controls.mjs";

export const meta = {
  name: "authorization",
  gate: "Authorization",
};

const VALID_ADAPTER_STATUSES = new Set(["PASS", "FAIL", "SKIP"]);

function loadAdapterResults(resultsPath) {
  if (!resultsPath) {
    return {
      ok: false,
      code: "MISSING_ADAPTER_RESULTS",
      message: "EVIDENCE_AUTHZ_RESULTS env var not set",
    };
  }
  if (!existsSync(resultsPath)) {
    return {
      ok: false,
      code: "MISSING_ADAPTER_RESULTS",
      message: `Adapter results file not found: ${resultsPath}`,
    };
  }
  let raw;
  try {
    raw = readFileSync(resultsPath, "utf8");
  } catch (err) {
    return { ok: false, code: "ADAPTER_READ_ERROR", message: String(err?.message ?? err) };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, code: "ADAPTER_PARSE_ERROR", message: String(err?.message ?? err) };
  }
  if (!parsed || typeof parsed !== "object" || !parsed.controls || typeof parsed.controls !== "object") {
    return { ok: false, code: "ADAPTER_SCHEMA_ERROR", message: "Adapter results missing controls{} object" };
  }
  return { ok: true, data: parsed };
}

function failureStatusFor(control) {
  if (control.blocking === "warning") return STATUS.WARNING;
  if (control.severity === "critical_leak") return STATUS.CRITICAL_LEAK;
  return STATUS.SECURITY_FAILURE;
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
  let sawCriticalLeak = false;
  let sawBlockingFailure = false;
  let sawWarningFailure = false;
  let sawSkip = false;

  for (const control of AUTHZ_CONTROLS) {
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

    const evidence = raw.evidence ?? {};
    const record = {
      control_id: control.control_id,
      control_name: control.control_name,
      category: control.category,
      status,
      execution_time_ms: Number(raw.execution_time_ms ?? 0),
      evidence,
      blocking: control.blocking === "critical",
      severity: control.severity,
      recommendation: control.recommendation,
    };

    const screenshots = evidence.screenshots;
    if (Array.isArray(screenshots)) {
      for (const s of screenshots) if (typeof s === "string" && s) evidence_files.push(s);
    }

    if (status === "PASS") {
      positive.push({ name: control.control_id, status: STATUS.PASS, detail: record });
    } else if (status === "SKIP") {
      sawSkip = true;
      warnings.push({
        code: "CONTROL_SKIPPED",
        control_id: control.control_id,
        control_name: control.control_name,
        message: raw.error?.message || raw.error || "Adapter skipped this control",
        recommendation: control.recommendation,
      });
      negative.push({ name: control.control_id, status: STATUS.WARNING, detail: record });
    } else {
      // FAIL
      const projected = failureStatusFor(control);
      if (projected === STATUS.CRITICAL_LEAK) sawCriticalLeak = true;
      else if (projected === STATUS.WARNING) sawWarningFailure = true;
      else sawBlockingFailure = true;

      failures.push({
        code: control.failure_code,
        control_id: control.control_id,
        control_name: control.control_name,
        category: control.category,
        blocking: projected !== STATUS.WARNING,
        severity: control.severity,
        message: raw.error?.message || raw.error || "Control asserted FAIL by adapter",
        expected_outcome: control.expected_outcome,
        failure_condition: control.failure_condition,
        recommendation: control.recommendation,
        evidence,
      });
      negative.push({ name: control.control_id, status: projected, detail: record });
    }
  }

  const anyMissing = failures.some(
    (f) => f.code === "MISSING_CONTROL" || f.code === "INVALID_CONTROL_STATUS",
  );

  let status;
  if (anyMissing) {
    status = STATUS.FRAMEWORK_INVALID;
  } else if (sawCriticalLeak) {
    status = STATUS.CRITICAL_LEAK;
  } else if (sawBlockingFailure) {
    status = STATUS.SECURITY_FAILURE;
  } else if (sawWarningFailure || sawSkip) {
    status = STATUS.WARNING;
  } else if (positive.length === 0) {
    status = STATUS.FRAMEWORK_INVALID;
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
  const resultsPath = process.env.EVIDENCE_AUTHZ_RESULTS;
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
          recommendation:
            "Run the authz execution adapter (see tests/evidence/adapters/README-authz-adapter.md) and set EVIDENCE_AUTHZ_RESULTS to its output path.",
        },
      ],
      failures: [
        {
          code: loaded.code,
          message: loaded.message,
          blocking: true,
          recommendation:
            "Provide EVIDENCE_AUTHZ_RESULTS pointing at the authz-adapter JSON output.",
        },
      ],
      evidence_files: [],
    };
  }
  return buildEvidence(loaded.data);
}

// Exported for tests / tooling.
export const CONTROLS = AUTHZ_CONTROLS;
export const CONTROLS_BY_ID = AUTHZ_CONTROL_INDEX;
export const REQUIRED_CONTROL_IDS = AUTHZ_REQUIRED_CONTROL_IDS;

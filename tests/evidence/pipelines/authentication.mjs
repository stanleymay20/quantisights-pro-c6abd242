// tests/evidence/pipelines/authentication.mjs
// EE-1: Authentication & Identity — real evidence pipeline.
//
// This pipeline is an EVIDENCE CONSUMER. It does not launch Playwright, k6,
// or a browser. The execution adapter (e.g. tests/e2e/auth.spec.ts wrapped by
// tests/evidence/adapters/auth-adapter.mjs, or a manual attester) writes a
// results JSON that this module validates against AUTH_CONTROLS and folds
// into the standard evidence artifact schema (see tests/evidence/lib/artifact.mjs).
//
// Adapter contract (JSON at $EVIDENCE_AUTH_RESULTS):
// {
//   "adapter": "playwright" | "manual" | ...,
//   "collected_at": "<ISO-8601>",
//   "environment": "preview" | "staging",
//   "controls": {
//     "AUTH-001": {
//       "status": "PASS" | "FAIL" | "SKIP",
//       "execution_time_ms": 1234,
//       "evidence": {
//         "route": "/login",
//         "response_status": 200,
//         "redirect_chain": ["/login", "/dashboard"],
//         "session_state": { "user_id": "…", "aal": "aal1" },
//         "auth_state": "signed_in",
//         "console_errors": [],
//         "network_failures": [],
//         "screenshots": ["…/login.png"]
//       },
//       "error": null
//     },
//     ...
//   }
// }
//
// Result mapping:
//   - Every required control PASS       → STATUS.PASS
//   - Any critical control FAIL         → STATUS.SECURITY_FAILURE (blocking)
//   - Only warning-tier controls FAIL   → STATUS.WARNING
//   - Missing controls / missing file   → STATUS.FRAMEWORK_INVALID
//
// Failure taxonomy is preserved (see tests/evidence/lib/taxonomy.mjs); the
// per-control semantic code (AUTH_FAILURE, PKCE_FAILURE, …) is recorded on
// failures[].code so the certification report can render it.

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

    // Track referenced screenshots / attachments for the artifact index.
    const screenshots = raw.evidence?.screenshots;
    if (Array.isArray(screenshots)) {
      for (const s of screenshots) if (typeof s === "string" && s) evidence_files.push(s);
    }

    if (status === "PASS") {
      positive.push({ name: control.control_id, status: STATUS.PASS, detail: record });
    } else if (status === "SKIP") {
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
      negative.push({ name: control.control_id, status: STATUS.SECURITY_FAILURE, detail: record });
    }
  }

  const anyBlockingFailure = failures.some((f) => f.blocking !== false);
  const hasFailures = failures.length > 0;
  const missingControls = REQUIRED_CONTROL_IDS.some((id) => !seen.has(id) && !failures.find((f) => f.control_id === id && f.code === "MISSING_CONTROL"));

  let status;
  if (missingControls || failures.some((f) => f.code === "MISSING_CONTROL" || f.code === "INVALID_CONTROL_STATUS")) {
    status = STATUS.FRAMEWORK_INVALID;
  } else if (anyBlockingFailure) {
    status = STATUS.SECURITY_FAILURE;
  } else if (hasFailures) {
    // only warning-tier failures
    status = STATUS.WARNING;
  } else if (positive.length === 0) {
    status = STATUS.FRAMEWORK_INVALID;
  } else if (warnings.some((w) => w.code === "CONTROL_SKIPPED")) {
    // EE-1C: any skipped control must degrade to WARNING — never a fake PASS.
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
          recommendation: "Run the auth execution adapter (see tests/evidence/adapters/README-auth-adapter.md) and set EVIDENCE_AUTH_RESULTS to its output path.",
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

// Exported for tests / tooling.
export const CONTROLS = AUTH_CONTROLS;
export const CONTROLS_BY_ID = CONTROL_INDEX;

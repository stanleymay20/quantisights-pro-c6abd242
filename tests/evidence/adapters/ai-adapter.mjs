#!/usr/bin/env node
// tests/evidence/adapters/ai-adapter.mjs
// EE-5 adapter: normalizes mocked AI evidence into pipeline input. This module
// never calls live AI providers.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_REQUIRED_CONTROL_IDS } from "../pipelines/lib/ai-controls.mjs";

export function parseArgs(argv) {
  const args = { input: null, output: null, strict: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") args.input = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function normalizeControl(raw = {}) {
  return {
    status: String(raw.status ?? "SKIP").toUpperCase(),
    execution_time_ms: Number(raw.execution_time_ms ?? 0),
    evidence: raw.evidence ?? {},
    error: raw.error ?? null,
  };
}

export function translate(raw, { strict = false } = {}) {
  if (!raw || typeof raw !== "object" || !raw.controls || typeof raw.controls !== "object") {
    throw new Error("AI adapter input missing controls{} object");
  }

  const controls = {};
  const warnings = [];
  for (const [id, rec] of Object.entries(raw.controls)) {
    if (!AI_REQUIRED_CONTROL_IDS.includes(id)) {
      warnings.push({ code: "UNKNOWN_CONTROL", control_id: id, message: `${id} is not an EE-5 AI control` });
      continue;
    }
    controls[id] = normalizeControl(rec);
  }

  const missing = AI_REQUIRED_CONTROL_IDS.filter((id) => !controls[id]);
  for (const id of missing) {
    warnings.push({ code: "MISSING_CONTROL", control_id: id, message: `No mocked AI result mapped to ${id}` });
  }
  if (strict && missing.length) {
    throw new Error(`Missing required EE-5 AI controls: ${missing.join(", ")}`);
  }

  return {
    result: {
      adapter: "ai-adapter",
      collected_at: raw.collected_at ?? new Date().toISOString(),
      environment: raw.environment ?? process.env.EVIDENCE_ENV ?? "preview",
      mode: raw.mode ?? "mocked_ai",
      sources: raw.sources ?? {},
      controls,
    },
    missing,
    warnings,
  };
}

function printHelp() {
  process.stdout.write(
    `ai-adapter — mocked AI evidence translator\n\n` +
      `Usage:\n` +
      `  node tests/evidence/adapters/ai-adapter.mjs --input <raw-json> --output <results-json> [--strict]\n`,
  );
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`ai-adapter: ${err.message}\n`);
    process.exit(1);
  }
  if (args.help || (!args.input && !args.output)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }
  if (!args.input || !args.output) {
    process.stderr.write("ai-adapter: --input and --output are required\n");
    process.exit(1);
  }
  try {
    const raw = JSON.parse(readFileSync(resolve(args.input), "utf8"));
    const out = translate(raw, { strict: args.strict });
    mkdirSync(dirname(resolve(args.output)), { recursive: true });
    writeFileSync(resolve(args.output), JSON.stringify(out.result, null, 2));
    process.stdout.write(JSON.stringify({
      written: args.output,
      controls_mapped: Object.keys(out.result.controls).length,
      controls_missing: out.missing.length,
      warnings: out.warnings.length,
    }, null, 2) + "\n");
    process.exit(0);
  } catch (err) {
    process.stderr.write(`ai-adapter: ${err.message}\n`);
    process.exit(1);
  }
}

const invokedDirect = (() => {
  try {
    const argv1 = process.argv[1] ? resolve(process.argv[1]) : "";
    return argv1 === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedDirect) main(process.argv.slice(2));

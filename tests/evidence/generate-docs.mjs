#!/usr/bin/env node
// tests/evidence/generate-docs.mjs
// Validate (or generate) enterprise docs against tests/evidence/lib/gates.mjs.
// gates.mjs is the single source of truth.
//
// Modes:
//   --check   (default) validate: exit 1 on drift, print diff summary
//   --write   regenerate the auto-generated block(s) in each doc
//
// Files validated:
//   - docs/enterprise/RELEASE_GATE.md
//   - docs/enterprise/EVIDENCE_MATRIX.md
//   - docs/enterprise/CERTIFICATION_ENGINE.md
//
// Determinism guarantees:
//   - UTF-8, LF line endings, no BOM, no trailing whitespace
//   - Stable ordering (as declared in gates.mjs)
//   - Idempotent: running --write twice produces byte-identical output

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GATES, TOTAL_WEIGHT } from "./lib/gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const RELEASE_GATE_PATH = join(REPO_ROOT, "docs/enterprise/RELEASE_GATE.md");
const MATRIX_PATH = join(REPO_ROOT, "docs/enterprise/EVIDENCE_MATRIX.md");
const ENGINE_PATH = join(REPO_ROOT, "docs/enterprise/CERTIFICATION_ENGINE.md");

const START = "<!-- AUTO-GENERATED:GATES:START (do not edit — run npm run evidence:docs:write) -->";
const END = "<!-- AUTO-GENERATED:GATES:END -->";
// Legacy start marker still accepted for backwards compatibility.
const START_LEGACY = "<!-- AUTO-GENERATED:GATES:START (do not edit — run npm run evidence:docs) -->";

function gateTable() {
  const rows = ["| Gate key | Label | Weight | Pipelines |", "|---|---|---:|---|"];
  for (const g of GATES) {
    rows.push(
      `| \`${g.key}\` | ${g.label} | ${g.weight} | ${g.pipelines.map((p) => `\`${p}\``).join(", ")} |`,
    );
  }
  return rows.join("\n");
}

function renderReleaseBlock() {
  return [
    START,
    "",
    "## Gate definition (generated from `tests/evidence/lib/gates.mjs`)",
    "",
    "Scoring model: weights do not need to sum to 100. The Enterprise",
    `Readiness Score is normalized to 0-100 against TOTAL_WEIGHT = ${TOTAL_WEIGHT}.`,
    "Gates with weight 0 are hard-blocking but do not contribute to the score.",
    "",
    gateTable(),
    "",
    `**Total weight (score denominator):** ${TOTAL_WEIGHT}`,
    "",
    END,
  ].join("\n");
}

function renderMatrixBlock() {
  return [
    START,
    "",
    "## Gate mapping (generated from `tests/evidence/lib/gates.mjs`)",
    "",
    "This section is auto-generated. Do not hand-edit.",
    "",
    gateTable(),
    "",
    END,
  ].join("\n");
}

function renderEngineBlock() {
  return [
    START,
    "",
    "### Canonical weights (generated from `tests/evidence/lib/gates.mjs`)",
    "",
    `**TOTAL_WEIGHT = ${TOTAL_WEIGHT}** (score denominator).`,
    "",
    gateTable(),
    "",
    END,
  ].join("\n");
}

// Normalize a file to a deterministic form: strip BOM, LF line endings,
// no trailing whitespace on lines, exactly one trailing newline.
function normalize(text) {
  let s = text.replace(/^\uFEFF/, "");
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n+$/g, "") + "\n";
  return s;
}

function findMarker(text, marker) {
  const i = text.indexOf(marker);
  return i;
}

function upsertBlock(existing, block) {
  let s = findMarker(existing, START);
  if (s === -1) s = findMarker(existing, START_LEGACY);
  const e = findMarker(existing, END);
  if (s !== -1 && e !== -1 && e > s) {
    return existing.slice(0, s) + block + existing.slice(e + END.length);
  }
  return existing.trimEnd() + "\n\n" + block + "\n";
}

function processFile(f, mode) {
  if (!existsSync(f.path)) return { error: `${f.name} missing at ${f.path}` };
  const raw = readFileSync(f.path, "utf8");
  const current = normalize(raw);
  const next = normalize(upsertBlock(current, f.block));
  if (mode === "write") {
    if (next !== raw) writeFileSync(f.path, next);
    return { wrote: next !== raw, path: f.path };
  }
  if (next !== raw) {
    return {
      drift: true,
      reason:
        raw !== current
          ? "encoding/whitespace drift (BOM/CRLF/trailing space) — run: npm run evidence:docs:write"
          : "generated block drift — run: npm run evidence:docs:write",
    };
  }
  return { ok: true };
}

function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  const files = [
    { path: RELEASE_GATE_PATH, block: renderReleaseBlock(), name: "RELEASE_GATE.md" },
    { path: MATRIX_PATH, block: renderMatrixBlock(), name: "EVIDENCE_MATRIX.md" },
    { path: ENGINE_PATH, block: renderEngineBlock(), name: "CERTIFICATION_ENGINE.md" },
  ];

  const errors = [];
  for (const f of files) {
    const res = processFile(f, mode);
    if (res.error) errors.push(res.error);
    else if (res.drift) errors.push(`${f.name}: ${res.reason}`);
    else if (mode === "write") console.log(`[docs] ${res.wrote ? "wrote" : "unchanged"} ${f.path}`);
  }

  if (errors.length) {
    for (const e of errors) console.error(`[docs] ${e}`);
    process.exit(1);
  }
  if (mode === "check") console.log("[docs] gates.mjs and enterprise docs are in sync");
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();

export { normalize, renderReleaseBlock, renderMatrixBlock, renderEngineBlock };

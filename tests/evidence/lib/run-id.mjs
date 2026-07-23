// tests/evidence/lib/run-id.mjs
// Deterministic-shaped run identifier: <ISO-compact>-<8 hex>.
// Uniqueness comes from a random suffix (crypto.randomUUID when available,
// Math.random fallback). Kept dependency-free so the engine has no npm deps.

import { randomUUID, randomBytes } from "node:crypto";

export function generateRunId(now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, "-"); // 2026-07-01T06-45-02-210Z
  let suffix;
  try {
    suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  } catch {
    try {
      suffix = randomBytes(4).toString("hex");
    } catch {
      suffix = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, "0");
    }
  }
  return `${iso}-${suffix}`;
}

export const RUN_ID_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}$/;

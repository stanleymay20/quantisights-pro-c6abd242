// Pack 3 — HR / PII fixture.
// Drives PII detection, identifier protection, boolean classification.

import { createSeededRandom, intBetween, pick } from "./seeded-random";

export interface HRPiiPack {
  headers: string[];
  rows: string[][];
}

export function generateHRPiiPack(rowCount = 500, seed = 11): HRPiiPack {
  const rng = createSeededRandom(seed);
  const headers = [
    "employee_id",
    "email",
    "phone",
    "address",
    "manager",
    "department",
    "salary",
    "is_active",
  ];
  const departments = ["Engineering", "Finance", "HR", "Sales", "Operations"];
  const managers = ["Anna Müller", "Lukas Weber", "Sofia Rossi", "James Patel", "Marta Schulz"];

  const rows: string[][] = new Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    const id = `EMP-${String(intBetween(rng, 10000, 99999))}`;
    rows[i] = [
      id,
      `user.${i}@quantivis-cert.example`,
      `+49 30 ${intBetween(rng, 1000000, 9999999)}`,
      `${intBetween(rng, 1, 200)} Hauptstr, Berlin`,
      pick(rng, managers),
      pick(rng, departments),
      intBetween(rng, 35000, 180000).toString(),
      pick(rng, ["true", "false"]),
    ];
  }
  return { headers, rows };
}

// Pack 4 — CRM fixture.

import { createSeededRandom, floatBetween, intBetween, pick } from "./seeded-random";

export interface CRMPack {
  headers: string[];
  rows: string[][];
}

export function generateCRMPack(rowCount = 1000, seed = 23): CRMPack {
  const rng = createSeededRandom(seed);
  const headers = [
    "lead_id",
    "account_name",
    "opportunity_stage",
    "expected_revenue",
    "close_date",
    "sales_rep",
  ];
  const stages = ["Prospect", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
  const accounts = [
    "Acme Corp", "Globex", "Initech", "Umbrella", "Hooli",
    "Stark Industries", "Wayne Enterprises", "Soylent", "Pied Piper", "Massive Dynamic",
  ];
  const reps = ["A. Smith", "B. Jones", "C. Lee", "D. Kim", "E. Garcia"];

  const rows: string[][] = new Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    const year = intBetween(rng, 2024, 2026);
    const month = String(intBetween(rng, 1, 12)).padStart(2, "0");
    const day = String(intBetween(rng, 1, 28)).padStart(2, "0");
    rows[i] = [
      `LEAD-${String(intBetween(rng, 100000, 999999))}`,
      pick(rng, accounts),
      pick(rng, stages),
      floatBetween(rng, 5_000, 750_000).toFixed(2),
      `${year}-${month}-${day}`,
      pick(rng, reps),
    ];
  }
  return { headers, rows };
}

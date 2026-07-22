// Pack 1 — Manufacturing Scale fixture generator.
// Produces a synthetic Manufacturing dataset with realistic dimensions and
// KPIs. Deterministic given the same row count + seed.

import { createSeededRandom, floatBetween, intBetween, pick } from "./seeded-random";

export interface ManufacturingPack {
  headers: string[];
  rows: string[][];
}

const REGIONS = ["DACH", "EMEA", "NA", "LATAM", "APAC"];
const DEPARTMENTS = ["Assembly", "Packaging", "Quality", "Logistics", "Maintenance"];
const SUPPLIERS = [
  "Bosch GmbH", "Siemens AG", "Schaeffler", "Continental", "ZF Friedrichshafen",
  "ThyssenKrupp", "Knorr-Bremse", "Mahle", "Hella", "SKF",
];
const PRODUCT_LINES = ["AX-100", "AX-200", "BR-50", "CR-700", "DX-900", "EX-1100"];
const SALES_CHANNELS = ["Direct", "Distributor", "OEM", "Aftermarket"];

export function generateManufacturingPack(rowCount: number, seed = 42): ManufacturingPack {
  const rng = createSeededRandom(seed);
  const headers = [
    "month",
    "region",
    "department",
    "supplier",
    "product_line",
    "sales_channel",
    "revenue_eur",
    "cost_eur",
    "gross_profit_eur",
    "inventory_turnover",
    "defect_rate",
    "risk_score",
  ];

  const rows: string[][] = new Array(rowCount);
  const startYear = 2022;
  for (let i = 0; i < rowCount; i += 1) {
    const monthOffset = i % 36; // 3 years rolling window
    const year = startYear + Math.floor(monthOffset / 12);
    const month = String((monthOffset % 12) + 1).padStart(2, "0");
    const revenue = floatBetween(rng, 50_000, 2_500_000);
    const cost = revenue * floatBetween(rng, 0.55, 0.88);
    // Inject ~3% missing values in non-key columns to exercise completeness checks.
    const missing = rng() < 0.03;
    rows[i] = [
      `${year}-${month}-01`,
      pick(rng, REGIONS),
      pick(rng, DEPARTMENTS),
      pick(rng, SUPPLIERS),
      pick(rng, PRODUCT_LINES),
      pick(rng, SALES_CHANNELS),
      revenue.toFixed(2),
      cost.toFixed(2),
      (revenue - cost).toFixed(2),
      floatBetween(rng, 2, 12).toFixed(2),
      missing ? "" : floatBetween(rng, 0.001, 0.045).toFixed(4),
      intBetween(rng, 1, 100).toString(),
    ];
  }
  return { headers, rows };
}

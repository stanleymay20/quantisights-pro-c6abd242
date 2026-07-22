// Pack 2 — German Locale fixture.
// Validates European decimal parsing (1.234.567,89), DD.MM.YYYY dates,
// and JA/NEIN boolean handling.

import { createSeededRandom, floatBetween, intBetween, pick } from "./seeded-random";

export interface GermanLocalePack {
  headers: string[];
  rows: string[][];
}

export function generateGermanLocalePack(rowCount = 200, seed = 7): GermanLocalePack {
  const rng = createSeededRandom(seed);
  const headers = ["periode", "abteilung", "umsatz", "kosten", "aktiv"];
  const departments = ["Vertrieb", "Marketing", "Produktion", "Einkauf", "Logistik"];

  const rows: string[][] = new Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    const day = String(intBetween(rng, 1, 28)).padStart(2, "0");
    const month = String(intBetween(rng, 1, 12)).padStart(2, "0");
    const year = String(intBetween(rng, 2022, 2025));
    const revenue = floatBetween(rng, 100_000, 9_999_999);
    const cost = revenue * floatBetween(rng, 0.4, 0.85);
    rows[i] = [
      `${day}.${month}.${year}`,
      pick(rng, departments),
      formatGermanNumber(revenue),
      formatGermanNumber(cost),
      pick(rng, ["JA", "NEIN"]),
    ];
  }
  return { headers, rows };
}

export function formatGermanNumber(n: number): string {
  // 1.234.567,89 format
  const parts = n.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intPart},${parts[1]}`;
}

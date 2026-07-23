/**
 * Shared currency/number formatting utility for portfolio components.
 * Uses €, matching the rest of the app (CURRENCY_SYMBOL in chart-config.ts,
 * cost-of-delay.ts's default, copilot-answer-engine.ts's EUR formatter) —
 * this was the one place still hardcoding $.
 */
export const fmtCurrency = (n: number | null): string => {
  if (n === null) return "—";
  if (Math.abs(n) >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${n.toFixed(0)}`;
};

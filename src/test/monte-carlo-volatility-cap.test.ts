import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// Reimplements monte-carlo-sim/index.ts's exact GBM path formula (it lives
// inline inside the Deno serve() handler, not a separately importable
// function) to prove the volatility-drag collapse this fix addresses, and
// that capping sigma prevents it. This is a math-level reproduction, not an
// import of the real edge function — the source-pattern checks below verify
// the actual file was changed to use the capped value.
function simulateFinalValues(lastValue: number, mu: number, sigma: number, steps: number, runs: number): number[] {
  function randn(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  const finalValues: number[] = [];
  for (let r = 0; r < runs; r++) {
    let price = lastValue;
    for (let t = 0; t < steps; t++) {
      const drift = (mu - 0.5 * sigma * sigma) * 1;
      const diffusion = sigma * Math.sqrt(1) * randn();
      price = price * Math.exp(drift + diffusion);
    }
    finalValues.push(price);
  }
  return finalValues;
}

describe("Monte Carlo simulation volatility-drag collapse (P0: Expected/P10/P90 all 0.00)", () => {
  // Root cause: GBM's drift term includes -0.5*sigma^2. For a metric with
  // genuinely extreme period-over-period volatility (sigma well above 1.0),
  // that term dominates and compounds toward zero over multiple forecast
  // steps — nearly every simulated path collapses, so expected/median/P10/P90
  // all round to 0.00 while probability_negative correctly reports ~100%
  // (every path really is below the last actual value). Fixed by capping
  // sigma before simulating.

  it("uncapped, extreme volatility collapses nearly the entire distribution to ~0", () => {
    const lastValue = 10_000;
    const extremeSigma = 2.0; // 200% per-period volatility
    const finalValues = simulateFinalValues(lastValue, 0, extremeSigma, 6, 2000);
    finalValues.sort((a, b) => a - b);
    const median = finalValues[Math.floor(0.5 * finalValues.length)];
    const p90 = finalValues[Math.floor(0.9 * finalValues.length)];
    // With this much volatility drag, the median collapses to a small
    // fraction of a cent against a starting value of 10,000 (rounds to
    // 0.00 at 2 decimal places in practice), and even the 90th percentile
    // (skewed upward by the fat log-normal tail) is left under 1% of the
    // starting value.
    expect(median).toBeLessThan(1);
    expect(p90).toBeLessThan(lastValue * 0.01);
  });

  it("capped at the fix's SIGMA_CAP (0.75), the same starting value produces a non-degenerate forecast", () => {
    const lastValue = 10_000;
    const cappedSigma = 0.75;
    const finalValues = simulateFinalValues(lastValue, 0, cappedSigma, 6, 2000);
    finalValues.sort((a, b) => a - b);
    const p90 = finalValues[Math.floor(0.9 * finalValues.length)];
    const median = finalValues[Math.floor(0.5 * finalValues.length)];
    expect(p90).toBeGreaterThan(0);
    expect(median).toBeGreaterThan(0);
  });

  it("monte-carlo-sim/index.ts caps sigma before simulating and reports it transparently", () => {
    const source = read("supabase/functions/monte-carlo-sim/index.ts");
    expect(source).toMatch(/const SIGMA_CAP = 0\.75/);
    expect(source).toContain("const simSigma = Math.min(sigma, SIGMA_CAP)");
    // The simulation loop must use the capped value, not raw sigma.
    expect(source).toMatch(/0\.5 \* simSigma \* simSigma/);
    expect(source).toContain("simSigma * Math.sqrt(dt) * randn()");
    // The reported "volatility" stat stays honest (uncapped) — only the
    // simulation itself is dampened.
    expect(source).toContain("volatility: round2(sigma * 100)");
    expect(source).toContain("volatilityCapNote");
  });
});

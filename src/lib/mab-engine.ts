/**
 * Multi-Armed Bandit Engine (Ch 9-11)
 * 
 * Implements Thompson Sampling, Epsilon-Greedy, and UCB1 strategies
 * for adaptive action selection in decision optimization.
 * 
 * Book concepts:
 * - Ch 9: Exploration vs exploitation tradeoff
 * - Ch 10: Thompson Sampling with Beta-Bernoulli conjugate priors
 * - Ch 11: Contextual bandits for personalized recommendations
 */

// ─── Types ───

export interface BanditArm {
  id: string;
  name: string;
  successes: number;  // alpha parameter (Beta distribution)
  failures: number;   // beta parameter (Beta distribution)
  pulls: number;
  totalReward: number;
  lastPulledAt?: string;
  context?: Record<string, number>; // For contextual bandits
}

export interface BanditConfig {
  strategy: "thompson" | "epsilon_greedy" | "ucb1";
  epsilon?: number;       // For epsilon-greedy (default 0.1)
  explorationBonus?: number; // UCB1 exploration parameter
  priorAlpha?: number;    // Beta prior alpha (default 1)
  priorBeta?: number;     // Beta prior beta (default 1)
}

export interface BanditResult {
  selectedArm: string;
  strategy: string;
  explorationReason: string;
  allScores: Array<{ armId: string; score: number; exploitScore: number }>;
}

// ─── Beta Distribution Sampling ───

/** Sample from Beta(alpha, beta) using Jöhnk's algorithm */
function sampleBeta(alpha: number, beta: number): number {
  // Use gamma sampling for Beta distribution
  const gammaA = sampleGamma(alpha);
  const gammaB = sampleGamma(beta);
  return gammaA / (gammaA + gammaB);
}

/** Sample from Gamma(shape, 1) — Marsaglia & Tsang's method */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Box-Muller transform for standard normal */
function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Strategy Implementations ───

/**
 * Thompson Sampling (Ch 10)
 * 
 * Bayesian approach: maintain Beta(α, β) posterior for each arm.
 * Sample from each posterior, select arm with highest sample.
 * Natural exploration-exploitation balance without tuning parameters.
 */
export function thompsonSampling(
  arms: BanditArm[],
  config: BanditConfig
): BanditResult {
  const priorA = config.priorAlpha ?? 1;
  const priorB = config.priorBeta ?? 1;

  const scores = arms.map((arm) => {
    const alpha = priorA + arm.successes;
    const beta = priorB + arm.failures;
    const sample = sampleBeta(alpha, beta);
    const exploitScore = arm.pulls > 0 ? arm.successes / arm.pulls : 0.5;
    return { armId: arm.id, score: sample, exploitScore };
  });

  scores.sort((a, b) => b.score - a.score);
  const selected = scores[0];

  return {
    selectedArm: selected.armId,
    strategy: "thompson_sampling",
    explorationReason: `Sampled from Beta(${(priorA + (arms.find(a => a.id === selected.armId)?.successes ?? 0))}, ${(priorB + (arms.find(a => a.id === selected.armId)?.failures ?? 0))})`,
    allScores: scores,
  };
}

/**
 * Epsilon-Greedy (Ch 9)
 * 
 * With probability ε, explore randomly. Otherwise exploit best-known arm.
 * Simple but effective baseline strategy.
 */
export function epsilonGreedy(
  arms: BanditArm[],
  config: BanditConfig
): BanditResult {
  const epsilon = config.epsilon ?? 0.1;
  const isExploring = Math.random() < epsilon;

  const scores = arms.map((arm) => {
    const exploitScore = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0;
    return { armId: arm.id, score: exploitScore, exploitScore };
  });
  scores.sort((a, b) => b.score - a.score);

  if (isExploring) {
    const randomIdx = Math.floor(Math.random() * arms.length);
    return {
      selectedArm: arms[randomIdx].id,
      strategy: "epsilon_greedy",
      explorationReason: `Exploring (ε=${epsilon}): random selection`,
      allScores: scores,
    };
  }

  return {
    selectedArm: scores[0].armId,
    strategy: "epsilon_greedy",
    explorationReason: `Exploiting best arm (ε=${epsilon})`,
    allScores: scores,
  };
}

/**
 * UCB1 — Upper Confidence Bound (Ch 9)
 * 
 * Select arm maximizing: mean_reward + c * sqrt(ln(N) / n_i)
 * Deterministic exploration based on confidence intervals.
 */
export function ucb1(
  arms: BanditArm[],
  config: BanditConfig
): BanditResult {
  const c = config.explorationBonus ?? Math.SQRT2;
  const totalPulls = arms.reduce((s, a) => s + a.pulls, 0);

  // Pull each arm at least once
  const unpulled = arms.find((a) => a.pulls === 0);
  if (unpulled) {
    return {
      selectedArm: unpulled.id,
      strategy: "ucb1",
      explorationReason: "Initial exploration: arm not yet tested",
      allScores: arms.map((a) => ({ armId: a.id, score: Infinity, exploitScore: 0 })),
    };
  }

  const scores = arms.map((arm) => {
    const mean = arm.totalReward / arm.pulls;
    const exploration = c * Math.sqrt(Math.log(totalPulls) / arm.pulls);
    return { armId: arm.id, score: mean + exploration, exploitScore: mean };
  });
  scores.sort((a, b) => b.score - a.score);

  return {
    selectedArm: scores[0].armId,
    strategy: "ucb1",
    explorationReason: `UCB1 bound (c=${c.toFixed(2)})`,
    allScores: scores,
  };
}

// ─── Main Selection Function ───

export function selectArm(arms: BanditArm[], config: BanditConfig): BanditResult {
  if (arms.length === 0) throw new Error("No arms provided");
  if (arms.length === 1) {
    return {
      selectedArm: arms[0].id,
      strategy: config.strategy,
      explorationReason: "Single arm — no choice needed",
      allScores: [{ armId: arms[0].id, score: 1, exploitScore: 1 }],
    };
  }

  switch (config.strategy) {
    case "thompson": return thompsonSampling(arms, config);
    case "epsilon_greedy": return epsilonGreedy(arms, config);
    case "ucb1": return ucb1(arms, config);
    default: return thompsonSampling(arms, config);
  }
}

// ─── Regret Tracking (Ch 9) ───

export interface RegretSnapshot {
  round: number;
  cumulativeRegret: number;
  bestArmReward: number;
  selectedArmReward: number;
}

export function computeCumulativeRegret(
  history: Array<{ armId: string; reward: number }>,
  arms: BanditArm[]
): RegretSnapshot[] {
  const bestRate = Math.max(
    ...arms.map((a) => (a.pulls > 0 ? a.totalReward / a.pulls : 0))
  );
  let cumRegret = 0;
  return history.map((h, i) => {
    cumRegret += bestRate - h.reward;
    return {
      round: i + 1,
      cumulativeRegret: cumRegret,
      bestArmReward: bestRate,
      selectedArmReward: h.reward,
    };
  });
}

// ─── Contextual Bandit (Ch 11) ───

export interface ContextualFeatures {
  segment?: string;
  urgency?: number;
  confidence?: number;
  dayOfWeek?: number;
  [key: string]: unknown;
}

/**
 * Contextual Thompson Sampling
 * Adjusts arm priors based on context similarity to historical performance.
 */
export function contextualThompson(
  arms: BanditArm[],
  context: ContextualFeatures,
  config: BanditConfig
): BanditResult {
  const adjustedArms = arms.map((arm) => {
    let boost = 0;
    if (arm.context && context.urgency !== undefined) {
      const urgencyMatch = 1 - Math.abs((arm.context.urgency ?? 0.5) - (context.urgency ?? 0.5));
      boost = urgencyMatch * 0.2; // Small contextual adjustment
    }
    return {
      ...arm,
      successes: arm.successes + Math.round(boost * arm.pulls),
    };
  });
  const result = thompsonSampling(adjustedArms, config);
  result.strategy = "contextual_thompson";
  result.explorationReason += ` | context-adjusted`;
  return result;
}

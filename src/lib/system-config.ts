/**
 * Dynamic System Configuration Service.
 * All intelligence parameters are configurable via environment variables.
 * No hardcoded magic numbers — every threshold is tunable at deploy time.
 */

function envFloat(key: string, fallback: number): number {
  const val = import.meta.env[key];
  if (val == null || val === "") return fallback;
  const parsed = parseFloat(val);
  return isFinite(parsed) ? parsed : fallback;
}

function envInt(key: string, fallback: number): number {
  const val = import.meta.env[key];
  if (val == null || val === "") return fallback;
  const parsed = parseInt(val, 10);
  return isFinite(parsed) ? parsed : fallback;
}

export interface SystemConfig {
  costOfDelay: {
    severityWeights: { critical: number; high: number; medium: number; low: number };
    confidenceContributionMax: number;
    ageDecayRate: number;
    ageDecayMax: number;
    signalDeltaMultiplier: number;
    signalDeltaMax: number;
    entityCountMultiplier: number;
    entityCountMax: number;
    trendAccelerationBonus: number;
    metricUrgency: Record<string, number>;
    labelThresholds: { critical: number; high: number; medium: number };
    actionWindows: { critical: number; high: number; medium: number; low: number };
  };
  decisionIntelligence: {
    voi: {
      uncertaintyReduction: number;
      costPerDataPointRatio: number;
      sampleInfoRatio: number;
      decideNowConfidence: number;
    };
    regret: {
      p10FallbackMultiplier: number;
      p90FallbackMultiplier: number;
    };
    velocity: {
      improvingThreshold: number;
      degradingThreshold: number;
      slowWarningDays: number;
      minDecisionsForTrend: number;
    };
    portfolioRisk: {
      varConfidenceLevel: number;
      highCorrelationThreshold: number;
      highConcentrationThreshold: number;
    };
  };
  convergence: {
    volatilityDivergenceThreshold: number;
    volatilityDivergencePenalty: number;
    alignmentThresholds: { aligned: number; tension: number; misalignment: number };
    conflictRules: {
      ceoVsCfoDivergence: number;
      ceoVsCfoPenalty: number;
      cmoLowThreshold: number;
      cooHighThreshold: number;
      growthExecutionPenalty: number;
      cfoHighThreshold: number;
      ceoLowThreshold: number;
      cashExpansionPenalty: number;
      volatilityHighThreshold: number;
      volatilityLowThreshold: number;
      operationalImbalancePenalty: number;
    };
    reconcileIntervalMs: number;
  };
  /**
   * Shared "is this score good/moderate/bad" display cutoffs. Previously
   * each component re-declared its own literal (70/50, 75/50, 80/50 for AI
   * confidence; 65 vs. 50/70 for calibration score), so the same underlying
   * value could render as a different color/tier depending on which screen
   * showed it. One canonical pair per metric fixes that.
   */
  confidenceDisplay: {
    /** AI/decision confidence percentage (0-100) badge & indicator color tiers. */
    aiConfidenceHigh: number;
    aiConfidenceModerate: number;
    /** Calibration score percentage (0-100) status tiers. */
    calibrationGood: number;
    calibrationWarning: number;
  };
}

let _cachedConfig: SystemConfig | null = null;

export function getSystemConfig(): SystemConfig {
  if (_cachedConfig) return _cachedConfig;

  _cachedConfig = {
    costOfDelay: {
      severityWeights: {
        critical: envFloat("VITE_COD_SEVERITY_CRITICAL", 40),
        high: envFloat("VITE_COD_SEVERITY_HIGH", 28),
        medium: envFloat("VITE_COD_SEVERITY_MEDIUM", 16),
        low: envFloat("VITE_COD_SEVERITY_LOW", 6),
      },
      confidenceContributionMax: envFloat("VITE_COD_CONFIDENCE_MAX", 20),
      ageDecayRate: envFloat("VITE_COD_AGE_DECAY_RATE", 0.7),
      ageDecayMax: envFloat("VITE_COD_AGE_DECAY_MAX", 20),
      signalDeltaMultiplier: envFloat("VITE_COD_SIGNAL_DELTA_MULT", 0.5),
      signalDeltaMax: envFloat("VITE_COD_SIGNAL_DELTA_MAX", 10),
      entityCountMultiplier: envFloat("VITE_COD_ENTITY_COUNT_MULT", 1.5),
      entityCountMax: envFloat("VITE_COD_ENTITY_COUNT_MAX", 5),
      trendAccelerationBonus: envFloat("VITE_COD_TREND_ACCEL_BONUS", 5),
      metricUrgency: {
        // SaaS / Subscription
        churn: envFloat("VITE_COD_URGENCY_CHURN", 1.3),
        retention: envFloat("VITE_COD_URGENCY_RETENTION", 1.3),
        revenue: envFloat("VITE_COD_URGENCY_REVENUE", 1.2),
        cost: envFloat("VITE_COD_URGENCY_COST", 1.1),
        margin: envFloat("VITE_COD_URGENCY_MARGIN", 1.15),
        growth: envFloat("VITE_COD_URGENCY_GROWTH", 1.05),
        // Industrial / Manufacturing
        safety: envFloat("VITE_COD_URGENCY_SAFETY", 1.5),
        downtime: envFloat("VITE_COD_URGENCY_DOWNTIME", 1.35),
        yield: envFloat("VITE_COD_URGENCY_YIELD", 1.2),
        throughput: envFloat("VITE_COD_URGENCY_THROUGHPUT", 1.15),
        defect: envFloat("VITE_COD_URGENCY_DEFECT", 1.25),
        // Regulatory / Compliance
        compliance: envFloat("VITE_COD_URGENCY_COMPLIANCE", 1.4),
        regulatory: envFloat("VITE_COD_URGENCY_REGULATORY", 1.4),
        audit: envFloat("VITE_COD_URGENCY_AUDIT", 1.25),
        // Healthcare / Life Sciences
        patient: envFloat("VITE_COD_URGENCY_PATIENT", 1.45),
        clinical: envFloat("VITE_COD_URGENCY_CLINICAL", 1.3),
        mortality: envFloat("VITE_COD_URGENCY_MORTALITY", 1.5),
        readmission: envFloat("VITE_COD_URGENCY_READMISSION", 1.25),
        // Supply Chain / Logistics
        "supply chain": envFloat("VITE_COD_URGENCY_SUPPLY_CHAIN", 1.3),
        inventory: envFloat("VITE_COD_URGENCY_INVENTORY", 1.15),
        logistics: envFloat("VITE_COD_URGENCY_LOGISTICS", 1.2),
        procurement: envFloat("VITE_COD_URGENCY_PROCUREMENT", 1.15),
        // Energy / Utilities
        energy: envFloat("VITE_COD_URGENCY_ENERGY", 1.25),
        outage: envFloat("VITE_COD_URGENCY_OUTAGE", 1.4),
        emission: envFloat("VITE_COD_URGENCY_EMISSION", 1.3),
        // Financial Services / Risk
        fraud: envFloat("VITE_COD_URGENCY_FRAUD", 1.4),
        exposure: envFloat("VITE_COD_URGENCY_EXPOSURE", 1.3),
        liquidity: envFloat("VITE_COD_URGENCY_LIQUIDITY", 1.35),
        credit: envFloat("VITE_COD_URGENCY_CREDIT", 1.25),
        // Education / Public Sector
        enrollment: envFloat("VITE_COD_URGENCY_ENROLLMENT", 1.15),
        attrition: envFloat("VITE_COD_URGENCY_ATTRITION", 1.25),
        // Hospitality / Real Estate
        occupancy: envFloat("VITE_COD_URGENCY_OCCUPANCY", 1.2),
        vacancy: envFloat("VITE_COD_URGENCY_VACANCY", 1.2),
      },
      labelThresholds: {
        critical: envInt("VITE_COD_LABEL_CRITICAL", 80),
        high: envInt("VITE_COD_LABEL_HIGH", 55),
        medium: envInt("VITE_COD_LABEL_MEDIUM", 30),
      },
      actionWindows: {
        critical: envInt("VITE_COD_WINDOW_CRITICAL", 3),
        high: envInt("VITE_COD_WINDOW_HIGH", 7),
        medium: envInt("VITE_COD_WINDOW_MEDIUM", 14),
        low: envInt("VITE_COD_WINDOW_LOW", 21),
      },
    },
    decisionIntelligence: {
      voi: {
        uncertaintyReduction: envFloat("VITE_VOI_UNCERTAINTY_REDUCTION", 0.03),
        costPerDataPointRatio: envFloat("VITE_VOI_COST_PER_DATAPOINT", 0.001),
        sampleInfoRatio: envFloat("VITE_VOI_SAMPLE_INFO_RATIO", 0.6),
        decideNowConfidence: envFloat("VITE_VOI_DECIDE_NOW_CONF", 0.75),
      },
      regret: {
        p10FallbackMultiplier: envFloat("VITE_REGRET_P10_FALLBACK", 0.3),
        p90FallbackMultiplier: envFloat("VITE_REGRET_P90_FALLBACK", 1.5),
      },
      velocity: {
        improvingThreshold: envFloat("VITE_VELOCITY_IMPROVING", 0.85),
        degradingThreshold: envFloat("VITE_VELOCITY_DEGRADING", 1.15),
        slowWarningDays: envFloat("VITE_VELOCITY_SLOW_WARN_DAYS", 5),
        minDecisionsForTrend: envInt("VITE_VELOCITY_MIN_DECISIONS", 4),
      },
      portfolioRisk: {
        varConfidenceLevel: envFloat("VITE_PORTFOLIO_VAR_CONF", 1.645),
        highCorrelationThreshold: envFloat("VITE_PORTFOLIO_HIGH_CORR", 0.5),
        highConcentrationThreshold: envFloat("VITE_PORTFOLIO_HIGH_CONC", 60),
      },
    },
    convergence: {
      volatilityDivergenceThreshold: envFloat("VITE_CONV_VOL_DIV_THRESHOLD", 35),
      volatilityDivergencePenalty: envFloat("VITE_CONV_VOL_DIV_PENALTY", 10),
      alignmentThresholds: {
        aligned: envInt("VITE_CONV_ALIGNED", 80),
        tension: envInt("VITE_CONV_TENSION", 60),
        misalignment: envInt("VITE_CONV_MISALIGNMENT", 40),
      },
      conflictRules: {
        ceoVsCfoDivergence: envFloat("VITE_CONV_CEO_CFO_DIV", 30),
        ceoVsCfoPenalty: envFloat("VITE_CONV_CEO_CFO_PENALTY", 15),
        cmoLowThreshold: envFloat("VITE_CONV_CMO_LOW", 40),
        cooHighThreshold: envFloat("VITE_CONV_COO_HIGH", 70),
        growthExecutionPenalty: envFloat("VITE_CONV_GROWTH_EXEC_PENALTY", 8),
        cfoHighThreshold: envFloat("VITE_CONV_CFO_HIGH", 75),
        ceoLowThreshold: envFloat("VITE_CONV_CEO_LOW", 50),
        cashExpansionPenalty: envFloat("VITE_CONV_CASH_EXP_PENALTY", 15),
        volatilityHighThreshold: envFloat("VITE_CONV_VOL_HIGH", 80),
        volatilityLowThreshold: envFloat("VITE_CONV_VOL_LOW", 40),
        operationalImbalancePenalty: envFloat("VITE_CONV_OP_IMBAL_PENALTY", 25),
      },
      reconcileIntervalMs: envInt("VITE_CONV_RECONCILE_INTERVAL", 6 * 60 * 60 * 1000),
    },
    confidenceDisplay: {
      aiConfidenceHigh: envFloat("VITE_CONF_AI_HIGH", 70),
      aiConfidenceModerate: envFloat("VITE_CONF_AI_MODERATE", 50),
      calibrationGood: envFloat("VITE_CONF_CALIBRATION_GOOD", 70),
      calibrationWarning: envFloat("VITE_CONF_CALIBRATION_WARNING", 50),
    },
  };

  return _cachedConfig;
}

/** Reset cached config (useful for testing) */
export function resetSystemConfig(): void {
  _cachedConfig = null;
}

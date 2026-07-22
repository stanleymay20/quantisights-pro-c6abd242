/**
 * Type definitions for ML Engine results.
 * Matches the server-side ml-engine.ts types.
 */

export interface KMeansResult {
  centroids: number[][];
  assignments: number[];
  iterations: number;
  inertia: number;
  silhouetteScore: number;
  clusterSizes: number[];
  clusterStats: Array<{
    centroid: number[];
    size: number;
    withinVariance: number;
    featureMeans: number[];
  }>;
}

export interface ARIMAResult {
  forecast: number[];
  confidence_intervals: Array<{ lower: number; upper: number }>;
  residuals: number[];
  aic: number;
  parameters: { ar: number[]; ma: number[]; d: number };
  mape: number;
  rmse: number;
}

export interface DecisionTreeResult {
  tree: {
    featureIndex?: number;
    threshold?: number;
    left?: DecisionTreeResult["tree"];
    right?: DecisionTreeResult["tree"];
    prediction?: string;
    samples: number;
    impurity: number;
    featureName?: string;
  };
  accuracy: number;
  featureImportance: Array<{ feature: string; importance: number }>;
  predictions: string[];
  confusionMatrix: Record<string, Record<string, number>>;
  depth: number;
}

export interface IsolationForestResult {
  anomalyScores: number[];
  anomalies: number[];
  threshold: number;
  numTrees: number;
}

export interface CohortResult {
  cohorts: Array<{
    cohortDate: string;
    initialSize: number;
    retentionByPeriod: number[];
    retentionRateByPeriod: number[];
  }>;
  averageRetention: number[];
  churnRate: number;
  ltv_multiplier: number;
}

export interface ABTestResult {
  controlMean: number;
  treatmentMean: number;
  absoluteDifference: number;
  relativeDifference: number;
  pValue: number;
  isSignificant: boolean;
  confidenceInterval: { lower: number; upper: number };
  statisticalPower: number;
  requiredSampleSize: number;
  recommendation: "control_wins" | "treatment_wins" | "no_difference" | "insufficient_data";
}

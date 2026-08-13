/**
 * Statistical ML Engine — Pure-function implementations of core ML algorithms.
 * 
 * No external ML libraries — all algorithms implemented from mathematical
 * foundations for full auditability and zero dependency risk.
 * 
 * Implements:
 * 1. K-Means Clustering (Lloyd's algorithm)
 * 2. ARIMA(p,d,q) Forecasting
 * 3. Decision Tree Classifier (entropy-based)
 * 4. Feature Importance (permutation-based)
 * 5. Linear Discriminant Analysis
 * 6. Isolation Forest (anomaly detection)
 */

// ═══════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += (arr[i] - m) ** 2;
  return sum / (arr.length - 1);
}

function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Standardize features to zero mean, unit variance */
function standardize(matrix: number[][]): { data: number[][]; means: number[]; stds: number[] } {
  if (matrix.length === 0) return { data: [], means: [], stds: [] };
  const nCols = matrix[0].length;
  const means: number[] = [];
  const stds: number[] = [];

  for (let j = 0; j < nCols; j++) {
    const col = matrix.map(row => row[j]);
    means.push(mean(col));
    stds.push(stdDev(col) || 1);
  }

  const data = matrix.map(row =>
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  return { data, means, stds };
}

// ═══════════════════════════════════════════════════════
// 1. K-MEANS CLUSTERING (Lloyd's Algorithm)
// ═══════════════════════════════════════════════════════

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

export function kMeansClustering(
  data: number[][],
  k: number,
  maxIterations: number = 100,
  nInit: number = 5
): KMeansResult {
  if (data.length === 0 || k <= 0) {
    return { centroids: [], assignments: [], iterations: 0, inertia: Infinity, silhouetteScore: 0, clusterSizes: [], clusterStats: [] };
  }

  k = Math.min(k, data.length);
  const { data: standardized } = standardize(data);

  let bestResult: KMeansResult | null = null;

  for (let init = 0; init < nInit; init++) {
    const result = _kMeansRun(standardized, data, k, maxIterations);
    if (!bestResult || result.inertia < bestResult.inertia) {
      bestResult = result;
    }
  }

  return bestResult!;
}

function _kMeansRun(stdData: number[][], rawData: number[][], k: number, maxIter: number): KMeansResult {
  const n = stdData.length;
  const nFeatures = stdData[0].length;

  // K-means++ initialization
  const centroids: number[][] = [];
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...stdData[firstIdx]]);

  for (let c = 1; c < k; c++) {
    const distances = stdData.map(point => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const d = euclideanDistance(point, centroid);
        if (d < minDist) minDist = d;
      }
      return minDist * minDist;
    });

    const totalDist = distances.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalDist;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      r -= distances[i];
      if (r <= 0) { idx = i; break; }
    }
    centroids.push([...stdData[idx]]);
  }

  // Lloyd's iterations
  const assignments = new Array(n).fill(0);
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations++;
    let changed = false;

    // Assign
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let minCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDistance(stdData[i], centroids[c]);
        if (d < minDist) { minDist = d; minCluster = c; }
      }
      if (assignments[i] !== minCluster) { assignments[i] = minCluster; changed = true; }
    }

    if (!changed) break;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = stdData.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      for (let j = 0; j < nFeatures; j++) {
        centroids[c][j] = mean(members.map(m => m[j]));
      }
    }
  }

  // Compute metrics
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += euclideanDistance(stdData[i], centroids[assignments[i]]) ** 2;
  }

  const silhouetteScore = computeSilhouette(stdData, assignments, k);

  // Cluster stats using raw data
  const clusterSizes = new Array(k).fill(0);
  for (const a of assignments) clusterSizes[a]++;

  const clusterStats = Array.from({ length: k }, (_, c) => {
    const members = rawData.filter((_, i) => assignments[i] === c);
    const featureMeans = members.length > 0
      ? Array.from({ length: nFeatures }, (_, j) => mean(members.map(m => m[j])))
      : new Array(nFeatures).fill(0);

    let withinVar = 0;
    for (const m of members) {
      withinVar += euclideanDistance(m, featureMeans) ** 2;
    }

    return {
      centroid: featureMeans,
      size: members.length,
      withinVariance: members.length > 1 ? withinVar / (members.length - 1) : 0,
      featureMeans,
    };
  });

  return { centroids, assignments, iterations, inertia, silhouetteScore, clusterSizes, clusterStats };
}

function computeSilhouette(data: number[][], assignments: number[], k: number): number {
  if (data.length < 2 || k < 2) return 0;
  const n = data.length;
  let totalSilhouette = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i];
    
    // a(i): mean intra-cluster distance
    const sameCluster = data.filter((_, j) => j !== i && assignments[j] === myCluster);
    const a = sameCluster.length > 0
      ? mean(sameCluster.map(p => euclideanDistance(data[i], p)))
      : 0;

    // b(i): min mean inter-cluster distance
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      const otherCluster = data.filter((_, j) => assignments[j] === c);
      if (otherCluster.length === 0) continue;
      const meanDist = mean(otherCluster.map(p => euclideanDistance(data[i], p)));
      if (meanDist < b) b = meanDist;
    }

    if (b === Infinity) b = 0;
    const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
    totalSilhouette += s;
  }

  return totalSilhouette / n;
}

// ═══════════════════════════════════════════════════════
// 2. ARIMA FORECASTING
// ═══════════════════════════════════════════════════════

export interface ARIMAResult {
  forecast: number[];
  confidence_intervals: Array<{ lower: number; upper: number }>;
  residuals: number[];
  aic: number;
  parameters: { ar: number[]; ma: number[]; d: number };
  mape: number;
  rmse: number;
}

/** Difference a series d times */
function difference(series: number[], d: number): number[] {
  let result = [...series];
  for (let i = 0; i < d; i++) {
    const diffed: number[] = [];
    for (let j = 1; j < result.length; j++) {
      diffed.push(result[j] - result[j - 1]);
    }
    result = diffed;
  }
  return result;
}

/** Undifference: reconstruct from differenced forecast */
function undifference(forecast: number[], lastValues: number[], d: number): number[] {
  let result = [...forecast];
  for (let i = d - 1; i >= 0; i--) {
    const restored: number[] = [];
    let prev = lastValues[i];
    for (const val of result) {
      prev = prev + val;
      restored.push(prev);
    }
    result = restored;
  }
  return result;
}

/** Autocorrelation function */
function acf(series: number[], maxLag: number): number[] {
  const m = mean(series);
  const n = series.length;
  let c0 = 0;
  for (let i = 0; i < n; i++) c0 += (series[i] - m) ** 2;
  c0 /= n;

  const result: number[] = [1.0];
  for (let lag = 1; lag <= maxLag; lag++) {
    let ck = 0;
    for (let i = lag; i < n; i++) {
      ck += (series[i] - m) * (series[i - lag] - m);
    }
    ck /= n;
    result.push(c0 > 0 ? ck / c0 : 0);
  }
  return result;
}

/** Partial autocorrelation via Durbin-Levinson */
function pacf(series: number[], maxLag: number): number[] {
  const ac = acf(series, maxLag);
  const result: number[] = [1.0];

  for (let k = 1; k <= maxLag; k++) {
    const phi: number[][] = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
    
    phi[1][1] = ac[1];
    
    for (let j = 2; j <= k; j++) {
      let num = ac[j];
      let den = 1;
      for (let i = 1; i < j; i++) {
        num -= phi[j - 1][i] * ac[j - i];
        den -= phi[j - 1][i] * ac[i];
      }
      phi[j][j] = den !== 0 ? num / den : 0;
      
      for (let i = 1; i < j; i++) {
        phi[j][i] = phi[j - 1][i] - phi[j][j] * phi[j - 1][j - i];
      }
    }
    
    result.push(phi[k][k]);
  }
  return result;
}

/** Detect linear trend in a series */
function linearTrend(series: number[]): { slope: number; intercept: number } {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: series[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += series[i];
    sumXY += i * series[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Auto-select ARIMA order using stationarity tests */
function selectOrder(series: number[]): { p: number; d: number; q: number } {
  let d = 0;
  let current = [...series];
  
  // Use both ACF decay AND linear trend significance to detect non-stationarity
  for (let i = 0; i < 2; i++) {
    const trend = linearTrend(current);
    const n = current.length;
    const se = stdDev(current) / Math.sqrt(n) || 1;
    const tStat = Math.abs(trend.slope * (n - 1) / 2) / se; // approximate t-stat for slope
    
    const ac = acf(current, Math.min(10, Math.floor(n / 3)));
    const acfDecaysSlow = Math.abs(ac[1] || 0) > 0.5;
    const hasTrend = tStat > 1.5; // More sensitive trend detection
    
    if (!acfDecaysSlow && !hasTrend) break;
    current = difference(current, 1);
    d++;
  }
  
  // Ensure at least d=1 if strong monotonic trend exists
  if (d === 0) {
    const trend = linearTrend(series);
    const r2 = (() => {
      const n = series.length;
      const m = mean(series);
      let ssTot = 0, ssRes = 0;
      for (let i = 0; i < n; i++) {
        ssTot += (series[i] - m) ** 2;
        ssRes += (series[i] - (trend.intercept + trend.slope * i)) ** 2;
      }
      return ssTot > 0 ? 1 - ssRes / ssTot : 0;
    })();
    if (r2 > 0.5) {
      d = 1;
      current = difference(series, 1);
    }
  }

  // Select p from PACF cutoff
  const pac = pacf(current, Math.min(5, Math.floor(current.length / 4)));
  let p = 0;
  const threshold = 1.96 / Math.sqrt(current.length);
  for (let i = 1; i < pac.length; i++) {
    if (Math.abs(pac[i]) > threshold) p = i;
    else break;
  }
  p = Math.min(p, 3);

  // Select q from ACF cutoff
  const ac = acf(current, Math.min(5, Math.floor(current.length / 4)));
  let q = 0;
  for (let i = 1; i < ac.length; i++) {
    if (Math.abs(ac[i]) > threshold) q = i;
    else break;
  }
  q = Math.min(q, 3);

  return { p: Math.max(p, 1), d, q: Math.max(q, 0) };
}

export function arimaForecast(
  series: number[],
  horizons: number = 6,
  order?: { p: number; d: number; q: number }
): ARIMAResult {
  if (series.length < 10) {
    return {
      forecast: new Array(horizons).fill(mean(series)),
      confidence_intervals: new Array(horizons).fill({ lower: 0, upper: 0 }),
      residuals: [],
      aic: Infinity,
      parameters: { ar: [], ma: [], d: 0 },
      mape: 100,
      rmse: Infinity,
    };
  }

  const { p, d, q } = order || selectOrder(series);
  
  // Store last values for undifferencing
  const lastValues: number[] = [];
  let current = [...series];
  for (let i = 0; i < d; i++) {
    lastValues.push(current[current.length - 1]);
    current = difference(current, 1);
  }

  // Mean-center the (possibly differenced) series for stable AR fitting
  const seriesMean = mean(current);
  const centered = current.map(v => v - seriesMean);

  // Fit AR parameters via Yule-Walker on centered series
  const ac = acf(centered, Math.max(p, q) + 1);
  const arCoeffs: number[] = [];

  if (p > 0) {
    const r = ac.slice(1, p + 1);
    const R: number[][] = [];
    for (let i = 0; i < p; i++) {
      R.push([]);
      for (let j = 0; j < p; j++) {
        R[i].push(ac[Math.abs(i - j)]);
      }
    }
    
    const augmented = R.map((row, i) => [...row, r[i]]);
    for (let col = 0; col < p; col++) {
      let maxRow = col;
      for (let row = col + 1; row < p; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) maxRow = row;
      }
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];
      if (Math.abs(augmented[col][col]) < 1e-10) continue;
      for (let row = col + 1; row < p; row++) {
        const factor = augmented[row][col] / augmented[col][col];
        for (let j = col; j <= p; j++) augmented[row][j] -= factor * augmented[col][j];
      }
    }
    
    const solution = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      let sum = augmented[i][p];
      for (let j = i + 1; j < p; j++) sum -= augmented[i][j] * solution[j];
      solution[i] = Math.abs(augmented[i][i]) > 1e-10 ? sum / augmented[i][i] : 0;
    }
    
    // Stability check: ensure AR polynomial roots are inside unit circle
    // Simple check: sum of absolute AR coefficients < 1
    const arSum = solution.reduce((s, c) => s + Math.abs(c), 0);
    if (arSum >= 1.0) {
      // Scale down to ensure stability
      const scale = 0.95 / arSum;
      for (let i = 0; i < solution.length; i++) solution[i] *= scale;
    }
    
    arCoeffs.push(...solution);
  }

  // Compute residuals on centered series
  const residuals: number[] = [];
  for (let t = p; t < centered.length; t++) {
    let predicted = 0;
    for (let i = 0; i < p; i++) predicted += arCoeffs[i] * centered[t - i - 1];
    residuals.push(centered[t] - predicted);
  }

  // Fit MA coefficients
  const maCoeffs: number[] = [];
  if (q > 0 && residuals.length > q) {
    const resAc = acf(residuals, q);
    for (let i = 1; i <= q; i++) maCoeffs.push(-resAc[i] * 0.5);
  }

  // Generate forecast on centered series, then add mean back
  const forecastCentered: number[] = [];
  const extendedCentered = [...centered];
  const extendedResiduals = [...residuals];

  for (let h = 0; h < horizons; h++) {
    let pred = 0;
    for (let i = 0; i < p; i++) {
      const idx = extendedCentered.length - i - 1;
      if (idx >= 0) pred += arCoeffs[i] * extendedCentered[idx];
    }
    for (let i = 0; i < q; i++) {
      const idx = extendedResiduals.length - i - 1;
      if (idx >= 0) pred += maCoeffs[i] * extendedResiduals[idx];
    }
    forecastCentered.push(pred);
    extendedCentered.push(pred);
    extendedResiduals.push(0);
  }

  // Add mean back to get forecast on differenced (or raw) scale
  const forecastDiff = forecastCentered.map(v => v + seriesMean);

  // Undifference
  const forecast = undifference(forecastDiff, lastValues, d);

  // Confidence intervals
  const residualStd = stdDev(residuals) || 1;
  const confidence_intervals = forecast.map((f, h) => {
    const width = 1.96 * residualStd * Math.sqrt(h + 1);
    return { lower: f - width, upper: f + width };
  });

  // Metrics
  const mape = residuals.length > 0
    ? mean(residuals.map((r, i) => {
        const actual = current[i + p];
        return actual !== 0 ? Math.abs(r / actual) * 100 : 0;
      }))
    : 100;

  const rmse = Math.sqrt(mean(residuals.map(r => r * r)));
  const n = current.length;
  const k = p + q;
  const aic = n * Math.log(mean(residuals.map(r => r * r)) || 1) + 2 * k;

  return {
    forecast,
    confidence_intervals,
    residuals,
    aic,
    parameters: { ar: arCoeffs, ma: maCoeffs, d },
    mape,
    rmse,
  };
}

// ═══════════════════════════════════════════════════════
// 3. DECISION TREE CLASSIFIER
// ═══════════════════════════════════════════════════════

interface TreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: string;
  samples: number;
  impurity: number;
  featureName?: string;
}

export interface DecisionTreeResult {
  tree: TreeNode;
  accuracy: number;
  featureImportance: Array<{ feature: string; importance: number }>;
  predictions: string[];
  confusionMatrix: Record<string, Record<string, number>>;
  depth: number;
}

function entropy(labels: string[]): number {
  const counts: Record<string, number> = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  let ent = 0;
  for (const count of Object.values(counts)) {
    const p = count / labels.length;
    if (p > 0) ent -= p * Math.log2(p);
  }
  return ent;
}

function informationGain(
  parentLabels: string[],
  leftLabels: string[],
  rightLabels: string[]
): number {
  const parentEnt = entropy(parentLabels);
  const n = parentLabels.length;
  const leftEnt = entropy(leftLabels) * (leftLabels.length / n);
  const rightEnt = entropy(rightLabels) * (rightLabels.length / n);
  return parentEnt - leftEnt - rightEnt;
}

function buildTree(
  features: number[][],
  labels: string[],
  featureNames: string[],
  maxDepth: number,
  minSamples: number,
  depth: number = 0,
  importanceAccum: number[]
): TreeNode {
  const uniqueLabels = [...new Set(labels)];

  // Leaf conditions
  if (uniqueLabels.length === 1 || depth >= maxDepth || labels.length < minSamples) {
    const counts: Record<string, number> = {};
    for (const l of labels) counts[l] = (counts[l] || 0) + 1;
    const prediction = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { prediction, samples: labels.length, impurity: entropy(labels) };
  }

  let bestGain = -Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;

  for (let f = 0; f < features[0].length; f++) {
    const values = features.map(row => row[f]);
    const sorted = [...new Set(values)].sort((a, b) => a - b);

    for (let t = 0; t < sorted.length - 1; t++) {
      const threshold = (sorted[t] + sorted[t + 1]) / 2;
      const leftLabels = labels.filter((_, i) => features[i][f] <= threshold);
      const rightLabels = labels.filter((_, i) => features[i][f] > threshold);

      if (leftLabels.length === 0 || rightLabels.length === 0) continue;

      const gain = informationGain(labels, leftLabels, rightLabels);
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = threshold;
      }
    }
  }

  if (bestGain <= 0) {
    const counts: Record<string, number> = {};
    for (const l of labels) counts[l] = (counts[l] || 0) + 1;
    const prediction = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { prediction, samples: labels.length, impurity: entropy(labels) };
  }

  // Accumulate feature importance
  importanceAccum[bestFeature] += bestGain * labels.length;

  const leftIndices = features.map((row, i) => row[bestFeature] <= bestThreshold ? i : -1).filter(i => i >= 0);
  const rightIndices = features.map((row, i) => row[bestFeature] > bestThreshold ? i : -1).filter(i => i >= 0);

  return {
    featureIndex: bestFeature,
    featureName: featureNames[bestFeature],
    threshold: bestThreshold,
    samples: labels.length,
    impurity: entropy(labels),
    left: buildTree(
      leftIndices.map(i => features[i]),
      leftIndices.map(i => labels[i]),
      featureNames, maxDepth, minSamples, depth + 1, importanceAccum
    ),
    right: buildTree(
      rightIndices.map(i => features[i]),
      rightIndices.map(i => labels[i]),
      featureNames, maxDepth, minSamples, depth + 1, importanceAccum
    ),
  };
}

function predictTree(node: TreeNode, features: number[]): string {
  if (node.prediction !== undefined) return node.prediction;
  if (features[node.featureIndex!] <= node.threshold!) {
    return predictTree(node.left!, features);
  }
  return predictTree(node.right!, features);
}

function treeDepth(node: TreeNode): number {
  if (!node.left && !node.right) return 0;
  return 1 + Math.max(
    node.left ? treeDepth(node.left) : 0,
    node.right ? treeDepth(node.right) : 0
  );
}

export function trainDecisionTree(
  features: number[][],
  labels: string[],
  featureNames: string[],
  maxDepth: number = 6,
  minSamples: number = 5
): DecisionTreeResult {
  const importanceAccum = new Array(featureNames.length).fill(0);

  const tree = buildTree(features, labels, featureNames, maxDepth, minSamples, 0, importanceAccum);

  // Normalize importance
  const totalImportance = importanceAccum.reduce((a, b) => a + b, 0) || 1;
  const featureImportance = featureNames.map((name, i) => ({
    feature: name,
    importance: importanceAccum[i] / totalImportance,
  })).sort((a, b) => b.importance - a.importance);

  // Predictions and accuracy
  const predictions = features.map(f => predictTree(tree, f));
  let correct = 0;
  for (let i = 0; i < labels.length; i++) {
    if (predictions[i] === labels[i]) correct++;
  }
  const accuracy = correct / labels.length;

  // Confusion matrix
  const confusionMatrix: Record<string, Record<string, number>> = {};
  const allLabels = [...new Set(labels)];
  for (const actual of allLabels) {
    confusionMatrix[actual] = {};
    for (const pred of allLabels) confusionMatrix[actual][pred] = 0;
  }
  for (let i = 0; i < labels.length; i++) {
    confusionMatrix[labels[i]][predictions[i]]++;
  }

  return { tree, accuracy, featureImportance, predictions, confusionMatrix, depth: treeDepth(tree) };
}

// ═══════════════════════════════════════════════════════
// 4. ISOLATION FOREST (Anomaly Detection)
// ═══════════════════════════════════════════════════════

export interface IsolationForestResult {
  anomalyScores: number[];
  anomalies: number[]; // indices
  threshold: number;
  numTrees: number;
}

interface IsoTreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: IsoTreeNode;
  right?: IsoTreeNode;
  size: number;
}

function buildIsoTree(data: number[][], maxDepth: number, depth: number = 0): IsoTreeNode {
  if (data.length <= 1 || depth >= maxDepth) {
    return { size: data.length };
  }

  const nFeatures = data[0].length;
  const featureIndex = Math.floor(Math.random() * nFeatures);
  const values = data.map(row => row[featureIndex]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) return { size: data.length };

  const threshold = min + Math.random() * (max - min);
  const leftData = data.filter(row => row[featureIndex] < threshold);
  const rightData = data.filter(row => row[featureIndex] >= threshold);

  return {
    featureIndex,
    threshold,
    left: buildIsoTree(leftData, maxDepth, depth + 1),
    right: buildIsoTree(rightData, maxDepth, depth + 1),
    size: data.length,
  };
}

function pathLength(node: IsoTreeNode, point: number[], depth: number = 0): number {
  if (node.featureIndex === undefined) {
    // Average path length correction for unbuilt subtrees
    const n = node.size;
    if (n <= 1) return depth;
    const harmonic = Math.log(n - 1) + 0.5772156649;
    return depth + 2 * harmonic - 2 * (n - 1) / n;
  }

  if (point[node.featureIndex] < node.threshold!) {
    return pathLength(node.left!, point, depth + 1);
  }
  return pathLength(node.right!, point, depth + 1);
}

export function isolationForest(
  data: number[][],
  numTrees: number = 100,
  contamination: number = 0.1
): IsolationForestResult {
  const n = data.length;
  const maxDepth = Math.ceil(Math.log2(Math.max(n, 2)));
  const sampleSize = Math.min(256, n);

  // Build forest
  const trees: IsoTreeNode[] = [];
  for (let t = 0; t < numTrees; t++) {
    // Subsample
    const indices: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      indices.push(Math.floor(Math.random() * n));
    }
    const sample = indices.map(i => data[i]);
    trees.push(buildIsoTree(sample, maxDepth));
  }

  // Score each point
  const avgPathLengths = data.map(point => {
    let totalPath = 0;
    for (const tree of trees) totalPath += pathLength(tree, point);
    return totalPath / numTrees;
  });

  // Compute anomaly scores: s(x, n) = 2^(-E[h(x)] / c(n))
  const cn = n > 2 ? 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n : 1;
  const anomalyScores = avgPathLengths.map(h => Math.pow(2, -h / cn));

  // Determine threshold from contamination rate
  const sortedScores = [...anomalyScores].sort((a, b) => b - a);
  const thresholdIdx = Math.max(0, Math.floor(contamination * n) - 1);
  const threshold = sortedScores[thresholdIdx] || 0.5;

  const anomalies = anomalyScores
    .map((score, i) => score >= threshold ? i : -1)
    .filter(i => i >= 0);

  return { anomalyScores, anomalies, threshold, numTrees };
}

// ═══════════════════════════════════════════════════════
// 5. COHORT ANALYSIS
// ═══════════════════════════════════════════════════════

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

export function cohortAnalysis(
  events: Array<{ userId: string; date: string; value?: number }>,
  periodType: "week" | "month" = "month"
): CohortResult {
  // Assign each user to their first-seen cohort
  const userFirstSeen: Record<string, string> = {};
  const userActivePeriods: Record<string, Set<string>> = {};

  const toPeriod = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (periodType === "week") {
      const day = d.getDay();
      const diff = d.getDate() - day;
      const weekStart = new Date(d.setDate(diff));
      return weekStart.toISOString().slice(0, 10);
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  for (const event of events) {
    const period = toPeriod(event.date);
    if (!userFirstSeen[event.userId] || period < userFirstSeen[event.userId]) {
      userFirstSeen[event.userId] = period;
    }
    if (!userActivePeriods[event.userId]) userActivePeriods[event.userId] = new Set();
    userActivePeriods[event.userId].add(period);
  }

  // Build cohorts
  const cohortUsers: Record<string, string[]> = {};
  for (const [userId, cohort] of Object.entries(userFirstSeen)) {
    if (!cohortUsers[cohort]) cohortUsers[cohort] = [];
    cohortUsers[cohort].push(userId);
  }

  const allPeriods = [...new Set(events.map(e => toPeriod(e.date)))].sort();
  const periodIndex: Record<string, number> = {};
  allPeriods.forEach((p, i) => { periodIndex[p] = i; });

  const cohorts = Object.entries(cohortUsers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohortDate, users]) => {
      const cohortIdx = periodIndex[cohortDate];
      const maxPeriods = allPeriods.length - cohortIdx;
      const retentionByPeriod: number[] = [];
      const retentionRateByPeriod: number[] = [];

      for (let offset = 0; offset < maxPeriods; offset++) {
        const targetPeriod = allPeriods[cohortIdx + offset];
        const retained = users.filter(u => userActivePeriods[u].has(targetPeriod)).length;
        retentionByPeriod.push(retained);
        retentionRateByPeriod.push(users.length > 0 ? retained / users.length : 0);
      }

      return { cohortDate, initialSize: users.length, retentionByPeriod, retentionRateByPeriod };
    });

  // Average retention across all cohorts
  const maxLen = Math.max(...cohorts.map(c => c.retentionRateByPeriod.length), 0);
  const averageRetention: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const rates = cohorts
      .filter(c => c.retentionRateByPeriod.length > i)
      .map(c => c.retentionRateByPeriod[i]);
    averageRetention.push(rates.length > 0 ? mean(rates) : 0);
  }

  const churnRate = averageRetention.length >= 2 ? 1 - averageRetention[1] : 0;
  const ltv_multiplier = churnRate > 0 ? 1 / churnRate : 10;

  return { cohorts, averageRetention, churnRate, ltv_multiplier };
}

// ═══════════════════════════════════════════════════════
// 6. A/B TEST SIGNIFICANCE
// ═══════════════════════════════════════════════════════

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

export function abTestSignificance(
  controlValues: number[],
  treatmentValues: number[],
  alpha: number = 0.05
): ABTestResult {
  const n1 = controlValues.length;
  const n2 = treatmentValues.length;

  if (n1 < 5 || n2 < 5) {
    return {
      controlMean: mean(controlValues),
      treatmentMean: mean(treatmentValues),
      absoluteDifference: 0,
      relativeDifference: 0,
      pValue: 1,
      isSignificant: false,
      confidenceInterval: { lower: -Infinity, upper: Infinity },
      statisticalPower: 0,
      requiredSampleSize: 100,
      recommendation: "insufficient_data",
    };
  }

  const m1 = mean(controlValues);
  const m2 = mean(treatmentValues);
  const v1 = variance(controlValues);
  const v2 = variance(treatmentValues);

  const diff = m2 - m1;
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const tStat = se > 0 ? diff / se : 0;

  // Welch's degrees of freedom
  const num = (v1 / n1 + v2 / n2) ** 2;
  const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = den > 0 ? num / den : 1;

  // Approximate p-value from t-distribution using normal approximation for large df
  const zScore = Math.abs(tStat);
  const pValue = 2 * (1 - normalCDF(zScore));

  const zAlpha = normalInvCDF(1 - alpha / 2);
  const ci = {
    lower: diff - zAlpha * se,
    upper: diff + zAlpha * se,
  };

  // Effect size (Cohen's d)
  const pooledStd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const effectSize = pooledStd > 0 ? Math.abs(diff) / pooledStd : 0;

  // Power calculation (approximate)
  const noncentrality = effectSize * Math.sqrt(n1 * n2 / (n1 + n2));
  const power = 1 - normalCDF(zAlpha - noncentrality);

  // Required sample size for 80% power
  const zBeta = normalInvCDF(0.8);
  const requiredN = effectSize > 0
    ? Math.ceil(2 * ((zAlpha + zBeta) / effectSize) ** 2)
    : 1000;

  let recommendation: ABTestResult["recommendation"];
  if (pValue >= alpha) recommendation = "no_difference";
  else if (diff > 0) recommendation = "treatment_wins";
  else recommendation = "control_wins";

  return {
    controlMean: m1,
    treatmentMean: m2,
    absoluteDifference: diff,
    relativeDifference: m1 !== 0 ? (diff / Math.abs(m1)) * 100 : 0,
    pValue,
    isSignificant: pValue < alpha,
    confidenceInterval: ci,
    statisticalPower: Math.min(power, 1),
    requiredSampleSize: requiredN,
    recommendation,
  };
}

// Normal distribution helpers
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

function normalInvCDF(p: number): number {
  // Rational approximation (Abramowitz & Stegun 26.2.23)
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const sign = p < 0.5 ? -1 : 1;
  const pp = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(pp));

  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  return sign * (t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
}

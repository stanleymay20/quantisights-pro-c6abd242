export interface ChangepointEvidence {
  index: number;
  date?: string;
  mean_before: number;
  mean_after: number;
  magnitude_pct: number;
  significance: number;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Deterministic binary-segmentation/CUSUM-style structural-break detector.
 *
 * A detected changepoint is temporal evidence that the statistical regime
 * changed. It is NOT proof that any contemporaneous event caused that change.
 */
export function detectChangepoints(
  values: number[],
  dates?: string[],
  minSegment = 5,
): ChangepointEvidence[] {
  if (values.length < minSegment * 2) return [];

  const globalStd = stdDev(values);
  if (globalStd === 0) return [];

  const results: ChangepointEvidence[] = [];
  findChangepoint(values, 0, values.length - 1, dates, minSegment, globalStd, results, 0);

  return results
    .sort((a, b) => b.significance - a.significance)
    .slice(0, 3);
}

function findChangepoint(
  values: number[],
  start: number,
  end: number,
  dates: string[] | undefined,
  minSegment: number,
  globalStd: number,
  results: ChangepointEvidence[],
  depth: number,
): void {
  if (depth > 3) return;
  const n = end - start + 1;
  if (n < minSegment * 2) return;

  let bestIndex = -1;
  let bestStatistic = 0;

  for (let index = start + minSegment; index <= end - minSegment; index++) {
    const left = values.slice(start, index);
    const right = values.slice(index, end + 1);
    const leftMean = mean(left);
    const rightMean = mean(right);
    const statistic = Math.abs(leftMean - rightMean) / globalStd * Math.sqrt((left.length * right.length) / n);

    if (statistic > bestStatistic) {
      bestStatistic = statistic;
      bestIndex = index;
    }
  }

  const threshold = 1.5 + 0.5 * Math.log(n);
  if (bestStatistic <= threshold || bestIndex < 0) return;

  const meanBefore = mean(values.slice(start, bestIndex));
  const meanAfter = mean(values.slice(bestIndex, end + 1));
  const magnitude = meanBefore !== 0
    ? ((meanAfter - meanBefore) / Math.abs(meanBefore)) * 100
    : 0;

  results.push({
    index: bestIndex,
    date: dates?.[bestIndex],
    mean_before: Math.round(meanBefore * 100) / 100,
    mean_after: Math.round(meanAfter * 100) / 100,
    magnitude_pct: Math.round(magnitude * 10) / 10,
    significance: Math.min(1, bestStatistic / (threshold * 2)),
  });

  findChangepoint(values, start, bestIndex - 1, dates, minSegment, globalStd, results, depth + 1);
  findChangepoint(values, bestIndex, end, dates, minSegment, globalStd, results, depth + 1);
}

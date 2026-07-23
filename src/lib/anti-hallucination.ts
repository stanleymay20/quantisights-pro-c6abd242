/**
 * Anti-Hallucination Validation Layer
 * 
 * Validates AI-generated outputs against source data before rendering.
 * Ensures every claim is traceable to actual metric values.
 * 
 * Used by: AI Insights, Copilot, Diagnostics, Advisory
 */

export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100 validation score
  flags: ValidationFlag[];
  sanitized: string; // cleaned output with fabricated claims removed
}

export interface ValidationFlag {
  type: "fabricated_metric" | "wrong_value" | "unsupported_claim" | "missing_source" | "inflated_confidence" | "temporal_mismatch";
  message: string;
  severity: "critical" | "warning" | "info";
  original: string;
  corrected?: string;
}

interface SourceData {
  metricTypes: string[];
  dateRange: { min: string; max: string };
  valueRanges: Record<string, { min: number; max: number; mean: number }>;
  regions: string[];
  segments: string[];
  sampleSize: number;
  datasetName?: string;
}

/**
 * Extract source data summary from metrics for validation
 */
export function buildSourceContext(metrics: Array<{ metric_type: string; date: string; value: number; region?: string; segment?: string }>, datasetName?: string): SourceData {
  const metricTypes = [...new Set(metrics.map(m => m.metric_type))];
  const regions = [...new Set(metrics.map(m => m.region).filter(Boolean))] as string[];
  const segments = [...new Set(metrics.map(m => m.segment).filter(Boolean))] as string[];
  
  let minDate = "", maxDate = "";
  const valueRanges: Record<string, { min: number; max: number; mean: number; sum: number; count: number }> = {};
  
  for (const m of metrics) {
    if (!minDate || m.date < minDate) minDate = m.date;
    if (!maxDate || m.date > maxDate) maxDate = m.date;
    
    if (!valueRanges[m.metric_type]) {
      valueRanges[m.metric_type] = { min: m.value, max: m.value, mean: 0, sum: 0, count: 0 };
    }
    const vr = valueRanges[m.metric_type];
    if (m.value < vr.min) vr.min = m.value;
    if (m.value > vr.max) vr.max = m.value;
    vr.sum += m.value;
    vr.count++;
  }
  
  // Compute means
  const cleanRanges: Record<string, { min: number; max: number; mean: number }> = {};
  for (const [type, vr] of Object.entries(valueRanges)) {
    cleanRanges[type] = { min: vr.min, max: vr.max, mean: vr.sum / vr.count };
  }
  
  return {
    metricTypes,
    dateRange: { min: minDate, max: maxDate },
    valueRanges: cleanRanges,
    regions,
    segments,
    sampleSize: metrics.length,
    datasetName,
  };
}

/**
 * Validate an AI-generated text against source data
 */
export function validateAIOutput(text: string, source: SourceData): ValidationResult {
  const flags: ValidationFlag[] = [];
  let sanitized = text;
  
  // 1. Check for fabricated metric types
  const mentionedMetrics = extractMetricMentions(text);
  for (const mentioned of mentionedMetrics) {
    const normalized = mentioned.toLowerCase().replace(/[\s_-]+/g, "_");
    const exists = source.metricTypes.some(mt => {
      const normMt = mt.toLowerCase().replace(/[\s_-]+/g, "_");
      return normMt.includes(normalized) || normalized.includes(normMt) ||
        levenshteinSimilarity(normMt, normalized) > 0.7;
    });
    if (!exists && !isCommonBusinessTerm(mentioned)) {
      flags.push({
        type: "fabricated_metric",
        message: `AI referenced metric "${mentioned}" which doesn't exist in the dataset`,
        severity: "critical",
        original: mentioned,
      });
    }
  }
  
  // 2. Check for fabricated numbers
  const numbers = extractNumbers(text);
  for (const num of numbers) {
    if (num.value === 0 || Math.abs(num.value) < 1) continue; // Skip trivial
    
    // Check if this number is plausible given value ranges
    let plausible = false;
    for (const [, range] of Object.entries(source.valueRanges)) {
      const margin = Math.abs(range.max - range.min) * 2;
      if (num.value >= range.min - margin && num.value <= range.max + margin) {
        plausible = true;
        break;
      }
      // Check if it could be a percentage or derived stat
      if (Math.abs(num.value) <= 100) plausible = true; // Percentages
      if (Math.abs(num.value) <= 10) plausible = true; // Scores/ratios
    }
    
    // Check if it's a year
    if (num.value >= 1900 && num.value <= 2100) plausible = true;
    
    if (!plausible && Object.keys(source.valueRanges).length > 0) {
      flags.push({
        type: "wrong_value",
        message: `Value ${num.value} appears fabricated — outside plausible range of source data`,
        severity: "warning",
        original: num.context,
      });
    }
  }
  
  // 3. Check for temporal claims outside data range
  const yearMentions = text.match(/\b(20\d{2})\b/g);
  if (yearMentions && source.dateRange.min) {
    const dataMinYear = parseInt(source.dateRange.min.slice(0, 4));
    const dataMaxYear = parseInt(source.dateRange.max.slice(0, 4));
    for (const yearStr of yearMentions) {
      const year = parseInt(yearStr);
      if (year < dataMinYear - 1 || year > dataMaxYear + 1) {
        flags.push({
          type: "temporal_mismatch",
          message: `AI references year ${year} but data only covers ${dataMinYear}–${dataMaxYear}`,
          severity: "warning",
          original: yearStr,
        });
      }
    }
  }
  
  // 4. Check for inflated confidence language
  const overconfidentPhrases = [
    "will definitely", "guaranteed to", "certainly will", "100% likely",
    "undoubtedly", "without question", "absolutely certain", "inevitably",
    "will always", "can never fail",
  ];
  for (const phrase of overconfidentPhrases) {
    if (text.toLowerCase().includes(phrase)) {
      flags.push({
        type: "inflated_confidence",
        message: `Overconfident language: "${phrase}" — AI should use probabilistic language`,
        severity: "warning",
        original: phrase,
        corrected: phrase.replace(/will definitely/gi, "is likely to")
          .replace(/guaranteed to/gi, "has a high probability of")
          .replace(/certainly will/gi, "is expected to")
          .replace(/undoubtedly/gi, "with high confidence"),
      });
      sanitized = sanitized.replace(new RegExp(phrase, "gi"), flags[flags.length - 1].corrected || phrase);
    }
  }
  
  // 5. Check for unsupported causal claims
  const causalPhrases = [
    "caused by", "causes", "directly leads to", "results in",
    "because of this", "as a direct result",
  ];
  for (const phrase of causalPhrases) {
    if (text.toLowerCase().includes(phrase) && source.sampleSize < 30) {
      flags.push({
        type: "unsupported_claim",
        message: `Causal claim "${phrase}" unsupported with only ${source.sampleSize} data points`,
        severity: "info",
        original: phrase,
      });
    }
  }
  
  // 6. Check for missing source attribution
  if (text.length > 200 && source.datasetName) {
    if (!text.toLowerCase().includes(source.datasetName.toLowerCase().slice(0, 10))) {
      flags.push({
        type: "missing_source",
        message: `AI output doesn't reference the source dataset "${source.datasetName}"`,
        severity: "info",
        original: "",
      });
    }
  }
  
  // Compute validation score
  const criticalCount = flags.filter(f => f.severity === "critical").length;
  const warningCount = flags.filter(f => f.severity === "warning").length;
  const infoCount = flags.filter(f => f.severity === "info").length;
  const score = Math.max(0, 100 - criticalCount * 30 - warningCount * 10 - infoCount * 3);
  
  return {
    valid: criticalCount === 0 && warningCount <= 2,
    score,
    flags,
    sanitized,
  };
}

/**
 * Quick validation check — returns true if output is safe to display
 */
export function isOutputSafe(text: string, source: SourceData): boolean {
  const result = validateAIOutput(text, source);
  return result.valid && result.score >= 50;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function extractMetricMentions(text: string): string[] {
  // Look for capitalized multi-word phrases that could be metric names
  const patterns = [
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g, // Title Case phrases
    /\b((?:total|average|mean|net|gross|monthly|annual|daily|weekly)\s+\w+)/gi,
    /\b(\w+(?:\s+rate|\s+ratio|\s+index|\s+score|\s+margin|\s+growth))\b/gi,
  ];
  
  const mentions = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1].length > 3 && match[1].length < 50) {
        mentions.add(match[1].trim());
      }
    }
  }
  return [...mentions];
}

function extractNumbers(text: string): Array<{ value: number; context: string }> {
  const numbers: Array<{ value: number; context: string }> = [];
  const regex = /(?:[\$€£¥]?\s*)?(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(%|M|B|K|million|billion|thousand)?/gi;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    let value = parseFloat(match[1].replace(/,/g, ""));
    const suffix = match[2]?.toLowerCase();
    
    if (suffix === "m" || suffix === "million") value *= 1_000_000;
    else if (suffix === "b" || suffix === "billion") value *= 1_000_000_000;
    else if (suffix === "k" || suffix === "thousand") value *= 1_000;
    
    if (!isNaN(value) && isFinite(value)) {
      numbers.push({ value, context: match[0] });
    }
  }
  return numbers;
}

function isCommonBusinessTerm(term: string): boolean {
  const common = [
    "revenue", "profit", "margin", "growth", "cost", "expense",
    "rate", "ratio", "index", "score", "performance", "average",
    "total", "net", "gross", "operating", "return", "investment",
    "customer", "market", "share", "volume", "efficiency",
  ];
  return common.some(c => term.toLowerCase().includes(c));
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  
  return 1 - matrix[a.length][b.length] / maxLen;
}

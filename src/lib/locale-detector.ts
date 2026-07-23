export type NumberLocale = "en-US" | "de-DE" | "fr-FR" | "de-CH" | "unknown";

export interface LocaleDetectionResult {
  locale: NumberLocale;
  confidence: number;
  decimalSeparator: string | null;
  thousandsSeparator: string | null;
  samplesAnalyzed: number;
  ambiguous: boolean;
  reason: string;
}

function flattenSamples(rows: string[][], maxRows: number): string[] {
  return rows
    .slice(0, maxRows)
    .flatMap((row) => row)
    .map((value) => String(value ?? "").trim().replace(/\u00A0/g, " "))
    .filter(Boolean);
}

function scorePattern(samples: string[], regex: RegExp): number {
  return samples.filter((sample) => regex.test(sample)).length;
}

export function detectNumberLocale(rows: string[][], maxRows = 500): LocaleDetectionResult {
  const samples = flattenSamples(rows, maxRows).filter((value) => /\d/.test(value));
  const numericLike = samples.filter((value) => /[., ']/.test(value));

  if (numericLike.length === 0) {
    return {
      locale: "unknown",
      confidence: 0,
      decimalSeparator: null,
      thousandsSeparator: null,
      samplesAnalyzed: samples.length,
      ambiguous: true,
      reason: "No locale-specific numeric separators found",
    };
  }

  const candidates = [
    {
      locale: "en-US" as NumberLocale,
      decimalSeparator: ".",
      thousandsSeparator: ",",
      matches: scorePattern(numericLike, /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/),
      reason: "Comma thousands and dot decimal format detected",
    },
    {
      locale: "de-DE" as NumberLocale,
      decimalSeparator: ",",
      thousandsSeparator: ".",
      matches: scorePattern(numericLike, /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/),
      reason: "Dot thousands and comma decimal format detected",
    },
    {
      locale: "fr-FR" as NumberLocale,
      decimalSeparator: ",",
      thousandsSeparator: " ",
      matches: scorePattern(numericLike, /^[-+]?\d{1,3}( \d{3})+(,\d+)?$/),
      reason: "Space thousands and comma decimal format detected",
    },
    {
      locale: "de-CH" as NumberLocale,
      decimalSeparator: ".",
      thousandsSeparator: "'",
      matches: scorePattern(numericLike, /^[-+]?\d{1,3}('\d{3})+(\.\d+)?$/),
      reason: "Apostrophe thousands and dot decimal format detected",
    },
  ].sort((a, b) => b.matches - a.matches);

  const top = candidates[0];
  const runnerUp = candidates[1];
  if (!top || top.matches === 0) {
    return {
      locale: "unknown",
      confidence: 0.35,
      decimalSeparator: null,
      thousandsSeparator: null,
      samplesAnalyzed: numericLike.length,
      ambiguous: true,
      reason: "Numeric separators were present but no locale won confidently",
    };
  }

  const dominance = runnerUp.matches > 0 ? top.matches / (top.matches + runnerUp.matches) : 1;
  const coverage = top.matches / numericLike.length;
  const confidence = Math.min(0.95, Math.round((0.55 * dominance + 0.45 * coverage) * 100) / 100);

  return {
    locale: top.locale,
    confidence,
    decimalSeparator: top.decimalSeparator,
    thousandsSeparator: top.thousandsSeparator,
    samplesAnalyzed: numericLike.length,
    ambiguous: confidence < 0.8,
    reason: top.reason,
  };
}

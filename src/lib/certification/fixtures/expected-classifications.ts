// Locked expected outcomes per certification pack. Drift in classifier
// or PII detector heuristics fails the gate.

import type { IndustryType } from "@/lib/data-upload-utils";

export interface ExpectedClassification {
  pack: "manufacturing" | "german_locale" | "hr_pii" | "crm";
  industry: IndustryType;
  /** Minimum acceptable classifier confidence (0-100). */
  minConfidence: number;
}

export const EXPECTED_CLASSIFICATIONS: ExpectedClassification[] = [
  { pack: "manufacturing", industry: "Manufacturing", minConfidence: 60 },
  { pack: "hr_pii", industry: "HR", minConfidence: 60 },
  { pack: "crm", industry: "CRM", minConfidence: 60 },
  // German locale pack uses German headers (umsatz/kosten/abteilung). Classifier
  // is keyword-based EN, so we only assert it does not falsely flag PII/HR.
];

export const EXPECTED_PII_COLUMNS: Record<string, string[]> = {
  hr_pii: ["email", "phone", "address"],
};

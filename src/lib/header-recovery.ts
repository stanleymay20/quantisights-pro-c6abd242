export interface HeaderRecoveryResult {
  original: string;
  recovered: string | null;
  confidence: number;
  accepted: boolean;
  reason: string;
}

const KNOWN_HEADERS = [
  "date",
  "revenue",
  "cost",
  "profit",
  "margin",
  "customer",
  "supplier",
  "product",
  "inventory",
  "region",
  "department",
  "employee",
  "quantity",
  "price",
  "sales",
];

function isCorruptedHeader(header: string): boolean {
  return /^(unnamed:?\s*\d+|column\d+|field[_ ]?\d+|attr[_ ]?\d+|[a-z])$/i.test(header.trim());
}

export function recoverHeader(header: string, samples: string[]): HeaderRecoveryResult {
  if (!isCorruptedHeader(header)) {
    return {
      original: header,
      recovered: null,
      confidence: 1,
      accepted: false,
      reason: "Header appears valid",
    };
  }

  const joined = samples.join(" ").toLowerCase();

  const match = KNOWN_HEADERS.find((candidate) => joined.includes(candidate));

  if (match) {
    return {
      original: header,
      recovered: match,
      confidence: 0.9,
      accepted: true,
      reason: `Sample values suggest '${match}' semantics`,
    };
  }

  return {
    original: header,
    recovered: null,
    confidence: 0.45,
    accepted: false,
    reason: "Insufficient semantic evidence for automatic recovery",
  };
}

export function recoverHeaders(headers: string[], rows: string[][]): HeaderRecoveryResult[] {
  return headers.map((header, idx) =>
    recoverHeader(
      header,
      rows.slice(0, 100).map((row) => row[idx]).filter(Boolean),
    ),
  );
}

/**
 * Entity Resolution — Phase 8
 *
 * Detects canonical business entities from column headers using synonym
 * lists + fuzzy matching. Pure functions; no I/O.
 */

export type CanonicalEntity =
  | "Customer" | "Employee" | "Supplier" | "Product"
  | "Order" | "Transaction" | "Account" | "Department"
  | "Store" | "Plant" | "Machine" | "Shipment" | "Lead";

interface EntityDef {
  entity: CanonicalEntity;
  /** Lowercased substring patterns that indicate this entity in a header */
  patterns: string[];
}

const ENTITY_DEFS: EntityDef[] = [
  { entity: "Customer", patterns: ["customer", "cust", "client", "buyer", "kunde"] },
  { entity: "Employee", patterns: ["employee", "staff", "worker", "personnel", "mitarbeiter", "fte"] },
  { entity: "Supplier", patterns: ["supplier", "vendor", "lieferant"] },
  { entity: "Product", patterns: ["product", "sku", "item", "material", "produkt"] },
  { entity: "Order", patterns: ["order", "po_number", "purchase_order", "bestellung"] },
  { entity: "Transaction", patterns: ["transaction", "txn", "payment", "invoice", "buchung"] },
  { entity: "Account", patterns: ["account", "acct", "konto"] },
  { entity: "Department", patterns: ["department", "dept", "division", "abteilung"] },
  { entity: "Store", patterns: ["store", "branch", "outlet", "filiale"] },
  { entity: "Plant", patterns: ["plant", "factory", "facility", "werk"] },
  { entity: "Machine", patterns: ["machine", "equipment", "asset", "maschine"] },
  { entity: "Shipment", patterns: ["shipment", "shipping", "delivery", "lieferung"] },
  { entity: "Lead", patterns: ["lead", "prospect", "mql", "sql"] },
];

const ID_SUFFIXES = ["id", "no", "num", "number", "code", "key", "ref"];

export interface ResolvedEntity {
  entity: CanonicalEntity;
  /** Header that matched */
  column: string;
  confidence: number;
  evidence: string;
}

const norm = (s: string): string =>
  s.toLowerCase().trim().replace(/[\s/.-]+/g, "_");

function isIdHeader(header: string): boolean {
  const n = norm(header);
  return ID_SUFFIXES.some((suf) => n === suf || n.endsWith("_" + suf) || n.endsWith(suf));
}

/** Resolve canonical entities from a list of headers. */
export function resolveEntities(headers: string[]): ResolvedEntity[] {
  const found = new Map<CanonicalEntity, ResolvedEntity>();
  for (const raw of headers) {
    const n = norm(raw);
    if (!n) continue;
    for (const def of ENTITY_DEFS) {
      for (const pat of def.patterns) {
        if (!n.includes(pat)) continue;
        const id = isIdHeader(n);
        // Strongest signal: pattern + ID suffix (customer_id, vendor_no…)
        let conf = id ? 0.95 : 0.7;
        // Bonus when the pattern is a near-prefix of the header
        if (n.startsWith(pat)) conf = Math.min(0.98, conf + 0.05);
        const existing = found.get(def.entity);
        if (!existing || conf > existing.confidence) {
          found.set(def.entity, {
            entity: def.entity,
            column: raw,
            confidence: Math.round(conf * 100) / 100,
            evidence: id
              ? `Column "${raw}" matches pattern "${pat}" with ID suffix`
              : `Column "${raw}" contains "${pat}"`,
          });
        }
        break;
      }
    }
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence);
}

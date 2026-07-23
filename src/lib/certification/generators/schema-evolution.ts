// Pack 5 — Schema Evolution fixture.
// Three sequential versions: additive (v1→v2) and rename + remove (v2→v3).

import type { SchemaColumn } from "@/lib/schema-evolution";

export function schemaEvolutionV1(): SchemaColumn[] {
  return [
    { name: "Revenue", type: "number", role: "value" },
    { name: "Cost", type: "number", role: "value" },
    { name: "Profit", type: "number", role: "value" },
  ];
}

export function schemaEvolutionV2(): SchemaColumn[] {
  return [
    { name: "Revenue", type: "number", role: "value" },
    { name: "Cost", type: "number", role: "value" },
    { name: "Profit", type: "number", role: "value" },
    { name: "Margin", type: "number", role: "value" },
  ];
}

export function schemaEvolutionV3(): SchemaColumn[] {
  return [
    { name: "Revenue", type: "number", role: "value" },
    { name: "Cost", type: "number", role: "value" },
    // 'Profit' renamed to 'Operating_Margin' (same type); 'Margin' removed.
    { name: "Operating_Margin", type: "number", role: "value" },
  ];
}

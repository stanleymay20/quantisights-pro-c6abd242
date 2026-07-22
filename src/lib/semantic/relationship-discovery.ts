/**
 * Relationship Discovery — Phase 8
 *
 * Given a set of resolved entities, propose a directed graph of likely
 * business relationships (Customer → Order → Product, etc.) and emit a
 * lineage-style summary.
 */

import type { CanonicalEntity, ResolvedEntity } from "./entity-resolution";

export interface RelationshipEdge {
  from: CanonicalEntity;
  to: CanonicalEntity;
  kind: "transactional" | "organizational" | "structural";
  confidence: number;
  reason: string;
}

interface EdgeTemplate {
  from: CanonicalEntity;
  to: CanonicalEntity;
  kind: RelationshipEdge["kind"];
  baseConfidence: number;
  reason: string;
}

const EDGE_TEMPLATES: EdgeTemplate[] = [
  { from: "Customer", to: "Order", kind: "transactional", baseConfidence: 0.9, reason: "Customers place orders" },
  { from: "Order", to: "Product", kind: "transactional", baseConfidence: 0.9, reason: "Orders contain products" },
  { from: "Customer", to: "Transaction", kind: "transactional", baseConfidence: 0.85, reason: "Customers generate transactions" },
  { from: "Customer", to: "Account", kind: "structural", baseConfidence: 0.85, reason: "Customers own accounts" },
  { from: "Supplier", to: "Order", kind: "transactional", baseConfidence: 0.85, reason: "Suppliers fulfill purchase orders" },
  { from: "Supplier", to: "Product", kind: "transactional", baseConfidence: 0.8, reason: "Suppliers provide products" },
  { from: "Order", to: "Shipment", kind: "transactional", baseConfidence: 0.85, reason: "Orders generate shipments" },
  { from: "Employee", to: "Department", kind: "organizational", baseConfidence: 0.95, reason: "Employees belong to departments" },
  { from: "Plant", to: "Machine", kind: "structural", baseConfidence: 0.9, reason: "Plants contain machines" },
  { from: "Plant", to: "Product", kind: "structural", baseConfidence: 0.75, reason: "Plants produce products" },
  { from: "Store", to: "Transaction", kind: "transactional", baseConfidence: 0.85, reason: "Stores record transactions" },
  { from: "Lead", to: "Customer", kind: "transactional", baseConfidence: 0.8, reason: "Leads convert into customers" },
];

export interface RelationshipGraph {
  nodes: CanonicalEntity[];
  edges: RelationshipEdge[];
  lineage: string[];
}

export function discoverRelationships(entities: ResolvedEntity[]): RelationshipGraph {
  const present = new Set(entities.map((e) => e.entity));
  const confidenceByEntity = new Map(entities.map((e) => [e.entity, e.confidence] as const));

  const edges: RelationshipEdge[] = [];
  for (const tpl of EDGE_TEMPLATES) {
    if (!present.has(tpl.from) || !present.has(tpl.to)) continue;
    const linkConf =
      (confidenceByEntity.get(tpl.from) ?? 0.7) *
      (confidenceByEntity.get(tpl.to) ?? 0.7);
    edges.push({
      from: tpl.from,
      to: tpl.to,
      kind: tpl.kind,
      confidence: Math.round(tpl.baseConfidence * linkConf * 100) / 100,
      reason: tpl.reason,
    });
  }

  return {
    nodes: [...present],
    edges,
    lineage: edges.map((e) => `${e.from} → ${e.to}`),
  };
}

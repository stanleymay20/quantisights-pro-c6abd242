import { describe, it, expect } from "vitest";
import { resolveEntities } from "@/lib/semantic/entity-resolution";
import { discoverRelationships } from "@/lib/semantic/relationship-discovery";

describe("Entity Resolution", () => {
  it("detects Customer from common id columns", () => {
    const r = resolveEntities(["customer_id", "amount"]);
    expect(r.find((e) => e.entity === "Customer")).toBeDefined();
    expect(r.find((e) => e.entity === "Customer")!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("recognizes variant id naming", () => {
    expect(resolveEntities(["cust_id"]).some((e) => e.entity === "Customer")).toBe(true);
    expect(resolveEntities(["client_no"]).some((e) => e.entity === "Customer")).toBe(true);
    expect(resolveEntities(["customer_number"]).some((e) => e.entity === "Customer")).toBe(true);
  });

  it("maps employee/staff/worker to Employee", () => {
    expect(resolveEntities(["employee_id"]).some((e) => e.entity === "Employee")).toBe(true);
    expect(resolveEntities(["staff_id"]).some((e) => e.entity === "Employee")).toBe(true);
    expect(resolveEntities(["worker_id"]).some((e) => e.entity === "Employee")).toBe(true);
  });

  it("maps supplier/vendor to Supplier", () => {
    expect(resolveEntities(["supplier_id"]).some((e) => e.entity === "Supplier")).toBe(true);
    expect(resolveEntities(["vendor_id"]).some((e) => e.entity === "Supplier")).toBe(true);
  });

  it("deduplicates entities (best confidence wins)", () => {
    const r = resolveEntities(["customer_id", "customer_name"]);
    const customers = r.filter((e) => e.entity === "Customer");
    expect(customers.length).toBe(1);
  });

  it("returns empty for entity-less headers", () => {
    expect(resolveEntities(["revenue", "date"]).length).toBe(0);
  });
});

describe("Relationship Discovery", () => {
  it("derives Customer → Order → Product chain", () => {
    const entities = resolveEntities(["customer_id", "order_id", "product_id"]);
    const g = discoverRelationships(entities);
    expect(g.edges.find((e) => e.from === "Customer" && e.to === "Order")).toBeDefined();
    expect(g.edges.find((e) => e.from === "Order" && e.to === "Product")).toBeDefined();
    expect(g.lineage).toContain("Customer → Order");
  });

  it("derives Employee → Department", () => {
    const entities = resolveEntities(["employee_id", "department"]);
    const g = discoverRelationships(entities);
    expect(g.edges.find((e) => e.from === "Employee" && e.to === "Department")).toBeDefined();
  });

  it("emits no edges when no templates match", () => {
    const entities = resolveEntities(["customer_id"]);
    const g = discoverRelationships(entities);
    expect(g.edges.length).toBe(0);
    expect(g.nodes).toContain("Customer");
  });

  it("assigns confidence between 0 and 1", () => {
    const entities = resolveEntities(["customer_id", "order_id"]);
    const g = discoverRelationships(entities);
    for (const e of g.edges) {
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });
});

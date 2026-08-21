import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_ALIASES } from "@/lib/public-route-aliases";

describe("public route compatibility", () => {
  it("keeps legacy marketing links mapped to canonical routes", () => {
    expect(PUBLIC_ROUTE_ALIASES["/contact"]).toBe("/enterprise/contact");
    expect(PUBLIC_ROUTE_ALIASES["/about"]).toBe("/decision-intelligence-platforms");
  });
});

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces") as ((input: string, options?: Record<string, unknown>) => string[]) & {
  parse: (input: string, options?: Record<string, unknown>) => unknown;
};
const bracesPackage = require("braces/package.json") as { version: string; quantivisProvenance?: Record<string, string> };

describe("controlled braces security patch", () => {
  it("resolves the Quantivis-controlled patched package", () => {
    expect(bracesPackage.version).toBe("3.0.4-quantivis.1");
    expect(bracesPackage.quantivisProvenance?.advisory).toBe("GHSA-vfj7-8cjw-p6xm");
  });

  it("preserves ordinary brace expansion", () => {
    expect(braces("a/{b,c}/d", { expand: true })).toEqual(["a/b/d", "a/c/d"]);
  });

  it("rejects brace nesting beyond the bounded maximum", () => {
    const input = "{".repeat(101) + "x" + "}".repeat(101);
    expect(() => braces.parse(input)).toThrow(/exceeds max depth/i);
  });

  it("rejects parenthesis nesting beyond the bounded maximum", () => {
    const input = "(".repeat(101) + "x" + ")".repeat(101);
    expect(() => braces.parse(input)).toThrow(/exceeds max depth/i);
  });

  it("honors a stricter caller-supplied maxDepth", () => {
    expect(() => braces.parse("{{{x}}}", { maxDepth: 2 })).toThrow(/exceeds max depth/i);
  });
});

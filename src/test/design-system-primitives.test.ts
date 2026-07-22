import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("DS-2 shared design primitives", () => {
  it("defines the low-risk shared marketing primitives", () => {
    const primitivePath = "src/components/design-system/marketing-primitives.tsx";

    expect(existsSync(resolve(root, primitivePath))).toBe(true);

    const primitives = read(primitivePath);
    for (const exportName of [
      "Eyebrow",
      "MarketingCard",
      "MarketingSection",
      "TagBadge",
      "MarketingCTA",
    ]) {
      expect(primitives).toContain(`export const ${exportName}`);
    }

    expect(primitives).toContain("hsl(var(--brand-marketing-slate))");
    expect(primitives).toContain("hsl(var(--surface-marketing))");
    expect(primitives).toContain("hsl(var(--status-success))");
    expect(primitives).toContain("hsl(var(--decision-needs-review))");
  });

  it("uses DS-1 semantic tokens for homepage tag badges instead of TAG_STYLES", () => {
    const homepage = read("src/pages/Index.tsx");

    expect(homepage).not.toContain("const TAG_STYLES");
    expect(homepage).toContain('import { Eyebrow, MarketingCard, MarketingCTA, MarketingSection, TagBadge }');
    expect(homepage).toContain('<TagBadge tone={primaryDecision.tag}');
    expect(homepage).toContain('<TagBadge tone={decision.tag}');
    expect(homepage).not.toContain("Approved: { bg:");
    expect(homepage).not.toContain("Pending: { bg:");
    expect(homepage).not.toContain("Review: { bg:");
  });

  it("extends DS-3A primitive adoption without removing deferred qv layout classes", () => {
    const homepage = read("src/pages/Index.tsx");
    const primitives = read("src/components/design-system/marketing-primitives.tsx");

    expect(homepage).toContain('<MarketingCTA href="#platform" variant="secondary"');
    expect(homepage).toContain('<MarketingCTA href="#demo"');
    expect(homepage).toContain('<Eyebrow style={{ marginBottom: 24 }}>The Problem</Eyebrow>');
    expect(homepage).toContain('<Eyebrow tone="light" style={{ marginBottom: 24 }}>Compliance</Eyebrow>');
    expect(homepage).toContain('<TagBadge tone="Warning"');
    expect(homepage).toContain('<TagBadge tone="Success"');
    expect(homepage).not.toContain("qv-eyebrow");
    expect(primitives).not.toContain("qv-eyebrow");

    // DS-3A is not a full homepage migration. These page-local layout classes
    // intentionally remain until a later layout-focused sprint.
    expect(homepage).toContain("qv-wrap");
    expect(homepage).toContain("qv-grid-2");
    expect(homepage).toContain("qv-primary-cta");
  });

  it("hardens DS-3B MarketingCTA for anchors, router links, and buttons", () => {
    const homepage = read("src/pages/Index.tsx");
    const primitives = read("src/components/design-system/marketing-primitives.tsx");
    const readme = read("src/design-system/README.md");

    expect(primitives).toContain('ElementType');
    expect(primitives).toContain('as?: T');
    expect(primitives).toContain('external?: boolean');
    expect(primitives).toContain('Component = as ?? "a"');
    expect(primitives).toContain('rel: external ? "noreferrer"');

    expect(homepage).toContain('<MarketingCTA as={Link} to="/ai-governance"');
    expect(homepage).toContain('<MarketingCTA as="button" type="submit"');
    expect(homepage).not.toContain('className="qv-primary-cta"');
    expect(homepage).toContain('<MarketingCTA href="#demo"');

    expect(readme).toContain("DS-3B CTA primitive hardening");
    expect(readme).toContain("normal anchors, React Router links, external anchors, and submit buttons");
  });

  it("documents DS-2 as a primitive layer without claiming full page migration", () => {
    const readme = read("src/design-system/README.md");

    expect(readme).toContain("DS-2 shared primitives");
    expect(readme).toContain("Eyebrow");
    expect(readme).toContain("MarketingCard");
    expect(readme).toContain("MarketingSection");
    expect(readme).toContain("TagBadge");
    expect(readme).toContain("MarketingCTA");
    expect(readme).toContain("DS-2 does not migrate full pages");
    expect(readme).toContain("DS-3A homepage primitive adoption");
    expect(readme).toContain("DS-3A keeps the homepage layout, Georgia typography, and 1280 px containers unchanged");
    expect(readme).toContain("DS-3B CTA primitive hardening");
  });
});

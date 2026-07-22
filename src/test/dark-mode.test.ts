import { describe, it, expect } from "vitest";

/**
 * Dark mode contract tests — verify CSS tokens are defined for both themes.
 */

describe("Dark Mode Support", () => {
  it("index.css has both light and dark token blocks", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/index.css", "utf-8");
    
    expect(content).toContain(":root,");
    expect(content).toContain(".light {");
    expect(content).toContain(".dark {");
  });

  it("dark theme defines all critical semantic tokens", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/index.css", "utf-8");
    
    const darkSection = content.split(".dark {")[1]?.split("}")[0] ?? "";
    const requiredTokens = [
      "--background", "--foreground", "--card", "--card-foreground",
      "--primary", "--primary-foreground", "--secondary", "--muted",
      "--border", "--input", "--ring", "--destructive",
      "--success", "--warning", "--sidebar-background",
    ];
    
    for (const token of requiredTokens) {
      expect(darkSection).toContain(token);
    }
  });

  it("ThemeProvider stores theme in localStorage", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/ThemeProvider.tsx", "utf-8");
    expect(content).toContain("localStorage");
    expect(content).toContain("quantivis-theme");
  });
});

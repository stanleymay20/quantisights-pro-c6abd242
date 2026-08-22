import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = resolve(root, "src");
const routesSource = readFileSync(resolve(srcRoot, "routes/index.tsx"), "utf8");
const aliasesSource = readFileSync(resolve(srcRoot, "lib/public-route-aliases.ts"), "utf8");

const registeredRoutes = [...routesSource.matchAll(/\bpath:\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
const concreteRoutes = registeredRoutes.filter((route) => route !== "*");
const aliases = [...aliasesSource.matchAll(/["'`]([^"'`]+)["'`]\s*:\s*["'`]([^"'`]+)["'`]/g)];
const aliasSources = aliases.map((match) => match[1]);
const aliasTargets = aliases.map((match) => match[2]);
const knownRoutes = [...new Set([...concreteRoutes, ...aliasSources])];

function routePattern(route: string): RegExp {
  const parts = route.split("/").map((part) => {
    if (part.startsWith(":")) {
      return part.endsWith("?") ? "(?:[^/]+)?" : "[^/]+";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });

  return new RegExp(`^${parts.join("/")}/?$`);
}

const matchers = knownRoutes.map(routePattern);

function normalizeTarget(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] || "/";
  return withoutQuery.replace(/\$\{[^}]+\}/g, "__dynamic__");
}

function isRegistered(target: string): boolean {
  return matchers.some((matcher) => matcher.test(target));
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const rel = relative(root, full).replaceAll("\\", "/");
    if (
      rel.startsWith("src/test/") ||
      rel.startsWith("src/i18n/") ||
      rel === "src/routes/index.tsx"
    ) {
      continue;
    }
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(?:ts|tsx)$/.test(name)) files.push(full);
  }
  return files;
}

function literalTargets(source: string, rel: string): string[] {
  const targets: string[] = [];
  const patterns = [
    /\b(?:href|to)\s*=\s*["']([^"']+)["']/g,
    /\b(?:href|to)\s*=\s*\{\s*`([^`]+)`\s*\}/g,
    /\bnavigate\(\s*["']([^"']+)["']/g,
    /\bnavigate\(\s*`([^`]+)`/g,
    /\b(?:href|to|url)\s*:\s*["']([^"']+)["']/g,
    /\b(?:href|to|url)\s*:\s*`([^`]+)`/g,
  ];

  if (/Nav|Navbar|Sidebar|Menu|useRoleNav/.test(rel)) {
    patterns.push(/["'](\/[A-Za-z0-9_./:-]+)["']/g);
  }

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) targets.push(match[1]);
  }
  return targets;
}

function duplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

describe("internal route integrity", () => {
  it("does not register duplicate route paths", () => {
    expect(duplicates(registeredRoutes), "Duplicate routes create ambiguous navigation and entitlement behavior").toEqual([]);
  });

  it("does not register duplicate alias sources", () => {
    expect(duplicates(aliasSources), "Duplicate aliases make redirects order-dependent").toEqual([]);
  });

  it("keeps aliases pointed at concrete registered destinations", () => {
    for (const target of aliasTargets) {
      expect(
        concreteRoutes.some((route) => routePattern(route).test(target)),
        `Alias target ${target} is not a concrete registered route`,
      ).toBe(true);
    }
  });

  it("keeps literal internal navigation targets backed by a concrete route or alias", () => {
    const broken: string[] = [];

    for (const file of walk(srcRoot)) {
      const rel = relative(root, file).replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");
      for (const rawTarget of literalTargets(source, rel)) {
        const target = normalizeTarget(rawTarget);
        if (!target) continue;
        if (/^\/(?:assets|lovable-uploads|favicon|robots\.txt|sitemap\.xml|manifest)/.test(target)) continue;
        if (!isRegistered(target)) broken.push(`${rel}: ${rawTarget}`);
      }
    }

    expect(broken, `Broken internal route targets:\n${broken.join("\n")}`).toEqual([]);
  });
});

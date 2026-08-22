import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = resolve(root, "src");
const homeSource = readFileSync(resolve(srcRoot, "pages/Index.tsx"), "utf8");

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const rel = relative(root, full).replaceAll("\\", "/");
    if (rel.startsWith("src/test/") || rel.startsWith("src/i18n/")) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(?:ts|tsx)$/.test(name)) files.push(full);
  }
  return files;
}

const homepageIds = new Set([
  ...homeSource.matchAll(/\bid\s*=\s*["']([^"']+)["']/g),
  ...homeSource.matchAll(/\bid\s*=\s*\{\s*["']([^"']+)["']\s*\}/g),
].map((match) => match[1]));

function homepageAnchors(source: string): string[] {
  const anchors: string[] = [];
  for (const pattern of [
    /["']\/#([A-Za-z][A-Za-z0-9_-]*)["']/g,
    /["']#([A-Za-z][A-Za-z0-9_-]*)["']/g,
  ]) {
    for (const match of source.matchAll(pattern)) anchors.push(match[1]);
  }
  return anchors;
}

describe("homepage anchor integrity", () => {
  it("keeps cross-page homepage anchors backed by a real homepage section", () => {
    const broken: string[] = [];
    for (const file of walk(srcRoot)) {
      const rel = relative(root, file).replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");
      for (const anchor of homepageAnchors(source)) {
        if (!homepageIds.has(anchor)) broken.push(`${rel}: #${anchor}`);
      }
    }
    expect(broken, `Homepage links target missing section IDs:\n${broken.join("\n")}`).toEqual([]);
  });
});

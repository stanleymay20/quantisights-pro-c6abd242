/**
 * Runtime DOM translator for German (and future locales).
 *
 * Rationale: the codebase has ~1900 hard-coded English phrases spread across
 * 128 pages and hundreds of components. Wrapping every JSX text node in `t()`
 * is a multi-week refactor. This translator swaps English text nodes with
 * their German equivalents at render time by observing DOM mutations, so we
 * can ship full German coverage without touching every component.
 *
 * Safety:
 *  - Runs only when i18n language starts with `de`.
 *  - Skips <code>, <pre>, <script>, <style>, editable fields, and any element
 *    (or ancestor) marked `data-notranslate` / `translate="no"`.
 *  - Only touches nodes whose trimmed text matches an English key exactly, or
 *    matches a small set of formatted variants (colon/period suffix). Numeric,
 *    date, currency, and interpolated content is left alone.
 *  - Also translates common English `placeholder`, `aria-label`, and `title`
 *    attributes on form controls / buttons.
 */
import deRuntime from "./de-runtime.json";

type Dict = Record<string, string>;

const NON_TRANSLATABLE_TAGS = new Set([
  "SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT", "TEXTAREA",
]);

let currentDict: Dict | null = null;
let observer: MutationObserver | null = null;

function buildDict(base: Dict): Dict {
  // Precompute variants so we match ": ", ".", "…" suffixes seen in the UI.
  const d: Dict = { ...base };
  for (const [en, de] of Object.entries(base)) {
    if (!d[en + ":"]) d[en + ":"] = de + ":";
    if (!d[en + "…"]) d[en + "…"] = de + "…";
    if (!d[en + "..."]) d[en + "..."] = de + "...";
    if (!d[en + "!"]) d[en + "!"] = de + "!";
    if (!d[en + "?"]) d[en + "?"] = de + "?";
  }
  return d;
}

function shouldSkip(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    if (NON_TRANSLATABLE_TAGS.has(node.tagName)) return true;
    if (node.getAttribute && (
      node.getAttribute("data-notranslate") !== null ||
      node.getAttribute("translate") === "no" ||
      node.getAttribute("contenteditable") === "true"
    )) return true;
    node = node.parentElement;
  }
  return false;
}

// Fragments used for substring replacement inside concatenated template strings
// (e.g. `${category} — Governance record logged`). Only phrases of >=2 words
// and >=10 chars are eligible so we don't damage arbitrary tokens.
let fragmentPairs: Array<[string, string]> = [];
function computeFragmentPairs(dict: Dict): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [en, de] of Object.entries(dict)) {
    if (en.length < 10) continue;
    if (en.split(/\s+/).length < 2) continue;
    if (/[{}<>]/.test(en)) continue;
    pairs.push([en, de]);
  }
  // Longest-first so we prefer specific matches over shorter substrings.
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Relative-time formats emitted by hooks like formatRelativeTime.
const RELATIVE_TIME_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^just now$/i, () => "gerade eben"],
  [/^(\d+)\s*m\s*ago$/i, (m) => `vor ${m[1]} Min.`],
  [/^(\d+)\s*min(?:ute)?s?\s*ago$/i, (m) => `vor ${m[1]} Min.`],
  [/^(\d+)\s*h\s*ago$/i, (m) => `vor ${m[1]} Std.`],
  [/^(\d+)\s*hours?\s*ago$/i, (m) => `vor ${m[1]} Std.`],
  [/^(\d+)\s*d\s*ago$/i, (m) => `vor ${m[1]} T.`],
  [/^(\d+)\s*days?\s*ago$/i, (m) => `vor ${m[1]} Tagen`],
  [/^(\d+)\s*w\s*ago$/i, (m) => `vor ${m[1]} Wo.`],
  [/^(\d+)\s*weeks?\s*ago$/i, (m) => `vor ${m[1]} Wochen`],
];

function translateText(raw: string, dict: Dict): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hit = dict[trimmed];
  if (hit) {
    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    return leading + hit + trailing;
  }
  // Relative time patterns
  for (const [re, fn] of RELATIVE_TIME_PATTERNS) {
    const m = trimmed.match(re);
    if (m) {
      const leading = raw.match(/^\s*/)?.[0] ?? "";
      const trailing = raw.match(/\s*$/)?.[0] ?? "";
      return leading + fn(m) + trailing;
    }
  }
  // Substring fragment replacement (case-sensitive) for concatenated text.
  let mutated = raw;
  let changed = false;
  for (const [en, de] of fragmentPairs) {
    if (!mutated.includes(en)) continue;
    mutated = mutated.replace(new RegExp(escapeRegex(en), "g"), de);
    changed = true;
  }
  return changed ? mutated : null;
}

function walkAndTranslate(root: Node, dict: Dict) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null = walker.nextNode();
  while (n) {
    const txt = n.nodeValue;
    if (txt) {
      const swap = translateText(txt, dict);
      if (swap && swap !== txt) n.nodeValue = swap;
    }
    n = walker.nextNode();
  }
  // Attributes: placeholder / aria-label / title / alt on element subtree.
  if (root instanceof Element || root === document) {
    const scope = root === document ? document.body : (root as Element);
    if (scope) {
      const els = scope.querySelectorAll<HTMLElement>("[placeholder], [aria-label], [title], [alt]");
      els.forEach((el) => {
        if (shouldSkip(el)) return;
        (["placeholder", "aria-label", "title", "alt"] as const).forEach((attr) => {
          const v = el.getAttribute(attr);
          if (!v) return;
          const swap = translateText(v, dict);
          if (swap && swap !== v) el.setAttribute(attr, swap);
        });
      });
    }
  }
}

function start(dict: Dict) {
  stop();
  currentDict = dict;
  fragmentPairs = computeFragmentPairs(dict);
  // Initial pass
  walkAndTranslate(document.body, dict);
  // Observe further mutations
  observer = new MutationObserver((mutations) => {
    if (!currentDict) return;
    for (const m of mutations) {
      if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
        if (shouldSkip((m.target as Text).parentElement)) continue;
        const v = m.target.nodeValue;
        if (v) {
          const swap = translateText(v, currentDict);
          if (swap && swap !== v) m.target.nodeValue = swap;
        }
      } else if (m.type === "childList") {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (shouldSkip(node.parentElement)) return;
            const v = node.nodeValue;
            if (v) {
              const swap = translateText(v, currentDict!);
              if (swap && swap !== v) node.nodeValue = swap;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkAndTranslate(node, currentDict!);
          }
        });
      } else if (m.type === "attributes") {
        const el = m.target as HTMLElement;
        if (shouldSkip(el)) continue;
        const attr = m.attributeName;
        if (!attr) continue;
        if (["placeholder", "aria-label", "title", "alt"].includes(attr)) {
          const v = el.getAttribute(attr);
          if (!v) continue;
          const swap = translateText(v, currentDict);
          if (swap && swap !== v) el.setAttribute(attr, swap);
        }
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "aria-label", "title", "alt"],
  });
}

function stop() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  currentDict = null;
}

export function applyRuntimeLocale(lang: string) {
  if (typeof document === "undefined") return;
  const primary = (lang || "en").split("-")[0].toLowerCase();
  if (primary === "de") {
    const dict = buildDict(deRuntime as Dict);
    // Defer to next microtask so React has flushed initial render.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => start(dict), { once: true });
    } else {
      queueMicrotask(() => start(dict));
    }
  } else {
    stop();
    // Note: we do NOT reverse-translate on switch back; a full reload restores
    // English cleanly. This is called out in the language switcher.
  }
}

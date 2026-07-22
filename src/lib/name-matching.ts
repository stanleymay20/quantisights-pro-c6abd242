/**
 * Personal Name Recognition Strategy (PNRS) + classic string-similarity primitives.
 * Reference: Data Engineering (Chan/Talburt/Talley, Springer 2010), Ch. 5.
 *
 * All functions are deterministic and pure. No allocations beyond the work strings.
 */

// ---------- Levenshtein edit distance ----------
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function editDistanceSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

// ---------- Jaro / Jaro-Winkler ----------
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(m, n) / 2) - 1);
  const aMatches = new Array(m).fill(false);
  const bMatches = new Array(n).fill(false);
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, n);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0, transpositions = 0;
  for (let i = 0; i < m; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / m + matches / n + (matches - transpositions) / matches) / 3;
}

export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  return j + prefix * prefixScale * (1 - j);
}

// ---------- Soundex ----------
export function soundex(s: string): string {
  const cleaned = s.toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return '0000';
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };
  const first = cleaned[0];
  let out = first;
  let prev = map[first] ?? '';
  for (let i = 1; i < cleaned.length && out.length < 4; i++) {
    const code = map[cleaned[i]] ?? '';
    if (code && code !== prev) out += code;
    if (code !== '') prev = code;
    else if ('AEIOUY'.includes(cleaned[i])) prev = '';
  }
  return (out + '000').slice(0, 4);
}

// ---------- Metaphone (simplified single-pass) ----------
export function metaphone(s: string): string {
  const w = s.toUpperCase().replace(/[^A-Z]/g, '');
  if (!w) return '';
  let out = '';
  let i = 0;
  // Skip silent leading clusters
  if (/^(KN|GN|PN|AE|WR)/.test(w)) i = 1;
  else if (w.startsWith('X')) { out = 'S'; i = 1; }
  const vowels = 'AEIOU';
  while (i < w.length && out.length < 8) {
    const c = w[i], next = w[i + 1] ?? '', prev = w[i - 1] ?? '';
    if (c === prev && c !== 'C') { i++; continue; }
    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U':
        if (i === 0) out += c; break;
      case 'B': out += 'B'; break;
      case 'C':
        if (next === 'H') { out += 'X'; i++; }
        else if ('IEY'.includes(next)) out += 'S';
        else out += 'K';
        break;
      case 'D':
        if (next === 'G' && 'IEY'.includes(w[i + 2] ?? '')) { out += 'J'; i += 2; }
        else out += 'T';
        break;
      case 'F': out += 'F'; break;
      case 'G':
        if (next === 'H') { if (i + 2 < w.length && !vowels.includes(w[i + 2])) { i++; break; } out += 'F'; i++; }
        else if (next === 'N') { out += 'N'; i++; }
        else if ('IEY'.includes(next)) out += 'J';
        else out += 'K';
        break;
      case 'H':
        if (i === 0 || vowels.includes(prev)) { if (vowels.includes(next)) out += 'H'; }
        break;
      case 'J': out += 'J'; break;
      case 'K': if (prev !== 'C') out += 'K'; break;
      case 'L': out += 'L'; break;
      case 'M': out += 'M'; break;
      case 'N': out += 'N'; break;
      case 'P': if (next === 'H') { out += 'F'; i++; } else out += 'P'; break;
      case 'Q': out += 'K'; break;
      case 'R': out += 'R'; break;
      case 'S': if (next === 'H') { out += 'X'; i++; } else out += 'S'; break;
      case 'T': if (next === 'H') { out += '0'; i++; } else out += 'T'; break;
      case 'V': out += 'F'; break;
      case 'W': case 'Y': if (vowels.includes(next)) out += c; break;
      case 'X': out += 'KS'; break;
      case 'Z': out += 'S'; break;
    }
    i++;
  }
  return out;
}

// ---------- Nickname dictionary (PNRS) ----------
// Bidirectional canonical groups. Each set members are mutually substitutable.
const NICKNAME_GROUPS: string[][] = [
  ['robert', 'rob', 'bob', 'bobby', 'bert'],
  ['william', 'will', 'bill', 'billy', 'liam'],
  ['richard', 'rick', 'rich', 'dick', 'ricky'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['john', 'johnny', 'jack', 'jon'],
  ['michael', 'mike', 'mick', 'mikey'],
  ['charles', 'charlie', 'chuck', 'chas'],
  ['thomas', 'tom', 'tommy'],
  ['anthony', 'tony'],
  ['christopher', 'chris', 'christoph'],
  ['edward', 'ed', 'eddie', 'ned', 'ted'],
  ['joseph', 'joe', 'joey'],
  ['daniel', 'dan', 'danny'],
  ['nicholas', 'nick', 'nicky'],
  ['matthew', 'matt', 'matty'],
  ['andrew', 'andy', 'drew'],
  ['benjamin', 'ben', 'benji', 'benny'],
  ['samuel', 'sam', 'sammy'],
  ['alexander', 'alex', 'al', 'sandy', 'xander'],
  ['elizabeth', 'liz', 'beth', 'eliza', 'lizzy', 'betsy', 'betty'],
  ['catherine', 'katherine', 'kate', 'katie', 'cathy', 'kathy', 'kit'],
  ['margaret', 'maggie', 'meg', 'peggy', 'marge'],
  ['susan', 'sue', 'susie', 'suzy'],
  ['patricia', 'pat', 'patty', 'tricia', 'trish'],
  ['jennifer', 'jen', 'jenny', 'jenn'],
  ['rebecca', 'becky', 'becca', 'reba'],
  ['deborah', 'deb', 'debbie', 'debra'],
  ['barbara', 'barb', 'barbie'],
  ['victoria', 'vicky', 'vic', 'tori'],
  ['stephanie', 'steph', 'stephie'],
  ['theodore', 'ted', 'teddy', 'theo'],
  ['frederick', 'fred', 'freddy', 'rick'],
];

const NICKNAME_INDEX = new Map<string, Set<string>>();
for (const group of NICKNAME_GROUPS) {
  const set = new Set(group);
  for (const name of group) {
    // Merge if name appears in multiple groups
    const existing = NICKNAME_INDEX.get(name);
    if (existing) for (const m of set) existing.add(m);
    else NICKNAME_INDEX.set(name, new Set(set));
  }
}

export function isNicknameOf(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  return NICKNAME_INDEX.get(la)?.has(lb) ?? false;
}

// ---------- PNRS — Personal Name Recognition Strategy ----------
// Returns a similarity score in [0,1] combining nickname, phonetic, and edit distance.
export function pnrsSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (isNicknameOf(na, nb)) return 0.95;
  const sa = soundex(na), sb = soundex(nb);
  const ma = metaphone(na), mb = metaphone(nb);
  const ed = editDistanceSimilarity(na, nb);
  const jw = jaroWinkler(na, nb);
  let phonetic = 0;
  if (sa === sb) phonetic += 0.5;
  if (ma === mb) phonetic += 0.5;
  // Weighted blend: jaro-winkler dominant (string), boost when phonetics agree
  return Math.min(1, 0.55 * jw + 0.30 * ed + 0.15 * phonetic);
}

// ---------- Declarative match-function dispatcher (Ch 2) ----------
export type MatchKind =
  | 'exact' | 'exact_ci' | 'prefix' | 'soundex' | 'metaphone'
  | 'edit_distance' | 'jaro_winkler' | 'nickname' | 'token_set';

export interface MatchRule {
  name: string;
  kind: MatchKind;
  threshold?: number; // for edit_distance, jaro_winkler, token_set
  weight: number;
}

function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter); // Jaccard
}

export function applyMatchRule(rule: MatchRule, a: string, b: string): { matched: boolean; score: number } {
  if (a == null || b == null) return { matched: false, score: 0 };
  switch (rule.kind) {
    case 'exact':       return { matched: a === b, score: a === b ? 1 : 0 };
    case 'exact_ci':    return { matched: a.toLowerCase() === b.toLowerCase(), score: a.toLowerCase() === b.toLowerCase() ? 1 : 0 };
    case 'prefix':      { const m = a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase()); return { matched: m, score: m ? 1 : 0 }; }
    case 'soundex':     { const m = soundex(a) === soundex(b); return { matched: m, score: m ? 1 : 0 }; }
    case 'metaphone':   { const m = metaphone(a) === metaphone(b); return { matched: m, score: m ? 1 : 0 }; }
    case 'edit_distance': { const s = editDistanceSimilarity(a, b); const t = rule.threshold ?? 0.85; return { matched: s >= t, score: s }; }
    case 'jaro_winkler':  { const s = jaroWinkler(a, b); const t = rule.threshold ?? 0.90; return { matched: s >= t, score: s }; }
    case 'nickname':    return { matched: isNicknameOf(a, b), score: isNicknameOf(a, b) ? 1 : 0 };
    case 'token_set':   { const s = tokenSetSimilarity(a, b); const t = rule.threshold ?? 0.5; return { matched: s >= t, score: s }; }
  }
}

export function scoreMatch(rules: MatchRule[], extract: (rule: MatchRule) => [string, string]): {
  totalScore: number;
  maxScore: number;
  normalized: number;
  perRule: Array<{ rule: string; matched: boolean; score: number; weight: number }>;
} {
  let total = 0, max = 0;
  const perRule: Array<{ rule: string; matched: boolean; score: number; weight: number }> = [];
  for (const rule of rules) {
    if (!rule.weight) continue;
    const [a, b] = extract(rule);
    const r = applyMatchRule(rule, a ?? '', b ?? '');
    total += r.score * rule.weight;
    max += rule.weight;
    perRule.push({ rule: rule.name, matched: r.matched, score: r.score, weight: rule.weight });
  }
  return { totalScore: total, maxScore: max, normalized: max ? total / max : 0, perRule };
}

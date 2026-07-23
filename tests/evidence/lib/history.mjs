// tests/evidence/lib/history.mjs
// Safe append-only history for certification runs.
// - lock file (O_EXCL) protects concurrent read-modify-write
// - atomic write (temp file + rename)
// - corrupt file quarantined, never silently discarded
// - dedupe by (release, commit, environment, run_id)

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  openSync,
  closeSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";

const LOCK_SUFFIX = ".lock";
const LOCK_RETRIES = 100;   // ~2s total
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30_000;

function sleepSync(ms) {
  const end = Date.now() + ms;
  // busy-wait; ms is tiny (20ms) and this only runs when contended.
  while (Date.now() < end) { /* spin */ }
}

function acquireLock(historyPath) {
  const lockPath = historyPath + LOCK_SUFFIX;
  mkdirSync(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt++) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        // Write pid for diagnostics.
        // Best-effort — ignore errors.
        // eslint-disable-next-line no-empty
        try { writeFileSync(lockPath, String(process.pid)); } catch {}
      } finally {
        closeSync(fd);
      }
      return lockPath;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      // Break stale locks.
      try {
        const st = statSync(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch { /* race: someone else released; retry */ }
      sleepSync(LOCK_RETRY_MS);
    }
  }
  throw new Error(`could not acquire history lock after ${LOCK_RETRIES} attempts: ${lockPath}`);
}

function releaseLock(lockPath) {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}

function readOrQuarantine(historyPath) {
  if (!existsSync(historyPath)) return { history: [], quarantined: null };
  const raw = readFileSync(historyPath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("history.json is not an array");
    return { history: parsed, quarantined: null };
  } catch (err) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const quarantined = join(
      dirname(historyPath),
      `history.corrupt.${stamp}.json`,
    );
    renameSync(historyPath, quarantined);
    return { history: [], quarantined, error: String(err) };
  }
}

function atomicWrite(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

function dedupeKey(entry) {
  return [
    entry.release ?? "",
    entry.commit ?? "",
    entry.environment ?? "",
    entry.run_id ?? "",
  ].join("|");
}

export function appendHistory(historyPath, entry) {
  const lockPath = acquireLock(historyPath);
  try {
    const { history, quarantined, error } = readOrQuarantine(historyPath);
    const key = dedupeKey(entry);
    const filtered = history.filter((e) => dedupeKey(e) !== key);
    filtered.push(entry);
    atomicWrite(historyPath, JSON.stringify(filtered, null, 2));
    return { path: historyPath, count: filtered.length, quarantined, error };
  } finally {
    releaseLock(lockPath);
  }
}

// Exposed for tests.
export const _internals = { acquireLock, releaseLock };

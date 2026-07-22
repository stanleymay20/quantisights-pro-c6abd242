import { useRef, useCallback, useState, useEffect } from "react";

const STORAGE_KEY = "quantivis_auth_throttle";

interface ThrottleState {
  attempts: number;
  lockedUntil: number; // epoch ms
}

function load(): ThrottleState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { attempts: 0, lockedUntil: 0 };
}

function save(state: ThrottleState) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/**
 * Client-side brute-force protection for auth forms.
 * 
 * - Persists lockout state in sessionStorage (survives page reload)
 * - Locks out after maxAttempts FAILED logins within the window
 * - Call recordFailure() on login error, recordSuccess() on success
 * - check() returns whether the current attempt is allowed
 * - Exposes secondsRemaining for a live countdown UI
 */
export const useAuthThrottle = (maxAttempts = 5, cooldownMs = 60_000) => {
  const state = useRef<ThrottleState>(load());
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Live countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (state.current.lockedUntil > now) {
        setSecondsRemaining(Math.ceil((state.current.lockedUntil - now) / 1000));
      } else {
        setSecondsRemaining(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const check = useCallback((): { allowed: boolean; waitSeconds: number } => {
    const now = Date.now();
    const s = load(); // always read fresh from sessionStorage
    if (s.lockedUntil > now) {
      const wait = Math.ceil((s.lockedUntil - now) / 1000);
      setSecondsRemaining(wait);
      return { allowed: false, waitSeconds: wait };
    }
    return { allowed: true, waitSeconds: 0 };
  }, []);

  const recordFailure = useCallback(() => {
    const now = Date.now();
    const s = load();
    if (s.lockedUntil > now) return; // already locked

    s.attempts = (s.attempts || 0) + 1;
    if (s.attempts >= maxAttempts) {
      s.lockedUntil = now + cooldownMs;
      s.attempts = 0;
      setSecondsRemaining(Math.ceil(cooldownMs / 1000));
    }
    state.current = s;
    save(s);
  }, [maxAttempts, cooldownMs]);

  const recordSuccess = useCallback(() => {
    const cleared = { attempts: 0, lockedUntil: 0 };
    state.current = cleared;
    save(cleared);
    setSecondsRemaining(0);
  }, []);

  // Legacy compat: check() used to also increment — now only recordFailure() does
  const legacyCheck = useCallback((): { allowed: boolean; waitSeconds: number } => {
    return check();
  }, [check]);

  return { check: legacyCheck, recordFailure, recordSuccess, secondsRemaining };
};

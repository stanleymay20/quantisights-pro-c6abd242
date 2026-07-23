/**
 * Circuit breaker for external service calls (AI/ML endpoints, webhooks).
 * Prevents cascade failures when downstream services degrade.
 * 
 * States: CLOSED (normal) → OPEN (failing, reject fast) → HALF_OPEN (testing recovery)
 */

interface CircuitState {
  state: "closed" | "open" | "half_open";
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  consecutiveSuccesses: number;
}

const circuits = new Map<string, CircuitState>();

const DEFAULT_CONFIG = {
  failureThreshold: 5,        // Open after N consecutive failures
  resetTimeoutMs: 30_000,     // Try half-open after 30s
  halfOpenSuccesses: 2,       // Close after N successes in half-open
};

function getCircuit(name: string): CircuitState {
  if (!circuits.has(name)) {
    circuits.set(name, {
      state: "closed",
      failures: 0,
      lastFailure: 0,
      lastSuccess: Date.now(),
      consecutiveSuccesses: 0,
    });
  }
  return circuits.get(name)!;
}

export function isCircuitOpen(name: string): boolean {
  const circuit = getCircuit(name);
  
  if (circuit.state === "closed") return false;
  
  if (circuit.state === "open") {
    // Check if reset timeout has elapsed → transition to half_open
    if (Date.now() - circuit.lastFailure > DEFAULT_CONFIG.resetTimeoutMs) {
      circuit.state = "half_open";
      circuit.consecutiveSuccesses = 0;
      return false; // Allow one request through
    }
    return true; // Still open, reject
  }
  
  // half_open: allow requests through
  return false;
}

export function recordSuccess(name: string): void {
  const circuit = getCircuit(name);
  circuit.failures = 0;
  circuit.lastSuccess = Date.now();
  
  if (circuit.state === "half_open") {
    circuit.consecutiveSuccesses++;
    if (circuit.consecutiveSuccesses >= DEFAULT_CONFIG.halfOpenSuccesses) {
      circuit.state = "closed";
    }
  } else {
    circuit.state = "closed";
  }
}

export function recordFailure(name: string): void {
  const circuit = getCircuit(name);
  circuit.failures++;
  circuit.lastFailure = Date.now();
  circuit.consecutiveSuccesses = 0;
  
  if (circuit.failures >= DEFAULT_CONFIG.failureThreshold) {
    circuit.state = "open";
  }
}

export function getCircuitStatus(name: string): { state: string; failures: number; lastFailure: number } {
  const circuit = getCircuit(name);
  return { state: circuit.state, failures: circuit.failures, lastFailure: circuit.lastFailure };
}

/**
 * Execute a function with circuit breaker protection.
 * If circuit is open, returns the fallback immediately.
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<{ result: T; fromFallback: boolean }> {
  if (isCircuitOpen(name)) {
    return { result: fallback, fromFallback: true };
  }
  
  try {
    const result = await fn();
    recordSuccess(name);
    return { result, fromFallback: false };
  } catch (err) {
    recordFailure(name);
    console.error(`[circuit-breaker:${name}] failure #${getCircuit(name).failures}:`, err instanceof Error ? err.message : String(err));
    return { result: fallback, fromFallback: true };
  }
}

/** Get status of all known circuits */
export function getAllCircuitStatuses(): Record<string, { state: string; failures: number }> {
  const result: Record<string, { state: string; failures: number }> = {};
  for (const [name, circuit] of circuits) {
    result[name] = { state: circuit.state, failures: circuit.failures };
  }
  return result;
}

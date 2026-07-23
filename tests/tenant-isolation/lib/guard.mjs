// tests/tenant-isolation/lib/guard.mjs
// Shared safety guard for all tenant-isolation scripts.
// Allow-list environment protection: refuses anything except staging/preview.

const ALLOWED_TARGETS = new Set(["staging", "preview"]);

export function must(k) {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
  return v;
}

export function assertAllowedEnvironment() {
  const target = (process.env.LOAD_TARGET || "").trim().toLowerCase();
  if (!target) {
    console.error("LOAD_TARGET is required. Allowed values: staging, preview.");
    process.exit(1);
  }
  if (!ALLOWED_TARGETS.has(target)) {
    console.error(
      `Refusing to run: LOAD_TARGET='${process.env.LOAD_TARGET}' is not on the allow-list.\n` +
        `Allowed values: ${[...ALLOWED_TARGETS].join(", ")}.\n` +
        `This is an allow-list check; production/prod/live/main/release and unknown values are rejected.`,
    );
    process.exit(1);
  }
  return target;
}

export function assertNotProduction() {
  // Kept as a distinct call site for readability; allow-list already covers this.
  const target = (process.env.LOAD_TARGET || "").trim().toLowerCase();
  const BLOCKED = ["production", "prod", "live", "main", "release"];
  if (BLOCKED.includes(target)) {
    console.error(`Refusing to run against '${target}'.`);
    process.exit(1);
  }
}

export function assertConfirmation() {
  // Reserved for future destructive extensions; currently a no-op that documents intent.
  return true;
}

export function guardOrExit() {
  const target = assertAllowedEnvironment();
  assertNotProduction();
  assertConfirmation();
  return target;
}

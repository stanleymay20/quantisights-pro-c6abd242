type RequiredEnvKey = "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY";

const REQUIRED_CLIENT_ENV: RequiredEnvKey[] = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

function readEnvValue(key: RequiredEnvKey): string {
  const value = import.meta.env[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `[config] Missing required environment variable: ${key}. ` +
        "Set it in Lovable, local .env, and GitHub Actions secrets before building."
    );
  }

  return value.trim();
}

export const clientEnv = Object.freeze({
  supabaseUrl: readEnvValue("VITE_SUPABASE_URL"),
  supabasePublishableKey: readEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY"),
});

export function validateClientEnv(): void {
  for (const key of REQUIRED_CLIENT_ENV) {
    readEnvValue(key);
  }
}

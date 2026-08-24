export type PublicClientBuildEnv = {
  VITE_SUPABASE_URL?: string | null;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string | null;
};

export type PublicClientConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  source: "environment" | "checked-in-public-default";
};

// These are browser-public identifiers, not secrets. Supabase publishable keys
// are intentionally delivered to clients and are constrained by RLS.
// NEVER place a service-role key, secret key, or other privileged credential here.
export const PRODUCTION_PUBLIC_CLIENT_CONFIG = Object.freeze({
  supabaseUrl: "https://izgfrekdamlgigehxoqs.supabase.co",
  supabasePublishableKey: "sb_publishable_h4JCxt31VXyaALxD-Uj1rw_y6w9_ZaY",
});

const SUPABASE_HOST_RE = /^([a-z0-9-]+)\.supabase\.co$/i;
const PUBLISHABLE_KEY_RE = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const validatePublicClientConfig = (
  supabaseUrl: string,
  supabasePublishableKey: string,
): { projectRef: string } => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("Public Supabase URL is malformed.");
  }

  const hostMatch = parsedUrl.protocol === "https:" ? parsedUrl.hostname.match(SUPABASE_HOST_RE) : null;
  if (!hostMatch || parsedUrl.pathname !== "/") {
    throw new Error("Public Supabase URL must be an HTTPS project URL on supabase.co.");
  }

  const key = supabasePublishableKey.trim();
  if (!key) throw new Error("Public Supabase publishable key is missing.");

  const jwtPayload = decodeJwtPayload(key);
  if (!jwtPayload && !PUBLISHABLE_KEY_RE.test(key)) {
    throw new Error("Public Supabase publishable key has an unsupported format.");
  }

  if (jwtPayload) {
    const role = typeof jwtPayload.role === "string" ? jwtPayload.role : null;
    if (role === "service_role" || role === "supabase_admin") {
      throw new Error("Privileged Supabase credentials must never be embedded in the browser build.");
    }

    const tokenRef = typeof jwtPayload.ref === "string" ? jwtPayload.ref : null;
    if (tokenRef && tokenRef !== hostMatch[1]) {
      throw new Error("Public Supabase URL and publishable key refer to different projects.");
    }
  }

  return { projectRef: hostMatch[1] };
};

export const resolvePublicClientConfig = (env: PublicClientBuildEnv = {}): PublicClientConfig => {
  const envUrl = env.VITE_SUPABASE_URL?.trim();
  const envKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const hasAnyOverride = Boolean(envUrl || envKey);

  if (hasAnyOverride && (!envUrl || !envKey)) {
    throw new Error(
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be supplied together.",
    );
  }

  const supabaseUrl = envUrl || PRODUCTION_PUBLIC_CLIENT_CONFIG.supabaseUrl;
  const supabasePublishableKey = envKey || PRODUCTION_PUBLIC_CLIENT_CONFIG.supabasePublishableKey;

  validatePublicClientConfig(supabaseUrl, supabasePublishableKey);

  return {
    supabaseUrl,
    supabasePublishableKey,
    source: hasAnyOverride ? "environment" : "checked-in-public-default",
  };
};

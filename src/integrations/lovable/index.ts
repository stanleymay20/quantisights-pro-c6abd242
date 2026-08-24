// Compatibility adapter for legacy call sites.
// Quantivis authentication is authoritative in Supabase; this module must not
// mint or broker sessions through Lovable Cloud Auth.

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type OAuthResult = {
  redirected: boolean;
  error?: Error;
};

type AuthSettings = {
  external?: {
    google?: boolean;
  };
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const normalizeOAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown OAuth error");
  const lower = message.toLowerCase();

  if (
    lower.includes("unsupported provider") ||
    lower.includes("provider is not enabled") ||
    lower.includes("provider not enabled") ||
    lower.includes("oauth provider")
  ) {
    return new Error("Google sign-in is not enabled for this environment yet. Use email and password for now.");
  }

  return error instanceof Error ? error : new Error(message);
};

const ensureGoogleProviderEnabled = async () => {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    });
  } catch (error: unknown) {
    throw new Error(
      `Google sign-in availability could not be verified. Use email and password for now. (${error instanceof Error ? error.message : "network error"})`,
    );
  }

  if (!response.ok) {
    throw new Error("Google sign-in availability could not be verified. Use email and password for now.");
  }

  let settings: AuthSettings;
  try {
    settings = await response.json() as AuthSettings;
  } catch {
    throw new Error("Google sign-in availability returned an invalid response. Use email and password for now.");
  }

  if (settings.external?.google !== true) {
    throw new Error("Google sign-in is not enabled for this environment yet. Use email and password for now.");
  }
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions,
    ): Promise<OAuthResult> => {
      if (provider !== "google") {
        return {
          redirected: false,
          error: new Error(`Unsupported social sign-in provider: ${provider}`),
        };
      }

      try {
        await ensureGoogleProviderEnabled();

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: opts?.redirect_uri,
            queryParams: opts?.extraParams,
            // Validate the authorization URL before navigation so a provider
            // configuration failure cannot silently redirect the browser.
            skipBrowserRedirect: true,
          },
        });

        if (error) {
          return { redirected: false, error: normalizeOAuthError(error) };
        }

        if (!data.url) {
          return {
            redirected: false,
            error: new Error("Google sign-in did not return an authorization URL. Use email and password for now."),
          };
        }

        let destination: URL;
        try {
          destination = new URL(data.url);
        } catch {
          return {
            redirected: false,
            error: new Error("Google sign-in returned an invalid authorization URL."),
          };
        }

        if (destination.protocol !== "https:") {
          return {
            redirected: false,
            error: new Error("Google sign-in returned an insecure authorization URL."),
          };
        }

        window.location.assign(destination.toString());
        return { redirected: true };
      } catch (error: unknown) {
        return { redirected: false, error: normalizeOAuthError(error) };
      }
    },
  },
};

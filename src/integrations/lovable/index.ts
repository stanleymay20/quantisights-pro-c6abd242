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

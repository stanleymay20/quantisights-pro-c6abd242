import { supabase } from "@/integrations/supabase/client";
import { safeHttpsUrl, safeInternalNavigation } from "@/lib/safe-navigation";

const OAUTH_NEXT_KEY = "quantivis_oauth_next";

const googleOAuthUnavailableMessage = (message: string) => {
  const lower = message.toLowerCase();
  if (
    lower.includes("unsupported provider") ||
    lower.includes("provider is not enabled") ||
    lower.includes("provider not enabled") ||
    lower.includes("oauth provider")
  ) {
    return "Google sign-in is not enabled for this environment yet. Use email and password for now.";
  }
  return message;
};

export const beginGoogleOAuth = async (next: string) => {
  const safeNext = safeInternalNavigation(next, "/onboarding");
  sessionStorage.setItem(OAUTH_NEXT_KEY, safeNext);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
      // Keep redirect control in one place so a missing/invalid provider URL
      // cannot silently navigate the browser away from Quantivis.
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    throw new Error(googleOAuthUnavailableMessage(error.message));
  }

  const destination = safeHttpsUrl(data.url);
  if (!destination) {
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    throw new Error("Google sign-in did not return a secure authorization URL. Use email and password for now.");
  }

  window.location.assign(destination);
};

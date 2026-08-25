import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { safeInternalNavigation } from "@/lib/safe-navigation";
import logo from "@/assets/quantivis-logo.png";

const isLocalEvidenceHost = () =>
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

const consumeStoredNext = () => {
  const value = sessionStorage.getItem("quantivis_oauth_next");
  sessionStorage.removeItem("quantivis_oauth_next");
  return safeInternalNavigation(value, "/onboarding");
};

const readOAuthError = (url: URL) => {
  const queryError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (queryError) return queryError;

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!hash) return null;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get("error_description") || hashParams.get("error");
};

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Finalizing your secure sign-in…");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    // Client Acceptance runs against a localhost preview backed by the real
    // staging Supabase project. Only that local browser may use evidence_email
    // to initiate a magic-link flow. Public staging/production hosts ignore the
    // parameter entirely. Starting the flow in the browser is essential: PKCE
    // exchange later requires the verifier stored by this exact client.
    const evidenceEmail = isLocalEvidenceHost()
      ? searchParams.get("evidence_email")?.trim()
      : null;
    if (evidenceEmail) {
      setMessage("Starting PKCE evidence flow…");
      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
      supabase.auth.signInWithOtp({
        email: evidenceEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      }).then(({ error: otpError }) => {
        if (cancelled) return;
        if (otpError) {
          console.error("[AuthCallback] PKCE evidence initiation failed:", otpError.message);
          setError(true);
          setMessage(`PKCE evidence initiation failed: ${otpError.message}`);
          return;
        }
        setMessage("PKCE evidence request queued");
      }).catch((otpError: unknown) => {
        if (cancelled) return;
        const detail = otpError instanceof Error ? otpError.message : String(otpError);
        console.error("[AuthCallback] PKCE evidence initiation failed:", detail);
        setError(true);
        setMessage(`PKCE evidence initiation failed: ${detail}`);
      });

      return () => {
        cancelled = true;
      };
    }

    const next = searchParams.get("next")
      ? safeInternalNavigation(searchParams.get("next"), "/onboarding")
      : consumeStoredNext();

    const finish = (ok: boolean) => {
      if (settled || cancelled) return;
      settled = true;
      if (ok) {
        // Remove OAuth query/hash material from browser history after the
        // Supabase client has completed the PKCE exchange.
        window.history.replaceState({}, document.title, window.location.pathname);
        navigate(next, { replace: true });
      } else {
        setError(true);
        setMessage("We could not confirm your session. Redirecting to sign in…");
        setTimeout(() => !cancelled && navigate("/login", { replace: true }), 1500);
      }
    };

    // Provider errors are terminal. Never attempt to manufacture a session
    // from URL-supplied access/refresh tokens; Quantivis uses PKCE only.
    const url = new URL(window.location.href);
    const providerError = readOAuthError(url);
    if (providerError) {
      console.error("[AuthCallback] OAuth provider error:", providerError);
      finish(false);
      return;
    }

    // The Supabase client is configured with detectSessionInUrl + PKCE. It
    // performs the one-time code exchange; this component only observes the
    // resulting authenticated session so the authorization code is never
    // exchanged twice.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(true);
    });

    // The exchange can finish before this component mounts.
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error("[AuthCallback] Failed to read OAuth session:", sessionError.message);
        return;
      }
      if (data.session) finish(true);
    }).catch((sessionReadError: unknown) => {
      console.error(
        "[AuthCallback] OAuth session read failed:",
        sessionReadError instanceof Error ? sessionReadError.message : sessionReadError,
      );
    });

    const timeoutId = window.setTimeout(async () => {
      if (settled || cancelled) return;
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("[AuthCallback] OAuth session timeout check failed:", sessionError.message);
          finish(false);
          return;
        }
        finish(Boolean(data.session));
      } catch (sessionReadError: unknown) {
        console.error(
          "[AuthCallback] OAuth timeout session read failed:",
          sessionReadError instanceof Error ? sessionReadError.message : sessionReadError,
        );
        finish(false);
      }
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-6 px-4">
      <img src={logo} alt="Quantivis" className="h-10 w-auto" />
      {!error && (
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      )}
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">
          {error ? "Taking you back to sign in…" : "Setting up your secure session"}
        </p>
      </div>
      <p className="text-xs text-muted-foreground/50 absolute bottom-6">
        Quantivis — Decision Intelligence OS
      </p>
    </div>
  );
};

export default AuthCallback;

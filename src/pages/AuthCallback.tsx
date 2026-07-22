import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/quantivis-logo.png";

const safeNext = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  return value;
};

const consumeStoredNext = () => {
  const value = sessionStorage.getItem("quantivis_oauth_next");
  sessionStorage.removeItem("quantivis_oauth_next");
  return safeNext(value);
};

const readOAuthParam = (url: URL, key: string) => {
  const queryValue = url.searchParams.get(key);
  if (queryValue) return queryValue;

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!hash) return null;
  return new URLSearchParams(hash).get(key);
};

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Finalizing your secure sign-in…");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const next = searchParams.get("next") ? safeNext(searchParams.get("next")) : consumeStoredNext();

    const finish = (ok: boolean) => {
      if (settled || cancelled) return;
      settled = true;
      if (ok) {
        navigate(next, { replace: true });
      } else {
        setError(true);
        setMessage("We could not confirm your session. Redirecting to sign in…");
        setTimeout(() => !cancelled && navigate("/login", { replace: true }), 1500);
      }
    };

    // Check for provider error first — never proceed to exchange on error response.
    const url = new URL(window.location.href);
    const errParam = readOAuthParam(url, "error_description") || readOAuthParam(url, "error");
    if (errParam) {
      console.error("[AuthCallback] OAuth provider error:", errParam);
      finish(false);
      return;
    }

    // Lovable managed OAuth can return directly to this public callback with
    // session tokens in either query or hash form. Hydrate them explicitly so
    // live full-page redirects do not depend solely on Supabase PKCE auto-detect.
    const accessToken = readOAuthParam(url, "access_token");
    const refreshToken = readOAuthParam(url, "refresh_token");
    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            console.error("[AuthCallback] Failed to set OAuth session:", error.message);
            finish(false);
            return;
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          finish(true);
        })
        .catch((setSessionError: unknown) => {
          console.error(
            "[AuthCallback] OAuth session handoff failed:",
            setSessionError instanceof Error ? setSessionError.message : setSessionError
          );
          finish(false);
        });
    }

    // The Supabase client is configured with `detectSessionInUrl: true` + PKCE flow,
    // so it auto-exchanges the `?code=` exactly once on page load. We MUST NOT call
    // `exchangeCodeForSession` again — that races with the auto-exchange and the
    // second call fails because the code (and PKCE verifier) have already been
    // consumed. We only listen for SIGNED_IN and poll getSession as a fallback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(true);
    });

    // Fallback: session may have been set before this component mounted.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });

    // Hard timeout — if no session appears in 6s, bail to /login.
    const timeoutId = window.setTimeout(async () => {
      if (settled || cancelled) return;
      const { data } = await supabase.auth.getSession();
      finish(Boolean(data.session));
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

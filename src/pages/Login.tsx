import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAuthThrottle } from "@/hooks/useAuthThrottle";
import { useAuthEvents } from "@/hooks/useAuthEvents";
import { supabase } from "@/integrations/supabase/client";
import { trackLogin, identifyUser } from "@/lib/analytics";
import MFAChallenge from "@/components/auth/MFAChallenge";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleButton from "@/components/auth/GoogleButton";
import { Shield } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showMFA, setShowMFA] = useState(false);
  const [ssoRedirect, setSsoRedirect] = useState<string | null>(null);
  const [ssoChecking, setSsoChecking] = useState(false);
  const [ssoEnforced, setSsoEnforced] = useState(false);
  const { user, signIn } = useAuth();
  const { logAuthEvent } = useAuthEvents();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  // Never redirect back to public/auth pages after login
  const BLOCKED = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];
  const isBlocked = BLOCKED.includes(rawRedirect) || !rawRedirect.startsWith("/") || rawRedirect.startsWith("//");
  const redirectTo = isBlocked ? "/dashboard" : rawRedirect;
  const { toast } = useToast();
  const throttle = useAuthThrottle(5, 60_000);

  // Redirect already-authenticated users to dashboard
  if (user) return <Navigate to={redirectTo} replace />;

  // Check SSO for email domain
  const checkSSODomain = async (emailValue: string) => {
    if (!emailValue.includes("@")) {
      setSsoRedirect(null);
      setSsoEnforced(false);
      return;
    }
    setSsoChecking(true);
    try {
      const { data } = await supabase.rpc("resolve_sso_for_email", { _email: emailValue });
      if (data && Array.isArray(data) && data.length > 0) {
        const ssoConfig = data[0];
        setSsoRedirect(ssoConfig.idp_sso_url);
        setSsoEnforced(ssoConfig.enforce_sso);
      } else {
        setSsoRedirect(null);
        setSsoEnforced(false);
      }
    } catch (e: unknown) {
      // SSO lookup failure is non-blocking — fall back to password login
      console.error("[Login] SSO lookup failed:", e instanceof Error ? e.message : e);
      setSsoRedirect(null);
      setSsoEnforced(false);
    } finally {
      setSsoChecking(false);
    }
  };

  const handleSSOLogin = () => {
    if (ssoRedirect) {
      window.location.href = ssoRedirect;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ssoEnforced) {
      toast({ title: "SSO Required", description: "Your organization requires SSO login. Use the SSO button below.", variant: "destructive" });
      return;
    }
    const { allowed, waitSeconds } = throttle.check();
    if (!allowed) {
      toast({ title: "Too many attempts", description: `Please wait ${waitSeconds}s before trying again.`, variant: "destructive" });
      return;
    }

    // Server-side rate limit check — protects against direct API abuse that
    // bypasses the client-side throttle entirely (curl, scripted attacks).
    // Fails open on error so a rate-limiter outage never blocks real logins.
    try {
      const { data: rateCheck } = await supabase.functions.invoke("auth-rate-limiter", {
        body: { email, action: "check" },
      });
      if (rateCheck && rateCheck.allowed === false) {
        toast({
          title: "Too many attempts",
          description: rateCheck.message || `Please wait before trying again.`,
          variant: "destructive",
        });
        return;
      }
    } catch (rateLimitErr) {
      console.warn("[login] Rate limiter check failed, proceeding:", rateLimitErr);
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
      throttle.recordSuccess();
      supabase.functions.invoke("auth-rate-limiter", { body: { email, action: "record_success" } }).catch(() => {});
      trackLogin("password");
      // Identify user for PostHog cohort analysis (no PII — only anonymous ID)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        import("@/lib/analytics").then(({ identifyUser }) =>
          identifyUser(session.user.id, "", "")
        );
      }

      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedFactors = factorsData?.totp?.filter((f) => f.status === "verified") || [];

      if (verifiedFactors.length > 0) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel !== aal?.nextLevel) {
          setShowMFA(true);
          setIsLoading(false);
          return;
        }
      }

      // Check for login anomalies (fire-and-forget)
      supabase.functions.invoke("login-anomaly-detect", {
        body: {
          ip_address: null, // Server-side detection
          user_agent: navigator.userAgent,
        },
      }).then(({ data }) => {
        if (data?.is_anomalous) {
          toast({
            title: "Security Notice",
            description: data.message + ". If this wasn't you, change your password immediately.",
            variant: "destructive",
            duration: 10000,
          });
        }
      }).catch((err) => {
        console.warn("[login] Anomaly detection call failed:", err);
      }); // Non-blocking

      logAuthEvent({ eventType: "login", metadata: { method: "password" } });
      navigate(redirectTo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throttle.recordFailure(); // increment failed-attempt counter (client-side UX)
      supabase.functions.invoke("auth-rate-limiter", { body: { email, action: "record_failure" } }).catch(() => {}); // server-side lockout (fire-and-forget)
      logAuthEvent({ eventType: "failed_login", metadata: { email, reason: msg } });
      const lower = msg.toLowerCase();
      const isCredentialError =
        lower.includes("invalid") || lower.includes("credential") || lower.includes("password") || lower.includes("not found");
      const isUnconfirmed = lower.includes("confirm") || lower.includes("not verified");
      toast({
        title: "Login failed",
        description: isUnconfirmed
          ? "Please verify your email address before signing in. Check your inbox for the confirmation link."
          : isCredentialError
          ? "Incorrect email or password. Please try again."
          : msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFAVerified = () => {
    navigate(redirectTo);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      // Lovable Cloud Managed Social Login. The Google OAuth client is registered
      // against the /~oauth/callback broker URLs, not Supabase's /auth/callback.
      // Using the legacy supabase.auth.signInWithOAuth flow here would fail because
      // Google would refuse the redirect URI.
      const { lovable } = await import("@/integrations/lovable");
      sessionStorage.setItem("quantivis_oauth_next", redirectTo);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth/callback",
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(String(result.error));
      }
      if (result.redirected) {
        // Browser is redirecting to Google — nothing more to do here.
        return;
      }
      // Tokens were returned synchronously and the session is set.
      logAuthEvent({ eventType: "login", metadata: { method: "google" } });
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      toast({ title: "Google sign-in failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title={showMFA ? "Two-factor authentication" : "Welcome back"}
      subtitle={
        showMFA
          ? "Enter the 6-digit code from your authenticator app to continue."
          : "Sign in to your Quantivis workspace."
      }
      footer={
        showMFA ? null : (
          <div className="space-y-2">
            <p>
              Don't have an account?{" "}
              <Link to="/register" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </p>
            <p className="text-xs">
              <Link
                to="/forgot-password"
                className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                Forgot your password?
              </Link>
            </p>
          </div>
        )
      }
    >
      {showMFA ? (
        <MFAChallenge onVerified={handleMFAVerified} />
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Work email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  checkSSODomain(e.target.value);
                }}
                required
                autoComplete="email"
                className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
                placeholder="you@company.com"
              />
            </div>

            {ssoChecking && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                Checking organization sign-in options…
              </p>
            )}

            {/* SSO detection */}
            {ssoRedirect && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Shield className="w-4 h-4" />
                  Enterprise SSO detected
                </div>
                {ssoEnforced && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your organization requires SSO sign-in. Password authentication is disabled.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSSOLogin}
                  disabled={ssoChecking}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  {ssoChecking ? "Checking…" : "Sign in with SSO"}
                </button>
              </div>
            )}

            {!ssoEnforced && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={!ssoRedirect}
                    autoComplete="current-password"
                    className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || ssoChecking || throttle.secondsRemaining > 0}
                  className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)]"
                >
                  {throttle.secondsRemaining > 0
                    ? `Too many attempts — wait ${throttle.secondsRemaining}s`
                    : isLoading
                    ? "Signing in…"
                    : "Sign in securely"}
                </button>
              </>
            )}
          </form>

          {!ssoEnforced && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    or continue with
                  </span>
                </div>
              </div>

              <GoogleButton
                loading={googleLoading}
                disabled={isLoading}
                onClick={handleGoogleSignIn}
              />
            </>
          )}
        </>
      )}
    </AuthLayout>
  );
};

export default Login;
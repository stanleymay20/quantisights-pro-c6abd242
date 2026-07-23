import { useState, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAuthThrottle } from "@/hooks/useAuthThrottle";
import { supabase } from "@/integrations/supabase/client";
import { Check, X } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleButton from "@/components/auth/GoogleButton";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const Register = () => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const planParam = new URLSearchParams(location.search).get("plan");
  const PLAN_LABELS: Record<string, string> = { starter: "Starter — €99/mo", growth: "Growth — €499/mo" };
  const { toast } = useToast();
  const throttle = useAuthThrottle(3, 120_000);

  const passedRules = useMemo(() => PASSWORD_RULES.map(r => r.test(password)), [password]);
  const allPassed = passedRules.every(Boolean);
  const strength = passedRules.filter(Boolean).length;
  const strengthLabel = strength <= 1 ? "Weak" : strength <= 3 ? "Fair" : strength <= 4 ? "Good" : "Strong";
  const strengthColor = strength <= 1 ? "bg-destructive" : strength <= 3 ? "bg-warning" : strength <= 4 ? "bg-primary" : "bg-success";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allPassed) {
      toast({ title: "Password too weak", description: "Please meet all password requirements", variant: "destructive" });
      return;
    }
    const { allowed, waitSeconds } = throttle.check();
    if (!allowed) {
      toast({ title: "Too many attempts", description: `Please wait ${waitSeconds}s before trying again.`, variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await signUp(email, password, fullName);
      toast({ title: "Verification email sent", description: "Confirm your email to continue setting up your Quantivis workspace." });
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const lower = message.toLowerCase();
      const isPasswordIssue =
        lower.includes("weak") ||
        lower.includes("pwned") ||
        lower.includes("leaked") ||
        lower.includes("password");
      const isAlreadyRegistered =
        lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already");
      toast({
        title: "Registration failed",
        description: isAlreadyRegistered
          ? "An account with this email already exists. Try signing in instead."
          : isPasswordIssue
          ? "This password has appeared in a known data breach. Use a longer passphrase — e.g. 'Blue-Harbour-Tide-2026!' — to pass the check instantly."
          : message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      // Lovable Cloud Managed Social Login. The Google OAuth client is registered
      // against the /~oauth/callback broker URLs, not Supabase's /auth/callback,
      // so we must go through the lovable broker, not supabase.auth.signInWithOAuth.
      const { lovable } = await import("@/integrations/lovable");
      sessionStorage.setItem("quantivis_oauth_next", "/onboarding");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth/callback",
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(String(result.error));
      }
      if (result.redirected) {
        return;
      }
      navigate("/onboarding", { replace: true });
    } catch (err: unknown) {
      toast({ title: "Google sign-up failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Start your 14-day enterprise trial. No credit card required."
      ribbon={
        planParam && PLAN_LABELS[planParam] ? (
          <div className="mb-6 -mt-1 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              You're signing up for
            </p>
            <p className="text-sm font-semibold text-primary mt-0.5">
              {PLAN_LABELS[planParam]}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              14-day free trial · Cancel anytime
            </p>
          </div>
        ) : null
      }
      footer={
        <p>
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
        <div>
          <label htmlFor="register-name" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Full name
          </label>
          <input
            id="register-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label htmlFor="register-email" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Work email
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label htmlFor="register-password" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
            placeholder="At least 12 characters"
          />
          {password.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                    style={{ width: `${(strength / 5) * 100}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    strength <= 1 ? "text-destructive" : strength <= 3 ? "text-warning" : "text-success"
                  }`}
                >
                  {strengthLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {PASSWORD_RULES.map((rule, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    {passedRules[i] ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <X className="w-3 h-3 text-muted-foreground/40" />
                    )}
                    <span
                      className={`text-[11px] ${
                        passedRules[i] ? "text-success" : "text-muted-foreground/60"
                      }`}
                    >
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
              {allPassed && (
                <p className="text-[11px] text-muted-foreground">
                  Passwords are checked against known breaches. Use a unique passphrase.
                </p>
              )}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !allPassed}
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)]"
        >
          {isLoading ? "Creating account…" : "Create account"}
        </button>
      </form>

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
        onClick={handleGoogleSignUp}
        label="Sign up with Google"
      />

      <p className="mt-5 text-[11px] text-muted-foreground/80 text-center leading-relaxed">
        By creating an account, you agree to our{" "}
        <Link to="/terms" className="underline hover:text-foreground">
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthLayout>
  );
};

export default Register;

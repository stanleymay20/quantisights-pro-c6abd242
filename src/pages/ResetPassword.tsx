import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, X } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const passedRules = useMemo(() => PASSWORD_RULES.map(r => r.test(password)), [password]);
  const allPassed = passedRules.every(Boolean);
  const strength = passedRules.filter(Boolean).length;
  const strengthLabel = strength <= 1 ? "Weak" : strength <= 3 ? "Fair" : strength <= 4 ? "Good" : "Strong";
  const strengthColor = strength <= 1 ? "bg-destructive" : strength <= 3 ? "bg-warning" : strength <= 4 ? "bg-primary" : "bg-success";

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allPassed) {
      toast({ title: "Password too weak", description: "Please meet all password requirements", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please re-enter", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      navigate("/dashboard");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This link may have expired or already been used."
        footer={
          <a href="/forgot-password" className="text-primary hover:underline font-medium">
            Request a new link
          </a>
        }
      >
        <p className="text-sm text-muted-foreground text-center">
          For your security, password reset links are single-use and expire after 60 minutes.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a strong, unique password for your Quantivis workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
            placeholder="••••••••"
          />
          {password.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strengthColor}`} style={{ width: `${(strength / 5) * 100}%` }} />
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${strength <= 1 ? "text-destructive" : strength <= 3 ? "text-warning" : "text-success"}`}>
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
                    <span className={`text-[11px] ${passedRules[i] ? "text-success" : "text-muted-foreground/60"}`}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="reset-confirm" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Confirm password
          </label>
          <input
            id="reset-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
            placeholder="••••••••"
          />
          {confirm.length > 0 && password !== confirm && (
            <p className="text-xs text-destructive mt-1.5">Passwords do not match</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !allPassed}
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)]"
        >
          {isLoading ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;

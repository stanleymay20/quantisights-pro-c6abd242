import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuthThrottle } from "@/hooks/useAuthThrottle";
import AuthLayout from "@/components/auth/AuthLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const throttle = useAuthThrottle(3, 120_000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { allowed, waitSeconds } = throttle.check();
    if (!allowed) {
      toast({
        title: "Too many attempts",
        description: `Please wait ${waitSeconds}s before trying again.`,
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast({
        title: "Recovery request received",
        description: "If an account exists for that email, a secure reset link will be sent shortly.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="If an account exists for this email, a secure reset link will be sent shortly."
        footer={
          <Link to="/login" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        }
      >
        <div className="text-center space-y-4 py-2">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Recovery requested for{" "}
            <span className="text-foreground font-medium">{email}</span>.
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            If this address is registered, check your inbox and spam folder. For security, we do not reveal whether an account exists.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and, if an account exists, we'll send a secure reset link."
      footer={
        <p>
          Remember your password?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Work email
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full h-11 px-4 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 text-sm transition-all"
            placeholder="you@company.com"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)]"
        >
          {isLoading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;

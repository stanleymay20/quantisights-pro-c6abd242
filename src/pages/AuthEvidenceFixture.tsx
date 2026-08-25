import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const enabled = import.meta.env.VITE_ENABLE_AUTH_EVIDENCE_FIXTURE === "true";

const AuthEvidenceFixture = () => {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"idle" | "sending" | "queued" | "error">("idle");
  const [error, setError] = useState("");

  const email = useMemo(() => params.get("email")?.trim() ?? "", [params]);

  if (!enabled) return <Navigate to="/login" replace />;

  const startPkce = async () => {
    if (!email) {
      setError("Evidence email is required");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      setError(otpError.message);
      setStatus("error");
      return;
    }

    // signInWithOtp() is executed by the same browser/client instance that will
    // later receive ?code=. With flowType=pkce this is what creates and stores
    // the verifier that a genuine exchange must possess.
    setStatus("queued");
  };

  return (
    <main className="min-h-dvh grid place-items-center bg-background px-4">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Authentication evidence fixture</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staging client-acceptance only. Starts a browser-owned PKCE magic-link flow.
          </p>
        </div>
        <button
          type="button"
          onClick={startPkce}
          disabled={status === "sending" || status === "queued"}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          {status === "sending" ? "Starting…" : "Start PKCE evidence"}
        </button>
        {status === "queued" && (
          <p role="status" className="text-sm text-success">PKCE evidence request queued</p>
        )}
        {status === "error" && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}
      </section>
    </main>
  );
};

export default AuthEvidenceFixture;

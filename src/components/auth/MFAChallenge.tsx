import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";

interface MFAChallengeProps {
  onVerified: () => void;
}

const MAX_MFA_ATTEMPTS = 5;
type FactorState = "checking" | "verified" | "missing" | "error";

const MFAChallenge = ({ onVerified }: MFAChallengeProps) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [factorState, setFactorState] = useState<FactorState>("checking");
  const attempts = useRef(0);

  const checkFactor = async () => {
    setFactorState("checking");
    setError("");
    const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !data) {
      console.error("[MFAChallenge] Factor check failed:", factorsError ?? "missing factor response");
      setFactorState("error");
      setError("We couldn't verify your authenticator status. Retry the security check or sign out.");
      return;
    }

    const verifiedFactor = (data.totp ?? []).find((factor) => factor.status === "verified");
    setFactorState(verifiedFactor ? "verified" : "missing");
  };

  // Proactively check for a verified factor on mount rather than waiting for
  // the user to submit a code against a factor that doesn't exist.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (factorsError || !data) {
        console.error("[MFAChallenge] Factor check failed:", factorsError ?? "missing factor response");
        setFactorState("error");
        setError("We couldn't verify your authenticator status. Retry the security check or sign out.");
        return;
      }

      const verifiedFactor = (data.totp ?? []).find((factor) => factor.status === "verified");
      setFactorState(verifiedFactor ? "verified" : "missing");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      // A failed remote revocation must not keep this browser inside the MFA
      // gate. Force local session removal before navigating away.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    window.location.href = "/login";
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked || factorState !== "verified") return;
    setError("");
    setLoading(true);

    attempts.current += 1;
    if (attempts.current > MAX_MFA_ATTEMPTS) {
      setLocked(true);
      setError("Too many failed attempts. Use the sign out link below and sign in again.");
      setLoading(false);
      return;
    }

    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      if (!factorsData) throw new Error("MFA factor response was empty");

      // Never challenge an arbitrary first TOTP entry: unverified enrollment
      // remnants may coexist with the verified factor that actually protects
      // the account.
      const totpFactor = (factorsData.totp ?? []).find((factor) => factor.status === "verified");
      if (!totpFactor) {
        setFactorState("missing");
        setError("No verified TOTP factor found.");
        return;
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      onVerified();
    } catch (verificationError: unknown) {
      setError(verificationError instanceof Error ? verificationError.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const unavailable = factorState === "error";
  const noFactor = factorState === "missing";

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <div className="text-muted-foreground/50">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-[16px] font-semibold tracking-tight">Two-Factor Authentication</h2>
        <p className="text-sm text-muted-foreground text-center">
          {factorState === "checking"
            ? "Verifying your authenticator status…"
            : noFactor
              ? "We couldn't find a verified authenticator app linked to your account."
              : unavailable
                ? "Your authenticator status could not be verified."
                : "Enter the 6-digit code from your authenticator app"}
        </p>
      </div>

      {factorState === "checking" ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : noFactor ? (
        <div className="space-y-4">
          <p className="text-sm text-destructive text-center">
            No verified authenticator factor was found for this account. Please sign out and sign back in to re-enroll if your organisation requires MFA.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all"
          >
            Sign out
          </button>
        </div>
      ) : unavailable ? (
        <div className="space-y-4">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <button
            type="button"
            onClick={() => void checkFactor()}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all"
          >
            Retry security check
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground text-center text-2xl font-mono tracking-[0.5em] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6 || locked}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
            >
              {locked ? "Locked" : loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verify"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Not your account? Sign out
          </button>
        </>
      )}
    </div>
  );
};

export default MFAChallenge;

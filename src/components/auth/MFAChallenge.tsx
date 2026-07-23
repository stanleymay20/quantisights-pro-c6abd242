import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";

interface MFAChallengeProps {
  onVerified: () => void;
}

const MAX_MFA_ATTEMPTS = 5;

const MFAChallenge = ({ onVerified }: MFAChallengeProps) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [noFactor, setNoFactor] = useState(false);
  const attempts = useRef(0);

  // Proactively check for an enrolled factor on mount rather than waiting for
  // the user to submit a code against a factor that doesn't exist. This can
  // happen if Supabase reports nextLevel=aal2 but the factor was since removed,
  // or on a transient AAL-check error in ProtectedRoute that routes here even
  // for users who never enrolled MFA at all.
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const hasFactor = (data?.totp ?? []).some(f => f.status === "verified");
      if (!hasFactor) setNoFactor(true);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
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
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.[0];
      if (!totpFactor) {
        setError("No TOTP factor found.");
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <div className="text-muted-foreground/50">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-[16px] font-semibold tracking-tight">Two-Factor Authentication</h2>
        <p className="text-sm text-muted-foreground text-center">
          {noFactor
            ? "We couldn't find an authenticator app linked to your account."
            : "Enter the 6-digit code from your authenticator app"}
        </p>
      </div>

      {noFactor ? (
        <div className="space-y-4">
          <p className="text-sm text-destructive text-center">
            No verified authenticator factor was found for this account. This can happen if 2FA was removed elsewhere. Please sign out and sign back in to re-enroll.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all"
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
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
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
            onClick={handleSignOut}
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

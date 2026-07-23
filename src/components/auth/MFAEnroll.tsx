import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldOff, Loader2, QrCode, CheckCircle2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MFAEnrollProps {
  onStatusChange?: () => void;
}

const MFAEnroll = ({ onStatusChange }: MFAEnrollProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "enrolling" | "verifying" | "enrolled">("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState(false);

  // Check MFA status — exposed standalone so the error-state Retry button can call it
  const loadMfaStatus = async () => {
    setChecking(true);
    setCheckError(false);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.filter((f) => f.status === "verified") || [];
      setMfaEnabled(verified.length > 0);
    } catch (e: unknown) {
      // On error, leave mfaEnabled as null (unknown) and surface an explicit
      // retry state — never assume MFA is disabled, which could mask an
      // active MFA enrollment and prompt the user to "set up" something
      // that's already protecting their account.
      console.error("[MFAEnroll] Factor check failed:", e instanceof Error ? e.message : e);
      setMfaEnabled(null);
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadMfaStatus();
  }, []);

  const startEnrollment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Quantivis",
        friendlyName: "Quantivis TOTP",
      });
      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("enrolling");
    } catch (err: unknown) {
      toast({ title: "Enrollment failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const verifyEnrollment = async () => {
    setLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      setStep("enrolled");
      setMfaEnabled(true);
      onStatusChange?.();
      toast({ title: "2FA Enabled", description: "Two-factor authentication is now active on your account." });
    } catch (err: unknown) {
      toast({ title: "Verification failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const disableMFA = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factors = data?.totp || [];
      for (const factor of factors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      setMfaEnabled(false);
      setStep("idle");
      onStatusChange?.();
      toast({ title: "2FA Disabled", description: "Two-factor authentication has been removed." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (checkError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            Two-Factor Authentication (TOTP)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            We couldn't verify your 2FA status right now. If you previously enabled 2FA, it's still active — this is just a connectivity issue with this check.
          </p>
          <Button variant="outline" size="sm" onClick={loadMfaStatus} className="gap-2">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Two-Factor Authentication (TOTP)
          {mfaEnabled && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mfaEnabled && step !== "enrolling" ? (
          <>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">2FA is enabled</p>
                <p className="text-xs text-muted-foreground">Your account is protected with an authenticator app.</p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <ShieldOff className="w-4 h-4" /> Disable 2FA
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reduce your account security. You can re-enable it at any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={disableMFA} className="bg-destructive text-destructive-foreground">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Disable 2FA
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : step === "enrolling" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
            </p>
            <div className="flex justify-center p-4 bg-white rounded-lg w-fit mx-auto">
              <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Can't scan? Enter this secret manually:</p>
              <code className="block p-2 rounded bg-muted text-xs font-mono break-all select-all">{secret}</code>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Enter verification code</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="text-center text-lg font-mono tracking-widest"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep("idle"); setCode(""); }} className="flex-1">
                Cancel
              </Button>
              <Button onClick={verifyEnrollment} disabled={loading || code.length !== 6} className="flex-1 gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Verify & Enable
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Add an extra layer of security to your account by requiring a one-time code from an authenticator app during login.
            </p>
            <Button onClick={startEnrollment} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Set Up 2FA
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MFAEnroll;

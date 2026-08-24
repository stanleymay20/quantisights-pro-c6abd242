import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const BackupPassword = () => {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const saveBackupPassword = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Password is too short",
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters for the backup credential.`,
        variant: "destructive",
      });
      return;
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      toast({
        title: "Password is too long",
        description: `Use no more than ${MAX_PASSWORD_LENGTH} characters.`,
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Re-enter the same password in both fields.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    setReady(false);
    try {
      // Read the authenticated identity immediately before credential mutation.
      // The continuity check below ensures this operation can never be treated as
      // account creation or migration by the UI.
      const { data: currentUser, error: currentUserError } = await supabase.auth.getUser();
      if (currentUserError) throw currentUserError;
      if (!currentUser.user) throw new Error("No authenticated user. Sign in again before changing credentials.");

      const { data: updatedUser, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (!updatedUser.user || updatedUser.user.id !== currentUser.user.id) {
        throw new Error("Identity continuity verification failed. No backup credential was confirmed.");
      }

      setPassword("");
      setConfirmPassword("");
      setReady(true);
      toast({
        title: "Backup sign-in password updated",
        description: "Your existing Quantivis identity now has an independent password sign-in path.",
      });
    } catch (error: unknown) {
      toast({
        title: "Backup password was not updated",
        description: error instanceof Error ? error.message : "Please sign in again and retry.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Sign-in resilience</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Set or rotate a backup password so you can still access the same Quantivis account if Google or another SSO provider is unavailable. This updates your existing Supabase identity and does not create another account.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="backup-password">Backup password</Label>
          <Input
            id="backup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            disabled={saving}
            placeholder="At least 12 characters"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="backup-password-confirm">Confirm password</Label>
          <Input
            id="backup-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            disabled={saving}
            placeholder="Repeat backup password"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={saveBackupPassword}
          disabled={saving || !password || !confirmPassword}
          className="gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {saving ? "Updating…" : "Set or rotate backup password"}
        </Button>
        {ready && (
          <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Backup credential ready for a fresh sign-in test.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Credential changes are handled by Supabase Auth. Quantivis never stores the password in application tables or logs. If you already use an email/password credential, this action rotates that password.
      </p>
    </div>
  );
};

export default BackupPassword;

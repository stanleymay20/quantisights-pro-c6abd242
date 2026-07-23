import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthEvents } from "@/hooks/useAuthEvents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Fingerprint, Plus, Trash2, Loader2, ShieldCheck, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface PasskeyCredential {
  id: string;
  credential_id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

const PasskeyManagement = () => {
  const { user } = useAuth();
  const { logAuthEvent } = useAuthEvents();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  const { data: passkeys = [], isLoading } = useQuery({
    queryKey: ["passkeys", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("webauthn_credentials")
        .select("id, credential_id, device_name, created_at, last_used_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data as unknown as PasskeyCredential[]) ?? [];
    },
    enabled: !!user?.id,
  });

  const removePasskey = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("webauthn_credentials").delete().eq("id", id);
      logAuthEvent({ eventType: "passkey_remove", metadata: { credential_id: id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast({ title: "Passkey removed" });
    },
  });

  const handleEnroll = async () => {
    if (!user?.id || !window.PublicKeyCredential) {
      toast({ title: "WebAuthn not supported", description: "Your browser doesn't support passkeys.", variant: "destructive" });
      return;
    }

    setEnrolling(true);
    try {
      // Generate challenge via edge function
      const { data: challengeData, error: challengeError } = await supabase.functions.invoke("webauthn-ceremony", {
        body: { action: "register_challenge" },
      });

      if (challengeError || !challengeData?.challenge) {
        throw new Error("Failed to generate challenge");
      }

      // Create credential using Web Authentication API
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: Uint8Array.from(atob(challengeData.challenge), (c) => c.charCodeAt(0)),
          rp: { name: "Quantivis", id: window.location.hostname },
          user: {
            id: Uint8Array.from(user.id, (c) => c.charCodeAt(0)),
            name: user.email || "",
            displayName: user.email || "",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },  // ES256
            { alg: -257, type: "public-key" }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        },
      }) as PublicKeyCredential;

      if (!credential) throw new Error("Registration cancelled");

      const response = credential.response as AuthenticatorAttestationResponse;

      // Verify and store via edge function
      const { error: verifyError } = await supabase.functions.invoke("webauthn-ceremony", {
        body: {
          action: "register_verify",
          credential_id: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          attestation: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))),
          client_data: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
          device_name: deviceName || "Security Key",
          challenge_id: challengeData.challenge_id,
        },
      });

      if (verifyError) throw new Error("Verification failed");

      logAuthEvent({ eventType: "passkey_enroll", metadata: { device_name: deviceName } });
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast({ title: "Passkey enrolled", description: "Your passkey has been registered successfully." });
      setEnrollOpen(false);
      setDeviceName("");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast({ title: "Registration cancelled", variant: "destructive" });
      } else {
        toast({ title: "Passkey enrollment failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      }
    } finally {
      setEnrolling(false);
    }
  };

  const webAuthnSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-primary" />
          Passkeys & Security Keys
        </CardTitle>
        <Button
          size="sm"
          onClick={() => setEnrollOpen(true)}
          disabled={!webAuthnSupported}
        >
          <Plus className="w-4 h-4 mr-1" /> Add Passkey
        </Button>
      </CardHeader>
      <CardContent>
        {!webAuthnSupported && (
          <p className="text-sm text-muted-foreground mb-4">
            Your browser does not support WebAuthn/passkeys.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
          </div>
        ) : passkeys.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No passkeys registered. Add a passkey for phishing-resistant authentication.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Fingerprint className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{pk.device_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Added {formatDistanceToNow(new Date(pk.created_at), { addSuffix: true })}
                      {pk.last_used_at && (
                        <span>
                          · Last used {formatDistanceToNow(new Date(pk.last_used_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePasskey.mutate(pk.id)}
                  disabled={removePasskey.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-primary" />
              Register Passkey
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Device Name</Label>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. MacBook Pro, YubiKey"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You'll be prompted by your browser to complete registration using biometrics or a security key.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PasskeyManagement;

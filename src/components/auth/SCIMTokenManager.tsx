import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Users, Plus, Trash2, Loader2, Copy, Clock, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface SCIMToken {
  id: string;
  description: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const SCIMTokenManager = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["scim-tokens", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase
        .from("scim_tokens")
        .select("id, description, created_at, last_used_at, revoked_at")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false });
      return (data as unknown as SCIMToken[]) ?? [];
    },
    enabled: !!currentOrgId,
  });

  const createToken = useMutation({
    mutationFn: async () => {
      if (!currentOrgId || !user?.id) throw new Error("Missing context");
      // Generate a cryptographically random token
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");

      // Hash for storage
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
      const tokenHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

      await supabase.from("scim_tokens").insert({
        organization_id: currentOrgId,
        token_hash: tokenHash,
        description: description || "SCIM Token",
        created_by: user.id,
      });

      return token;
    },
    onSuccess: (token) => {
      setGeneratedToken(token);
      queryClient.invalidateQueries({ queryKey: ["scim-tokens"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to create token", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("scim_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scim-tokens"] });
      toast({ title: "SCIM token revoked" });
    },
  });

  const activeTokens = tokens.filter((t) => !t.revoked_at);
  const scimEndpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scim-provision`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          SCIM Provisioning
        </CardTitle>
        <Button size="sm" onClick={() => { setCreateOpen(true); setGeneratedToken(null); setDescription(""); }}>
          <Plus className="w-4 h-4 mr-1" /> Generate Token
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">SCIM Endpoint URL</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded border flex-1 truncate">
              {scimEndpoint}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(scimEndpoint); toast({ title: "Copied" }); }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure this URL in your IdP (Okta, Entra ID, OneLogin) as the SCIM base URL.
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : activeTokens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active SCIM tokens. Generate a token to enable IdP provisioning.
          </p>
        ) : (
          <div className="space-y-2">
            {activeTokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">{token.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Clock className="w-3 h-3" />
                    Created {formatDistanceToNow(new Date(token.created_at), { addSuffix: true })}
                    {token.last_used_at && (
                      <span>· Last used {formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true })}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeToken.mutate(token.id)}
                  disabled={revokeToken.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate SCIM Token</DialogTitle>
            <DialogDescription>
              This token allows your IdP to provision and deprovision users automatically.
            </DialogDescription>
          </DialogHeader>

          {generatedToken ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive mb-2">
                  ⚠️ Copy this token now. It won't be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-background px-2 py-1 rounded border flex-1 break-all">
                    {generatedToken}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedToken);
                      toast({ title: "Token copied" });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Okta SCIM Integration"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => createToken.mutate()} disabled={createToken.isPending}>
                  {createToken.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Generate
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SCIMTokenManager;

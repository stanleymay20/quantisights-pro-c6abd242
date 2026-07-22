import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Code2, Copy, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const EmbedManager = () => {
  const { user } = useAuth();
  const { currentOrg: organization } = useOrganization();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["embed-tokens", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("embed_tokens")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const createToken = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id) throw new Error("Missing context");
      const { data, error } = await supabase
        .from("embed_tokens")
        .insert({ organization_id: organization.id, created_by: user.id, dashboard_type: "kpi_overview" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embed-tokens"] });
      toast.success("Embed token created");
      setCreating(false);
    },
  });

  const deleteToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("embed_tokens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embed-tokens"] });
      toast.success("Token deleted");
    },
  });

  const copyEmbed = (token: string) => {
    const url = `${window.location.origin}/embed?token=${token}`;
    const iframe = `<iframe src="${url}" width="100%" height="600" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(iframe);
    toast.success("Embed code copied to clipboard");
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              Embeddable Dashboards
            </CardTitle>
            <CardDescription>Create embed tokens to share dashboards externally</CardDescription>
          </div>
          <Button size="sm" onClick={() => createToken.mutate()} disabled={createToken.isPending}>
            <Plus className="w-4 h-4 mr-1" />
            New Token
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse h-20 bg-muted/20 rounded" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No embed tokens yet</p>
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => {
              const tk = t as { id: string; is_active: boolean; dashboard_type: string; token: string };
              return (
              <div key={tk.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-border/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={tk.is_active ? "default" : "secondary"}>
                      {tk.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{tk.dashboard_type}</span>
                  </div>
                  <Input
                    readOnly
                    value={`${window.location.origin}/embed?token=${tk.token}`}
                    className="text-xs h-7 bg-background/50 font-mono"
                  />
                </div>
                <div className="flex gap-1 ml-3">
                  <Button size="icon" variant="ghost" aria-label="Copy embed code" onClick={() => copyEmbed(tk.token)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Delete embed token" onClick={() => deleteToken.mutate(tk.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

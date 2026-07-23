import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield, LogIn, LogOut, Key, Fingerprint, AlertTriangle,
  UserX, UserPlus, Settings, ShieldX, Lock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const EVENT_CONFIG: Record<string, { icon: typeof Shield; label: string; severity: "default" | "destructive" | "secondary" | "outline" }> = {
  login: { icon: LogIn, label: "Login", severity: "default" },
  logout: { icon: LogOut, label: "Logout", severity: "secondary" },
  failed_login: { icon: AlertTriangle, label: "Failed Login", severity: "destructive" },
  mfa_enroll: { icon: Key, label: "MFA Enrolled", severity: "default" },
  mfa_verify: { icon: Key, label: "MFA Verified", severity: "secondary" },
  mfa_challenge_fail: { icon: AlertTriangle, label: "MFA Failed", severity: "destructive" },
  sso_login: { icon: Shield, label: "SSO Login", severity: "default" },
  session_revoke: { icon: ShieldX, label: "Session Revoked", severity: "destructive" },
  password_reset: { icon: Lock, label: "Password Reset", severity: "outline" },
  password_change: { icon: Lock, label: "Password Changed", severity: "outline" },
  step_up_auth: { icon: Shield, label: "Step-up Auth", severity: "secondary" },
  step_up_fail: { icon: AlertTriangle, label: "Step-up Failed", severity: "destructive" },
  passkey_enroll: { icon: Fingerprint, label: "Passkey Added", severity: "default" },
  passkey_login: { icon: Fingerprint, label: "Passkey Login", severity: "default" },
  passkey_remove: { icon: Fingerprint, label: "Passkey Removed", severity: "outline" },
  account_delete: { icon: UserX, label: "Account Deleted", severity: "destructive" },
  role_change: { icon: Settings, label: "Role Changed", severity: "outline" },
  scim_provision: { icon: UserPlus, label: "SCIM Provisioned", severity: "default" },
  scim_deprovision: { icon: UserX, label: "SCIM Deprovisioned", severity: "destructive" },
};

const AuthEventLog = () => {
  const { currentOrgId } = useOrganization();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["auth-events", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      // Schema-gap note: auth_events IS in generated types, but query builder
      // types may not resolve correctly here. Cast is safe — table schema matches.
      const { data } = await supabase
        .from("auth_events")
        .select("*")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as Array<{ id: string; event_type: string; risk_score: number | null; created_at: string; ip_address: string | null; metadata: any | null }>;
    },
    enabled: !!currentOrgId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Auth Event Log</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Authentication Event Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No auth events recorded yet.
          </p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {events.map((event) => {
                const config = EVENT_CONFIG[event.event_type as string] || {
                  icon: Shield, label: event.event_type, severity: "secondary" as const,
                };
                const Icon = config.icon;
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={config.severity} className="text-[10px]">
                            {config.label}
                          </Badge>
                          {event.risk_score != null && event.risk_score > 50 && (
                            <Badge variant="destructive" className="text-[10px]">
                              Risk: {event.risk_score}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                          {event.ip_address && ` · ${event.ip_address}`}
                        </p>
                      </div>
                    </div>
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {JSON.stringify(event.metadata).slice(0, 80)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AuthEventLog;

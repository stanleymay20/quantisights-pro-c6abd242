import { useSessionManager } from "@/hooks/useSessionManager";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Monitor, Smartphone, Globe, Clock, ShieldX, ShieldCheck, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const DeviceIcon = ({ ua }: { ua: string | null }) => {
  if (ua?.includes("iPhone") || ua?.includes("Android") || ua?.includes("iPad"))
    return <Smartphone className="w-5 h-5 text-primary" />;
  return <Monitor className="w-5 h-5 text-primary" />;
};

// user_sessions rows are only updated by a 5-minute heartbeat ping while the
// tab is open, and otherwise only cleared by explicit revoke — there is no
// expiry-based cleanup job. A row can sit here for months looking like a
// live, revocable session long after Supabase's actual refresh token for it
// has expired. 30 days is well beyond any realistic refresh-token lifetime,
// so anything older is almost certainly already dead; flag it rather than
// present it with the same confidence as a genuinely active session.
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
const isLikelyExpired = (lastActiveAt: string) =>
  Date.now() - new Date(lastActiveAt).getTime() > STALE_THRESHOLD_MS;

const SessionManagement = () => {
  const {
    activeSessions, revokedSessions, isLoading,
    revokeSession, revokeAllOtherSessions, isRevoking,
    parseDeviceName, parseBrowser,
  } = useSessionManager();
  const { orgRole } = usePermissions();
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Active Sessions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const isCurrentSession = (ua: string | null) => ua === navigator.userAgent;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Active Sessions ({activeSessions.length})
          </CardTitle>
          {activeSessions.length > 1 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => revokeAllOtherSessions()}
              disabled={isRevoking}
            >
              {isRevoking ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldX className="w-4 h-4 mr-1" />}
              Revoke All Others
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activeSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          ) : (
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <DeviceIcon ua={session.user_agent} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {session.device_name || parseDeviceName(session.user_agent)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {parseBrowser(session.user_agent)}
                        </span>
                        {isCurrentSession(session.user_agent) && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Current
                          </Badge>
                        )}
                        {!isCurrentSession(session.user_agent) && isLikelyExpired(session.last_active_at) && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-muted-foreground/30">
                            Likely expired
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3" />
                        Last active {formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true })}
                        {session.ip_address && (
                          <>
                            <Globe className="w-3 h-3 ml-1" />
                            {session.ip_address}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isCurrentSession(session.user_agent) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeSession(session.id)}
                      disabled={isRevoking}
                      className="text-destructive hover:text-destructive"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {activeSessions.some((s) => !isCurrentSession(s.user_agent) && isLikelyExpired(s.last_active_at)) && (
        <p className="text-xs text-muted-foreground/70 px-1">
          Sessions marked "Likely expired" haven't checked in for 30+ days. Their underlying login token has almost certainly already expired on its own — Revoke removes the row from this list, but isn't required for security.
        </p>
      )}

      {isAdmin && revokedSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Recently Revoked ({revokedSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revokedSessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-dashed opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <DeviceIcon ua={session.user_agent} />
                    <div>
                      <span className="text-sm line-through">
                        {session.device_name || parseDeviceName(session.user_agent)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Revoked {formatDistanceToNow(new Date(session.revoked_at!), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
                    Revoked
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SessionManagement;

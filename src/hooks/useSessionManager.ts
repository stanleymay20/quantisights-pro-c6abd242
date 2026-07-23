import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuthEvents } from "@/hooks/useAuthEvents";
import { useCallback, useEffect } from "react";
import type { Database } from "@/integrations/supabase/types";

type UserSessionRow = Database["public"]["Tables"]["user_sessions"]["Row"];

export interface UserSession {
  id: string;
  user_id: string;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  last_active_at: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

function parseDeviceName(ua: string | null): string {
  if (!ua) return "Unknown Device";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android Device";
  if (ua.includes("Mac OS")) return "Mac";
  if (ua.includes("Windows")) return "Windows PC";
  if (ua.includes("Linux")) return "Linux";
  return "Browser";
}

function parseBrowser(ua: string | null): string {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Other";
}

function toUserSession(row: UserSessionRow): UserSession {
  return {
    id: row.id,
    user_id: row.user_id,
    device_name: row.device_name,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    last_active_at: row.last_active_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
  };
}

export function useSessionManager() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { logAuthEvent } = useAuthEvents();
  const queryClient = useQueryClient();

  // Register/update current session on mount
  useEffect(() => {
    if (!user?.id || !currentOrgId) return;
    const upsertSession = async () => {
      const { data: existing } = await supabase
        .from("user_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("user_agent", navigator.userAgent)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("user_sessions")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", existing[0].id);
      } else {
        await supabase.from("user_sessions").insert({
          user_id: user.id,
          organization_id: currentOrgId,
          user_agent: navigator.userAgent,
          device_name: parseDeviceName(navigator.userAgent),
        });
      }
    };
    upsertSession();
  }, [user?.id, currentOrgId]);

  // Heartbeat: update last_active_at periodically
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(async () => {
      await supabase
        .from("user_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("user_agent", navigator.userAgent)
        .is("revoked_at", null);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Fetch all sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["user-sessions", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("organization_id", currentOrgId)
        .order("last_active_at", { ascending: false });
      return (data ?? []).map(toUserSession);
    },
    enabled: !!user?.id && !!currentOrgId,
    refetchInterval: 30000,
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), revoked_by: user?.id })
        .eq("id", sessionId);
      logAuthEvent({
        eventType: "session_revoke",
        metadata: { revoked_session_id: sessionId },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-sessions"] }),
  });

  const revokeAllOtherSessions = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { data: otherSessions } = await supabase
        .from("user_sessions")
        .select("id")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .neq("user_agent", navigator.userAgent);

      if (otherSessions) {
        for (const s of otherSessions) {
          await supabase
            .from("user_sessions")
            .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
            .eq("id", s.id);
        }
      }
      logAuthEvent({
        eventType: "session_revoke",
        metadata: { action: "revoke_all_other" },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-sessions"] }),
  });

  const activeSessions = sessions.filter((s) => !s.revoked_at);
  const revokedSessions = sessions.filter((s) => !!s.revoked_at);

  return {
    sessions,
    activeSessions,
    revokedSessions,
    isLoading,
    revokeSession: revokeSession.mutate,
    revokeAllOtherSessions: revokeAllOtherSessions.mutate,
    isRevoking: revokeSession.isPending || revokeAllOtherSessions.isPending,
    parseDeviceName,
    parseBrowser,
  };
}

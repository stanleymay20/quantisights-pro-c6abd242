import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NotificationItem {
  id: string;
  message: string;
  severity: string;
  category: string | null;
  is_read: boolean;
  created_at: string;
  confidence_score?: number | null;
  raw_confidence?: number | null;
  capped_confidence?: number | null;
  confidence_cap_reason?: string | null;
}

const PAGE_LIMIT = 20;

function severityRank(severity: string) {
  if (["critical", "high"].includes(severity)) return 0;
  if (["medium", "warning"].includes(severity)) return 1;
  if (["low", "info"].includes(severity)) return 2;
  return 3;
}

export function useNotifications(orgId: string | null, datasetId: string | null) {
  const queryClient = useQueryClient();
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const queryKey = useMemo(() => ["notifications", orgId, datasetId], [orgId, datasetId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(orgId && datasetId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!orgId || !datasetId) return [] as NotificationItem[];

      const { data, error } = await supabase
        .from("insights")
        .select("id,message,severity,category,is_read,created_at,confidence_score,raw_confidence,capped_confidence,confidence_cap_reason")
        .eq("organization_id", orgId)
        .eq("dataset_id", datasetId)
        .order("is_read", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);

      if (error) throw error;

      return ((data ?? []) as NotificationItem[]).sort((a, b) => {
        const readDelta = Number(a.is_read) - Number(b.is_read);
        if (readDelta !== 0) return readDelta;
        const severityDelta = severityRank(a.severity) - severityRank(b.severity);
        if (severityDelta !== 0) return severityDelta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
  });

  useEffect(() => {
    if (!orgId || !datasetId) {
      setIsRealtimeConnected(false);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const uniq = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      channel = supabase
        .channel(`notifications:${orgId}:${datasetId}:${uniq}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "insights",
            filter: `organization_id=eq.${orgId}`,
          },
          (payload) => {
            const row = (payload.new ?? payload.old) as { dataset_id?: string } | null;
            if (row?.dataset_id && row.dataset_id !== datasetId) return;
            queryClient.invalidateQueries({ queryKey });
            queryClient.invalidateQueries({ queryKey: ["insights", orgId, datasetId] });
          },
        )
        .subscribe((status) => {
          setIsRealtimeConnected(status === "SUBSCRIBED");
        });
    } catch (err) {
      console.warn("[useNotifications] realtime subscribe failed:", err);
      setIsRealtimeConnected(false);
    }

    return () => {
      setIsRealtimeConnected(false);
      if (channel) { try { supabase.removeChannel(channel); } catch { /* noop */ } }
    };
  }, [datasetId, orgId, queryClient, queryKey]);

  const markRead = useCallback(async (notificationId: string) => {
    if (!orgId || !datasetId) return;

    const previous = queryClient.getQueryData<NotificationItem[]>(queryKey);
    queryClient.setQueryData<NotificationItem[]>(queryKey, (current = []) =>
      current.map((item) => item.id === notificationId ? { ...item, is_read: true } : item),
    );

    const { error } = await supabase
      .from("insights")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId);

    if (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }

    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["insights", orgId, datasetId] });
  }, [datasetId, orgId, queryClient, queryKey]);

  const markAllRead = useCallback(async () => {
    if (!orgId || !datasetId) return;

    const previous = queryClient.getQueryData<NotificationItem[]>(queryKey);
    queryClient.setQueryData<NotificationItem[]>(queryKey, (current = []) =>
      current.map((item) => ({ ...item, is_read: true })),
    );

    const { error } = await supabase
      .from("insights")
      .update({ is_read: true })
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId)
      .eq("is_read", false);

    if (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }

    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["insights", orgId, datasetId] });
  }, [datasetId, orgId, queryClient, queryKey]);

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const criticalUnreadCount = notifications.filter((item) => !item.is_read && ["critical", "high"].includes(item.severity)).length;

  return {
    notifications,
    unreadCount,
    criticalUnreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isRealtimeConnected,
    refetch: query.refetch,
    markRead,
    markAllRead,
  };
}

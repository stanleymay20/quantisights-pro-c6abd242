import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  CreditCard,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import OrgSwitcher from "@/components/dashboard/OrgSwitcher";
import ProjectSwitcher from "@/components/dashboard/ProjectSwitcher";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { embedInsightsBatch } from "@/lib/decision-lifecycle";
import { useToast } from "@/hooks/use-toast";
import { useNotifications, type NotificationItem } from "@/hooks/useNotifications";
import { useTranslation } from "react-i18next";
import HeaderLanguageSwitcher from "@/components/HeaderLanguageSwitcher";

interface Insight {
  category?: string;
  message?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface DashboardHeaderProps {
  organizations: { id: string; name: string; role: string }[];
  currentOrg: { id: string; name: string; role: string } | null;
  switchOrganization: (id: string) => void;
  displayName: string;
  email?: string;
  hasData: boolean;
  criticalInsights: Insight[];
  currentOrgId: string | null;
  activeDatasetId: string | null;
  onSignOut: () => void;
}

function severityClass(severity: string) {
  if (["critical", "high"].includes(severity)) return "text-destructive border-destructive/30 bg-destructive/10";
  if (["medium", "warning"].includes(severity)) return "text-warning border-warning/30 bg-warning/10";
  return "text-muted-foreground border-border bg-muted/40";
}

function formatRelativeTime(value: string) {
  const createdAt = new Date(value).getTime();
  const diffMs = Date.now() - createdAt;
  if (!Number.isFinite(createdAt) || diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function notificationTitle(item: NotificationItem) {
  return item.category?.replace(/_/g, " ") || `${item.severity || "Alert"} notification`;
}

export const DashboardHeader = ({
  organizations,
  currentOrg,
  switchOrganization,
  displayName,
  email,
  hasData,
  criticalInsights,
  currentOrgId,
  activeDatasetId,
  onSignOut,
}: DashboardHeaderProps) => {
  const [recalculating, setRecalculating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const {
    notifications,
    unreadCount,
    criticalUnreadCount,
    isLoading: notificationsLoading,
    isError: notificationsError,
    isRealtimeConnected,
    markRead,
    markAllRead,
    refetch: refetchNotifications,
  } = useNotifications(currentOrgId, activeDatasetId);

  const handleRecalculate = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) {
      toast({ title: "Select a dataset first", variant: "destructive" });
      return;
    }
    setRecalculating(true);
    try {
      await invokeWithRetry("generate-insights", {
        body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
      });
      embedInsightsBatch(currentOrgId);

      try {
        await invokeWithRetry("prescriptive-advisory", {
          body: { organization_id: currentOrgId, dataset_id: activeDatasetId, role_type: "ceo" },
        });
        await invokeWithRetry("auto-create-decisions", {
          body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
        });
      } catch {
        console.warn("[Dashboard] Advisory pipeline step failed");
      }

      toast({ title: "Analysis refreshed" });
      queryClient.invalidateQueries();
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  }, [currentOrgId, activeDatasetId, toast, queryClient]);

  const handleOpenNotification = useCallback(async (item: NotificationItem) => {
    try {
      if (!item.is_read) await markRead(item.id);
    } catch {
      toast({ title: "Could not mark notification as read", variant: "destructive" });
    }
    navigate("/decisions");
  }, [markRead, navigate, toast]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllRead();
      toast({ title: "Notifications marked as read" });
    } catch {
      toast({ title: "Could not mark notifications as read", variant: "destructive" });
    }
  }, [markAllRead, toast]);

  const fallbackUnread = criticalInsights.length;
  const displayUnread = activeDatasetId ? unreadCount : fallbackUnread;
  const hasUnread = displayUnread > 0;

  return (
    <header className="h-12 border-b border-border/30 flex items-center justify-between px-3 sm:px-6 shrink-0 bg-background/60 backdrop-blur-sm">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <SidebarMobileToggle />
        <OrgSwitcher organizations={organizations} currentOrg={currentOrg} onSwitch={switchOrganization} />
        <ProjectSwitcher />
      </div>
      <div className="flex items-center gap-1">
        {hasData && (
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all disabled:opacity-50"
            aria-label={recalculating ? t("header.analyzing") : t("header.refresh")}
          >
            <RefreshCw className={`w-3 h-3 ${recalculating ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{recalculating ? t("header.analyzing") : t("header.refresh")}</span>
          </button>
        )}

        <HeaderLanguageSwitcher />



        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 ml-1 pl-2 border-l border-border/30 hover:bg-secondary/40 rounded-lg px-2 py-1 transition-colors" aria-label="User menu">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="w-4 h-4 mr-2" /> {t("nav.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/billing")}>
              <CreditCard className="w-4 h-4 mr-2" /> {t("nav.billing")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/team")}>
              <Users className="w-4 h-4 mr-2" /> {t("nav.team")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive" data-testid="sign-out">
              <LogOut className="w-4 h-4 mr-2" /> {t("auth.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

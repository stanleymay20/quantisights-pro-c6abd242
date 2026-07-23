import { ChevronRight, Building2, FolderKanban, Database, Layers, Bell, BellRing, Check, ShieldCheck } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

import { useOrganization } from "@/hooks/useOrganization";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProject } from "@/contexts/ProjectContext";
import { useDataset } from "@/contexts/DatasetContext";
import { useNotifications, type NotificationItem } from "@/hooks/useNotifications";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Segment {
  icon: React.ElementType;
  label: string | null;
  fallback: string;
  onClick?: () => void;
}

const ContextChip = ({ icon: Icon, label, fallback, onClick }: Segment) => {
  const text = label || fallback || "";
  const isMissing = !label;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 text-[12px] font-normal transition-colors max-w-[140px] truncate cursor-pointer ${
              isMissing
                ? "text-muted-foreground/35 italic"
                : "text-muted-foreground hover:text-foreground hover:underline"
            }`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate">{text}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const Separator = () => <span className="text-muted-foreground/25 text-[13px] select-none px-0.5">/</span>;

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

const GlobalNotificationBell = ({ orgId, datasetId }: { orgId: string | null; datasetId: string | null }) => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    criticalUnreadCount,
    isLoading,
    isError,
    isRealtimeConnected,
    markRead,
    markAllRead,
    refetch,
  } = useNotifications(orgId, datasetId);

  const hasUnread = unreadCount > 0;

  const openNotification = async (item: NotificationItem) => {
    if (!item.is_read) {
      try { await markRead(item.id); } catch { /* surface stays usable */ }
    }
    navigate("/decisions");
  };

  return (
    <Popover onOpenChange={(open) => open && orgId && datasetId && refetch()}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-secondary/60 transition-colors"
          aria-label={hasUnread ? `${unreadCount} unread notifications` : "Notifications"}
        >
          {criticalUnreadCount > 0 ? <BellRing className="w-3.5 h-3.5 text-destructive" /> : <Bell className="w-3.5 h-3.5 text-muted-foreground" />}
          {hasUnread && (
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-[9px] leading-[15px] text-destructive-foreground font-bold text-center shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)] p-0">
        <div className="p-3 border-b border-border/30 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Notification Center</h4>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
              <span>{unreadCount} unread</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isRealtimeConnected ? "bg-success" : "bg-muted-foreground"}`} />
                {isRealtimeConnected ? "Live" : "Syncing"}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" disabled={!hasUnread} onClick={markAllRead} className="h-7 px-2 text-xs">
            <Check className="w-3.5 h-3.5" /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!orgId ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Select an organization to view notifications.</p>
          ) : !datasetId ? (
            <div className="p-6 text-center space-y-2">
              <Database className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No dataset selected</p>
              <p className="text-xs text-muted-foreground">Notifications become actionable after a dataset is selected.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/data-upload")}>Upload data</Button>
            </div>
          ) : isLoading ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Loading notifications…</p>
          ) : isError ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-sm text-destructive">Notifications could not be loaded</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-success mx-auto" />
              <p className="text-sm font-medium">No active notifications</p>
              <p className="text-xs text-muted-foreground">Quantivis will alert you when decisions, risks, or anomalies need attention.</p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openNotification(item)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openNotification(item); }}
                className={`px-3 py-3 border-b border-border/10 last:border-0 hover:bg-muted/40 transition-colors cursor-pointer ${!item.is_read ? "bg-primary/[0.03]" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.is_read ? "bg-muted" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate capitalize">{notificationTitle(item)}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(item.created_at)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{item.message}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] h-5 ${severityClass(item.severity)}`}>{item.severity}</Badge>
                      {item.capped_confidence != null && <Badge variant="secondary" className="text-[10px] h-5">{Math.round(item.capped_confidence)}% confidence</Badge>}
                      {!item.is_read && <Badge variant="secondary" className="text-[10px] h-5">Unread</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border/30 flex items-center justify-between">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate("/intelligence-inbox")}>View inbox</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate("/decisions")}>Review decisions</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const GlobalContextBar = () => {
  const location = useLocation();
  // Dashboard page has its own notification bell in DashboardHeader — hide here to avoid duplicate
  const isDashboard = location.pathname === "/dashboard";
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const { currentProject, activeDatasetId } = useProject();
  const { activeDataset } = useDataset();
  const navigate = useNavigate();

  return (
    <div className="h-10 border-b border-border/30 bg-background hidden md:flex items-center px-4 md:px-6 gap-0.5 shrink-0 overflow-x-auto scrollbar-hide">
      <ContextChip icon={Building2} label={currentOrg?.name?.replace(/\s+'/g, "'").replace(/'\s+/g, "'").trim() ?? null} fallback="No org" onClick={() => navigate("/settings")} />
      <Separator />
      <ContextChip icon={Layers} label={currentWorkspace?.name ?? null} fallback={currentOrg ? "Set up workspace" : "No workspace"} onClick={() => navigate("/settings")} />
      {currentProject?.name && <><Separator /><ContextChip icon={FolderKanban} label={currentProject.name} fallback={null} onClick={() => navigate("/settings")} /></>}
      {activeDataset?.name && <><Separator /><ContextChip icon={Database} label={activeDataset.name} fallback={null} onClick={() => navigate("/data-upload")} /></>}
      {!currentProject?.name && !activeDataset?.name && (
        <><Separator /><span className="text-[11px] text-muted-foreground/50 italic px-1">Decision context</span></>
      )}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {!isDashboard && (
          <GlobalNotificationBell orgId={currentOrg?.id ?? null} datasetId={activeDatasetId ?? null} />
        )}
      </div>
    </div>
  );
};

export default GlobalContextBar;

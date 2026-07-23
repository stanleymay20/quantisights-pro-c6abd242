/**
 * MobileTabBar
 *
 * Bottom navigation bar for screens < 768px.
 * Replaces the hamburger → drawer pattern on mobile with a persistent 5-tab bar.
 *
 * Phase 5 — IA v1.1 Section 7: Mobile Navigation Strategy.
 *
 * Tab layout:
 *   Dashboard · Decisions · Operations · Reports · More
 *
 * "More" opens a slide-up drawer containing:
 *   Reports · Monitor · Governance · Team · Settings
 *
 * The bar is hidden on desktop (>= 768px).
 * It respects the safe-area-inset-bottom for notched devices.
 *
 * Role filtering: hides tabs for paths not in the user's allowedPaths.
 */

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessageSquareText, ClipboardList,
  Target, MoreHorizontal, X,
  FileText, BarChart2, Shield, Users, Settings, Upload, Plug, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoleNav } from "@/hooks/useRoleNav";

interface TabItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

// UX-1 primary tabs aligned with desktop executive sidebar
const PRIMARY_TABS: TabItem[] = [
  { icon: LayoutDashboard,   label: "Dashboard", path: "/dashboard" },
  { icon: ClipboardList,     label: "Decisions", path: "/decisions" },
  { icon: Target,            label: "Operations",path: "/outcomes" },
  { icon: FileText,          label: "Reports",   path: "/reports" },
];

// "More" reveals settings, governed AI help, and power-user pages
const MORE_ITEMS: TabItem[] = [
  { icon: Settings,  label: "Settings",    path: "/settings" },
  { icon: MessageSquareText, label: "Ask Quantivis", path: "/app/copilot" },
  { icon: Users,     label: "Team",        path: "/team" },
  { icon: Upload,    label: "Data",        path: "/data-upload" },
  { icon: Shield,    label: "Governance",  path: "/governance" },
  { icon: BarChart2, label: "Monitor",     path: "/executive-intelligence" },
  { icon: Activity,  label: "System Health",path: "/system-health" },
];

const MobileTabBar = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { orgRole } = usePermissions();
  const allowedPaths = useRoleNav(orgRole as any);

  // Only render on mobile
  if (!isMobile) return null;

  // Primary tabs filter by role's allowedPaths; MORE items always shown
  // (route-level guards enforce access). Viewer keeps a clean shell anyway.
  const visibleTabs = PRIMARY_TABS.filter(t => allowedPaths.has(t.path));
  const visibleMore = orgRole === "viewer" ? [] : MORE_ITEMS;
  const showMore = visibleMore.length > 0;

  // Check if current path is in the "More" drawer
  const moreActive = MORE_ITEMS.some(t => location.pathname === t.path);

  return (
    <>
      {/* More drawer overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer */}
      {moreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More navigation options"
          className="fixed bottom-[56px] left-0 right-0 z-50 bg-background border-t border-border/50 rounded-t-2xl shadow-xl pb-2"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <span className="text-sm font-semibold text-foreground">More</span>
            <button
              onClick={() => setMoreOpen(false)}
              className="p-1 rounded-lg hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-3">
            {visibleMore.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch h-14">
          {visibleTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 w-1 h-1 rounded-full bg-primary mb-1" />
                )}
              </Link>
            );
          })}

          {/* More tab */}
          {showMore && (
            <button
              onClick={() => setMoreOpen(p => !p)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                (moreOpen || moreActive)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="More navigation options"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};

export default MobileTabBar;

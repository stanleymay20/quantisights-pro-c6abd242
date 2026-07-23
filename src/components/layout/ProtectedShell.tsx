import { ReactNode } from "react";
import DashboardSidebar, { SidebarMobileToggle } from "@/components/dashboard/DashboardSidebar";
import GlobalContextBar from "@/components/layout/GlobalContextBar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

export { SidebarMobileToggle };

/**
 * Unified UI shell for all protected routes.
 *
 * Desktop (>= 768px):
 *   Left sidebar + GlobalContextBar + page content.
 *
 * Mobile (< 768px):
 *   No sidebar (hidden). MobileTabBar fixed at bottom.
 *   GlobalContextBar still shown at top.
 *   Page content gets pb-16 to clear the tab bar.
 *
 * Phase 5 — IA v1.1 Section 7: Mobile Navigation Strategy.
 */
const ProtectedShell = ({ children }: { children: ReactNode }) => {
  const isMobile = useIsMobile();
  useIdleTimeout(); // enforces org-configured idle timeout → auto signOut

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Skip to main content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Sidebar — desktop only */}
      {!isMobile && <DashboardSidebar />}

      {/* Mobile sidebar overlay (hamburger-triggered) — still available */}
      {isMobile && <DashboardSidebar />}

      <div className="flex-1 flex flex-col min-h-dvh overflow-hidden">
        <GlobalContextBar />
        <main
          id="main-content"
          role="main"
          className={`flex-1 overflow-y-auto${isMobile ? " pb-16" : ""}`}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <MobileTabBar />
    </div>
  );
};

export default ProtectedShell;

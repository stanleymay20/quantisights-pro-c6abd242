import { Suspense, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { DatasetProvider } from "@/contexts/DatasetContext";
import { SidebarProvider } from "@/components/dashboard/DashboardSidebar";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import RouteErrorFallback from "@/components/RouteErrorFallback";
import { ThemeProvider } from "@/components/ThemeProvider";
import ProtectedLayout, { MinimalProtectedLayout } from "@/components/layout/ProtectedLayout";
import CookieConsent from "@/components/CookieConsent";
import SessionTimeout from "@/components/auth/SessionTimeout";
import UpgradeModalProvider from "@/components/UpgradeModalProvider";
import { routes, RouteLayout } from "@/routes";
import PublicPageNav from "@/components/layout/PublicPageNav";
import PageMetadata from "@/components/PageMetadata";
import { metadataForPath } from "@/lib/page-metadata";

// ═══════════════════════════════════════════════════════
// QUERY CLIENT — production-hardened defaults
// ═══════════════════════════════════════════════════════
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-dvh items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/** Route-level error boundary wrapper */
const SafeRoute = ({ children }: { children: ReactNode }) => (
  <RouteErrorBoundary fallback={(props) => <RouteErrorFallback {...props} />}>
    {children}
  </RouteErrorBoundary>
);

/** Providers stack for all protected routes */
const Providers = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <SidebarProvider>
      <WorkspaceProvider>
        <ProjectProvider>
          <DatasetProvider>
            {children}
          </DatasetProvider>
        </ProjectProvider>
      </WorkspaceProvider>
    </SidebarProvider>
  </ProtectedRoute>
);

/** Full shell: providers + sidebar + context bar + error boundary */
const P = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <ProtectedLayout>
      <SafeRoute>{children}</SafeRoute>
    </ProtectedLayout>
  </Providers>
);

/** Minimal: providers only (no sidebar/context bar) — for Onboarding, BoardReport */
const PMinimal = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <MinimalProtectedLayout>
      <SafeRoute>{children}</SafeRoute>
    </MinimalProtectedLayout>
  </Providers>
);

/** Layout wrapper factory */
const wrapLayout: Record<RouteLayout, (el: React.ReactNode) => React.ReactNode> = {
  none: (el) => el,
  public: (el) => (
    <SafeRoute>
      <PublicPageNav />
      {el}
    </SafeRoute>
  ),
  full: (el) => <P>{el}</P>,
  minimal: (el) => <PMinimal>{el}</PMinimal>,
};

const RouteMetadata = () => {
  const { pathname } = useLocation();
  const metadata = metadataForPath(pathname);
  return metadata ? <PageMetadata key={pathname} metadata={metadata} /> : null;
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <RouteMetadata />
          <AuthProvider>
            <CookieConsent />
            <SessionTimeout />
            <UpgradeModalProvider />
            <Suspense fallback={<PageLoader />}>
            <Routes>
              {routes.map(({ path, element, layout }) => (
                <Route key={path} path={path} element={wrapLayout[layout](element)} />
              ))}
            </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDataset } from "@/contexts/DatasetContext";
import { useMetricsSummary } from "@/hooks/useMetricsSummary";
import { useInsights } from "@/hooks/useInsights";
import { filterCriticalInsights } from "@/lib/insight-filters";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import ExecutiveDailyDriver from "@/components/dashboard/ExecutiveDailyDriver";
import WelcomeFlow from "@/components/dashboard/WelcomeFlow";
import DemoBanner from "@/components/dashboard/DemoBanner";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

const Dashboard = () => {
  const { user, profile, signOut } = useAuth();
  const { organizations, currentOrgId, currentOrg, switchOrganization, loading: orgLoading } = useOrganization();
  const { currentWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { loading: projectLoading } = useProject();
  // Never scope dashboard data from projects.active_dataset_id directly. The
  // DatasetContext ID exists only after the project_datasets link has been
  // verified for the active project.
  const { activeDatasetId, loading: datasetLoading } = useDataset();

  const {
    topMetrics, hasData, loading: metricsLoading,
  } = useMetricsSummary(currentOrgId, activeDatasetId);

  const { insights, loading: insightsLoading } = useInsights(currentOrgId, activeDatasetId);
  const navigate = useNavigate();

  const rawEmailPrefix = user?.email?.split("@")[0] ?? "";
  const formattedEmailName = rawEmailPrefix
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const displayName = profile?.full_name || formattedEmailName || "User";
  const isDemoUser = Boolean(user?.user_metadata?.is_demo);

  const [pendingDecisions, setPendingDecisions] = useState(0);
  const decisionSyncRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (orgLoading || !currentOrgId) return;
    const cacheKey = `onboarding_checked_${currentOrgId}`;
    if (sessionStorage.getItem(cacheKey) === "done") return;

    const checkOnboarding = async () => {
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("onboarding_completed")
          .eq("id", currentOrgId)
          .maybeSingle();
        if (error) {
          console.warn("[Dashboard] Onboarding check failed:", error.message);
          sessionStorage.setItem(cacheKey, "done");
          return;
        }
        if (data && !data.onboarding_completed) {
          navigate("/onboarding", { replace: true });
        } else {
          sessionStorage.setItem(cacheKey, "done");
        }
      } catch (error) {
        console.warn("[Dashboard] Onboarding check threw:", error);
        sessionStorage.setItem(cacheKey, "done");
      }
    };
    void checkOnboarding();
  }, [currentOrgId, orgLoading, navigate]);

  const refreshDecisionStats = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) {
      setPendingDecisions(0);
      return;
    }

    const { count, error } = await supabase
      .from("decision_ledger")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", currentOrgId)
      .filter("dataset_id", "eq", activeDatasetId)
      .eq("execution_status", "not_started")
      .eq("is_suppressed", false);

    if (error) {
      console.warn("[Dashboard] Pending-decision count failed:", error.message);
      setPendingDecisions(0);
      return;
    }
    setPendingDecisions(count ?? 0);
  }, [currentOrgId, activeDatasetId]);

  useEffect(() => {
    void refreshDecisionStats();
  }, [refreshDecisionStats]);

  const criticalInsights = useMemo(() => filterCriticalInsights(insights), [insights]);

  useEffect(() => {
    if (!currentOrgId || !activeDatasetId || insightsLoading) return;
    if (criticalInsights.length === 0) return;

    const syncKey = `${currentOrgId}:${activeDatasetId}:${criticalInsights.map((i) => i.id).sort().join("|")}`;
    if (decisionSyncRef.current.has(syncKey)) return;
    decisionSyncRef.current.add(syncKey);

    invokeWithRetry("auto-create-decisions", {
      body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
    })
      .then((result) => {
        if (result.error) {
          console.warn("[Dashboard] auto-create-decisions sync failed", result.error);
          decisionSyncRef.current.delete(syncKey);
          return;
        }
        void refreshDecisionStats();
      })
      .catch((error) => {
        console.warn("[Dashboard] auto-create-decisions sync threw", error);
        decisionSyncRef.current.delete(syncKey);
      });
  }, [activeDatasetId, criticalInsights, currentOrgId, insightsLoading, refreshDecisionStats]);

  const isContextLoading = orgLoading || workspaceLoading || projectLoading || datasetLoading;
  const isLoading = isContextLoading || metricsLoading || insightsLoading;
  const isDemoHydrating = isDemoUser && (!currentWorkspaceId || !activeDatasetId);
  const showWelcomeFlow = !isDemoUser && !isContextLoading;
  const showEmptyState = !hasData && !isLoading && !isDemoHydrating;

  useEffect(() => {
    if (isDemoUser && hasData) sessionStorage.removeItem("quantivis_demo_mode");
    if (!isDemoUser) sessionStorage.removeItem("quantivis_demo_mode");
  }, [isDemoUser, hasData]);

  return (
    <>
      {showWelcomeFlow && <WelcomeFlow hasData={hasData} displayName={displayName} />}

      <DashboardHeader
        organizations={organizations}
        currentOrg={currentOrg}
        switchOrganization={switchOrganization}
        displayName={displayName}
        email={user?.email}
        hasData={hasData}
        criticalInsights={criticalInsights}
        currentOrgId={currentOrgId}
        activeDatasetId={activeDatasetId}
        onSignOut={signOut}
      />

      {isDemoUser && hasData && <DemoBanner />}

      <main id="main-content" className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 md:p-8">
          {(isLoading || isDemoHydrating) && !hasData ? (
            <DashboardSkeleton />
          ) : showEmptyState ? (
            <DashboardEmptyState />
          ) : (
            <SectionErrorBoundary sectionName="Dashboard">
              <ExecutiveDailyDriver
                displayName={displayName}
                orgId={currentOrgId ?? null}
                datasetId={activeDatasetId}
                insights={insights}
                topMetrics={topMetrics ?? []}
                pendingDecisions={pendingDecisions}
              />
            </SectionErrorBoundary>
          )}
        </div>
      </main>
    </>
  );
};

export default Dashboard;

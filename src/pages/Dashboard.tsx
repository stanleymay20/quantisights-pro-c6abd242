import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useMetricsSummary } from "@/hooks/useMetricsSummary";
import { useInsights } from "@/hooks/useInsights";
import { filterCriticalInsights } from "@/lib/insight-filters";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import CopilotHome from "@/components/dashboard/CopilotHome";
import ExecutiveDailyDriver from "@/components/dashboard/ExecutiveDailyDriver";
import WelcomeFlow from "@/components/dashboard/WelcomeFlow";
import DemoBanner from "@/components/dashboard/DemoBanner";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

const Dashboard = () => {
  const { user, profile, signOut } = useAuth();
  const { organizations, currentOrgId, currentOrg, switchOrganization, loading: orgLoading } = useOrganization();
  const { currentWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { activeDatasetId, loading: projectLoading } = useProject();

  // ── FAST PATH: server-aggregated summaries (~20 rows) instead of full metrics (~3K+ rows) ──
  const {
    topMetrics, hasData, loading: metricsLoading,
  } = useMetricsSummary(currentOrgId, activeDatasetId);

  const { insights, loading: insightsLoading } = useInsights(currentOrgId, activeDatasetId);
  const navigate = useNavigate();

  const rawEmailPrefix = user?.email?.split("@")[0] ?? "";
  // Capitalise the email prefix as a last-resort fallback
  const formattedEmailName = rawEmailPrefix
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  // Prefer the user's actual full_name from the profiles table over auth metadata,
  // which can contain the org/account name instead of the user's real name.
  const displayName = profile?.full_name || formattedEmailName || "User";
  const isDemoUser = Boolean(user?.user_metadata?.is_demo);

  const [pendingDecisions, setPendingDecisions] = useState(0);
  const [calibrationScore, setCalibrationScore] = useState<number | null>(null);
  const decisionSyncRef = useRef<Set<string>>(new Set());

  // Onboarding redirect — cached in sessionStorage to avoid repeated DB hits
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
          // Non-blocking — default to showing dashboard
          console.warn("[Dashboard] Onboarding check failed:", error.message);
          sessionStorage.setItem(cacheKey, "done");
          return;
        }
        if (data && !data.onboarding_completed) {
          navigate("/onboarding", { replace: true });
        } else {
          sessionStorage.setItem(cacheKey, "done");
        }
      } catch (e) {
        // Fail open — show dashboard rather than redirect loop
        console.warn("[Dashboard] Onboarding check threw:", e);
        sessionStorage.setItem(cacheKey, "done");
      }
    };
    checkOnboarding();
  }, [currentOrgId, orgLoading, navigate]);

  const refreshDecisionStats = useCallback(async () => {
    if (!currentOrgId) return;

    const [decisionRes, calRes] = await Promise.all([
      supabase.from("decision_ledger")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrgId)
        .eq("execution_status", "not_started")
        .eq("is_suppressed", false),
      supabase.from("calibration_models")
        .select("overall_calibration_score")
        .eq("organization_id", currentOrgId)
        .order("computed_at", { ascending: false })
        .limit(1),
    ]);

    setPendingDecisions(decisionRes.count || 0);
    setCalibrationScore(calRes.data?.[0]?.overall_calibration_score ?? null);
  }, [currentOrgId]);

  // Fetch pending decisions & calibration — parallel, lightweight queries
  useEffect(() => {
    if (!currentOrgId) return;
    refreshDecisionStats();
  }, [currentOrgId, activeDatasetId, refreshDecisionStats]);

  // Memoize expensive insight filtering
  const criticalInsights = useMemo(() => filterCriticalInsights(insights), [insights]);

  // Close the intelligence → decision gap: once high/critical insights exist,
  // invoke the unified converter so the Decision Queue becomes the durable source of truth.
  useEffect(() => {
    if (!currentOrgId || !activeDatasetId || insightsLoading) return;
    if (criticalInsights.length === 0) return;

    const syncKey = `${currentOrgId}:${activeDatasetId}:${criticalInsights.map((i) => i.id).sort().join("|")}`;
    if (decisionSyncRef.current.has(syncKey)) return;
    decisionSyncRef.current.add(syncKey);

    invokeWithRetry("auto-create-decisions", {
      body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
    })
      .then(() => refreshDecisionStats())
      .catch((error) => {
        console.warn("[Dashboard] auto-create-decisions sync failed", error);
        decisionSyncRef.current.delete(syncKey);
      });
  }, [activeDatasetId, criticalInsights, currentOrgId, insightsLoading, refreshDecisionStats]);

  const isContextLoading = orgLoading || workspaceLoading || projectLoading;
  const isLoading = isContextLoading || metricsLoading || insightsLoading;
  const isDemoHydrating = isDemoUser && (!currentWorkspaceId || !activeDatasetId);
  const showWelcomeFlow = !isDemoUser && !isContextLoading;
  const showEmptyState = !hasData && !isLoading && !isDemoHydrating;

  // Demo session cleanup
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

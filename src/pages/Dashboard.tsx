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
    topMetrics,
    hasData,
    loading: metricsLoading,
    stale: metricsStale,
    error: metricsError,
    cachedAt: metricsCachedAt,
  } = useMetricsSummary(currentOrgId, activeDatasetId);

  const {
    insights,
    loading: insightsLoading,
    error: insightsError,
  } = useInsights(currentOrgId, activeDatasetId);
  const navigate = useNavigate();

  const rawEmailPrefix = user?.email?.split("@")[0] ?? "";
  const formattedEmailName = rawEmailPrefix
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const displayName = profile?.full_name || formattedEmailName || "User";
  const isDemoUser = user?.app_metadata?.is_demo === true;

  // `null` means the value is unknown because the query failed. Zero is only
  // used after a successful query proving that no governed decisions are
  // awaiting review.
  const [pendingDecisions, setPendingDecisions] = useState<number | null>(0);
  const [decisionStatsError, setDecisionStatsError] = useState<string | null>(null);
  const [onboardingVerificationError, setOnboardingVerificationError] = useState<string | null>(null);
  const [onboardingVerifiedComplete, setOnboardingVerifiedComplete] = useState(false);
  const decisionSyncRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // First-run guidance must fail closed. "Not loading" is not evidence that an
    // organization is safe for onboarding; only a positive database verification
    // of onboarding_completed=true may enable the WelcomeFlow.
    if (orgLoading || !currentOrgId) {
      setOnboardingVerifiedComplete(false);
      return;
    }

    const cacheKey = `onboarding_checked_${currentOrgId}`;
    if (sessionStorage.getItem(cacheKey) === "done") {
      setOnboardingVerifiedComplete(true);
      return;
    }

    setOnboardingVerifiedComplete(false);
    let cancelled = false;
    const checkOnboarding = async () => {
      setOnboardingVerificationError(null);
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("onboarding_completed")
          .eq("id", currentOrgId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("[Dashboard] Onboarding check failed:", error.message);
          setOnboardingVerificationError(error.message);
          setOnboardingVerifiedComplete(false);
          return;
        }
        if (!data) {
          setOnboardingVerificationError("Organization onboarding status could not be verified.");
          setOnboardingVerifiedComplete(false);
          return;
        }
        if (!data.onboarding_completed) {
          setOnboardingVerifiedComplete(false);
          navigate("/onboarding", { replace: true });
          return;
        }
        // Cache only a successfully verified completed state. Unknown/error
        // states remain retryable on the next mount instead of becoming truth.
        sessionStorage.setItem(cacheKey, "done");
        setOnboardingVerifiedComplete(true);
      } catch (error) {
        if (cancelled) return;
        console.warn("[Dashboard] Onboarding check threw:", error);
        setOnboardingVerificationError(error instanceof Error ? error.message : "Onboarding verification failed.");
        setOnboardingVerifiedComplete(false);
      }
    };
    void checkOnboarding();
    return () => { cancelled = true; };
  }, [currentOrgId, orgLoading, navigate]);

  const refreshDecisionStats = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) {
      setPendingDecisions(0);
      setDecisionStatsError(null);
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
      setPendingDecisions(null);
      setDecisionStatsError(error.message);
      return;
    }

    setPendingDecisions(count ?? 0);
    setDecisionStatsError(null);
  }, [currentOrgId, activeDatasetId]);

  useEffect(() => {
    void refreshDecisionStats();
  }, [refreshDecisionStats]);

  const criticalInsights = useMemo(() => filterCriticalInsights(insights), [insights]);

  useEffect(() => {
    // Never generate an executive all-clear/decision state from an insight set
    // that failed to load. An empty verified set and an unavailable set have
    // different meanings.
    if (!currentOrgId || !activeDatasetId || insightsLoading || insightsError) return;
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
  }, [activeDatasetId, criticalInsights, currentOrgId, insightsError, insightsLoading, refreshDecisionStats]);

  const isContextLoading = orgLoading || workspaceLoading || projectLoading || datasetLoading;
  const isLoading = isContextLoading || metricsLoading || insightsLoading;
  const isDemoHydrating = isDemoUser && (!currentWorkspaceId || !activeDatasetId);
  const showWelcomeFlow = !isDemoUser && !isContextLoading && onboardingVerifiedComplete;
  // An unavailable evidence source is not the same as an empty dataset.
  const showEmptyState = !metricsError && !insightsError && !hasData && !isLoading && !isDemoHydrating;

  useEffect(() => {
    if (isDemoUser && hasData) sessionStorage.removeItem("quantivis_demo_mode");
    if (!isDemoUser) sessionStorage.removeItem("quantivis_demo_mode");
  }, [isDemoUser, hasData]);

  const executiveEvidenceUnavailable = Boolean((metricsError && !hasData) || insightsError);

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

      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 md:p-8 space-y-4">
          {(metricsStale || metricsError) && (
            <section className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3" role="status" aria-live="polite">
              <p className="text-sm font-semibold text-foreground">
                {metricsError ? "Live metric evidence could not be verified" : "Metric evidence is awaiting live verification"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metricsStale
                  ? `Cached evidence${metricsCachedAt ? ` from ${new Date(metricsCachedAt).toLocaleString()}` : ""} is shown as stale and must not be treated as current.`
                  : "Quantivis is not presenting unavailable evidence as an empty or healthy state."}
              </p>
            </section>
          )}

          {insightsError && (
            <section className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-foreground">Insight evidence cannot currently be verified</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quantivis will not interpret an unavailable insight query as “no critical insights” or use it to generate an executive all-clear.
              </p>
            </section>
          )}

          {onboardingVerificationError && (
            <section className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3" role="status" aria-live="polite">
              <p className="text-sm font-semibold text-foreground">Onboarding status is unverified</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quantivis could not verify whether onboarding is complete. This state has not been cached as completed and will be checked again.
              </p>
            </section>
          )}

          {decisionStatsError && (
            <section className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-foreground">Pending decisions cannot currently be verified</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quantivis will not convert this query failure into “0 awaiting review.” Refresh the page or retry after the data service recovers.
              </p>
            </section>
          )}

          {(isLoading || isDemoHydrating) && !hasData ? (
            <DashboardSkeleton />
          ) : executiveEvidenceUnavailable ? (
            <section className="rounded-2xl border border-destructive/30 bg-card p-8 text-center">
              <h2 className="text-base font-semibold">Executive evidence is temporarily unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                One or more required evidence surfaces could not be verified. Quantivis is withholding an empty-state or all-clear interpretation until live evidence is available.
              </p>
            </section>
          ) : showEmptyState ? (
            <DashboardEmptyState />
          ) : pendingDecisions === null ? (
            <section className="rounded-2xl border border-destructive/30 bg-card p-8 text-center">
              <h2 className="text-base font-semibold">Executive decision state is temporarily unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The governed decision count could not be verified, so Quantivis is withholding the executive all-clear surface rather than displaying a misleading zero.
              </p>
            </section>
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
      </div>
    </>
  );
};

export default Dashboard;

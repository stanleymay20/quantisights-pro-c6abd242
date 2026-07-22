/**
 * Embedding triggers — fire-and-forget vector embedding invocations
 */
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";

/** Trigger embedding for a batch of insights after generation */
export async function embedInsightsBatch(organizationId: string) {
  try {
    supabase.functions.invoke("embed-decisions", {
      body: { organization_id: organizationId, mode: "insights" },
    }).catch((err) => {
      console.warn("[lifecycle] Insights embedding failed:", err);
      captureError(
        err instanceof Error ? err : new Error("Insights embedding invocation failed"),
        { organizationId, context: "embedInsightsBatch" }
      );
    });
  } catch (err) {
    console.warn("[lifecycle] embedInsightsBatch outer error:", err);
  }
}

/** Trigger embedding for advisories after generation */
export async function embedAdvisoriesBatch(organizationId: string) {
  try {
    supabase.functions.invoke("embed-decisions", {
      body: { organization_id: organizationId, mode: "advisories" },
    }).catch((err) => {
      console.warn("[lifecycle] Advisories embedding failed:", err);
      captureError(
        err instanceof Error ? err : new Error("Advisories embedding invocation failed"),
        { organizationId, context: "embedAdvisoriesBatch" }
      );
    });
  } catch (err) {
    console.warn("[lifecycle] embedAdvisoriesBatch outer error:", err);
  }
}

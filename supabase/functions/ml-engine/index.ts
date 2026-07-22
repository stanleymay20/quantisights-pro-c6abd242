/**
 * ml-engine — Server-side statistical ML capabilities.
 * 
 * Supports:
 * - K-Means clustering
 * - ARIMA forecasting
 * - Decision tree classification
 * - Isolation forest anomaly detection
 * - Cohort analysis
 * - A/B test significance
 * 
 * All algorithms are pure-function implementations with zero external ML deps.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  kMeansClustering,
  arimaForecast,
  trainDecisionTree,
  isolationForest,
  cohortAnalysis,
  abTestSignificance,
} from "../_shared/ml-engine.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { algorithm, params } = body;

    if (!algorithm) {
      return new Response(JSON.stringify({ error: "algorithm required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: unknown;

    switch (algorithm) {
      case "kmeans": {
        const { data, k, maxIterations, nInit } = params;
        if (!data || !k) {
          return new Response(JSON.stringify({ error: "data and k required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = kMeansClustering(data, k, maxIterations, nInit);
        break;
      }

      case "arima": {
        const { series, horizons, order } = params;
        if (!series || !Array.isArray(series)) {
          return new Response(JSON.stringify({ error: "series array required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = arimaForecast(series, horizons, order);
        break;
      }

      case "decision_tree": {
        const { features, labels, featureNames, maxDepth, minSamples } = params;
        if (!features || !labels || !featureNames) {
          return new Response(JSON.stringify({ error: "features, labels, featureNames required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = trainDecisionTree(features, labels, featureNames, maxDepth, minSamples);
        break;
      }

      case "isolation_forest": {
        const { data, numTrees, contamination } = params;
        if (!data) {
          return new Response(JSON.stringify({ error: "data required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = isolationForest(data, numTrees, contamination);
        break;
      }

      case "cohort_analysis": {
        const { events, periodType } = params;
        if (!events) {
          return new Response(JSON.stringify({ error: "events required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = cohortAnalysis(events, periodType);
        break;
      }

      case "ab_test": {
        const { controlValues, treatmentValues, alpha } = params;
        if (!controlValues || !treatmentValues) {
          return new Response(JSON.stringify({ error: "controlValues and treatmentValues required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = abTestSignificance(controlValues, treatmentValues, alpha);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown algorithm: ${algorithm}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ algorithm, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ml-engine error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

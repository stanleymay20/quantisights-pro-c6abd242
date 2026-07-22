import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortfolioCompany {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  name: string;
  sector: string;
  investment_date: string | null;
  investment_amount: number | null;
  ownership_pct: number | null;
  current_valuation: number | null;
  revenue_ltm: number | null;
  ebitda_ltm: number | null;
  revenue_growth_pct: number | null;
  ebitda_margin_pct: number | null;
  cash_runway_months: number | null;
  headcount: number | null;
  risk_score: number | null;
  risk_trend: string | null;
  health_status: string | null;
  last_board_date: string | null;
  next_board_date: string | null;
  fund_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe accessor for nullable numeric fields — returns 0 if null/undefined */
const n = (v: number | null | undefined): number => v ?? 0;

export type NewPortfolioCompany = Omit<PortfolioCompany, "id" | "created_at" | "updated_at" | "risk_trend" | "health_status"> & {
  organization_id: string;
  dataset_id: string;
  name: string;
};

/**
 * Hook to fetch portfolio companies — REQUIRES dataset_id (Active Data Contract).
 */
export const usePortfolioCompanies = (orgId: string | null, datasetId: string | null) => {
  const [companies, setCompanies] = useState<PortfolioCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    if (!orgId || !datasetId) { setCompanies([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("portfolio_companies")
      .select("*")
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId)
      .order("name");

    if (fetchError) {
      console.error("Portfolio fetch error:", fetchError);
      setError(fetchError.message);
      setCompanies([]);
    } else {
      setCompanies((data ?? []) as PortfolioCompany[]);
    }
    setLoading(false);
  }, [orgId, datasetId]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const addCompany = async (company: Partial<PortfolioCompany> & { name: string; organization_id: string }) => {
    if (!company.dataset_id) {
      throw new Error("dataset_id is required by Active Data Contract");
    }
    const { data, error } = await supabase.from("portfolio_companies").insert(company).select().single();
    if (!error && data) { await fetchCompanies(); return data as PortfolioCompany; }
    throw error;
  };

  const updateCompany = async (id: string, updates: Partial<PortfolioCompany>) => {
    if (!orgId || !datasetId) throw new Error("Organization and dataset context required (Active Data Contract)");
    // Prevent mutation of identity fields
    const { id: _id, organization_id: _o, dataset_id: _d, created_at: _c, ...safeUpdates } = updates as Partial<Record<string, unknown>>;
    const { error } = await supabase
      .from("portfolio_companies")
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId);
    if (!error) await fetchCompanies();
    else throw error;
  };

  const deleteCompany = async (id: string) => {
    if (!orgId || !datasetId) throw new Error("Organization and dataset context required (Active Data Contract)");
    const { error } = await supabase
      .from("portfolio_companies")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId);
    if (!error) await fetchCompanies();
    else throw error;
  };

  const totalAUM = companies.reduce((s, c) => s + n(c.current_valuation), 0);
  const totalRevenue = companies.reduce((s, c) => s + n(c.revenue_ltm), 0);
  const avgRisk = companies.length ? Math.round(companies.reduce((s, c) => s + n(c.risk_score), 0) / companies.length) : 0;
  const atRiskCount = companies.filter(c => n(c.risk_score) >= 70).length;
  const avgEbitdaMargin = companies.length ? companies.reduce((s, c) => s + n(c.ebitda_margin_pct), 0) / companies.length : 0;

  return {
    companies, loading, error, refresh: fetchCompanies,
    addCompany, updateCompany, deleteCompany,
    totalAUM, totalRevenue, avgRisk, atRiskCount, avgEbitdaMargin,
  };
};

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Database, Plus, Trash2, Upload, Loader2, Shield, FileSpreadsheet, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface InternalRow {
  id: string;
  category: string;
  metric_name: string;
  value: number;
  unit: string | null;
  region: string | null;
  industry: string | null;
  period_start: string | null;
  source: string;
  confidence_grade: string | null;
  created_at: string;
}

const CATEGORIES = [
  { value: "macro", label: "Macro / Economic" },
  { value: "industry", label: "Industry Benchmark" },
  { value: "regulatory", label: "Regulatory / Compliance" },
  { value: "operational", label: "Operational Reference" },
  { value: "competitive", label: "Competitive Intelligence" },
];

const InternalData = () => {
  const { toast } = useToast();
  const { currentOrgId } = useOrganization();
  const [rows, setRows] = useState<InternalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);

  const [form, setForm] = useState({
    category: "industry",
    metric_name: "",
    value: "",
    unit: "",
    industry: "",
    region: "",
    period_start: format(new Date(), "yyyy-MM-dd"),
    source: "",
    confidence_grade: "B",
  });

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("internal_reference_data")
      .select("*")
      .eq("organization_id", currentOrgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as InternalRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentOrgId]);

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.metric_name.trim() || !form.value || !form.source.trim()) {
      toast({ title: "Missing fields", description: "Metric name, value and source are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("internal_reference_data").insert({
      organization_id: currentOrgId,
      category: form.category,
      metric_name: form.metric_name.trim(),
      value: Number(form.value),
      unit: form.unit.trim() || null,
      industry: form.industry.trim() || null,
      region: form.region.trim() || null,
      period_start: form.period_start || null,
      source: form.source.trim(),
      confidence_grade: form.confidence_grade,
      metadata: { entry_method: "manual" },
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Insert failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Reference signal added" });
      setForm({ ...form, metric_name: "", value: "", unit: "" });
      load();
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("internal_reference_data").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setRows((r) => r.filter((x) => x.id !== id));
    }
  };

  const handleCsv = async (file: File) => {
    if (!currentOrgId) return;
    setCsvBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV must include a header row and at least one data row.");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const required = ["metric_name", "value", "source"];
      for (const r of required) {
        if (!headers.includes(r)) throw new Error(`Missing required column: ${r}`);
      }
      const records = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
        return {
          organization_id: currentOrgId,
          category: row.category || "industry",
          metric_name: row.metric_name,
          value: Number(row.value),
          unit: row.unit || null,
          industry: row.industry || null,
          region: row.region || null,
          period_start: row.period_start || null,
          source: row.source,
          confidence_grade: row.confidence_grade || "B",
          metadata: { entry_method: "csv_upload", file: file.name },
        };
      }).filter((r) => Number.isFinite(r.value) && r.metric_name);

      if (records.length === 0) throw new Error("No valid rows to import.");
      const { error } = await supabase
        .from("internal_reference_data")
        .upsert(records, { onConflict: "organization_id,metric_name,source,period_start", ignoreDuplicates: false });
      if (error) throw error;
      toast({ title: "CSV imported", description: `${records.length} reference signals upserted.` });
      load();
    } catch (e) {
      toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCsvBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, InternalRow[]>();
    rows.forEach((r) => {
      const key = r.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [rows]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Internal Data Hub</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Curate organization-specific reference signals — industry benchmarks, regulatory thresholds,
          competitive intel — that blend into Layer B advisory context. All entries
          are scoped to your organization and audited.
        </p>
      </motion.div>

      <Tabs defaultValue="manual" className="space-y-6">
        <TabsList>
          <TabsTrigger value="manual"><Plus className="w-4 h-4 mr-1.5" />Manual entry</TabsTrigger>
          <TabsTrigger value="csv"><FileSpreadsheet className="w-4 h-4 mr-1.5" />CSV import</TabsTrigger>
          <TabsTrigger value="api"><Database className="w-4 h-4 mr-1.5" />API / Connectors</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <div className="glass-card p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Metric name *</Label>
                <Input value={form.metric_name} onChange={(e) => setForm({ ...form, metric_name: e.target.value })} placeholder="e.g. industry.churn.median" />
              </div>
              <div>
                <Label>Value *</Label>
                <Input type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%, EUR, count..." />
              </div>
              <div>
                <Label>Industry</Label>
                <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="SaaS, Manufacturing..." />
              </div>
              <div>
                <Label>Region</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="EU, NA, APAC..." />
              </div>
              <div>
                <Label>Period start</Label>
                <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
              </div>
              <div>
                <Label>Source *</Label>
                <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Gartner, Internal Analyst..." />
              </div>
              <div>
                <Label>Confidence</Label>
                <Select value={form.confidence_grade} onValueChange={(v) => setForm({ ...form, confidence_grade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — Audited / verified</SelectItem>
                    <SelectItem value="B">B — Reputable source</SelectItem>
                    <SelectItem value="C">C — Indicative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={submit} disabled={submitting} className="w-full md:w-auto">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add reference signal
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="csv">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg border border-border/40 bg-muted/20">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Required columns: <code className="text-xs">metric_name, value, source</code></p>
                <p className="text-muted-foreground">Optional: category, unit, industry, region, period_start (YYYY-MM-DD), confidence_grade. Duplicates upsert by (metric_name, source, period_start).</p>
              </div>
            </div>
            <div>
              <input
                type="file"
                accept=".csv"
                disabled={csvBusy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsv(f); e.target.value = ""; }}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:brightness-110 cursor-pointer"
              />
            </div>
            {csvBusy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Parsing & upserting...</p>}
          </div>
        </TabsContent>

        <TabsContent value="api">
          <div className="glass-card p-6 space-y-3">
            <h3 className="font-semibold">REST API ingestion</h3>
            <p className="text-sm text-muted-foreground">Programmatically push reference signals from Snowflake/BigQuery/dbt or any pipeline.</p>
            <pre className="text-xs bg-muted/40 p-4 rounded-lg overflow-x-auto">
{`POST https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-internal-data
Authorization: Bearer <user_jwt>
Content-Type: application/json

{
  "rows": [
    {
      "category": "industry",
      "metric_name": "saas.gross_margin.median",
      "value": 78.5,
      "unit": "%",
      "industry": "SaaS",
      "source": "Internal benchmarks 2025-Q1",
      "period_start": "2025-01-01",
      "confidence_grade": "A"
    }
  ]
}`}
            </pre>
            <p className="text-xs text-muted-foreground">External system connectors (Snowflake, BigQuery, dbt Cloud) are configured under <a href="/data-connectors" className="text-primary underline">Data Connectors</a>.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-10">
        <h2 className="text-[16px] font-semibold tracking-tight mb-4">Curated reference signals ({rows.length})</h2>
        {loading ? (
          <div className="glass-card p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <Database className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No internal reference signals yet. Add one above to enrich Layer B advisory context.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([cat, list]) => (
              <div key={cat}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat} ({list.length})</h3>
                <div className="border border-border/40 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Metric</th>
                        <th className="text-right px-3 py-2 font-medium">Value</th>
                        <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Source</th>
                        <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Period</th>
                        <th className="text-center px-3 py-2 font-medium hidden lg:table-cell">Grade</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr key={r.id} className="border-t border-border/30">
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.metric_name}</div>
                            {(r.industry || r.region) && (
                              <div className="text-xs text-muted-foreground">{[r.industry, r.region].filter(Boolean).join(" · ")}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{r.value}{r.unit ? ` ${r.unit}` : ""}</td>
                          <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{r.source}</td>
                          <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">{r.period_start ?? "—"}</td>
                          <td className="px-3 py-2 hidden lg:table-cell text-center">
                            <span className={`text-xs px-2 py-0.5 rounded ${r.confidence_grade === "A" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {r.confidence_grade ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InternalData;

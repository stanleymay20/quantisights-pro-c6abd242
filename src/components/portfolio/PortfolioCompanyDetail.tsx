import { useState, useEffect } from "react";
import { PortfolioCompany } from "@/hooks/usePortfolioCompanies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, TrendingUp, DollarSign, Users, Calendar, Target, Pencil, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency } from "@/lib/format-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  company: PortfolioCompany;
  onClose: () => void;
  onUpdate: (updates: Partial<PortfolioCompany>) => Promise<void>;
  onDelete: () => Promise<void>;
}

const n = (v: number | null | undefined): number => v ?? 0;

const riskLabel = (score: number | null) => {
  const s = n(score);
  if (s <= 25) return { text: "Low", className: "bg-[hsl(var(--severity-success))]/10 text-[hsl(var(--severity-success))]" };
  if (s <= 50) return { text: "Moderate", className: "bg-[hsl(var(--severity-info))]/10 text-[hsl(var(--severity-info))]" };
  if (s <= 75) return { text: "Elevated", className: "bg-[hsl(var(--severity-warning))]/10 text-[hsl(var(--severity-warning))]" };
  return { text: "Critical", className: "bg-destructive/10 text-destructive" };
};

const buildForm = (company: PortfolioCompany) => ({
  revenue_ltm: n(company.revenue_ltm).toString(),
  ebitda_ltm: n(company.ebitda_ltm).toString(),
  revenue_growth_pct: n(company.revenue_growth_pct).toString(),
  ebitda_margin_pct: n(company.ebitda_margin_pct).toString(),
  current_valuation: company.current_valuation?.toString() ?? "",
  headcount: company.headcount?.toString() ?? "",
  risk_score: n(company.risk_score).toString(),
});

const PortfolioCompanyDetail = ({ company, onClose, onUpdate, onDelete }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const risk = riskLabel(company.risk_score);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(buildForm(company));

  // Reset form and exit edit mode when company changes
  useEffect(() => {
    setForm(buildForm(company));
    setEditing(false);
  }, [company.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        revenue_ltm: Number(form.revenue_ltm) || 0,
        ebitda_ltm: Number(form.ebitda_ltm) || 0,
        revenue_growth_pct: Number(form.revenue_growth_pct) || 0,
        ebitda_margin_pct: Number(form.ebitda_margin_pct) || 0,
        current_valuation: form.current_valuation ? Number(form.current_valuation) : null,
        headcount: form.headcount ? Number(form.headcount) : null,
        risk_score: Number(form.risk_score) || 0,
      });
      setEditing(false);
      toast({ title: "Company updated" });
    } catch (err: unknown) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      toast({ title: "Company removed from portfolio" });
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const metrics = [
    { label: "Revenue LTM", value: fmtCurrency(n(company.revenue_ltm)), icon: DollarSign },
    { label: "EBITDA LTM", value: fmtCurrency(n(company.ebitda_ltm)), icon: DollarSign },
    { label: "Revenue Growth", value: `${n(company.revenue_growth_pct) > 0 ? "+" : ""}${n(company.revenue_growth_pct).toFixed(1)}%`, icon: TrendingUp },
    { label: "EBITDA Margin", value: `${n(company.ebitda_margin_pct).toFixed(1)}%`, icon: Target },
    { label: "Valuation", value: fmtCurrency(company.current_valuation), icon: DollarSign },
    { label: "Headcount", value: company.headcount?.toString() ?? "—", icon: Users },
    { label: "Ownership", value: company.ownership_pct ? `${Math.round(company.ownership_pct)}%` : "—", icon: Target },
    { label: "Cash Runway", value: company.cash_runway_months ? `${company.cash_runway_months} mo` : "—", icon: Calendar },
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg">{company.name}</CardTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground capitalize">{company.sector}</span>
            {company.fund_name && <span className="text-xs text-muted-foreground">· {company.fund_name}</span>}
            <Badge className={`${risk.className} border-none text-xs`}>{risk.text} Risk ({n(company.risk_score)})</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setEditing(!editing)} aria-label="Edit company">
            <Pencil className="w-4 h-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Delete company" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {company.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this company from your portfolio. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Revenue LTM ($)", key: "revenue_ltm" },
                { label: "EBITDA LTM ($)", key: "ebitda_ltm" },
                { label: "Revenue Growth %", key: "revenue_growth_pct" },
                { label: "EBITDA Margin %", key: "ebitda_margin_pct" },
                { label: "Valuation ($)", key: "current_valuation" },
                { label: "Headcount", key: "headcount" },
                { label: "Risk Score", key: "risk_score" },
              ].map((field) => (
                <div key={field.key}>
                  <Label className="text-[10px]">{field.label}</Label>
                  <Input
                    type="number"
                    value={form[field.key as keyof typeof form]}
                    onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setForm(buildForm(company)); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metrics.map(m => (
                <div key={m.label} className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{m.label}</span>
                  </div>
                  <span className="text-base font-bold">{m.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/simulations")} className="text-xs">
                Run Simulation
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/scenarios")} className="text-xs">
                Scenario Analysis
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PortfolioCompanyDetail;

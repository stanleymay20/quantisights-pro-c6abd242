import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PortfolioCompany } from "@/hooks/usePortfolioCompanies";

interface Props {
  organizationId: string;
  onAdd: (company: Partial<PortfolioCompany> & { organization_id: string; name: string }) => Promise<PortfolioCompany | undefined>;
}

const SECTORS = ["technology", "healthcare", "fintech", "saas", "e-commerce", "manufacturing", "energy", "consumer", "logistics", "other"];

const AddPortfolioCompanyDialog = ({ organizationId, onAdd }: Props) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sector: "technology",
    fund_name: "",
    investment_amount: "",
    ownership_pct: "",
    current_valuation: "",
    revenue_ltm: "",
    ebitda_ltm: "",
    revenue_growth_pct: "",
    ebitda_margin_pct: "",
    headcount: "",
  });

  const update = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const resetForm = () => setForm({
    name: "", sector: "technology", fund_name: "", investment_amount: "",
    ownership_pct: "", current_valuation: "", revenue_ltm: "", ebitda_ltm: "",
    revenue_growth_pct: "", ebitda_margin_pct: "", headcount: "",
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast({ title: "Company name required", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await onAdd({
        organization_id: organizationId,
        name: form.name.trim(),
        sector: form.sector,
        fund_name: form.fund_name || null,
        investment_amount: form.investment_amount ? Number(form.investment_amount) : null,
        ownership_pct: form.ownership_pct ? Number(form.ownership_pct) : null,
        current_valuation: form.current_valuation ? Number(form.current_valuation) : null,
        revenue_ltm: form.revenue_ltm ? Number(form.revenue_ltm) : 0,
        ebitda_ltm: form.ebitda_ltm ? Number(form.ebitda_ltm) : 0,
        revenue_growth_pct: form.revenue_growth_pct ? Number(form.revenue_growth_pct) : 0,
        ebitda_margin_pct: form.ebitda_margin_pct ? Number(form.ebitda_margin_pct) : 0,
        headcount: form.headcount ? Number(form.headcount) : null,
      });
      toast({ title: "Portfolio company added" });
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Add Portco
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Portfolio Company</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="company-name" className="text-xs">Company Name *</Label>
              <Input id="company-name" value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <Label className="text-xs">Sector</Label>
              <Select value={form.sector} onValueChange={v => update("sector", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fund-name" className="text-xs">Fund Name</Label>
              <Input id="fund-name" value={form.fund_name} onChange={e => update("fund_name", e.target.value)} placeholder="e.g. Fund III" />
            </div>
            <div>
              <Label htmlFor="investment-amount" className="text-xs">Investment ($)</Label>
              <Input type="number" id="investment-amount" value={form.investment_amount} onChange={e => update("investment_amount", e.target.value)} placeholder="10000000" />
            </div>
            <div>
              <Label htmlFor="ownership-pct" className="text-xs">Ownership %</Label>
              <Input type="number" id="ownership-pct" value={form.ownership_pct} onChange={e => update("ownership_pct", e.target.value)} placeholder="25" />
            </div>
            <div>
              <Label htmlFor="current-valuation" className="text-xs">Current Valuation ($)</Label>
              <Input type="number" id="current-valuation" value={form.current_valuation} onChange={e => update("current_valuation", e.target.value)} placeholder="50000000" />
            </div>
            <div>
              <Label htmlFor="revenue-ltm" className="text-xs">Revenue LTM ($)</Label>
              <Input type="number" id="revenue-ltm" value={form.revenue_ltm} onChange={e => update("revenue_ltm", e.target.value)} placeholder="5000000" />
            </div>
            <div>
              <Label htmlFor="ebitda-ltm" className="text-xs">EBITDA LTM ($)</Label>
              <Input type="number" id="ebitda-ltm" value={form.ebitda_ltm} onChange={e => update("ebitda_ltm", e.target.value)} placeholder="1000000" />
            </div>
            <div>
              <Label htmlFor="revenue-growth" className="text-xs">Revenue Growth %</Label>
              <Input type="number" id="revenue-growth" value={form.revenue_growth_pct} onChange={e => update("revenue_growth_pct", e.target.value)} placeholder="15" />
            </div>
            <div>
              <Label htmlFor="ebitda-margin" className="text-xs">EBITDA Margin %</Label>
              <Input type="number" id="ebitda-margin" value={form.ebitda_margin_pct} onChange={e => update("ebitda_margin_pct", e.target.value)} placeholder="20" />
            </div>
            <div>
              <Label htmlFor="headcount" className="text-xs">Headcount</Label>
              <Input type="number" id="headcount" value={form.headcount} onChange={e => update("headcount", e.target.value)} placeholder="150" />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Add Company
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddPortfolioCompanyDialog;

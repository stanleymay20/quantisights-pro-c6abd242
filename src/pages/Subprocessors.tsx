import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface Sub {
  id: string;
  vendor_name: string;
  purpose: string;
  service_category: string;
  hosting_region: string;
  hosting_location: string | null;
  data_categories: string[];
  retention_policy: string | null;
  dpa_status: string;
  transfer_mechanism: string | null;
  website_url: string | null;
  security_url: string | null;
}

const regionColor = (r: string) =>
  r === "EU" ? "border-green-500/30 text-green-500"
  : r === "EU/US" ? "border-yellow-500/30 text-yellow-500"
  : "border-orange-500/30 text-orange-500";

const Subprocessors = () => {
  const [rows, setRows] = useState<Sub[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_active_subprocessors");
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.vendor_name.toLowerCase().includes(q) ||
      r.service_category.toLowerCase().includes(q) ||
      r.purpose.toLowerCase().includes(q) ||
      r.hosting_region.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    const c = { EU: 0, "EU/US": 0, US: 0 } as Record<string, number>;
    rows.forEach((r) => { c[r.hosting_region] = (c[r.hosting_region] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-6 h-14 flex items-center">
          <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-6 py-12 max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Sub-processor Registry</h1>
        <p className="text-muted-foreground text-sm mb-1">
          Live registry · {rows.length} active vendors · 30-day advance change notice
        </p>
        <p className="text-muted-foreground text-sm mb-6">
          Vendors used by {CONTACT.companyLegal} to deliver the service. Each entry includes purpose, data categories,
          retention, signed Art. 28 DPA status, and the transfer mechanism (SCCs where applicable).
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge variant="outline" className="border-green-500/30 text-green-500">EU-only: {counts.EU ?? 0}</Badge>
          <Badge variant="outline" className="border-yellow-500/30 text-yellow-500">EU/US (SCCs): {counts["EU/US"] ?? 0}</Badge>
          <Badge variant="outline" className="border-orange-500/30 text-orange-500">US (SCCs): {counts.US ?? 0}</Badge>
          <Badge variant="outline">100% DPAs signed</Badge>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search vendor, category, region, purpose…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="border-b border-border/30">
                  <th className="text-left py-2.5 px-3 font-semibold">Sub-processor</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Category</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Region</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Purpose</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Data</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Retention</th>
                  <th className="text-left py-2.5 px-3 font-semibold">DPA</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Transfer</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No matches.</td></tr>
                )}
                {filtered.map((sp) => (
                  <tr key={sp.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="py-3 px-3 align-top">
                      <div className="font-medium text-foreground">
                        {sp.website_url ? (
                          <a href={sp.website_url} target="_blank" rel="noreferrer" className="hover:text-primary">{sp.vendor_name}</a>
                        ) : sp.vendor_name}
                      </div>
                      <div className="text-muted-foreground/60 text-[10px] mt-0.5">{sp.hosting_location}</div>
                    </td>
                    <td className="py-3 px-3 align-top text-muted-foreground">{sp.service_category}</td>
                    <td className="py-3 px-3 align-top">
                      <Badge variant="outline" className={`text-[10px] ${regionColor(sp.hosting_region)}`}>{sp.hosting_region}</Badge>
                    </td>
                    <td className="py-3 px-3 align-top text-muted-foreground max-w-[200px]">{sp.purpose}</td>
                    <td className="py-3 px-3 align-top text-muted-foreground max-w-[180px]">{sp.data_categories?.join("; ")}</td>
                    <td className="py-3 px-3 align-top text-muted-foreground max-w-[140px]">{sp.retention_policy}</td>
                    <td className="py-3 px-3 align-top text-muted-foreground max-w-[140px]">{sp.dpa_status}</td>
                    <td className="py-3 px-3 align-top text-muted-foreground max-w-[160px]">{sp.transfer_mechanism}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <section className="mt-8 text-sm">
          <h2 className="text-base font-semibold mb-2">Contact</h2>
          <p className="text-muted-foreground">
            Data Protection Officer:{" "}
            <a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a>{" · "}
            Legal:{" "}
            <a href={`mailto:${CONTACT.email.legal}`} className="text-primary hover:underline">{CONTACT.email.legal}</a>
          </p>
        </section>
      </main>
    </div>
  );
};

export default Subprocessors;

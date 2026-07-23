import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, ShieldCheck, MapPin, Info } from "lucide-react";

/**
 * Data Residency & International Transfers.
 * Reads the configured hosting region from build-time env when present,
 * otherwise displays "configured at deployment" rather than hardcoding.
 */
const CONFIGURED_REGION =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_HOSTING_REGION) || null;

const aiProviders = [
  {
    provider: "Google (Gemini family)",
    purpose: "Narrative generation, semantic classification",
    inferenceRegion: "EU / US",
    retention: "No training retention (zero-retention configuration)",
    mechanism: "Contractual + SCC where applicable",
  },
  {
    provider: "OpenAI (GPT family)",
    purpose: "Narrative generation, structured extraction",
    inferenceRegion: "US",
    retention: "Opt-out of training; 30-day abuse log",
    mechanism: "Standard Contractual Clauses (SCC)",
  },
];

const DataResidency = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>

    <main className="container mx-auto px-6 py-12 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <Globe className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Data Residency &amp; International Transfers</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8 max-w-2xl">
        Where customer data is hosted, which sub-processors may touch it, and the legal mechanisms governing any
        transfer outside the EU/EEA.
      </p>

      {/* ── Primary hosting region (no hardcoded claims) ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-primary mt-1 shrink-0" />
            <div className="flex-1">
              <h2 className="text-base font-semibold mb-1">Primary Hosting Region</h2>
              {CONFIGURED_REGION ? (
                <>
                  <p className="text-sm">
                    Customer data at rest is hosted in <strong>{CONFIGURED_REGION}</strong>.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Region sourced from deployment configuration (<code>VITE_HOSTING_REGION</code>).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The active hosting region is configured at deployment time and disclosed under your contract.
                    Region is intentionally not hardcoded here so this page never drifts from infrastructure reality.
                  </p>
                  <div className="mt-2 text-xs flex items-start gap-1.5 text-muted-foreground">
                    <Info className="w-3 h-3 mt-0.5" />
                    <span>To surface the live region, set <code>VITE_HOSTING_REGION</code> in the deployment environment.</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Sub-processors pointer ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <h2 className="text-base font-semibold mb-2">Sub-processor Registry</h2>
          <p className="text-sm text-muted-foreground">
            The live registry — including <strong>hosting region</strong> and <strong>transfer mechanism</strong> per
            vendor — is published at <Link to="/subprocessors" className="text-primary hover:underline">/subprocessors</Link>.
            Material changes are announced 30 days in advance with a right to object.
          </p>
        </CardContent>
      </Card>

      {/* ── SCC disclosure ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-primary mt-1 shrink-0" />
            <div>
              <h2 className="text-base font-semibold mb-1">Standard Contractual Clauses (SCC)</h2>
              <p className="text-sm text-muted-foreground">
                Where personal data is transferred outside the EU/EEA, Quantivis relies on the
                <strong> EU Standard Contractual Clauses</strong> adopted by Commission Implementing
                Decision <strong>(EU) 2021/914</strong>, Module 2 (controller → processor) and Module 3
                (processor → sub-processor), supplemented by a Transfer Impact Assessment (TIA) and
                supplementary technical measures (encryption, pseudonymisation, access controls).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── AI model provider disclosures ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <h2 className="text-base font-semibold mb-3">AI Model Provider Disclosures</h2>
          <div className="rounded-md border border-border/40 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 px-3 font-semibold">Provider</th>
                  <th className="text-left py-2 px-3 font-semibold">Purpose</th>
                  <th className="text-left py-2 px-3 font-semibold">Inference Region</th>
                  <th className="text-left py-2 px-3 font-semibold">Retention</th>
                  <th className="text-left py-2 px-3 font-semibold">Transfer Mechanism</th>
                </tr>
              </thead>
              <tbody>
                {aiProviders.map((p) => (
                  <tr key={p.provider} className="border-b border-border/20">
                    <td className="py-2.5 px-3 font-medium">{p.provider}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{p.purpose}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className="text-[10px]">{p.inferenceRegion}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{p.retention}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{p.mechanism}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            PII redaction is applied before any LLM call unless the customer explicitly enables raw-text mode.
          </p>
        </CardContent>
      </Card>

      {/* ── Residency statement ── */}
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardContent className="pt-5">
          <h2 className="text-base font-semibold mb-2">Residency Statement</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Customer data at rest remains in the contracted hosting region. Transient AI inference may touch
            US-based providers under SCC + zero-retention configuration. No analytics, billing, or transactional
            data is transferred outside the EU/EEA without a documented Article 46 mechanism. Customers receive
            30-day advance notice of any change to this posture.
          </p>
        </CardContent>
      </Card>
    </main>
  </div>
);

export default DataResidency;

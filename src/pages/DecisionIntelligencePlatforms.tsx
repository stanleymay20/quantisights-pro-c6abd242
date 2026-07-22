import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, ArrowRight, Shield, Brain, GitBranch, Lock } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ─── Comparison data ───────────────────────────────────────────────────────
type Cell = "strong" | "partial" | "limited" | "none";

interface Row {
  capability: string;
  detail: string;
  vendors: Record<string, Cell>;
}

const VENDORS = [
  "Quantivis",
  "Domo",
  "Quantexa",
  "ThoughtSpot",
  "Qlik",
  "IBM Cognos",
  "SAS",
  "Power BI",
  "SAP AC",
  "TIBCO",
  "Sisense",
] as const;

const ROWS: Row[] = [
  {
    capability: "Closed-loop decision lifecycle",
    detail: "Ingest → analyze → advise → decide → execute → measure → learn, in one system",
    vendors: {
      Quantivis: "strong", Domo: "partial", Quantexa: "partial", ThoughtSpot: "limited",
      Qlik: "limited", "IBM Cognos": "limited", SAS: "partial", "Power BI": "limited",
      "SAP AC": "partial", TIBCO: "limited", Sisense: "limited",
    },
  },
  {
    capability: "Append-only decision ledger",
    detail: "Every decision logged with inputs, confidence, rationale — immutable audit trail",
    vendors: {
      Quantivis: "strong", Domo: "none", Quantexa: "limited", ThoughtSpot: "none",
      Qlik: "none", "IBM Cognos": "none", SAS: "limited", "Power BI": "none",
      "SAP AC": "limited", TIBCO: "none", Sisense: "none",
    },
  },
  {
    capability: "Contextual governance profiles",
    detail: "Versioned per-org thresholds + sequenced approval chains enforced at write-time",
    vendors: {
      Quantivis: "strong", Domo: "limited", Quantexa: "partial", ThoughtSpot: "none",
      Qlik: "limited", "IBM Cognos": "partial", SAS: "partial", "Power BI": "limited",
      "SAP AC": "strong", TIBCO: "limited", Sisense: "none",
    },
  },
  {
    capability: "Epistemic confidence capping",
    detail: "Confidence calibrated to data volume; hard cap (0.85) on AI claims",
    vendors: {
      Quantivis: "strong", Domo: "none", Quantexa: "limited", ThoughtSpot: "none",
      Qlik: "none", "IBM Cognos": "none", SAS: "partial", "Power BI": "none",
      "SAP AC": "none", TIBCO: "none", Sisense: "none",
    },
  },
  {
    capability: "Information Quality scoring",
    detail: "7-dimension IQ score (accuracy, completeness, timeliness, …) attached to evidence",
    vendors: {
      Quantivis: "strong", Domo: "limited", Quantexa: "partial", ThoughtSpot: "limited",
      Qlik: "limited", "IBM Cognos": "limited", SAS: "partial", "Power BI": "limited",
      "SAP AC": "limited", TIBCO: "limited", Sisense: "limited",
    },
  },
  {
    capability: "Causal vs correlation semantics",
    detail: "Edge typing in the reasoning graph distinguishes causal links from correlations",
    vendors: {
      Quantivis: "strong", Domo: "none", Quantexa: "partial", ThoughtSpot: "none",
      Qlik: "none", "IBM Cognos": "none", SAS: "partial", "Power BI": "none",
      "SAP AC": "none", TIBCO: "limited", Sisense: "none",
    },
  },
  {
    capability: "Evidence-hashed procurement packs",
    detail: "Immutable trust snapshots + SHA-256 bundle integrity for buyer due diligence",
    vendors: {
      Quantivis: "strong", Domo: "none", Quantexa: "none", ThoughtSpot: "none",
      Qlik: "none", "IBM Cognos": "limited", SAS: "limited", "Power BI": "none",
      "SAP AC": "limited", TIBCO: "none", Sisense: "none",
    },
  },
  {
    capability: "DSGVO / EU data residency posture",
    detail: "German-market localization, EU-resident data, Impressum, AVV, TOMs",
    vendors: {
      Quantivis: "strong", Domo: "partial", Quantexa: "partial", ThoughtSpot: "partial",
      Qlik: "partial", "IBM Cognos": "partial", SAS: "partial", "Power BI": "partial",
      "SAP AC": "strong", TIBCO: "partial", Sisense: "partial",
    },
  },
  {
    capability: "Natural-language copilot",
    detail: "Conversational front door over governed reasoning, with streamed evidence",
    vendors: {
      Quantivis: "partial", Domo: "strong", Quantexa: "partial", ThoughtSpot: "strong",
      Qlik: "partial", "IBM Cognos": "partial", SAS: "partial", "Power BI": "strong",
      "SAP AC": "partial", TIBCO: "partial", Sisense: "partial",
    },
  },
  {
    capability: "Connector breadth (data sources)",
    detail: "Pre-built integrations to BI, ERP, CRM, finance, ops systems",
    vendors: {
      Quantivis: "partial", Domo: "strong", Quantexa: "partial", ThoughtSpot: "partial",
      Qlik: "strong", "IBM Cognos": "partial", SAS: "partial", "Power BI": "strong",
      "SAP AC": "strong", TIBCO: "strong", Sisense: "partial",
    },
  },
];

const CELL_STYLE: Record<Cell, { label: string; cls: string }> = {
  strong:  { label: "Strong",  cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  partial: { label: "Partial", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  limited: { label: "Limited", cls: "bg-muted text-muted-foreground border-border" },
  none:    { label: "—",       cls: "bg-transparent text-muted-foreground/60 border-dashed border-border" },
};

const FAQS = [
  {
    q: "What is a decision intelligence platform?",
    a: "A decision intelligence (DI) platform automates the full lifecycle from data ingestion to executed decision and measured outcome — not just dashboards. Gartner defines the category around closed-loop reasoning: signals in, governed decisions out, outcomes captured, models retrained. Quantivis adds an append-only governance layer so every step is auditable.",
  },
  {
    q: "How is decision intelligence different from business intelligence?",
    a: "BI shows what happened. DI automates the next action. BI tools (Power BI, Tableau, Looker) deliver dashboards humans interpret. DI platforms run the lifecycle: ingest → model → simulate → execute → capture outcomes → retrain. Quantivis goes one step further — it governs the reasoning itself, with confidence caps, evidence hashes, and an append-only decision ledger.",
  },
  {
    q: "How is Quantivis different from Domo, Quantexa, ThoughtSpot, or SAS?",
    a: "Most platforms on Gartner's DI list lead with analytics breadth or NL search. Quantivis leads with governed reasoning: contextual governance profiles enforced at write-time, sequenced approval chains, 0.85 confidence cap on AI claims, SHA-256 evidence hashes on procurement packs, and an Operational Intelligence Graph with causal-vs-correlation edge semantics. Compare the matrix above — we are honest about where we are weaker (connector breadth, NL-search-as-front-door).",
  },
  {
    q: "Does Quantivis use generative AI? Is that safe for regulated decisions?",
    a: "Yes, and the answer to safety is structural, not promissory. AI suggestions are draft → validate → decide → act. Confidence is capped at 0.85 regardless of model output. Every claim is anchored to numeric evidence in 'Label: value' form. No conversational prose for math or projections — those use the deterministic ml-engine (Holt's, ARIMA, clustering). LLM outputs never write to the decision ledger without a human-in-the-loop or a passing rules-engine gate.",
  },
  {
    q: "Is Quantivis suitable for the German / EU market and DSGVO?",
    a: "Yes. Quantivis ships with German legal localization (/de/datenschutz, /de/agb, /de/avv, /de/toms), Impressum, EU data residency posture, an evidence-derived procurement pack with SHA-256 bundle integrity, and a published subprocessor registry. The DSGVO posture is built into the product, not bolted on.",
  },
  {
    q: "How do teams compare decision intelligence platforms?",
    a: "Beyond Gartner's Magic Quadrant, evaluate on five axes: (1) closed-loop coverage — does it ingest and act, or only visualize? (2) governance — is every decision auditable? (3) epistemic integrity — does the system cap its own confidence? (4) evidence handling — can buyers verify the data lineage? (5) deployment posture — does it match your regulatory market? The matrix on this page scores all 11 platforms across these axes.",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────
const DecisionIntelligencePlatforms = () => {
  const canonical = "https://www.quantivis.io/decision-intelligence-platforms";
  const title = "Decision Intelligence Platforms in 2026 — Compared | Quantivis";
  const description =
    "Compare 11 decision intelligence platforms across closed-loop coverage, governance, and epistemic integrity. Honest matrix: Quantivis vs Domo, Quantexa, ThoughtSpot, SAS, more.";

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Decision Intelligence Platforms in 2026 — Compared",
    description,
    author: { "@type": "Organization", name: "Quantivis" },
    publisher: {
      "@type": "Organization",
      name: "Quantivis",
      logo: { "@type": "ImageObject", url: "https://www.quantivis.io/favicon.ico" },
    },
    datePublished: "2026-06-23",
    dateModified: "2026-06-23",
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const upsertMeta = (selector: string, attrs: Record<string, string>) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        document.head.appendChild(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
      return el;
    };
    const upsertLink = (rel: string, href: string) => {
      let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = href;
      return el;
    };

    const created: HTMLElement[] = [];
    created.push(upsertMeta('meta[name="description"]', { name: "description", content: description }));
    created.push(upsertLink("canonical", canonical));
    created.push(upsertMeta('meta[property="og:title"]', { property: "og:title", content: title }));
    created.push(upsertMeta('meta[property="og:description"]', { property: "og:description", content: description }));
    created.push(upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical }));
    created.push(upsertMeta('meta[property="og:type"]', { property: "og:type", content: "article" }));
    created.push(upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" }));
    created.push(upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title }));
    created.push(upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description }));

    const ld1 = document.createElement("script");
    ld1.type = "application/ld+json";
    ld1.text = JSON.stringify(articleLd);
    ld1.dataset.dip = "1";
    document.head.appendChild(ld1);

    const ld2 = document.createElement("script");
    ld2.type = "application/ld+json";
    ld2.text = JSON.stringify(faqLd);
    ld2.dataset.dip = "1";
    document.head.appendChild(ld2);

    return () => {
      document.title = prevTitle;
      ld1.remove();
      ld2.remove();
    };
  }, [title, description, canonical, articleLd, faqLd]);

  return (
    <>
      <div className="min-h-screen bg-background">
        <Navbar />



        <main className="container mx-auto max-w-7xl px-4 py-12 md:py-20">
          {/* ── Hero ─────────────────────────────────────────────────── */}
          <header className="mb-16 max-w-4xl">
            <Badge variant="outline" className="mb-4">Category guide · Updated June 2026</Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Decision Intelligence Platforms in 2026 — Compared
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              BI tools show what happened. DI platforms automate the next action.{" "}
              <span className="text-foreground font-medium">
                Quantivis governs the reasoning itself
              </span>{" "}
              — every decision logged, every confidence calibrated, every action carrying an evidence hash.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button asChild size="lg">
                <Link to="/demo">See the Decision Ledger live <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/how-ai-is-used">Read the methodology</Link>
              </Button>
            </div>
          </header>

          {/* ── Category gap ─────────────────────────────────────────── */}
          <section className="mb-20">
            <h2 className="text-2xl md:text-3xl font-semibold mb-8">
              The category exists because dashboards weren't enough
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { stat: "58%", label: "of leaders say critical decisions still run on bad data", source: "Domo, 2025" },
                { stat: "$53B", label: "projected DI market by 2033 (19.1% CAGR)", source: "Market Research Future" },
                { stat: "12%", label: "of organizations report their data is AI-ready", source: "Domo, 2025" },
              ].map((s) => (
                <Card key={s.stat} className="border-border">
                  <CardContent className="pt-6">
                    <div className="text-4xl font-bold text-primary mb-2">{s.stat}</div>
                    <div className="text-sm text-foreground mb-2">{s.label}</div>
                    <div className="text-xs text-muted-foreground">Source: {s.source}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-muted-foreground max-w-3xl">
              The DI category answers a structural failure of BI: visualization without action,
              and action without governance. The 11 platforms below all claim closed-loop
              coverage. The matrix shows where the claim holds and where it doesn't.
            </p>
          </section>

          {/* ── Comparison matrix ───────────────────────────────────── */}
          <section className="mb-20">
            <h2 className="text-2xl md:text-3xl font-semibold mb-3">
              How 11 platforms compare across governance and reasoning
            </h2>
            <p className="text-muted-foreground mb-8 max-w-3xl">
              Scored on capabilities a buyer can verify, not marketing claims. We grade ourselves
              honestly — partial means partial.
            </p>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-muted/50 z-10 min-w-[220px]">
                      Capability
                    </th>
                    {VENDORS.map((v) => (
                      <th
                        key={v}
                        className={`px-3 py-3 font-semibold text-center min-w-[90px] ${
                          v === "Quantivis" ? "text-primary" : ""
                        }`}
                      >
                        {v}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr key={row.capability} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-4 py-3 sticky left-0 bg-inherit z-10 align-top">
                        <div className="font-medium text-foreground">{row.capability}</div>
                        <div className="text-xs text-muted-foreground mt-1">{row.detail}</div>
                      </td>
                      {VENDORS.map((v) => {
                        const cell = row.vendors[v];
                        const style = CELL_STYLE[cell];
                        return (
                          <td key={v} className="px-3 py-3 text-center align-middle">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-medium border ${style.cls}`}
                            >
                              {style.label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Scoring methodology: vendor documentation, Gartner reviews, and Domo's
              June 2025 DI platform comparison. Sources cited per cell on request.
            </p>
          </section>

          {/* ── What no one else ships ──────────────────────────────── */}
          <section className="mb-20">
            <h2 className="text-2xl md:text-3xl font-semibold mb-8">
              Four things no other platform on this list ships as a primitive
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Shield,
                  title: "Append-only governance audit",
                  body: "Every decision, threshold change, and approval written to an immutable ledger. BEFORE-UPDATE triggers enforce the sequence. No retroactive edits, ever.",
                },
                {
                  icon: GitBranch,
                  title: "Contextual Governance Engine",
                  body: "Versioned governance_profiles per organization. Sequenced approval chains. Context packs as overlays, not products. 'Why did I receive this?' is one click away.",
                },
                {
                  icon: Lock,
                  title: "Epistemic Integrity",
                  body: "AI confidence is capped at 0.85 regardless of model output. Confidence is decomposed into 5 sub-scores (data volume, recency, source agreement, model calibration, base rate). ConfidenceBadge surfaces it on every claim.",
                },
                {
                  icon: Brain,
                  title: "Operational Intelligence Graph + Narrative Fusion",
                  body: "PageRank centrality, blast-radius BFS, causal-vs-correlation edge typing, attention budgets, append-only narrative audit log. Reasoning is a graph you can inspect.",
                },
              ].map((c) => (
                <Card key={c.title} className="border-border">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <c.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{c.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{c.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Honest gaps ─────────────────────────────────────────── */}
          <section className="mb-20 max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold mb-6">
              Where we are honestly weaker
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                <span className="text-foreground font-medium">Connector breadth.</span> Domo
                ships 1,000+ pre-built connectors. We ship the AICIS bridge plus a curated set
                via our ingestion pipeline. If your stack is connector-count-bound, that gap
                matters — and we'll be transparent about it during evaluation.
              </p>
              <p>
                <span className="text-foreground font-medium">NL search as the front door.</span>{" "}
                ThoughtSpot and Domo lead with a search bar. We lead with the Decision Ledger.
                The Copilot exists and streams evidence, but it isn't the homepage.
              </p>
              <p>
                <span className="text-foreground font-medium">Embedded analytics.</span> Sisense
                owns the white-label/embed lane. We expose embed tokens for governed surfaces
                today; deeper iframe SDK work is on the roadmap, not in the product.
              </p>
            </div>
          </section>

          {/* ── FAQ ─────────────────────────────────────────────────── */}
          <section className="mb-20">
            <h2 className="text-2xl md:text-3xl font-semibold mb-8">
              Frequently asked questions
            </h2>
            <Accordion type="single" collapsible className="max-w-4xl">
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          {/* ── CTA ─────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-muted/30 p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              See governed reasoning in action
            </h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              The Decision Ledger, Contextual Governance Engine, and Confidence Caps are live
              in the product — not slideware. Five minutes to see a real decision logged.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button asChild size="lg">
                <Link to="/demo">Open the live demo <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/enterprise/contact">Talk to the team</Link>
              </Button>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default DecisionIntelligencePlatforms;

// satisfy unused-import lints for icons that may not render in every render path
void Check; void Minus;

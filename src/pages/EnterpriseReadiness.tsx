import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Brain, Globe, FileCheck, MapPin, ArrowRight, CheckCircle2, ScrollText } from "lucide-react";

/**
 * The page you send a procurement team first.
 * Not legal. Not marketing. A single-page summary that links to everything.
 */

const pillars = [
  {
    icon: ScrollText,
    title: "Contextual Governance",
    badge: "Live — Enforced",
    links: [
      { to: "/admin/governance-simulation", label: "Cross-Domain Governance Simulation" },
      { to: "/admin/context-packs", label: "Context Packs (University / Supply Chain / PE / Gov / Health)" },
      { to: "/admin/governance-audit", label: "Governance Audit Explorer" },
      { to: "/ai-governance", label: "Governance Principles" },
      { to: "/auditability", label: "Approval-Chain Enforcement" },
    ],
  },
  {
    icon: Lock,
    title: "Security",
    badge: "Controls documented",
    links: [
      { to: "/security-overview", label: "Security Overview" },
      { to: "/toms", label: "TOMs (EN)" },
      { to: "/de/toms", label: "TOMs (DE)" },
      { to: "/security-policy", label: "Vulnerability Disclosure" },
      { to: "/incident-response", label: "Incident Response" },
    ],
  },
  {
    icon: Shield,
    title: "Privacy",
    badge: "GDPR / DSGVO",
    links: [
      { to: "/privacy", label: "Privacy Policy (EN)" },
      { to: "/de/datenschutz", label: "Datenschutzerklärung (DE)" },
      { to: "/gdpr-rights", label: "GDPR Rights & Erasure" },
      { to: "/data-retention", label: "Data Retention" },
      { to: "/cookies", label: "Cookie Policy (EN)" },
      { to: "/de/cookies", label: "Cookie-Richtlinie (DE)" },
    ],
  },
  {
    icon: Brain,
    title: "AI Governance",
    badge: "EU AI Act aligned",
    links: [
      { to: "/how-ai-is-used", label: "How AI Is Used" },
      { to: "/ai-system-classification", label: "AI System Classification" },
      { to: "/ai-governance", label: "AI Governance" },
      { to: "/de/ki-nutzung", label: "KI-Nutzungserklärung (DE)" },
      { to: "/fairness", label: "Fairness & Drift" },
    ],
  },
  {
    icon: FileCheck,
    title: "Compliance",
    badge: "Procurement evidence",
    links: [
      { to: "/dpa", label: "DPA (EN)" },
      { to: "/de/avv", label: "AVV (DE) — beschaffungsreif" },
      { to: "/dpia", label: "DPIA Summary" },
      { to: "/auditability", label: "Auditability" },
      { to: "/security-questionnaire", label: "Security Questionnaire" },
      { to: "/sla", label: "SLA" },
    ],
  },
  {
    icon: MapPin,
    title: "Data Residency",
    badge: "EU-first",
    links: [
      { to: "/data-residency", label: "Data Residency & Transfers" },
      { to: "/subprocessors", label: "Sub-processor Registry" },
    ],
  },
  {
    icon: Globe,
    title: "Trust Center",
    badge: "Evidence-backed",
    links: [
      { to: "/trust", label: "Trust Center (live metrics)" },
      { to: "/procurement-pack", label: "Procurement Pack (ZIP)" },
      { to: "/system-health", label: "System Health" },
      { to: "/status", label: "System Status" },
    ],
  },
];

const EnterpriseReadiness = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
        <Button asChild size="sm" variant="outline">
          <Link to="/procurement-pack">Download Procurement Pack <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Link>
        </Button>
      </div>
    </header>

    <main className="flex-1 container mx-auto px-6 py-12 max-w-5xl">
      <div className="mb-10">
        <Badge variant="outline" className="text-[10px] mb-3">For procurement teams</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Enterprise Readiness</h1>
        <p className="text-muted-foreground text-base max-w-2xl leading-relaxed">
          Everything a security, legal, or procurement reviewer needs to evaluate Quantivis — in one place.
          Each pillar links to live evidence pages, signed policies, and downloadable artifacts.
        </p>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> DSGVO / GDPR</Badge>
          <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> EU AI Act aligned</Badge>
          <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> EU-first residency</Badge>
          <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Append-only audit</Badge>
          <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Human-in-the-loop</Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pillars.map((p) => (
          <Card key={p.title} className="border-border/50 hover:border-primary/30 transition-colors">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <p.icon className="w-4 h-4 text-primary" />
                  <h2 className="text-base font-semibold">{p.title}</h2>
                </div>
                <Badge variant="secondary" className="text-[10px]">{p.badge}</Badge>
              </div>
              <ul className="space-y-1.5">
                {p.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 group"
                    >
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/30 bg-primary/[0.02] mt-8">
        <CardContent className="pt-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold mb-1">Need something not listed?</h2>
            <p className="text-xs text-muted-foreground">Reach our team for custom questionnaires, MNDA, or vendor-specific responses.</p>
          </div>
          <Button asChild size="sm">
            <Link to="/enterprise/contact">Contact Enterprise <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  </div>
);

export default EnterpriseReadiness;

import {
  AlertTriangle, Lightbulb, Shield, Rocket, Brain, Compass,
  GraduationCap, Plane, HelpCircle, Clock, Users
} from "lucide-react";
import { CONTACT } from "@/lib/contact-config";

export interface Slide {
  number: number;
  title: string;
  icon: typeof Brain;
  content: React.ReactNode;
}

const Timing = ({ window }: { window: string }) => (
  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">
    <Clock className="w-3 h-3" /> {window}
  </div>
);

export const SLIDES: Slide[] = [
  {
    number: 1,
    title: "Cover — Berkeley Final Round",
    icon: Rocket,
    content: (
      <div className="text-center">
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Quantivis</h3>
        <p className="text-primary font-semibold text-lg mb-3">Governed Operational Reasoning Infrastructure</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A 2-minute pitch for the Berkeley Entrepreneurship Bootcamp final round.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
          <div className="p-3 rounded-lg border border-border">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Founder</p>
            <p className="text-sm font-semibold">Stanley Osei-Wusu</p>
          </div>
          <div className="p-3 rounded-lg border border-border">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Co-Founder</p>
            <p className="text-sm font-semibold">Souley Kassoum</p>
          </div>
        </div>
        <div className="mt-5 text-xs text-muted-foreground space-y-1">
          <p>Quantivis Global GmbH · Germany</p>
          <p>{CONTACT.email.general} · quantivis.io</p>
        </div>
      </div>
    ),
  },
  {
    number: 2,
    title: "Problem",
    icon: AlertTriangle,
    content: (
      <div className="space-y-4">
        <Timing window="0:00 – 0:20" />
        <p className="text-base sm:text-lg font-semibold text-foreground">
          Organizations are drowning in operational complexity.
        </p>
        <p className="text-sm text-muted-foreground">
          Data is scattered across CRM systems, ERP platforms, operational tools, and external
          intelligence sources. Leaders receive dashboards and reports — but lack clear,
          explainable intelligence to support strategic decisions.
        </p>
        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
          <p className="text-xs text-destructive font-semibold">
            More data, less clarity. No audit trail for why a decision was made.
          </p>
        </div>
      </div>
    ),
  },
  {
    number: 3,
    title: "Solution",
    icon: Lightbulb,
    content: (
      <div className="space-y-4">
        <Timing window="0:20 – 0:50" />
        <p className="text-base sm:text-lg font-semibold text-foreground">
          Quantivis is a governed operational reasoning platform.
        </p>
        <p className="text-sm text-muted-foreground">
          It transforms fragmented operational signals into explainable executive intelligence,
          interventions, and strategic decision support.
        </p>
        <p className="text-sm text-muted-foreground">
          Instead of just generating AI recommendations, Quantivis provides{" "}
          <strong className="text-foreground">evidence-linked reasoning</strong> and{" "}
          <strong className="text-foreground">governance controls</strong> so organizations
          understand <em>why</em> each decision is suggested.
        </p>
      </div>
    ),
  },
  {
    number: 4,
    title: "Differentiation",
    icon: Shield,
    content: (
      <div className="space-y-4">
        <Timing window="0:50 – 1:20" />
        <p className="text-base sm:text-lg font-semibold text-foreground">
          What makes Quantivis different is its focus on governed reasoning.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            "Operational intelligence",
            "Decision governance",
            "Organizational memory",
            "Explainability by default",
          ].map((p) => (
            <div key={p} className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs font-semibold text-primary text-center">
              {p}
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          We use <strong className="text-foreground">deterministic reasoning</strong> where trust
          matters — helping organizations remain compliant, transparent, and accountable.
        </p>
      </div>
    ),
  },
  {
    number: 5,
    title: "Vision",
    icon: Compass,
    content: (
      <div className="space-y-4">
        <Timing window="1:20 – 1:45" />
        <p className="text-base sm:text-lg font-semibold text-foreground">
          The operating system for governed organizational cognition.
        </p>
        <p className="text-sm text-muted-foreground">
          A platform that helps organizations continuously{" "}
          <strong className="text-foreground">sense, understand, decide, act, and learn</strong>{" "}
          — while preserving institutional knowledge across leadership cycles.
        </p>
        <div className="flex flex-wrap gap-1.5 justify-center pt-1">
          {["Sense", "Understand", "Decide", "Act", "Learn"].map((s) => (
            <span key={s} className="px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
              {s}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    number: 6,
    title: "Why Berkeley",
    icon: GraduationCap,
    content: (
      <div className="space-y-4">
        <Timing window="1:45 – 2:00" />
        <p className="text-base sm:text-lg font-semibold text-foreground">
          Why the Berkeley Entrepreneurship Bootcamp.
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">›</span> World-class mentorship from experienced founders and investors</li>
          <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">›</span> Validation of our governed-reasoning thesis with global peers</li>
          <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">›</span> A platform to refine and commercialize Quantivis globally</li>
        </ul>
      </div>
    ),
  },
  {
    number: 7,
    title: "Travel & Accommodation Financing",
    icon: Plane,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Honest, concrete plan to finance travel and accommodation for the bootcamp.
        </p>
        <ul className="space-y-2 text-sm">
          {[
            "Personal contribution and savings",
            "Support from GISMA University (where available)",
            "Startup grants and entrepreneurship programs",
            "Sponsorship opportunities and ecosystem partners",
            "Support from entrepreneurship networks and alumni",
          ].map((s) => (
            <li key={s} className="flex items-start gap-2 text-muted-foreground">
              <span className="text-primary font-bold mt-0.5">•</span> {s}
            </li>
          ))}
        </ul>
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
          <p className="text-xs text-primary font-semibold italic">
            "I am actively exploring a combination of personal funding, university support,
            grants, and startup ecosystem opportunities to finance travel and accommodation."
          </p>
        </div>
      </div>
    ),
  },
  {
    number: 8,
    title: "Q&A Preparation",
    icon: HelpCircle,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Likely judge questions — rehearse short, confident answers.</p>
        {[
          { q: "Why not just use Power BI?", a: "Power BI visualizes data. Quantivis governs decisions — adding evidence, reasoning, and accountability that BI tools don't provide." },
          { q: "How is this different from AI copilots?", a: "Copilots assist with tasks. Quantivis governs reasoning — deterministic where trust matters, with explainability and audit." },
          { q: "Who is the customer?", a: "Mid-market and enterprise operations leaders (COO, CFO, Heads of Strategy) in regulated or complex industries." },
          { q: "What is the business model?", a: "B2B SaaS — tiered subscriptions plus paid pilots; enterprise contracts for governed deployments." },
          { q: "How do you prevent AI hallucinations?", a: "Deterministic reasoning on trusted paths, evidence-linked recommendations, and confidence capped by data sufficiency." },
          { q: "Evidence the market needs this?", a: "Boards and regulators (EU AI Act, DORA) increasingly demand explainable, auditable decision processes." },
        ].map((item) => (
          <div key={item.q} className="p-3 rounded-lg border border-border bg-card/50">
            <p className="text-xs font-semibold text-foreground">Q: {item.q}</p>
            <p className="text-xs text-muted-foreground mt-1">A: {item.a}</p>
          </div>
        ))}
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-2">
          <Users className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-primary font-semibold">
            Leave them thinking: "This founder has identified a serious problem and built a sophisticated solution."
          </p>
        </div>
      </div>
    ),
  },
];

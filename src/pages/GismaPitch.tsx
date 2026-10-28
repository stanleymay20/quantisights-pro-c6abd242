import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpenCheck, BrainCircuit, Building2, ClipboardCheck,
  GitBranch, ShieldCheck, Target, Workflow,
} from "lucide-react";

const coreStages = [
  "Trust the evidence",
  "Expose conflicts",
  "Evaluate options",
  "Govern approvals",
  "Track execution",
  "Measure outcomes",
  "Learn responsibly",
];

const productLayers = [
  {
    title: "Quantivis Core",
    stage: "Existing product lineage",
    detail: "Data quality, evidence and provenance, advisory workflows, Decision Ledger, governance, execution, and outcome feedback.",
    icon: ShieldCheck,
  },
  {
    title: "Decision Solutions",
    stage: "First commercial focus",
    detail: "Supplier-risk decisions first. Finance, Revenue, and Operations are subsequent opportunities, not launched suites.",
    icon: Target,
  },
  {
    title: "Governed AI Agents",
    stage: "Controlled expansion",
    detail: "Assist analysts and operations teams behind authorization, audit, human review and explicit abstention.",
    icon: BrainCircuit,
  },
];

const proof = [
  { title: "Implemented code", content: "Data ingestion and validation, analytical workflows, supplier-risk orchestration, Decision Ledger and execution components are present in the maintained repository." },
  { title: "Validation needed", content: "Production reliability, full supplier journey, external data connectors, real outcomes, customer demand and security qualifications must be demonstrated on a verified release." },
  { title: "What we do not claim", content: "No represented paying customers, signed pilots, proven ROI, consulting-firm parity, or certified regulatory compliance without independent evidence." },
];

const workflow = [
  { heading: "Supplier delay", body: "Take in a traceable source event with supplier, delay, timestamp and data-quality checks." },
  { heading: "Response options", body: "Compare mitigation choices, assumptions, conflicts and uncertainty; abstain when evidence is weak." },
  { heading: "Accountable decision", body: "Require authorized review and record evidence and approval in the Decision Ledger." },
  { heading: "Follow-through", body: "Track assigned execution and record measured outcomes, leaving unknown results unknown." },
];

const alternatives = [
  {
    category: "Consulting and AI advisory",
    examples: "McKinsey / QuantumBlack, KPMG, Deloitte, PwC, EY, Accenture",
    fit: "Human experts, bespoke transformation, change management and implementation may be the right choice.",
    hypothesis: "Quantivis aims to support repeatable, ongoing decision review and follow-through between engagements.",
  },
  {
    category: "Enterprise decision platforms",
    examples: "Aera, Palantir and other operational intelligence systems",
    fit: "Established software solutions already address parts of decision automation, governance and operations.",
    hypothesis: "Our market hypothesis is a narrower, accessible mid-market workflow; this is not a claim of feature uniqueness.",
  },
  {
    category: "BI, ERP, FP&A and internal analytics",
    examples: "Existing company reporting, finance and transactional tools",
    fit: "Keep these as systems of record and specialist analysis tools.",
    hypothesis: "Quantivis seeks to provide the governed record of why a decision was made and what happened next.",
  },
];

const GismaPitch = () => (
  <main className="min-h-dvh bg-background text-foreground">
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
        <span className="rounded-full border border-primary/30 px-3 py-1">AsiaBerlin 2026 · GISMA pitch brief</span>
        <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">Technical validation stage</span>
      </div>

      <header className="mt-7 max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Quantivis Global</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
          Continuous intelligence for <span className="text-primary">accountable business decisions.</span>
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Quantivis is building an enterprise AI Decision Intelligence and Governance platform.
          It aims to connect business evidence, response options, human approval, execution
          and measured outcomes in one auditable workflow.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/enterprise/contact" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:opacity-90">
            Discuss a design-partner pilot <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/demo" className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 font-semibold hover:bg-muted">
            Open technical demo <Workflow className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The technical demo depends on the live backend and is not evidence of a production-certified customer deployment.
          Demonstration data must be labeled as synthetic.
        </p>
      </header>

      <section className="mt-16" aria-labelledby="problem-title">
        <div className="flex items-start gap-3"><Building2 className="mt-1 h-6 w-6 text-primary" /><div>
          <h2 id="problem-title" className="text-2xl font-semibold">The customer problem</h2>
          <p className="mt-2 max-w-4xl leading-relaxed text-muted-foreground">
            Decision-makers get dashboards, reports, consultants and AI advice from many places.
            But they still need to establish which evidence is trustworthy, which alternatives
            were considered, who approved a course of action, whether it was executed, and what
            the real outcome was. We seek to make that recurring process easier to govern and review.
          </p>
        </div></div>
      </section>

      <section className="mt-14" aria-labelledby="loop-title">
        <h2 id="loop-title" className="text-2xl font-semibold">One accountable decision loop</h2>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {coreStages.map((step, i) => (
            <li key={step} className="rounded-xl border border-border bg-card p-4 text-sm">
              <span className="mb-2 block text-xs font-semibold text-primary">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-medium">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-labelledby="platform-title">
        <h2 id="platform-title" className="text-2xl font-semibold">The product: one core, focused solutions, governed agents</h2>
        <p className="mt-2 text-sm text-muted-foreground">Enterprise OS is our long-term vision, not a claim that every module is already available.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {productLayers.map(({ title, stage, detail, icon: Icon }) => (
            <article key={title} className="rounded-xl border border-border bg-card p-6">
              <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-primary">{stage}</p>
              <h3 className="mt-2 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="supplier-title">
        <div className="flex items-start gap-3"><GitBranch className="mt-1 h-6 w-6 text-primary" /><div>
          <h2 id="supplier-title" className="text-2xl font-semibold">First use case: Supplier Decision Intelligence</h2>
          <p className="mt-2 max-w-4xl text-muted-foreground">A proposed first pilot for European mid-market manufacturers and operators. The buyer, budget and outcome improvements remain validation hypotheses.</p>
        </div></div>
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {workflow.map(({ heading, body }, i) => (
            <li key={heading} className="rounded-lg border border-border p-5">
              <p className="text-xs font-semibold text-primary">Step {i + 1}</p>
              <h3 className="mt-1 font-semibold">{heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-labelledby="consulting-title">
        <h2 id="consulting-title" className="text-2xl font-semibold">Consulting comparison: complement and productize repeatable work</h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Our position is not “replace consultants.” Specialist firms and enterprise platforms already have serious AI, governance and operational capabilities.
          Quantivis aims to provide a persistent decision record for a defined recurring workflow.
        </p>
        <div className="mt-5 space-y-3">
          {alternatives.map(({ category, examples, fit, hypothesis }) => (
            <article key={category} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
              <div><h3 className="font-semibold">{category}</h3><p className="mt-1 text-xs text-muted-foreground">{examples}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Strength of alternatives</p><p className="mt-1 text-sm text-muted-foreground">{fit}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Our testable hypothesis</p><p className="mt-1 text-sm text-muted-foreground">{hypothesis}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="evidence-title">
        <h2 id="evidence-title" className="text-2xl font-semibold">Evidence and limits</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {proof.map(({ title, content }, i) => {
            const Icon = [BookOpenCheck, ClipboardCheck, ShieldCheck][i];
            return <article key={title} className="rounded-xl border border-border p-5">
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{content}</p>
            </article>;
          })}
        </div>
      </section>

      <footer className="mt-14 rounded-xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">What we are seeking</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Introductions to mid-market procurement/operations leaders, a bounded design partner,
          and a measurable supplier-risk pilot. Our first proof must be demonstrated with real,
          permissioned evidence and a baseline rather than assumed return on investment.
        </p>
        <p className="mt-5 text-xs text-muted-foreground">
          Product strategy dated 28 October 2026. Public brief of a developing product, not a
          customer testimonial, independently audited comparison or production certification.
        </p>
      </footer>
    </div>
  </main>
);

export default GismaPitch;

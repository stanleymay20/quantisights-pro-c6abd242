import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight, Calendar, MapPin, Euro, Trophy, ExternalLink,
  Clock, CheckCircle2, AlertCircle, Rocket, Globe, Award
} from "lucide-react";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

type Status = "open" | "closed" | "upcoming";

interface Competition {
  name: string;
  organizer: string;
  prize: string;
  deadline: string;
  location: string;
  status: Status;
  url: string;
  eligibility: string[];
  fit: "perfect" | "good" | "stretch";
  notes: string;
}

const COMPETITIONS: Competition[] = [
  {
    name: "BMWK Gründungswettbewerb – Digitale Innovationen",
    organizer: "German Federal Ministry for Economic Affairs",
    prize: "Up to €32K seed capital + coaching + networking",
    deadline: "Rolling (twice per year)",
    location: "Germany",
    status: "open",
    url: "https://www.bmwk.de/Redaktion/DE/Wettbewerb/gruenderwettbewerb-digitale-innovationen.html",
    eligibility: ["German-based startups", "ICT / digital innovations", "Early-stage or pre-founding"],
    fit: "perfect",
    notes: "Federal government program — strong credibility signal. Rolling applications with two evaluation rounds per year.",
  },
  {
    name: "Rising Digital Award 2026",
    organizer: "Rising Digital",
    prize: "€30,000 + coaching from experienced experts",
    deadline: "Applications open — check website",
    location: "Germany",
    status: "open",
    url: "https://rising-digital.io/",
    eligibility: ["Digital startups", "New benefits through digital innovation", "Early-stage welcome"],
    fit: "perfect",
    notes: "German digital startup award with premium partners. Strong fit for B2B SaaS / Decision Intelligence.",
  },
  {
    name: "EU-Startups Summit Pitch Competition",
    organizer: "EU-Startups",
    prize: "€1M+ package (funding, credits, accelerator access)",
    deadline: "Feb 10, 2026 (closed for 2026)",
    location: "Malta · May 7–8, 2026",
    status: "closed",
    url: "https://www.eu-startups.com/summit/",
    eligibility: ["Pre-Seed or Seed stage", "< 3 years old", "< €750K VC raised", "EU-based"],
    fit: "perfect",
    notes: "Largest EU startup pitch competition. 15 finalists pitch on main stage. Watch for 2027 applications opening ~Dec 2026.",
  },
  {
    name: "OOTB.NRW Competition",
    organizer: "Out of the Box NRW / NRW.BANK",
    prize: "€50K total (€25K / €15K / €10K)",
    deadline: "Next round TBA (was Feb 2026)",
    location: "North Rhine-Westphalia, Germany",
    status: "upcoming",
    url: "https://www.outofthebox.nrw/competition/",
    eligibility: ["Startups in NRW or willing to relocate", "Innovative digital solutions"],
    fit: "good",
    notes: "Regional NRW competition backed by NRW.BANK. Check for next round opening.",
  },
  {
    name: "WMF Startup Competition 2026",
    organizer: "We Make Future",
    prize: "Access to $1M Startup World Cup + global exposure",
    deadline: "Applications open",
    location: "Italy (Rimini)",
    status: "open",
    url: "https://www.wemakefuture.it/",
    eligibility: ["EU-based companies eligible", "All stages", "Tech startups"],
    fit: "good",
    notes: "Gateway to the $1M Startup World Cup in Silicon Valley. Strong exposure opportunity.",
  },
  {
    name: "EIC Accelerator",
    organizer: "European Innovation Council",
    prize: "Up to €17.5M (grant + equity blended finance)",
    deadline: "May 6, 2026 (short proposals)",
    location: "EU-wide",
    status: "open",
    url: "https://eic.ec.europa.eu/",
    eligibility: ["EU-based SME or startup", "Deep-tech / breakthrough innovation", "TRL 5–8"],
    fit: "stretch",
    notes: "Highly competitive (~3% success rate). Best if positioned as breakthrough AI/decision-science technology. Requires substantial application prep.",
  },
];

const statusConfig: Record<Status, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  open: { label: "Open", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  closed: { label: "Closed", color: "text-muted-foreground bg-muted/50 border-border/50", icon: AlertCircle },
  upcoming: { label: "Upcoming", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: Clock },
};

const fitBadge: Record<string, string> = {
  perfect: "bg-primary/10 text-primary border-primary/20",
  good: "bg-accent/50 text-accent-foreground border-accent/50",
  stretch: "bg-muted text-muted-foreground border-border/50",
};

const Competitions = () => {
  const openComps = COMPETITIONS.filter((c) => c.status === "open");
  const otherComps = COMPETITIONS.filter((c) => c.status !== "open");

  return (
    <div className="min-h-dvh bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Quantivis" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/pitch" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:border-primary/30 transition-all hidden sm:inline-flex">
              One-Pager
            </Link>
            <Link to="/demo" className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all">
              Live Demo
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero */}
        <section className="py-12 sm:py-20">
          <div className="container mx-auto px-6 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary mb-6">
                <Trophy className="w-3.5 h-3.5" />
                Competition Tracker
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
                Startup Competitions &{" "}
                <span className="gradient-text">Grants</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Tracked opportunities for Quantivis — EU/German competitions, grants, and accelerator programs matching our stage and market.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Open Competitions */}
        <section className="py-8 sm:py-12">
          <div className="container mx-auto px-6 max-w-4xl">
            <h2 className="text-xl sm:text-[18px] font-semibold tracking-tight tracking-tight mb-6 flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" />
              Open Applications ({openComps.length})
            </h2>
            <div className="space-y-4">
              {openComps.map((comp, i) => (
                <CompetitionCard key={comp.name} comp={comp} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* Other Competitions */}
        <section className="py-8 sm:py-12 bg-muted/10">
          <div className="container mx-auto px-6 max-w-4xl">
            <h2 className="text-xl sm:text-[18px] font-semibold tracking-tight tracking-tight mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              Closed / Upcoming ({otherComps.length})
            </h2>
            <div className="space-y-4">
              {otherComps.map((comp, i) => (
                <CompetitionCard key={comp.name} comp={comp} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* Resources */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-6 max-w-2xl text-center">
            <Award className="w-10 h-10 text-primary mx-auto mb-4" />
            <h2 className="text-[18px] font-semibold tracking-tight tracking-tight mb-4">Competition-Ready Assets</h2>
            <p className="text-muted-foreground mb-8">
              Everything you need to submit a winning application.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              <Link to="/pitch" className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
                <Globe className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-sm font-semibold">One-Pager</p>
                <p className="text-xs text-muted-foreground">Investor overview</p>
              </Link>
              <Link to="/pitch-deck" className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
                <Rocket className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-sm font-semibold">Pitch Deck</p>
                <p className="text-xs text-muted-foreground">Slide content</p>
              </Link>
              <Link to="/demo" className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
                <Trophy className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-sm font-semibold">Live Demo</p>
                <p className="text-xs text-muted-foreground">Full platform</p>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

function CompetitionCard({ comp, index }: { comp: Competition; index: number }) {
  const status = statusConfig[comp.status];
  const StatusIcon = status.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className="p-5 sm:p-6 rounded-xl border border-border bg-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-base">{comp.name}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${status.color}`}>
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${fitBadge[comp.fit]}`}>
              {comp.fit} fit
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{comp.organizer}</p>
        </div>
        <a
          href={comp.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
        >
          Visit <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mb-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Euro className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{comp.prize}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{comp.deadline}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{comp.location}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {comp.eligibility.map((e) => (
          <span key={e} className="px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground border border-border/30">
            {e}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{comp.notes}</p>
    </motion.div>
  );
}

export default Competitions;

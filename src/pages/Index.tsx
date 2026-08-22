import { forwardRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Shield, TrendingUp, Globe } from "lucide-react";
import { Eyebrow, MarketingCard, MarketingCTA, MarketingSection, TagBadge } from "@/components/design-system/marketing-primitives";
import { REGION_DISCLOSURE_SHORT } from "@/lib/reliability-claims";
import { COMMERCIAL_TERMS, TIERS } from "@/lib/stripe-tiers";
import { PILOT_TERMS } from "@/lib/pilot-terms";

const NAVY = "hsl(var(--brand-executive-navy))";
const DEEP = "hsl(var(--brand-marketing-deep))";
const ACCENT = "hsl(var(--brand-marketing-accent))";
const MUTED = "hsl(var(--brand-marketing-muted))";
const SLATE = "hsl(var(--brand-marketing-slate))";

const DECISIONS = [
  { id: "DL-2847", category: "Risk Mitigation", confidence: 90, impact: "+€20K", tag: "Pending", time: "2m ago", governance: "Active" },
  { id: "DL-2846", category: "Revenue Growth", confidence: 88, impact: "+€15K", tag: "Approved", time: "14m ago", governance: "Logged" },
  { id: "DL-2845", category: "Cost Optimisation", confidence: 85, impact: "+€8K", tag: "Review", time: "31m ago", governance: "Active" },
  { id: "DL-2844", category: "Supply Chain", confidence: 92, impact: "+€42K", tag: "Approved", time: "1h ago", governance: "Logged" },
  { id: "DL-2843", category: "Risk Mitigation", confidence: 79, impact: "+€11K", tag: "Pending", time: "2h ago", governance: "Active" },
];

const ResponsiveStyles = () => (
  <style>{`
    .qv-page { min-height: 100dvh; background: #fff; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .qv-wrap { max-width: 1280px; margin: 0 auto; padding: 96px 24px; }
    .qv-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
    .qv-nav-links { display: flex; gap: 28px; align-items: center; }
    .qv-nav-link { font-size: 14px; color: rgba(255,255,255,0.65); text-decoration: none; padding: 6px 2px; border-bottom: 1px solid transparent; transition: color 0.15s, border-color 0.15s; }
    .qv-nav-link:hover { color: #fff; }
    .qv-nav-link.is-active { color: #fff; border-bottom-color: ${ACCENT}; }
    .qv-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 64px; align-items: center; }
    .qv-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; }
    .qv-grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .qv-hero { position: relative; min-height: 100vh; display: flex; flex-direction: column; justify-content: flex-end; color: #fff; overflow: hidden; }
    .qv-hero-content { position: relative; z-index: 2; max-width: 1280px; margin: 0 auto; padding: 128px 24px 80px; width: 100%; }
    .qv-hero h1 { font-family: Georgia, serif; font-size: clamp(36px, 5vw, 64px); line-height: 1.1; letter-spacing: -0.02em; max-width: 860px; margin: 28px 0; font-weight: 400; }
    .qv-hero-copy { font-size: 18px; line-height: 1.7; color: rgba(255,255,255,0.82); max-width: 650px; margin: 0 0 40px; }
    .qv-illustrative-banner { display: inline-flex; align-items: center; gap: 10px; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.45); color: #FCD34D; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; padding: 8px 14px; border-radius: 4px; margin-top: 40px; }
    .qv-illustrative-banner-dot { width: 6px; height: 6px; border-radius: 50%; background: #F59E0B; }
    .qv-mock-frame { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; overflow: hidden; margin-top: 12px; }
    .qv-mock-titlebar { background: rgba(0,0,0,0.30); padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .qv-mock-title { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: rgba(255,255,255,0.78); }
    .qv-mock-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(255,255,255,0.55); font-weight: 500; letter-spacing: 0.06em; }
    .qv-mock-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22C55E; box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }
    .qv-cta-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 32px; }
    .qv-primary-cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: ${ACCENT}; color: #fff; padding: 14px 28px; border-radius: 4px; font-size: 14px; font-weight: 700; text-decoration: none; }
    .qv-secondary-cta { display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: rgba(255,255,255,0.78); font-size: 14px; text-decoration: none; }
    .qv-ledger { background: transparent; border: none; border-radius: 0; overflow: visible; }
    .qv-ledger-row, .qv-ledger-head { display: grid; grid-template-columns: 80px 1fr 90px 80px 90px 90px 110px; align-items: center; }
    .qv-ledger-head { padding: 8px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .qv-ledger-row { padding: 14px 20px; }
    .qv-mobile-card { display: none; }
    .qv-heading { font-family: Georgia, serif; font-size: clamp(28px, 4vw, 52px); line-height: 1.15; color: ${NAVY}; font-weight: 400; letter-spacing: -0.02em; margin: 0; }
    .qv-card { background: #fff; padding: 40px 36px; }
    .qv-card-interactive { transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s; }
    .qv-card-interactive:hover { box-shadow: 0 8px 24px -8px rgba(30,39,97,0.18); transform: translateY(-1px); border-color: rgba(30,39,97,0.22); }
    .qv-footer-grid { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 48px; margin-bottom: 48px; }
    .qv-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: rgba(255,255,255,0.06); }
    @media (max-width: 900px) {
      .qv-wrap { padding: 72px 18px; }
      .qv-nav-inner { height: 60px; padding: 0 18px; }
      .qv-nav-links a:not(:last-child):not([href='#demo']):not(.qv-nav-signin) { display: none; }
      .qv-nav-links { gap: 10px; }
      .qv-nav-signin { font-size: 13px !important; padding: 8px 12px !important; border: 1px solid rgba(255,255,255,0.18); border-radius: 4px; color: #fff !important; }
      .qv-grid-2, .qv-grid-3, .qv-grid-4, .qv-footer-grid { grid-template-columns: 1fr; gap: 24px; }
      .qv-hero { min-height: auto; }
      .qv-hero-content { padding: 104px 18px 48px; }
      .qv-hero h1 { font-size: clamp(34px, 11vw, 48px); line-height: 1.05; margin: 22px 0; max-width: 100%; }
      .qv-hero-copy { font-size: 16px; line-height: 1.65; margin-bottom: 28px; }
      .qv-cta-row { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 32px; }
      .qv-primary-cta, .qv-secondary-cta { width: 100%; min-height: 48px; box-sizing: border-box; }
      .qv-ledger { margin-top: 28px; }
      .qv-ledger-head, .qv-ledger-row { display: none; }
      .qv-mobile-card { display: block; padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .qv-mobile-card-title { color: #fff; font-weight: 600; font-size: 13px; line-height: 1.35; margin: 8px 0; }
      .qv-mobile-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
      .qv-mobile-metric { background: rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; text-align: center; }
      .qv-card { padding: 30px 22px; }
      .qv-heading { font-size: clamp(28px, 9vw, 40px); }
      .qv-form-grid { grid-template-columns: 1fr; }
      .qv-hide-mobile { display: none !important; }
      input, textarea, button, a { font-size: 16px; }
    }
    @media (max-width: 520px) {
      .qv-nav-links a[href='#demo'] { padding: 8px 12px !important; font-size: 12px !important; }
      .qv-badge { font-size: 9px !important; line-height: 1.4; }
      .qv-stat-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .qv-footer-bottom { flex-direction: column; align-items: flex-start !important; gap: 16px; }
    }
  `}</style>
);

const NAV_SECTIONS = ["platform", "pricing", "demo"] as const;

const Nav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => {
    const elements = NAV_SECTIONS.map(id => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-30% 0px -30% 0px", threshold: [0, 0.25, 0.5, 1] });
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const linkClass = (id: string) => `qv-nav-link${activeSection === id ? " is-active" : ""}`;
  return (
    <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, backgroundColor: scrolled ? "rgba(14,22,40,0.97)" : DEEP, borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent", backdropFilter: "blur(12px)", transition: "background-color 0.3s, border-color 0.3s" }}>
      <div className="qv-nav-inner">
        <Link to="/" style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 600, color: "#fff", textDecoration: "none", letterSpacing: "-0.02em" }}>Quantivis</Link>
        <nav className="qv-nav-links" aria-label="Primary">
          <a href="#platform" className={linkClass("platform")} aria-current={activeSection === "platform" ? "true" : undefined}>Platform</a>
          <a href="#pricing" className={linkClass("pricing")} aria-current={activeSection === "pricing" ? "true" : undefined}>Pricing</a>
          <Link to="/trust" className="qv-nav-link">Security</Link>
          <Link to="/login" className="qv-nav-link qv-nav-signin" style={{ color: "rgba(255,255,255,0.75)" }}>Sign In</Link>
          <Link to="/register" className="qv-nav-link qv-hide-mobile" style={{ color: "rgba(255,255,255,0.55)" }}>Sign Up</Link>
          <a href="#demo" style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: ACCENT, padding: "9px 18px", borderRadius: 4, textDecoration: "none" }}>Request Demo</a>
        </nav>
      </div>
    </header>
  );
};

const LedgerTicker = () => {
  const [visible, setVisible] = useState([0, 1, 2]);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setFade(true);
      window.setTimeout(() => {
        setVisible(prev => prev.map(i => (i + 1) % DECISIONS.length));
        setFade(false);
      }, 350);
    }, 3200);
    return () => window.clearInterval(interval);
  }, []);
  const primaryDecision = DECISIONS[visible[0]];
  return (
    <div className="qv-mock-frame qv-ledger">
      <div className="qv-mock-titlebar"><span className="qv-mock-title">Decision Ledger · Illustrative View</span><span className="qv-mock-status"><span className="qv-mock-status-dot" />Sample workflow</span></div>
      <div className="qv-mobile-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{primaryDecision.id}</span>
          <TagBadge tone={primaryDecision.tag}>{primaryDecision.tag}</TagBadge>
        </div>
        <div className="qv-mobile-card-title">{primaryDecision.category}</div>
        <div className="qv-mobile-metrics"><div className="qv-mobile-metric"><div style={{ color: "#fff", fontWeight: 700 }}>{primaryDecision.confidence}%</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>CONF.</div></div><div className="qv-mobile-metric"><div style={{ color: "#fff", fontWeight: 700 }}>{primaryDecision.impact}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>IMPACT</div></div><div className="qv-mobile-metric"><div style={{ color: "#4ADE80", fontWeight: 700 }}>{primaryDecision.governance}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>GOV.</div></div></div>
      </div>
      <div className="qv-ledger-head"><span /><span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>DECISION</span><span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>CONF.</span><span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>IMPACT</span><span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>STATUS</span><span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>AGE</span><span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>GOVERNANCE</span></div>
      <div style={{ opacity: fade ? 0.35 : 1, transition: "opacity 0.35s" }}>
        {visible.map(index => {
          const decision = DECISIONS[index];
          return <div className="qv-ledger-row" key={decision.id}><span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{decision.id}</span><span style={{ color: "#fff", fontSize: 12 }}>{decision.category}</span><span style={{ color: "#fff", fontSize: 12 }}>{decision.confidence}%</span><span style={{ color: "#fff", fontSize: 12 }}>{decision.impact}</span><span><TagBadge tone={decision.tag}>{decision.tag}</TagBadge></span><span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{decision.time}</span><span style={{ color: "#4ADE80", fontSize: 11 }}>{decision.governance}</span></div>;
        })}
      </div>
    </div>
  );
};

const Hero = () => (
  <section className="qv-hero" style={{ background: DEEP }}>
    <LandingHeroMedia />
    <div className="qv-hero-content">

      <Eyebrow tone="light">Enterprise decision intelligence</Eyebrow>
      <h1>Turn consequential decisions into governed, reviewable records.</h1>
      <p className="qv-hero-copy">Quantivis brings evidence, recommendations, human approval, execution context and outcomes into one decision record — so teams can understand what was decided, why, and what happened next.</p>
      <div className="qv-cta-row"><MarketingCTA href="#demo">Request a Demo <ArrowRight size={16} /></MarketingCTA><MarketingCTA href="#platform" variant="secondary">See the platform <ArrowRight size={14} /></MarketingCTA></div>
      <div className="qv-illustrative-banner" role="note" aria-label="Illustrative data disclosure"><span className="qv-illustrative-banner-dot" aria-hidden="true" />Illustrative data — not a live customer record</div>
      <LedgerTicker />
    </div>
  </section>
);

const DecisionBrief = () => (
  <section style={{ background: DEEP, paddingBottom: 96 }}>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
      <div className="qv-grid-2">
        <div>
          <Eyebrow tone="light" style={{ display: "block", marginBottom: 20 }}>The governance record</Eyebrow>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(26px, 3vw, 42px)", lineHeight: 1.15, letterSpacing: "-0.02em", color: "#fff", fontWeight: 400, margin: "0 0 24px" }}>Every decision. Full evidence chain. One auditable record.</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.78)", lineHeight: 1.75, margin: "0 0 32px" }}>The Decision Ledger captures AI recommendations, human approvals, supporting evidence, predicted outcomes and observed outcomes so teams can review how consequential decisions were made.</p>
          {[["Recommendation → Decision → Outcome → Learning", "The full loop, recorded in one governed workflow"], ["Source-aware outputs on governed recommendations", "Evidence references are carried into the decision record for review"], ["Calibration after measurable outcomes", "Prediction performance can be compared with observed results over time"]].map(([title, sub]) => (
            <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}><div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(34,197,94,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}><span style={{ color: "#4ADE80", fontSize: 11, fontWeight: 700 }}>✓</span></div><div><div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{title}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{sub}</div></div></div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}><div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}><TagBadge tone="Warning" style={{ borderRadius: 2 }}>Risk Mitigation</TagBadge><TagBadge tone="Success" style={{ borderRadius: 2 }}>Governance Active</TagBadge></div><div style={{ fontSize: 13, color: "#fff", fontWeight: 500, lineHeight: 1.4 }}>Illustrative inventory and working-capital decision</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>Example record · Source: enterprise connector</div></div>
          <div className="qv-form-grid">{[["90%", "Illustrative confidence", "#22C55E"], ["+€20K", "Illustrative impact", "#fff"], ["Strong", "Evidence", "#F59E0B"]].map(([value, label, color]) => <div key={label} style={{ background: "rgba(255,255,255,0.03)", padding: "14px 16px" }}><div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div></div>)}</div>
          <div style={{ padding: "14px 20px" }}>{["Source reference attached", "Governance checks recorded", "Human approval captured"].map(item => <div key={item} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }}>{item}</span></div>)}</div>
        </div>
      </div>
    </div>
  </section>
);

const Stats = () => <div style={{ background: MUTED, borderBottom: `1px solid rgba(30,39,97,0.1)` }}><div className="qv-grid-4 qv-stat-strip" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>{[["Decision", "Evidence-backed records"], ["Human", "Approval and oversight"], ["Outcome", "Measurement and learning"], ["15+", "Enterprise data connectors"]].map(([value, label]) => <div key={label} style={{ padding: "26px 14px", borderRight: `1px solid rgba(30,39,97,0.1)` }}><div style={{ fontFamily: "Georgia, serif", fontSize: 32, fontWeight: 400, color: NAVY, letterSpacing: "-0.03em" }}>{value}</div><div style={{ fontSize: 13, color: SLATE, marginTop: 4, lineHeight: 1.5 }}>{label}</div></div>)}</div></div>;

const SocialProof = () => <section style={{ background: "#fff", borderBottom: `1px solid rgba(30,39,97,0.08)` }}><div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px" }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}><div><Eyebrow style={{ marginBottom: 14 }}>What a governed workflow should prove</Eyebrow><p style={{ fontFamily: "Georgia, serif", fontSize: "clamp(17px, 2vw, 22px)", color: NAVY, lineHeight: 1.5, margin: "0 0 16px", fontWeight: 400 }}>A strong decision system should show the signal, the evidence, who approved the action, what outcome was expected, and what happened afterwards.</p><p style={{ fontSize: 12, color: SLATE, lineHeight: 1.6, margin: 0 }}>These are product design objectives and illustrative workflow outcomes — not attributed customer results.</p></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{[["Traceable", "Recommendation, evidence and approval stay linked"], ["Reviewable", "Governance records are available for audit and board review"], ["Measurable", "Predicted and observed outcomes can be compared"], ["Learnable", "Outcome history can inform future calibration"]].map(([stat, desc]) => <div key={stat} className="qv-card-interactive" style={{ background: "#fff", padding: "18px", border: "1px solid rgba(30,39,97,0.12)", borderRadius: 8 }}><div style={{ fontFamily: "Georgia, serif", fontSize: 22, color: NAVY, fontWeight: 400, marginBottom: 4 }}>{stat}</div><div style={{ fontSize: 12, color: SLATE, lineHeight: 1.5 }}>{desc}</div></div>)}</div></div></div></section>;

const Problem = () => <section style={{ background: "#fff" }}><div className="qv-wrap"><Eyebrow style={{ marginBottom: 24 }}>The Problem</Eyebrow><h2 className="qv-heading" style={{ maxWidth: 760, marginBottom: 48 }}>Your organisation runs on decisions. But when one fails, can you answer these?</h2>{[["Who approved this decision, and what evidence did they have?", "Without a logged approval chain, accountability is anecdotal."], ["What outcome did we predict, and what actually happened?", "Quantivis can compare the prediction with the recorded outcome and preserve the learning signal."], ["Did our AI recommendation perform better than the alternative?", "Quantivis preserves the decision and outcome history needed to evaluate performance over time."]].map(([question, answer]) => <div key={question} className="qv-grid-2" style={{ gap: 32, padding: "30px 0", borderTop: `1px solid rgba(30,39,97,0.12)` }}><div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: NAVY, lineHeight: 1.35 }}>{question}</div><div style={{ fontSize: 15, color: SLATE, lineHeight: 1.7 }}>{answer}</div></div>)}</div></section>;

const HowItWorks = () => <section style={{ background: MUTED }}><div className="qv-wrap"><Eyebrow style={{ marginBottom: 24 }}>Illustrative decision — step by step</Eyebrow><h2 className="qv-heading" style={{ maxWidth: 640, marginBottom: 48 }}>From operational signal to board-reviewable outcome.</h2><div style={{ display: "flex", flexDirection: "column", gap: 0 }}>{[["01", "Signal ingested", "An operational system flags a supplier-risk change. Quantivis can ingest the signal and create a Decision Brief with the available evidence and confidence context."], ["02", "Evidence assembled", "The workflow links relevant internal data and available alternatives so reviewers can see what supports the recommendation."], ["03", "Human decision recorded", "An authorised reviewer approves, rejects or requests more evidence. The action, rationale and timestamp become part of the governed record."], ["04", "Outcome measured", "When outcome data becomes available, Quantivis can compare it with the prediction and preserve the result for calibration and review."]].map(([number, title, description], i) => <div key={number} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 24, padding: "28px 0", borderBottom: i < 3 ? `1px solid rgba(30,39,97,0.1)` : "none", alignItems: "flex-start" }}><div style={{ fontFamily: "Georgia, serif", fontSize: 36, color: i === 0 ? ACCENT : "hsl(var(--brand-executive-navy) / 0.145)", lineHeight: 1, fontWeight: 400 }}>{number}</div><div><h3 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: NAVY, marginBottom: 8, fontWeight: 400 }}>{title}</h3><p style={{ fontSize: 14, color: SLATE, lineHeight: 1.75, margin: 0 }}>{description}</p></div></div>)}</div></div></section>;

const Platform = () => {
  const features = [
    { icon: <CheckCircle size={20} color={ACCENT} />, title: "Decision Ledger", description: "A governed record of decisions, evidence, approvals and outcomes across your organisation." },
    { icon: <Shield size={20} color={ACCENT} />, title: "Governance Score", description: "Recommendations can carry evidence, confidence and risk context for human review." },
    { icon: <TrendingUp size={20} color={ACCENT} />, title: "Outcome Intelligence", description: "Compare what was predicted with the outcome that was later recorded." },
    { icon: <Globe size={20} color={ACCENT} />, title: "Geopolitical Signal Layer", description: "AICIS signal integration can bring geopolitical context into governed decision workflows." },
    { icon: <Shield size={20} color={ACCENT} />, title: "Source Verification Layer", description: "Evidence references and verification controls help keep recommendations tied to source material." },
    { icon: <Shield size={20} color={ACCENT} />, title: "Enterprise Connectors", description: "SAP, Salesforce, Dynamics, HubSpot, NetSuite, BigQuery, Snowflake, S3, Sheets, REST APIs and more." },
  ];
  return <MarketingSection id="platform"><div className="qv-wrap"><Eyebrow style={{ marginBottom: 24 }}>The Platform</Eyebrow><div className="qv-grid-2" style={{ gap: 48, marginBottom: 48 }}><h2 className="qv-heading">Built for the decisions that matter.</h2><p style={{ fontSize: 16, color: SLATE, lineHeight: 1.75, margin: 0 }}>Quantivis is not just a dashboard. It is a governed decision record — the layer between AI recommendations and the humans who act on them.</p></div><div className="qv-grid-3" style={{ background: `rgba(30,39,97,0.08)` }}>{features.map(feature => <MarketingCard key={feature.title}><div style={{ marginBottom: 16 }}>{feature.icon}</div><h3 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: NAVY, marginBottom: 12, fontWeight: 400 }}>{feature.title}</h3><p style={{ fontSize: 13, color: SLATE, lineHeight: 1.75, margin: 0 }}>{feature.description}</p></MarketingCard>)}</div></div></MarketingSection>;
};

const SecurityTrust = () => (
  <section style={{ background: MUTED, borderTop: `1px solid rgba(30,39,97,0.1)`, borderBottom: `1px solid rgba(30,39,97,0.1)` }}>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "64px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>
        <div>
          <Eyebrow style={{ marginBottom: 16 }}>Security & compliance</Eyebrow>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(22px, 2.5vw, 34px)", color: NAVY, fontWeight: 400, margin: "0 0 24px", lineHeight: 1.2 }}>Built for procurement teams, not just developers.</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            {[{ label: "SOC 2 Type II", status: "Not claimed without report" }, { label: "ISO 27001", status: "Not claimed without certificate" }, { label: "TISAX", status: "Not claimed without assessment" }, { label: "BSI C5", status: "Not claimed without attestation" }].map(({ label, status }) => <div key={label} style={{ border: "1px solid rgba(30,39,97,0.18)", borderRadius: 6, padding: "8px 12px" }}><div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{label}</div><div style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>{status}</div></div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["EU Data Residency", REGION_DISCLOSURE_SHORT], ["GDPR-ready controls", "DPA support, privacy controls and data-governance workflows are available; customers remain responsible for their own compliance obligations."], ["EU AI Act support", "Governance records support risk-management, transparency and human-oversight workflows where those obligations apply."], ["Encryption", "Encryption controls protect data at rest and in transit; current implementation details are documented in the Trust Center."], ["Access Control", "SAML SSO, SCIM provisioning, MFA, WebAuthn passkeys and RBAC are available according to plan and configuration."], ["Audit Trail", "Tamper-evident decision records and evidence verification support later review."]].map(([label, desc]) => <div key={label} style={{ padding: "14px 0", borderBottom: `1px solid rgba(30,39,97,0.08)` }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ color: "#16a34a", fontSize: 12, fontWeight: 700 }}>✓</span><span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{label}</span></div><p style={{ fontSize: 11, color: SLATE, lineHeight: 1.5, margin: 0, paddingLeft: 20 }}>{desc}</p></div>)}
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><a href="/trust" style={{ fontSize: 12, color: ACCENT, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>View Trust Center →</a><a href="/procurement-pack" style={{ fontSize: 12, color: SLATE, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>View procurement pack →</a></div>
        </div>
        <div>
          <Eyebrow style={{ marginBottom: 16 }}>Why not just use Microsoft?</Eyebrow>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(22px, 2.5vw, 34px)", color: NAVY, fontWeight: 400, margin: "0 0 24px", lineHeight: 1.2 }}>Different layers of the governance stack.</h2>
          <p style={{ fontSize: 15, color: SLATE, lineHeight: 1.75, margin: "0 0 24px" }}>Quantivis is designed around the business decision record: who approved an action, what evidence supported it, what outcome was expected and what happened afterwards. Existing productivity, compliance and workflow platforms can remain part of the surrounding stack.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[["AI productivity tools", "Assist users with AI-generated work", "Quantivis", "Focuses on governed business decisions and outcomes"], ["Data compliance platforms", "Govern documents, identities and data", "Quantivis", "Adds a decision-level evidence and approval record"], ["Workflow platforms", "Automate operational processes", "Quantivis", "Adds decision governance and outcome learning"]].map(([comp, compDesc, qv, qvDesc]) => <div key={comp} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "12px 0", borderBottom: `1px solid rgba(30,39,97,0.08)` }}><div><div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{comp}</div><div style={{ fontSize: 12, color: SLATE, lineHeight: 1.45 }}>{compDesc}</div></div><div style={{ fontSize: 11, color: "hsl(var(--brand-executive-navy) / 0.333)", fontStyle: "italic" }}>and</div><div><div style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>{qv}</div><div style={{ fontSize: 12, color: SLATE, lineHeight: 1.45 }}>{qvDesc}</div></div></div>)}</div>
        </div>
      </div>
    </div>
  </section>
);

const EUAIAct = () => <section style={{ background: DEEP, color: "#fff" }}><div className="qv-wrap"><Eyebrow tone="light" style={{ marginBottom: 24 }}>Compliance support</Eyebrow><div className="qv-grid-2" style={{ gap: 64 }}><div><h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1.15, fontWeight: 400, letterSpacing: "-0.02em", margin: "0 0 32px" }}>High-risk AI governance needs documented controls and human oversight. Quantivis helps teams assemble the decision evidence.</h2><MarketingCTA as={Link} to="/ai-governance" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.25)" }}>Read our EU AI Act guide <ArrowRight size={14} /></MarketingCTA></div><div className="qv-grid-2" style={{ gap: 32, alignItems: "start" }}>{[["Relevant high-risk AI requirements", ["Article 9 — Risk management", "Article 13 — Transparency", "Article 14 — Human oversight"]], ["Quantivis workflow support", ["Governed decision trail", "Evidence chain", "Board-reviewable reports"]]].map(([title, items]) => <div key={title as string}><div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>{title as string}</div>{(items as string[]).map(item => <div key={item} style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", lineHeight: 1.4 }}>{item}</div>)}</div>)}</div></div></div></section>;

const Pricing = () => {
  const plans = [
    { name: TIERS.starter.name, price: `${TIERS.starter.currency}${TIERS.starter.price}`, cadence: "/month", seats: TIERS.starter.features[0], features: TIERS.starter.features.slice(1), featured: false, cta: "Discuss Essentials" },
    { name: TIERS.growth.name, price: `${TIERS.growth.currency}${TIERS.growth.price.toLocaleString("en-US")}`, cadence: "/month", seats: TIERS.growth.features[0], features: TIERS.growth.features.slice(1), featured: true, cta: "Request Governance Demo" },
    { name: TIERS.enterprise.name, price: "From €6,500", cadence: "/month", seats: TIERS.enterprise.features[1], features: TIERS.enterprise.features.filter((feature) => feature !== "Everything in Governance, plus:" && feature !== TIERS.enterprise.features[1]), featured: false, cta: "Contact Enterprise Sales" },
  ];
  return (
    <section id="pricing" style={{ background: "#fff" }}>
      <div className="qv-wrap">
        <Eyebrow style={{ marginBottom: 24 }}>Pricing</Eyebrow>
        <div className="qv-grid-2" style={{ gap: 48, marginBottom: 16 }}><h2 className="qv-heading">Straightforward pricing. No hidden tier surprises.</h2><p style={{ fontSize: 15, color: SLATE, lineHeight: 1.75, margin: 0 }}>Evaluate Quantivis with a {PILOT_TERMS.days}-day no-card {PILOT_TERMS.tierLabel} pilot. Eligible paid checkouts may also include a {COMMERCIAL_TERMS.trialDays}-day checkout trial; billing and renewal terms are shown before confirmation.</p></div>
        <p style={{ fontSize: 12, color: SLATE, margin: "0 0 32px", letterSpacing: "0.02em" }}>Current plan capabilities below come from the same commercial tier definitions used by the application. All amounts exclude VAT.</p>
        <div className="qv-grid-3" style={{ background: `rgba(30,39,97,0.08)` }}>
          {plans.map(plan => <div key={plan.name} className="qv-card" style={{ display: "flex", flexDirection: "column", position: "relative", borderRadius: 0, outline: plan.featured ? `2px solid ${ACCENT}` : "none", outlineOffset: -2 }}>{plan.featured && <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: ACCENT, textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", padding: "6px 0" }}>Recommended for governed teams</div>}<div style={{ paddingTop: plan.featured ? 24 : 0 }}><h3 style={{ fontFamily: "Georgia, serif", fontSize: 22, color: NAVY, fontWeight: 400, margin: "0 0 20px" }}>{plan.name}</h3><div><span style={{ fontFamily: "Georgia, serif", fontSize: 40, color: NAVY }}>{plan.price}</span><span style={{ fontSize: 13, color: SLATE }}> {plan.cadence}</span></div><div style={{ fontSize: 13, color: SLATE, marginBottom: 24 }}>{plan.seats}</div>{plan.features.map(feature => <div key={feature} style={{ display: "flex", gap: 10, marginBottom: 12 }}><span style={{ color: "#16a34a", fontWeight: 700 }} aria-hidden="true">✓</span><span style={{ fontSize: 13, color: "hsl(var(--brand-executive-navy) / 0.8)", lineHeight: 1.5 }}>{feature}</span></div>)}</div><MarketingCTA href="#demo" style={{ marginTop: "auto", background: plan.featured ? ACCENT : "transparent", color: plan.featured ? "#fff" : NAVY, border: plan.featured ? "none" : `1.5px solid ${NAVY}` }} aria-label={`${plan.cta} for the ${plan.name} plan`}>{plan.cta}</MarketingCTA></div>)}
        </div>
      </div>
    </section>
  );
};

const Demo = () => {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.company) return;
    setStatus("sending");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.from("enterprise_leads").insert({ full_name: form.name, work_email: form.email, company: form.company, use_case: form.message || null, source: "homepage_demo_form", status: "new" });
      if (error) throw error;
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return <section id="demo" style={{ background: DEEP, color: "#fff" }}><div className="qv-wrap qv-grid-2" style={{ gap: 64, alignItems: "start" }}><div><Eyebrow tone="light" style={{ marginBottom: 24 }}>See Quantivis in your workflow</Eyebrow><h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px, 4vw, 52px)", fontWeight: 400, margin: "0 0 24px", lineHeight: 1.15 }}>Bring one consequential decision. We’ll show you the evidence trail.</h2><p style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.7, fontSize: 15 }}>A strong pilot starts with one measurable decision process, the systems that inform it, the required approval path and the outcome you want to track.</p><p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 16 }}>No fabricated ROI claims. We define pilot success criteria with you before measuring results.</p></div><div>{status === "sent" ? <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "48px 30px", textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 16 }}>✓</div><h3 style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#fff", marginBottom: 12 }}>Request received</h3><p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>We will be in touch to arrange the next step.</p></div> : <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>{[["Full name *", "name", "Jane Smith", "text"], ["Work email *", "email", "jane@company.com", "email"], ["Company *", "company", "Acme GmbH", "text"]].map(([label, key, placeholder, type]) => <label key={key} style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}<input type={type} required value={form[key as keyof typeof form]} placeholder={placeholder} onChange={event => setForm(prev => ({ ...prev, [key]: event.target.value }))} style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "13px 14px", fontSize: 16, color: "#fff", outline: "none", boxSizing: "border-box" }} /></label>)}<label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>What are you trying to govern? <span style={{ opacity: 0.5 }}>(optional)</span><textarea rows={3} value={form.message} placeholder="e.g. AI procurement decisions, supply chain risk approvals..." onChange={event => setForm(prev => ({ ...prev, message: event.target.value }))} style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "13px 14px", fontSize: 16, color: "#fff", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></label>{status === "error" && <p style={{ fontSize: 13, color: "#EF4444", margin: 0 }}>Something went wrong. Please email hello@quantivis.io directly.</p>}<MarketingCTA as="button" type="submit" disabled={status === "sending"} style={{ border: "none", cursor: status === "sending" ? "not-allowed" : "pointer" }}>{status === "sending" ? "Sending…" : <>Request a working session <ArrowRight size={16} /></>}</MarketingCTA></form>}</div></div></section>;
};

const Footer = () => <footer style={{ background: "#0a1120", color: "#fff" }}><div style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 24px 28px" }}><div className="qv-footer-grid"><div><div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Quantivis</div><p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.6, maxWidth: 280 }}>Enterprise decision intelligence and governed decision records.</p></div><div><div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Product</div><Link to="/documentation" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Documentation</Link><Link to="/trust" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Trust Center</Link></div><div><div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Company</div><Link to="/contact" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Contact</Link><Link to="/about" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>About</Link></div><div><div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Legal</div><Link to="/privacy" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Privacy</Link><Link to="/terms" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Terms</Link></div><div><div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Access</div><Link to="/login" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Sign In</Link><Link to="/register" style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none", marginBottom: 8 }}>Create account</Link></div></div><div className="qv-footer-bottom" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>© 2026 Quantivis. All rights reserved.</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Claims should be verified against the Trust Center and current procurement evidence.</span></div></div></footer>;

export default function Index() {
  return <div className="qv-page"><ResponsiveStyles /><Nav /><Hero /><DecisionBrief /><Stats /><SocialProof /><Problem /><HowItWorks /><Platform /><SecurityTrust /><EUAIAct /><Pricing /><Demo /><Footer /></div>;
}

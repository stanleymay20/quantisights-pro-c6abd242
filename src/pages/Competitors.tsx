import { Link } from "react-router-dom";
import { Check, ArrowRight, Shield, Brain, Lock, Zap, Star, TrendingUp, Globe, Search, Plug } from "lucide-react";

const NAVY = "#1E2761";
const DEEP = "#0E1628";
const ACCENT = "#3D5AFE";
const GOLD = "#C9A84C";
const MUTED = "#F4F6F9";
const SLATE = "#64748B";
const GREEN = "#16a34a";

const WEDGE = "Domo's 2025 DI report lists 10 platforms. Every one of them answers: \"What does the data say?\" None answers: \"Who approved the AI recommendation, on what evidence, and did it work?\" EU AI Act Article 13 makes that second question a legal obligation from 2025. Quantivis is the only platform that ships it as a product primitive — not a professional-services engagement.";

const COLS = [
  { key: "q",    label: "Quantivis",    hi: true },
  { key: "sas",  label: "SAS" },
  { key: "domo", label: "Domo" },
  { key: "qntx", label: "Quantexa" },
  { key: "pbi",  label: "Power BI" },
  { key: "sap",  label: "SAP AC" },
  { key: "ibm",  label: "IBM Cognos" },
  { key: "ts",   label: "ThoughtSpot" },
  { key: "qlik", label: "Qlik" },
  { key: "sis",  label: "Sisense" },
];

const MATRIX = [
  // ── GOVERNANCE ──────────────────────────────────────────────────────────────
  { cat:"Governance", cap:"Append-only decision audit trail",         tip:"SHA-256-hashed, immutable record — who approved what, when, on what evidence",                    v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Governance", cap:"Contextual approval chain enforcement",    tip:"BEFORE-UPDATE trigger at DB layer — no decision bypasses governance, not bypassable by admins",  v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Governance", cap:"EU AI Act Art. 9 / 13 / 14 evidence packs",tip:"Export-ready compliance documentation generated automatically per decision",                     v:{q:1,sas:0,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Governance", cap:"Decision Maturity Score (A–F)",            tip:"Quantified governance health across every decision domain — not a vanity dashboard",             v:{q:1,sas:0,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Governance", cap:"Disparate-impact ratio monitoring",        tip:"Detects systematic bias in AI-assisted decisions across demographic dimensions",                 v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Governance", cap:"Evidence-hash procurement packs",          tip:"Cryptographically-linked evidence chain per approved decision — for auditors and procurement",    v:{q:1,sas:0,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Governance", cap:"Human-in-the-loop enforcement (not just UI)",tip:"Approval enforced at database trigger level — not a skippable button",                         v:{q:1,sas:0.5,domo:0.5,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  // ── INTELLIGENCE ──────────────────────────────────────────────────────────
  { cat:"Intelligence", cap:"Closed-loop outcome capture + retraining",tip:"Decision → outcome → learning, closed automatically — no manual data entry",                   v:{q:1,sas:1,domo:0.5,qntx:0,pbi:0,sap:0.5,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Intelligence", cap:"Epistemic confidence cap (0.85 hard limit)",tip:"All scores deterministic, capped — no LLM hallucination possible in recommendations",          v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Intelligence", cap:"Bayesian self-calibration (EWMA)",       tip:"Model weights adjust based on actual decision hit rate over time",                               v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Intelligence", cap:"Cost-of-Delay engine",                   tip:"Quantifies revenue impact of delayed or untracked decisions in real currency",                   v:{q:1,sas:0,domo:0,qntx:0,pbi:0,sap:0.5,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Intelligence", cap:"Graph-based causal influence mapping",   tip:"Causal vs correlation, PageRank centrality, blast-radius BFS — Quantexa stops at fraud",        v:{q:1,sas:0,domo:0,qntx:1,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Intelligence", cap:"7-dimension Information Quality score",  tip:"Measures data quality across 7 dimensions before any AI model runs",                            v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  { cat:"Intelligence", cap:"Governance-aware NL search (Copilot)",   tip:"\"Which decision had highest governance risk?\" — every answer source-verified and logged",    v:{q:1,sas:0,domo:1,qntx:0,pbi:1,sap:0.5,ibm:0,ts:1,qlik:0.5,sis:0} },
  // ── COMPLIANCE ─────────────────────────────────────────────────────────────
  { cat:"Compliance", cap:"EU data residency (DSGVO-native)",        tip:"All data in Supabase Frankfurt — zero US-cloud dependency, DPA included",                       v:{q:1,sas:0,domo:0,qntx:0,pbi:0,sap:0.5,ibm:0,ts:0.5,qlik:0.5,sis:0.5} },
  { cat:"Compliance", cap:"SOC 2 Type II controls (in progress)",    tip:"SOC 2 audit started Q3 2026 — Drata framework, controls mapped",                               v:{q:0.5,sas:1,domo:1,qntx:1,pbi:1,sap:1,ibm:1,ts:1,qlik:1,sis:1} },
  { cat:"Compliance", cap:"Step-Up Auth + HIBP integration",         tip:"Progressive authentication for high-risk decisions; HIBP for credential security",              v:{q:1,sas:0,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0.5,qlik:0.5,sis:0.5} },
  { cat:"Compliance", cap:"Row-Level Security on all tables",        tip:"RLS enforced at DB layer on 209 tables — not bypassable through any API",                       v:{q:1,sas:0.5,domo:0,qntx:0,pbi:0,sap:0,ibm:0,ts:0,qlik:0,sis:0} },
  // ── PLATFORM ───────────────────────────────────────────────────────────────
  { cat:"Platform", cap:"Pre-built connector library",               tip:"Domo: 1,000+. Quantivis: 50+ live (SAP, Salesforce, REST, BigQuery, Snowflake, S3, CSV, webhooks)", v:{q:0.5,sas:0.5,domo:1,qntx:0,pbi:1,sap:1,ibm:1,ts:0.5,qlik:0.5,sis:0.5} },
  { cat:"Platform", cap:"Self-serve analytics (NL search)",          tip:"ThoughtSpot/Power BI lead. Quantivis Copilot is governance-first NL — expanding to data-first", v:{q:0.5,sas:0,domo:1,qntx:0,pbi:1,sap:0.5,ibm:0,ts:1,qlik:0.5,sis:0} },
  { cat:"Platform", cap:"Embedded / white-label analytics",          tip:"Governance API on roadmap Q4 2026 — decision_ledger + governance_export endpoints",             v:{q:0,sas:0,domo:0.5,qntx:0,pbi:1,sap:0.5,ibm:0,ts:0,qlik:0,sis:1} },
  { cat:"Platform", cap:"Mid-market pricing (< €2K/month entry)",    tip:"Essentials €499/mo, Governance €1,999/mo. SAS starts at €100K+/year.",                          v:{q:1,sas:0,domo:0,qntx:0,pbi:1,sap:0,ibm:0,ts:0,qlik:0,sis:0.5} },
  { cat:"Platform", cap:"< 1 week time-to-value",                    tip:"First governance record live in under 7 days — no 18-month implementation",                      v:{q:1,sas:0,domo:0.5,qntx:0,pbi:0.5,sap:0,ibm:0,ts:0.5,qlik:0.5,sis:0.5} },
];

const GAPS = [
  {
    icon: <Plug size={16} />, gap:"Connector breadth",
    status:"Live",
    before:"Domo ships 1,000+ prebuilt connectors. Quantivis had ~15.",
    after:"50+ live connectors: SAP ERP, Salesforce, Redshift, BigQuery, Snowflake, PostgreSQL, MySQL, S3, CSV, REST webhooks — plus universal webhook ingest for any system that emits events. Connector count growing monthly.",
  },
  {
    icon: <Search size={16} />, gap:"Governance-aware NL search",
    status:"Live",
    before:"ThoughtSpot/Domo AI Chat/Power BI Copilot are the headline buyer-demo moment. Quantivis had no NL entry point.",
    after:"Decision Copilot: ask \"Which AI decision had the highest governance risk this week?\" Every answer source-verified, governance-logged, and linked to the original decision record. Unlike Domo/Power BI Copilot, it cannot answer outside the governance evidence chain.",
  },
  {
    icon: <Globe size={16} />, gap:"Mass-market accessibility",
    status:"Live",
    before:"Platform copy was executive/governance-first — risked reading as heavyweight like Cognos/SAS to mid-market buyers.",
    after:"Homepage now leads with Article 13-first framing. \"<1 week time-to-value\" and €499/month Essentials tier above the fold. 90-day pilot with no SOC 2 required to begin — removes the enterprise procurement barrier.",
  },
  {
    icon: <TrendingUp size={16} />, gap:"Planning / forecasting surface",
    status:"Q3 2026",
    before:"SAP Analytics Cloud's planning lane. War-Room + Monte Carlo covered it technically but weren't packaged as a buyer-facing surface.",
    after:"Packaging War-Room + Monte Carlo as \"Scenario Planner\" — executive-facing, not data-science-facing. Connects directly to decision approval flow so every forecast becomes a governable action.",
  },
  {
    icon: <Zap size={16} />, gap:"Embedded / white-label analytics",
    status:"Q4 2026",
    before:"Sisense's lane. No embed or API story for partner platforms.",
    after:"Governance API: decision_ledger + governance_export endpoints exposing Quantivis governance layer to partner platforms. Any SaaS vendor can add EU AI Act Article 13 compliance to their product via API.",
  },
];

const VERDICTS = [
  { vendor:"Domo",                 score:2, summary:"Best-in-class connectors and real-time dashboards. Zero decision governance. Zero EU AI Act compliance story. AI Chat has no epistemic cap — it can hallucinate inside your data.", why:"Use Domo for dashboards. Use Quantivis for what happens after the dashboard is read." },
  { vendor:"SAS Intelligent Decisioning", score:7, summary:"Closest competitor technically. Rules + model governance, closed-loop retraining. Critical gap: governs automated decisions (credit scoring, fraud) — not human decisions in response to AI. Six-figure contracts, 18-month implementations.", why:"SAS for automated decision factories at €500K+/year. Quantivis for human-in-the-loop strategic governance at €499/month." },
  { vendor:"Quantexa",             score:5, summary:"Graph + entity resolution. The only other vendor doing causal relationship mapping — stops at fraud/AML/KYC. No decision audit trail. No EU AI Act evidence packs. No outcome tracking.", why:"Quantexa governs your data graph. Quantivis governs your decision graph." },
  { vendor:"Power BI / Copilot",   score:3, summary:"Inside every Microsoft 365 tenant — the most dangerous competitor by distribution, not by capability. Copilot logs what the AI said, not what the organisation decided. No approval workflow. No outcome tracking. No Article 13.", why:"Quantivis sits one layer above Power BI — the governance layer Microsoft does not provide." },
  { vendor:"SAP Analytics Cloud",  score:4, summary:"Strong planning + SAP-native integration for finance and supply chain. No decision governance, no approval chain, no outcome tracking, no EU AI Act compliance documentation.", why:"SAP tells you the plan. Quantivis records every deviation from it — with approval trail." },
  { vendor:"IBM Cognos",           score:3, summary:"Legacy reporting for compliance-heavy regulated industries. Governance = data-access governance, not decision accountability. No outcome tracking. Enterprise-only pricing.", why:"Cognos for regulated reporting. Quantivis for the decisions those reports inform." },
  { vendor:"ThoughtSpot",          score:2, summary:"Best self-serve NL analytics. Zero decision governance. The gap: ThoughtSpot tells you what the data says. It cannot record who acted on it, who approved the action, or what happened.", why:"ThoughtSpot for insight discovery. Quantivis for what your team decides to do about it." },
  { vendor:"Qlik / TIBCO / Sisense", score:2, summary:"Analytics infrastructure. Excellent at insight delivery, zero at decision governance. None produce EU AI Act Article 13 evidence or track human approvals against AI recommendations.", why:"These tools surface insights. Quantivis records what your organisation does with them." },
];

const PRIMITIVES = [
  { icon:<Lock size={22} color={GOLD} />, title:"Append-only governance audit", body:"Every decision, approval, and outcome written once — SHA-256-hashed per record. Mathematically immutable. Not a log file. Not a database you can UPDATE. This is what EU AI Act Article 13 actually requires in production, and the only way to prove it in front of a regulator." },
  { icon:<Shield size={22} color={GOLD} />, title:"Epistemic-integrity caps", body:"No Quantivis model output presents a confidence above 0.85. Every score is deterministic — no LLM math, no hallucination possible. The \"copilot, not autopilot\" mandate enforced in code. When Domo or Power BI Copilot hallucinates inside your governance data, you have no defence. When Quantivis gives you a confidence score, it is mathematically bounded." },
  { icon:<Brain size={22} color={GOLD} />, title:"Contextual approval chains", body:"Approval stages enforced by a BEFORE-UPDATE database trigger — not a UI button you can click past. A decision cannot skip governance. Not misconfigurable. Not bypassable by admins. Not a setting in a control panel. The governance is at the infrastructure layer — which is the only layer that matters when a regulator asks for proof." },
  { icon:<Star size={22} color={GOLD} />, title:"Outcome-calibrated learning", body:"After every decision, Quantivis captures the real outcome and compares it to what was predicted. Brier-score calibration adjusts future recommendations based on actual hit rate. No other platform on this list ships this as a product primitive. SAS can approximate it with custom professional services engagements. Quantivis ships it in the €499/month tier." },
];

type CellVal = number;
function Cell({ v }: { v: CellVal }) {
  if (v === 1) return <span style={{ color: GREEN, fontWeight: 700, fontSize: 17 }}>&#10003;</span>;
  if (v === 0.5) return <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>~</span>;
  return <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 13 }}>&#10007;</span>;
}

function Dots({ n }: { n: number }) {
  return (
    <div style={{ display:"flex", gap:3 }}>
      {Array.from({ length:10 }, (_,i) => (
        <div key={i} style={{ width:6, height:6, borderRadius:"50%", background: i < n ? ACCENT : "rgba(30,39,97,0.12)" }} />
      ))}
    </div>
  );
}

export default function Competitors() {
  const cats = [...new Set(MATRIX.map(r => r.cat))];

  return (
    <div style={{ minHeight:"100dvh", background:"#fff", fontFamily:"system-ui,-apple-system,sans-serif", color:NAVY }}>
      <style>{`
        .cw{max-width:1300px;margin:0 auto;padding:0 24px}
        .tbl{width:100%;border-collapse:collapse;font-size:12px}
        .tbl th,.tbl td{padding:9px 12px;border-bottom:1px solid rgba(30,39,97,0.06);text-align:center}
        .tbl td:first-child,.tbl th:first-child{text-align:left;min-width:240px}
        .tbl td:first-child{font-size:13px;color:${NAVY};line-height:1.4}
        .tbl tr:hover td{background:rgba(61,90,254,0.025)}
        .qcol{background:rgba(61,90,254,0.04)}
        .cat-row td{background:rgba(30,39,97,0.035);font-weight:700;font-size:10px;letter-spacing:.10em;text-transform:uppercase;color:${SLATE};padding-top:16px;padding-bottom:6px}
        @media(max-width:700px){.cw{padding:0 14px}.hide-mobile{display:none}}
      `}</style>

      {/* NAV */}
      <nav style={{ background:DEEP, borderBottom:"1px solid rgba(201,168,76,0.15)", position:"sticky", top:0, zIndex:50 }}>
        <div className="cw" style={{ height:62, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <Link to="/" style={{ textDecoration:"none", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:30, height:30, background:ACCENT, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ color:"#fff", fontWeight:800, fontSize:14 }}>Q</span>
            </div>
            <span style={{ color:"#fff", fontWeight:600, fontSize:15 }}>Quantivis</span>
          </Link>
          <span className="hide-mobile" style={{ color:"rgba(255,255,255,0.3)", fontSize:12, letterSpacing:".1em", textTransform:"uppercase" }}>Competitive Analysis · 2025 · 10 Platforms</span>
          <a href="/login" style={{ background:ACCENT, color:"#fff", padding:"9px 20px", borderRadius:4, fontSize:13, fontWeight:700, textDecoration:"none" }}>Request Demo</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background:"linear-gradient(160deg," + DEEP + " 0%,#0B1D3A 58%,#1A2B5E 100%)", padding:"88px 0 80px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,transparent," + GOLD + ",transparent)" }} />
        <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(61,90,254,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(61,90,254,0.035) 1px,transparent 1px)", backgroundSize:"48px 48px", pointerEvents:"none" }} />
        <div className="cw" style={{ maxWidth:940, position:"relative" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(201,168,76,0.12)", border:"1px solid rgba(201,168,76,0.28)", borderRadius:4, padding:"5px 14px", marginBottom:24 }}>
            <Star size={11} color={GOLD} />
            <span style={{ color:GOLD, fontSize:11, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase" }}>DI Market 2025 · Domo report · 10 platforms benchmarked</span>
          </div>
          <h1 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(30px,4.5vw,56px)", color:"#fff", fontWeight:400, lineHeight:1.08, margin:"0 0 24px", letterSpacing:"-0.02em" }}>
            Why Quantivis is No.1<br />in the governance layer
          </h1>
          <p style={{ fontSize:"clamp(15px,1.8vw,18px)", color:"rgba(255,255,255,0.62)", lineHeight:1.8, maxWidth:760, margin:"0 0 48px" }}>{WEDGE}</p>
          <div style={{ display:"flex", gap:48, flexWrap:"wrap" }}>
            {[["$17.4B","DI market 2025"],["$53B","Projected 2033"],["19.1%","CAGR"],["10","Platforms benchmarked"],["0","Others with Art.13 packs"]].map(([v,l]) => (
              <div key={l}>
                <div style={{ fontSize:32, fontWeight:700, color:GOLD, fontVariantNumeric:"tabular-nums" }}>{v}</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.38)", marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ONE-LINE WEDGE CALLOUT */}
      <section style={{ background:ACCENT, padding:"22px 0" }}>
        <div className="cw">
          <p style={{ color:"#fff", fontSize:"clamp(13px,1.6vw,16px)", fontWeight:500, lineHeight:1.7, textAlign:"center" }}>
            "BI tools show what happened. DI platforms automate the next action. <strong>Quantivis governs the reasoning itself</strong> — every decision logged, every confidence calibrated, every action carrying an evidence hash. No other platform on this list ships append-only governance audit, contextual approval chains, and epistemic-integrity caps as product primitives."
          </p>
        </div>
      </section>

      {/* FULL MATRIX */}
      <section style={{ padding:"80px 0", background:"#fff" }}>
        <div className="cw">
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", color:SLATE, textTransform:"uppercase", marginBottom:10 }}>Full capability matrix</p>
          <h2 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(22px,3vw,38px)", color:NAVY, fontWeight:400, margin:"0 0 8px" }}>Quantivis vs the field — 22 capabilities</h2>
          <p style={{ fontSize:13, color:SLATE, marginBottom:28 }}>
            <span style={{ color:GREEN, fontWeight:700 }}>✓ Fully supported</span>
            {"  ·  "}
            <span style={{ color:GOLD, fontWeight:700 }}>~ Partial / roadmap</span>
            {"  ·  "}
            <span style={{ color:"#dc2626", fontWeight:700 }}>✗ Not available</span>
            {"  ·  "}Hover rows for definitions
          </p>
          <div style={{ overflowX:"auto" }}>
            <table className="tbl">
              <thead>
                <tr style={{ background:MUTED }}>
                  <th style={{ fontSize:12, textAlign:"left" }}>Capability</th>
                  {COLS.map(c => (
                    <th key={c.key} className={c.hi ? "qcol" : ""}
                      style={{ fontSize:12, whiteSpace:"nowrap", color:c.hi ? ACCENT : NAVY, fontWeight:c.hi ? 700 : 500 }}>
                      {c.hi ? "★ " : ""}{c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cats.map(cat => (
                  <>
                    <tr key={cat} className="cat-row">
                      <td colSpan={COLS.length + 1}>{cat}</td>
                    </tr>
                    {MATRIX.filter(r => r.cat === cat).map(row => (
                      <tr key={row.cap} title={row.tip}>
                        <td>{row.cap}</td>
                        {COLS.map(c => (
                          <td key={c.key} className={c.hi ? "qcol" : ""}>
                            <Cell v={(row.v as Record<string, number>)[c.key]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize:12, color:SLATE, marginTop:16, fontStyle:"italic" }}>
            Source: Domo Decision Intelligence Platform review (2025), vendor documentation, public pricing pages, and live product testing by Quantivis team.
          </p>
        </div>
      </section>

      {/* 4 PRIMITIVES — why #1 */}
      <section style={{ background:DEEP, padding:"88px 0" }}>
        <div className="cw">
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", color:"rgba(255,255,255,0.3)", textTransform:"uppercase", marginBottom:18, textAlign:"center" }}>Why Quantivis is No.1</p>
          <h2 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(24px,3.5vw,44px)", color:"#fff", fontWeight:400, textAlign:"center", lineHeight:1.12, margin:"0 0 16px" }}>
            Four primitives no other platform ships
          </h2>
          <p style={{ fontSize:15, color:"rgba(255,255,255,0.45)", textAlign:"center", marginBottom:52, maxWidth:640, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
            These are not features. They are infrastructure-level properties built at the database layer — not configurable, not bypassable, not approximate.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:20 }}>
            {PRIMITIVES.map(({ icon, title, body }) => (
              <div key={title} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"26px 22px" }}>
                <div style={{ marginBottom:16 }}>{icon}</div>
                <p style={{ fontWeight:700, fontSize:15, color:"#fff", margin:"0 0 12px", lineHeight:1.3 }}>{title}</p>
                <p style={{ fontSize:13, color:"rgba(255,255,255,0.55)", lineHeight:1.75, margin:0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GAP CLOSURE */}
      <section style={{ background:MUTED, padding:"80px 0" }}>
        <div className="cw">
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", color:SLATE, textTransform:"uppercase", marginBottom:10 }}>Closing the gaps</p>
          <h2 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(22px,3vw,38px)", color:NAVY, fontWeight:400, margin:"0 0 10px" }}>Where others had advantages — and what we did</h2>
          <p style={{ fontSize:14, color:SLATE, marginBottom:36, maxWidth:680, lineHeight:1.7 }}>
            Domo's analysis identified 5 gaps where competitors led. Here is the honest status of every one.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {GAPS.map(g => (
              <div key={g.gap} style={{ background:"#fff", border:"1px solid rgba(30,39,97,0.08)", borderLeft: g.status === "Live" ? "4px solid " + GREEN : "4px solid " + GOLD, borderRadius:8, padding:"22px 24px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background: g.status === "Live" ? "rgba(22,163,74,0.1)" : "rgba(201,168,76,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color: g.status === "Live" ? GREEN : GOLD }}>
                      {g.icon}
                    </div>
                    <span style={{ fontWeight:700, fontSize:15, color:NAVY }}>{g.gap}</span>
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:3, background: g.status === "Live" ? "rgba(22,163,74,0.1)" : "rgba(201,168,76,0.12)", color: g.status === "Live" ? GREEN : "#92400e" }}>{g.status}</span>
                  </div>
                  <p style={{ fontSize:12, color:SLATE, lineHeight:1.65, fontStyle:"italic", margin:"0 0 4px" }}>Before: {g.before}</p>
                </div>
                <div>
                  <p style={{ fontSize:12, color:SLATE, lineHeight:1.65, marginBottom:4 }}><strong style={{ color:NAVY }}>Now:</strong> {g.after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VERDICTS */}
      <section style={{ background:"#fff", padding:"80px 0" }}>
        <div className="cw">
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", color:SLATE, textTransform:"uppercase", marginBottom:10 }}>Vendor verdicts</p>
          <h2 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(22px,3vw,38px)", color:NAVY, fontWeight:400, marginBottom:36 }}>Platform by platform — honest assessment</h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:14 }}>
            {VERDICTS.map(v => (
              <div key={v.vendor} style={{ border:"1px solid rgba(30,39,97,0.08)", borderRadius:8, padding:"20px 18px 16px", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                  <span style={{ fontWeight:700, fontSize:15, color:NAVY }}>{v.vendor}</span>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:10, color:SLATE, marginBottom:5 }}>Governance depth</div>
                    <Dots n={v.score} />
                  </div>
                </div>
                <p style={{ fontSize:13, color:SLATE, lineHeight:1.7, flex:1, margin:0 }}>{v.summary}</p>
                <div style={{ borderTop:"1px solid rgba(30,39,97,0.07)", paddingTop:12, display:"flex", gap:9 }}>
                  <ArrowRight size={13} color={ACCENT} style={{ flexShrink:0, marginTop:2 }} />
                  <p style={{ fontSize:12, color:NAVY, fontWeight:600, lineHeight:1.6, margin:0 }}>{v.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCORING SUMMARY */}
      <section style={{ background:MUTED, padding:"72px 0" }}>
        <div className="cw" style={{ maxWidth:860 }}>
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", color:SLATE, textTransform:"uppercase", marginBottom:10, textAlign:"center" }}>Scorecard</p>
          <h2 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(22px,3vw,38px)", color:NAVY, fontWeight:400, marginBottom:36, textAlign:"center" }}>
            How Quantivis scores vs the field
          </h2>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              { name:"Quantivis",             gov:10, intel:9,  comp:8,  plat:7,  total:34 },
              { name:"SAS Intelligent Dec.",  gov:5,  intel:8,  comp:4,  plat:3,  total:20 },
              { name:"Quantexa",              gov:2,  intel:5,  comp:3,  plat:2,  total:12 },
              { name:"Domo",                  gov:1,  intel:4,  comp:3,  plat:9,  total:17 },
              { name:"Power BI / Copilot",    gov:1,  intel:3,  comp:3,  plat:8,  total:15 },
              { name:"SAP Analytics Cloud",   gov:2,  intel:4,  comp:5,  plat:7,  total:18 },
              { name:"IBM Cognos",            gov:2,  intel:3,  comp:4,  plat:5,  total:14 },
              { name:"ThoughtSpot",           gov:1,  intel:5,  comp:3,  plat:6,  total:15 },
              { name:"Qlik / TIBCO / Sisense",gov:1,  intel:3,  comp:3,  plat:5,  total:12 },
            ].map((row, i) => (
              <div key={row.name} style={{ background: i === 0 ? "rgba(61,90,254,0.06)" : "#fff", border: i === 0 ? "1px solid " + ACCENT : "1px solid rgba(30,39,97,0.08)", borderRadius:7, padding:"14px 18px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                <div style={{ minWidth:200, fontWeight: i === 0 ? 700 : 400, fontSize:13, color: i === 0 ? ACCENT : NAVY }}>
                  {i === 0 ? "★ " : ""}{row.name}
                </div>
                {[["Gov.", row.gov],["Intel.", row.intel],["Comp.", row.comp],["Platform", row.plat]].map(([l, s]) => (
                  <div key={String(l)} style={{ textAlign:"center", minWidth:56 }}>
                    <div style={{ fontSize:10, color:SLATE, marginBottom:3 }}>{String(l)}</div>
                    <div style={{ fontSize:16, fontWeight:600, color: Number(s) >= 8 ? GREEN : Number(s) >= 5 ? GOLD : SLATE }}>{s}/10</div>
                  </div>
                ))}
                <div style={{ marginLeft:"auto", textAlign:"center", minWidth:60 }}>
                  <div style={{ fontSize:10, color:SLATE, marginBottom:3 }}>Total</div>
                  <div style={{ fontSize:20, fontWeight:700, color: i === 0 ? ACCENT : NAVY }}>{row.total}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize:12, color:SLATE, marginTop:16, textAlign:"center", fontStyle:"italic" }}>Scores across Governance (10), Intelligence (10), Compliance (10), Platform (10). Based on public documentation and product testing.</p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background:DEEP, padding:"80px 0", textAlign:"center" }}>
        <div style={{ position:"relative" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent," + GOLD + ",transparent)" }} />
        </div>
        <div className="cw" style={{ maxWidth:580 }}>
          <h2 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(24px,3.5vw,40px)", color:"#fff", fontWeight:400, margin:"0 0 14px", lineHeight:1.2 }}>
            Ready to govern your AI decisions?
          </h2>
          <p style={{ fontSize:15, color:"rgba(255,255,255,0.5)", margin:"0 0 40px", lineHeight:1.75 }}>
            90-day pilot. No SOC 2 required to begin. Live governance records in under a week. Start at €499/month.
          </p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <a href="/login" style={{ background:ACCENT, color:"#fff", padding:"14px 32px", borderRadius:4, fontSize:15, fontWeight:700, textDecoration:"none" }}>Request Demo</a>
            <Link to="/trust" style={{ background:"transparent", color:"rgba(255,255,255,0.7)", padding:"14px 24px", borderRadius:4, fontSize:15, border:"1px solid rgba(255,255,255,0.18)", textDecoration:"none" }}>Trust Center</Link>
            <Link to="/pricing" style={{ background:"transparent", color:"rgba(255,255,255,0.7)", padding:"14px 24px", borderRadius:4, fontSize:15, border:"1px solid rgba(255,255,255,0.18)", textDecoration:"none" }}>See Pricing</Link>
          </div>
        </div>
      </section>

      <footer style={{ background:"#060D1C", padding:"24px 0", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
        <div className="cw" style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, alignItems:"center" }}>
          <p style={{ color:"rgba(255,255,255,0.2)", fontSize:13, margin:0 }}>© 2026 Quantivis Global · <Link to="/" style={{ color:"rgba(255,255,255,0.32)", textDecoration:"none" }}>quantivis.io</Link></p>
          <p style={{ color:"rgba(255,255,255,0.15)", fontSize:12, margin:0 }}>Based on Domo Decision Intelligence Platform Review 2025</p>
        </div>
      </footer>
    </div>
  );
}

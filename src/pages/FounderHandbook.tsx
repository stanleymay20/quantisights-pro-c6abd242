import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Download, ChevronDown, ChevronRight, Search,
  Target, Brain, Shield, TrendingUp, Users, Zap, Database,
  BarChart3, AlertTriangle, CheckCircle2, MessageSquare,
  Lightbulb, DollarSign, Globe, Layers, ArrowRight, Copy
} from "lucide-react";
import logo from "@/assets/quantivis-logo.png";

// ─── Handbook Data ────────────────────────────────────────────────────────────

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  content: string;
}

const SECTIONS: Section[] = [
  {
    id: "what-is-quantivis",
    icon: Target,
    title: "What Is Quantivis?",
    subtitle: "The 30-second explanation",
    content: `
## The One-Liner
**Quantivis is a Decision Governance platform that makes every strategic decision board-defensible.**

## The 60-Second Pitch
"Every year, companies lose millions to executive overconfidence — pricing decisions based on gut feel, market expansions without proper risk modeling, budget reforecasts driven by optimism instead of data.

Quantivis creates a permanent institutional memory for strategic decisions. When a CEO decides to enter a new market, we capture the data signals, the confidence level, the assumptions, and the expected outcomes. Six months later, we measure what actually happened and feed that back into the system.

Over time, the platform learns your organization's bias patterns — are you systematically overestimating revenue projections by 23%? Are your cost estimates always 15% too low? — and automatically corrects future predictions.

Think of it as a **credit score for executive decision-making**."

## What Category Is This?
- **NOT** a BI tool (we don't replace Tableau/PowerBI)
- **NOT** a generic AI chatbot
- **It IS** Decision Intelligence Infrastructure — a new category
- Closest analogies: "Bloomberg Terminal for strategic decisions" or "Grammarly for executive judgment"

## Who Is It For?
| Role | What They Get |
|------|---------------|
| **CEO** | Board-defensible audit trail for every strategic call |
| **CFO** | Calibrated financial projections, not gut-based forecasts |
| **COO** | Operational risk detection with causal attribution |
| **PE/VC Firms** | Portfolio-wide decision governance across companies |
| **Board Directors** | Transparent evidence for fiduciary oversight |
    `,
  },
  {
    id: "problem",
    icon: AlertTriangle,
    title: "The Problem We Solve",
    subtitle: "Why this needs to exist",
    content: `
## The Core Problem
**Executive overconfidence is the #1 unmanaged risk in business.** Nobel laureate Daniel Kahneman's research shows that executives are systematically overconfident in their predictions — they believe they'll be right 80% of the time when they're actually right only 40%.

## The Cost
- **$2.3 trillion** wasted annually on failed strategic initiatives (McKinsey)
- **70%** of major IT projects fail to meet objectives (Standish Group)
- **83%** of M&A deals fail to create shareholder value (KPMG)
- Average CEO overestimates revenue projections by **25-40%** (academic research)

## Why No One Has Solved This
| Existing Solution | Why It Fails |
|-------------------|--------------|
| BI Dashboards | Show you what happened, not whether your decision was right |
| AI Analytics | Generate more data, but don't track if predictions were accurate |
| Management Consultants | €500K reports that sit in drawers; no feedback loop |
| Spreadsheet Models | No accountability, no calibration, no institutional memory |

## The Gap
**No tool tracks the complete Decision → Outcome → Learning lifecycle.** Companies make thousands of strategic decisions but never systematically measure which decision-makers are well-calibrated and which are chronically overconfident.

Quantivis fills this gap.
    `,
  },
  {
    id: "how-it-works",
    icon: Layers,
    title: "How It Works (Technical)",
    subtitle: "The architecture you need to understand",
    content: `
## The Core Loop
\`\`\`
Data Ingestion → Signal Detection → Decision Queue → Executive Action
       ↓                                                    ↓
  Quality Scoring                                    Decision Ledger
       ↓                                                    ↓
  AI Analysis                                      Outcome Tracking
       ↓                                                    ↓
  Confidence Capping                            Calibration Engine
       ↓                                                    ↓
  Evidence Contract ←←←←←←←←←←←←←←←←←← Bias Correction (Feedback)
\`\`\`

## 1. Data Ingestion (Multi-Source)
- **CSV Upload** — immediate analysis for demos and pilots
- **Direct Database Connectors** — PostgreSQL, Snowflake, BigQuery, MySQL, MS SQL
- **API Ingestion** — REST webhook endpoints for real-time data feeds
- **3-Tier Data Lake** — Raw (immutable JSONB) → Clean (normalized) → Analytical (pre-computed rollups)

## 2. Intelligence Engine
The engine runs **classical statistics + Bayesian inference**, NOT deep learning. Why?
- **Interpretability** — executives need to understand WHY, not just WHAT
- **Auditability** — every output can be traced to specific data points
- **Small sample reliability** — deep learning needs millions of rows; we work with hundreds

### What It Computes:
- **Anomaly Detection** — Z-score and IQR-based outlier identification
- **Trend Analysis** — Linear regression with slope significance testing
- **Forecasting** — Time-series projection with confidence intervals
- **Risk Scoring** — Multi-factor composite risk indices (0-100)

## 3. Anti-Hallucination Layer (5 Layers)
This is our **key differentiator**. Unlike ChatGPT that confidently makes things up:

| Layer | What It Does |
|-------|-------------|
| **Confidence Capping** | <12 data points = max 60%, <30 = max 75%, 30+ = max 90%. NEVER 95%+ |
| **Evidence Classification** | Every output labeled: OBSERVED_FACT, STATISTICAL_INFERENCE, HEURISTIC_ESTIMATE, or AI_RECOMMENDATION |
| **Data Fidelity** | Zero fabricated baselines. If data is insufficient, we say "Insufficient Data" — no fake charts |
| **PII Redaction** | Emails, phones, credit cards stripped before any AI processing |
| **Decision Quality Grades** | A-F grading; low-quality recommendations are auto-suppressed |

## 4. Decision Governance
- **Decision Queue** — AI-generated action items ranked by Cost of Delay
- **One-Tap Actions** — Approve / Dismiss / Modify with audit trail
- **Decision Ledger** — Immutable record: who decided, when, based on what data, with what confidence
- **Outcome Tracking** — Measures actual vs. predicted outcomes
- **Calibration Engine** — Learns from last 500 decisions using Bayesian smoothing

## 5. The 47-Parameter Configuration System
Every threshold, weight, and multiplier is configurable via environment variables. No hardcoded "magic numbers." This means:
- Different industries can tune sensitivity
- A/B testing of intelligence parameters
- Full reproducibility of any analysis
    `,
  },
  {
    id: "features-tour",
    icon: Zap,
    title: "Feature-by-Feature Guide",
    subtitle: "What every page does — study this",
    content: `
## Dashboard (/dashboard)
**"Mission Control for executives"**
- **Protection Status** — Overall risk posture: Covered / Watch / Exposed
- **AI Decision Queue** — Ranked action items with Cost of Delay scoring
- **KPI Cards** — Real-time metrics with trend sparklines (real data only, no fakes)
- **Analytics Panel** — EBITDA Bridge, Cash Runway, Revenue vs. Plan charts
- **Command Center** — Keyboard shortcuts (Ctrl+K) for power users

## Data Upload (/data-upload)
- CSV upload with automatic column detection
- Trust badges showing encryption + isolation status (reduces upload anxiety)
- Data quality scoring (0-100) on ingestion
- Staleness monitoring via freshness policies

## Executive Intelligence (/executive)
**"Role-specific strategic briefings"**
- Switch between CEO / CFO / CMO / COO perspectives
- AI-generated strategic brief (cached 6 hours)
- Strategic Risk Index (0-100) with component breakdown
- Convergence analysis — are your executives aligned or diverging?

## Decision Ledger (/decisions)
**"The institutional memory"**
- Every approved/dismissed/modified decision
- Full audit trail: raw confidence, capped confidence, cap reason
- Outcome tracking: predicted vs. actual
- Calibration error per decision
- This is the TABLE that proves governance to a board

## Decision Intelligence (/decision-intelligence)
**"20+ quantitative frameworks — now with Decision Economics"**
- Monte Carlo simulation (10,000 iterations)
- Bayesian Prior Visualization
- Value of Information analysis
- Regret Minimization framework
- Sensitivity Analysis (tornado charts)
- Decision Trees with probability nodes
- **NEW: DROI Calculator** — quantifies financial return from better decisions
- **NEW: TCI Calculator** — calculates compounding cost of inaction with Decision Entropy
- **NEW: Decision Velocity Curve** — optimal speed-accuracy tradeoff with Paralysis Index
- **NEW: Decision Maturity Assessment** — 15-question diagnostic with 3-phase roadmap

## Simulations (/simulations)
**"War Room for strategic modeling"**
- Multi-variable scenario modeling
- Monte Carlo risk engine
- Revenue/cost delta projections
- "Truth-First" policy — refuses to simulate without valid baselines
- War-Room Mode triggered when risk > 80

## Strategy Pack (/strategy-pack)
**"Replaces a €200K consulting engagement"**
- 5-slide executive narrative
- Risk Heatmap (role × risk dimension)
- Probabilistic Outlook (P10/P50/P90)
- Decision Comparison tool
- Full transparency panel

## Board Report (/board-report)
- Auto-generated board-ready report
- Executive summary + risk attribution
- Trend intelligence + simulation results
- Governance actions tracking
- Export to PowerPoint (.pptx)

## AI Copilot (/ask)
**"Ask Quantivis anything about your data"**
- Natural language queries over your metrics
- Streaming responses (Server-Sent Events)
- Session memory (30-day retention)
- Usage limits by tier (20/100/unlimited)

## Causal Inference (/causal-inference)
- DAG-based causal modeling
- Granger-like temporal precedence testing
- Counterfactual "what-if" explanations
- This is PhD-level methodology made accessible

## Cognitive Bias Detection (/cognitive-bias)
- Automatic detection of 12+ cognitive biases
- Anchoring, confirmation bias, sunk cost, etc.
- Severity scoring + mitigation suggestions
- Links biases to specific decisions

## Calibration Assessment (/calibration)
- Shareable scorecard (social proof)
- Brier score calculation
- Overconfidence/underconfidence profiling
- Organizational bias patterns

## Portfolio View (/portfolio)
**"For PE/VC firms managing multiple companies"**
- Cross-portfolio risk heatmap
- Company-level detail panels
- Correlated risk detection
- Concentration analysis

## Decision Fitness (/decision-fitness)
**"The organizational readiness diagnostic"**
- 7-dimension assessment: Strategic Clarity, Structural Agility, Systems & Tools, Shared Culture, Analytical Acumen, Staff Enablement, Leadership Style
- Weighted scoring produces a composite Decision Fitness Score (0–100)
- Actionable recommendations per dimension
- Based on the book *Decision Intelligence: The Operating System for Billion-Dollar Decisions*

## Decision Intelligence Suite (/decision-intelligence)
**"Now with DROI, TCI, Velocity Curve, and Maturity Assessment"**
- **DROI Calculator** — Quantifies financial return from improving decision quality
- **TCI Calculator** — Calculates compounding cost of inaction with Decision Entropy metric
- **Decision Velocity Curve** — Finds optimal speed-accuracy tradeoff with Paralysis Index
- **Decision Maturity Assessment** — 15-question diagnostic mapping to 3-phase roadmap
- Plus all existing: Monte Carlo, Bayesian, Regret Minimization, Sensitivity, Decision Trees

## Free Strategy Session (/free-analysis)
**"The conversion engine — instant value before signup"**
- Paste business metrics or upload CSV
- AI generates McKinsey-level diagnosis: Executive Summary, Key Findings, Hidden Loss Estimation, Root Cause Analysis, Priority Action Plan
- Strategic Insight reframe + soft conversion CTA
- No account required — demonstrates platform capability instantly
    `,
  },
  {
    id: "competitive-advantage",
    icon: Shield,
    title: "Why We Win (Moats)",
    subtitle: "Defensible advantages to articulate",
    content: `
## Competitive Moats

### 1. The Calibration Flywheel (Network Effect)
Every decision an organization logs makes the system smarter. After 500+ decisions, the calibration engine produces correction factors that are unique to that organization. **Switching costs increase with every decision logged.** This is a data moat.

### 2. Instant-Value Conversion Engine
The Free Strategy Session (/free-analysis) lets any business get a McKinsey-level diagnosis in 60 seconds — no signup required. This creates a product-led growth flywheel:
- Prospect experiences value BEFORE signing up
- AI generates Executive Summary, Hidden Losses, Root Cause Analysis
- Soft conversion: "To unlock continuous monitoring, activate Quantivis"

### 3. Anti-Hallucination as a Feature
Every AI tool hallucinates. We're the only platform that:
- Caps confidence at 90% maximum
- Classifies every output by evidence type
- Auto-suppresses low-quality recommendations
- Shows "Insufficient Data" instead of fabricating

**In a world drowning in AI BS, radical honesty is a differentiator.**

### 3. The Evidence Contract
Every recommendation comes with:
- Source dataset + transformation path
- Model/heuristic used
- Assumptions made
- Limitations acknowledged
- Decision Quality Grade (A-F)

This creates **legal defensibility** — "the system told us X based on evidence Y with confidence Z."

### 4. Institutional Memory Lock-In
Once a company has 2+ years of decisions in the ledger, that data is irreplaceable. No competitor can offer calibration insights based on YOUR historical decisions.

### 5. Category Creation
"Decision Governance" doesn't exist as a software category yet. First mover in category = category king (see: Salesforce for CRM, Slack for business chat).

## Competitive Landscape

| Competitor | What They Do | Why We're Different |
|-----------|-------------|-------------------|
| **Tableau/PowerBI** | Visualize historical data | We track Decision → Outcome → Learning |
| **Palantir** | Big data analytics for government | We focus on executive decision quality, not data exploration |
| **Anaplan** | Financial planning | We add decision accountability + calibration |
| **Generic AI tools** | Generate insights | We verify, cap, grade, and track accuracy |
| **McKinsey/BCG** | Strategic consulting | We're software (€500/mo vs. €500K/engagement), continuous not one-time |
    `,
  },
  {
    id: "business-model",
    icon: DollarSign,
    title: "Business Model & Revenue",
    subtitle: "How we make money",
    content: `
## Pricing Tiers

| Tier | Price | Target |
|------|-------|--------|
| **Starter** | €99/mo | Startups, small teams, thesis pilots |
| **Growth** | €499/mo | Scale-ups, mid-market companies |
| **Enterprise** | €18K–€72K/yr | PE/VC firms, Fortune 500 |

## Revenue Drivers
1. **Seat-based expansion** — more executives = more seats
2. **Usage-based AI** — copilot queries, simulations, reports
3. **Portfolio licensing** — PE/VC firms pay per portfolio company
4. **Professional services** — onboarding, custom integrations

## Unit Economics (Target)
- **CAC**: €2-5K (content marketing + enterprise outreach)
- **LTV**: €30-60K (3-5 year retention, expanding seats)
- **LTV:CAC ratio**: 10:1+ (exceptional for SaaS)
- **Gross margin**: 85%+ (infrastructure costs minimal)
- **Net revenue retention**: 130%+ (seat expansion + tier upgrades)

## Why the Model Works
Decision governance becomes MORE valuable over time (calibration improves). Churn is structurally low because switching means losing your institutional decision history. This creates a **negative churn** dynamic where existing customers naturally expand.

## Go-To-Market Strategy
1. **Phase 1 (Now)**: PE portfolio governance deals (multi-company deployments)
2. **Phase 2**: CFO & COO network outreach via industry events
3. **Phase 3**: Board risk committee partnerships
4. **Phase 4**: Consulting firm channel partners (Big 4, boutique strategy)
    `,
  },
  {
    id: "market-size",
    icon: Globe,
    title: "Market Size (TAM/SAM/SOM)",
    subtitle: "Numbers for your pitch deck",
    content: `
## Total Addressable Market (TAM)
**$4.2B** — Decision Intelligence market (2026)

## Serviceable Addressable Market (SAM)
**$850M** — EU enterprise segment
- Companies with 50+ employees making tracked strategic decisions
- Focus: mid-market + PE/VC portfolio governance

## Serviceable Obtainable Market (SOM) — Year 3
**$42M** — PE/VC + mid-market DACH
- Focus: DACH region + UK enterprise mid-market
- ACV: €18K – €72K per organization

## Market Timing
Why NOW:
1. **AI trust crisis** — Every company using AI is worried about hallucinations. We solve this.
2. **Board accountability** — Post-WeWork/FTX, boards demand decision audit trails
3. **ESG/Governance** — Regulatory pressure for transparent decision-making (EU AI Act)
4. **Remote work** — Distributed leadership teams need a shared decision system

## Comparable Exits
| Company | Category Created | Valuation |
|---------|-----------------|-----------|
| Palantir | Data analytics for decisions | $50B |
| Anaplan | Connected planning | $10.7B (acquired) |
| Gong | Revenue intelligence | $7.2B |
| Quantivis potential | Decision governance | €100M+ (5yr) |

Sources: Gartner Decision Intelligence Market Guide 2024 · McKinsey AI Governance Spending Report · Deloitte Enterprise Analytics Budget Survey 2023
    `,
  },
  {
    id: "security-story",
    icon: Shield,
    title: "Security Architecture",
    subtitle: "What to say when asked 'Is it secure?'",
    content: `
## The Quick Answer
"Yes. We enforce security at the DATABASE layer, not the application layer. Even if our app code had a bug, your data would still be isolated."

## Key Talking Points

### 1. Row-Level Security (RLS)
"Every single table — 100% coverage — has database-level policies that scope all queries to your organization. It's architecturally impossible for one customer to see another's data. This isn't an app-level filter that could break; it's enforced by PostgreSQL itself."

### 2. Immutable Audit Trail
"Our audit log cannot be altered or deleted — not even by us as administrators. There are no UPDATE or DELETE policies on audit tables. This gives you a tamper-proof record for compliance and board oversight."

### 3. AI Data Protection
"Before any data touches an AI model, we automatically strip PII — emails, phone numbers, credit cards, SSNs. The AI Data Boundary toggle is OFF by default, meaning raw strategic text never leaves your organization unless you explicitly enable it."

### 4. Encryption
"AES-256 at rest, TLS 1.3 in transit. Service role keys never touch the client — they exist only in encrypted server-side functions."

### 5. MFA
"Multi-factor authentication enforced at the route level. You can't access protected pages without completing a second-factor challenge."

## If Asked About SOC 2
"Our infrastructure provider holds SOC 2 Type II certification. We've built all the technical controls aligned to SOC 2 standards — RLS, immutable audit logs, MFA, encrypted secrets. We maintain enterprise-grade security across the platform. Our Trust Center at /security documents every control in detail."
    `,
  },
  {
    id: "investor-qa",
    icon: MessageSquare,
    title: "Investor Q&A Preparation",
    subtitle: "The 25 questions you'll get asked — with answers",
    content: `
## Questions About the Product

**Q: "How is this different from Tableau/PowerBI?"**
A: "Tableau shows you what happened. We track whether your DECISIONS about what to do next were right. It's the difference between a dashboard and a decision accountability system. We're not replacing BI — we sit on top of it."

**Q: "Why would executives use this? They hate being tracked."**
A: "Because boards are demanding it. Post-FTX, post-WeWork, fiduciary oversight is intensifying. The question isn't 'do you want to be tracked' — it's 'do you want your decisions to be defensible when the board asks?' We position it as protection, not surveillance."

**Q: "What's your AI model?"**
A: "We use classical statistics and Bayesian inference for core analytics, with LLMs (Gemini) only for natural language interpretation. This is intentional — deep learning is a black box. Our outputs are fully interpretable and auditable, which is essential for executive trust."

**Q: "What if someone uploads bad data?"**
A: "We have a 5-layer data integrity framework: ingestion validation (ISO dates, finite numbers, <5 year age), automated quality scoring, staleness monitoring, dataset versioning with rollback, and transparent 'Insufficient Data' warnings instead of fabricated outputs."

## Questions About the Market

**Q: "Who's your competition?"**
A: "There is no direct competitor doing Decision Governance as a software category. Palantir does data analytics, Anaplan does financial planning, McKinsey does consulting — but nobody tracks the Decision → Outcome → Learning lifecycle as software. We're creating a category."

**Q: "Is this a feature or a company?"**
A: "The calibration engine alone — learning an organization's bias patterns from historical decisions — is defensible IP that would take 2+ years to replicate. Combined with the anti-hallucination framework and evidence contract system, this is deep technical infrastructure, not a feature."

**Q: "What's your TAM?"**
A: "$4.2B Decision Intelligence market (2026), with an $850M SAM in the EU enterprise segment. Our Year 3 SOM target is $42M focused on PE/VC + mid-market DACH."

## Questions About Traction

**Q: "Do you have customers?"**
A: "We're pre-revenue, building with design partners. The platform is fully functional — not a mockup. What you're seeing is a production-grade system with 50+ pages, 30+ backend functions, multi-tenant isolation, and a complete decision intelligence suite."

**Q: "How will you get your first 10 customers?"**
A: "Competition wins and academic partnerships give us credibility. Then we offer a free pilot (30-60 days) to CFOs/COOs where they upload historical decision data and see their calibration score. That 'aha moment' — realizing they've been 35% overconfident on revenue estimates — is what converts."

## Questions About the Team

**Q: "It's just you? How did you build this?"**
A: "I designed the architecture, product strategy, and intelligence framework. I used AI-assisted development to execute at the pace of a 5-person engineering team. The decisions about WHAT to build, WHY, and HOW the intelligence works — that's all me. The execution speed is the AI advantage. Every Fortune 500 company will build this way in 3 years."

**Q: "Can you maintain this codebase?"**
A: "The architecture is intentionally modular — 50+ independent pages, 30+ edge functions, a centralized configuration system with 47 tunable parameters. It's documented, tested, and follows enterprise patterns (RLS, RBAC, audit trails). This isn't spaghetti code — it's production infrastructure."

**Q: "What's your unfair advantage?"**
A: "Three things: (1) I deeply understand the problem from an academic/research perspective — this started as my thesis on executive overconfidence. (2) I can build at 10x the speed of a funded competitor because I'm AI-native. (3) Every decision logged by a customer deepens our moat. Time is our ally."

## Questions About Fundraising

**Q: "How much are you raising?"**
A: "€500K pre-seed to close first 10 enterprise customers and reach €150K ARR in 12 months. The product is built; the investment goes into go-to-market and one senior hire."

**Q: "What's the use of funds?"**
A: "40% product & engineering, 35% sales & GTM, 25% operations. The product is built — investment goes into enterprise customer acquisition and scaling."

**Q: "What milestones will you hit?"**
A: "Month 3: 5 paid pilot customers. Month 6: €50K ARR. Month 12: €150K ARR with 2+ enterprise logos. These unlock a Series Seed at 10-15x ARR."
    `,
  },
  {
    id: "demo-script",
    icon: BarChart3,
    title: "Demo Script (5 Minutes)",
    subtitle: "Exactly what to show and say",
    content: `
## Setup (Before the Demo)
1. Upload a sample dataset (use the included Middle East Economic dataset or any CSV)
2. Let the AI insights generate
3. Have the Decision Queue populated with action items

## The Demo Flow

### Minute 1: The Problem (Don't Touch the Product Yet)
> "Let me ask you something — when your company made its last major strategic decision, was there a system that tracked what you predicted would happen, what actually happened, and whether the decision-maker was right? In 99% of companies, the answer is no. That's what we built."

### Minute 2: The Dashboard
*Show /dashboard*
> "This is the executive command center. At the top — Protection Status. Are we Covered, on Watch, or Exposed? Below that, AI-generated decision items ranked by urgency. Each one has a Cost of Delay score — how much money you're losing per week by NOT deciding.

> Notice the confidence badges — see how this one says 72% with a cap reason? That's our anti-hallucination system. We never tell you we're 95% confident. If we only have 15 data points, the maximum confidence is 75%. Radical honesty."

### Minute 3: The Decision Flow
*Click Approve on one decision item*
> "One tap. Now this is in the Decision Ledger — who approved it, when, based on what evidence, at what confidence level. Six months from now, we measure the actual outcome and calculate whether this decision-maker was well-calibrated.

> Over time, the system learns: 'This organization overestimates revenue projections by 23%.' Future predictions are automatically adjusted. That's the calibration engine — the core IP."

### Minute 4: Intelligence Depth
*Show /decision-intelligence*
> "For deeper analysis — Monte Carlo simulations, DROI and TCI calculators, Decision Velocity Curve, and a Decision Maturity Assessment. The DROI Calculator shows the financial return from improving decisions. The TCI Calculator shows the compounding cost of NOT deciding — including Decision Entropy, which measures how your options narrow every day you wait."

*Show /free-analysis briefly*
> "And this is the Free Strategy Session — any business can paste their metrics and get an instant McKinsey-level diagnosis. Executive Summary, Hidden Losses, Root Cause Analysis, Priority Actions. No signup required. This is how we convert prospects."

*Show /decision-fitness briefly*
> "The Decision Fitness Assessment evaluates your organization across 7 dimensions — from Strategic Clarity to Leadership Style — and maps you onto a maturity roadmap."

### Minute 5: The Close
> "What you've just seen is the world's first Decision Governance platform. Every strategic call — documented, tracked, measured, and fed back into organizational learning. 

> The question for your company isn't 'should we track this?' — it's 'can you afford the next board meeting without it?'"

## Key Demo Tips
- **NEVER say "AI built this"** — say "I designed and architected this"
- **Focus on the PROBLEM, not features** — executives buy solutions to pain
- **Show the confidence capping** — it's your #1 differentiator
- **Keep the Decision Ledger visible** — that's the "aha" moment
- **End with a question**, not a statement
    `,
  },
  {
    id: "vocabulary",
    icon: BookOpen,
    title: "Vocabulary & Terminology",
    subtitle: "Know these terms cold",
    content: `
## Core Concepts

| Term | Definition | When to Use |
|------|-----------|------------|
| **Decision Governance** | Systematic tracking of strategic decisions from prediction to outcome | Always — this is the category |
| **Calibration** | How accurate a decision-maker's confidence matches reality | When explaining the learning loop |
| **Brier Score** | Mathematical measure of prediction accuracy (0=perfect, 1=worst) | When asked about methodology |
| **Confidence Capping** | Hard limits on AI confidence based on data volume | When explaining anti-hallucination |
| **Evidence Contract** | Required proof chain for every AI recommendation | When discussing trust/auditability |
| **Cost of Delay** | Financial impact of postponing a decision | When showing the Decision Queue |
| **Decision Ledger** | Immutable record of all strategic decisions | When discussing governance |
| **Institutional Memory** | Organization's accumulated decision history | When pitching the data moat |
| **Board-Defensible** | Decisions backed by auditable evidence trail | When pitching to CFOs/boards |

## Statistical Methods

| Method | What It Does | Layman's Explanation |
|--------|-------------|---------------------|
| **Monte Carlo** | Runs 10,000 random simulations | "We simulate every possible outcome to see the range of what could happen" |
| **Bayesian Inference** | Updates probabilities with new evidence | "As we get more data, the system gets smarter — it updates its beliefs" |
| **Causal Inference (DAGs)** | Determines what CAUSES what | "Not just correlation — we figure out if A actually causes B" |
| **Regression** | Fits a trend line to data | "We calculate the mathematical trend and how reliable it is" |
| **Z-Score Anomaly** | Detects unusual data points | "We flag when something is statistically weird — not just 'different'" |

## Acronyms

| Acronym | Full Form |
|---------|-----------|
| RLS | Row-Level Security |
| MFA | Multi-Factor Authentication |
| RBAC | Role-Based Access Control |
| PII | Personally Identifiable Information |
| AAL2 | Authenticator Assurance Level 2 |
| DPA | Data Processing Agreement |
| ARR | Annual Recurring Revenue |
| CAC | Customer Acquisition Cost |
| LTV | Lifetime Value |
| NRR | Net Revenue Retention |
| TAM/SAM/SOM | Total/Serviceable/Obtainable Market |
    `,
  },
  {
    id: "things-not-to-say",
    icon: AlertTriangle,
    title: "What NOT to Say",
    subtitle: "Common mistakes that kill credibility",
    content: `
## Never Say These Things

### ❌ "AI built this"
**✅ Say instead:** "I designed the architecture and product strategy. I used AI-assisted development tools to execute at 10x speed — the same way every Fortune 500 company will build software in 3 years."

### ❌ "It uses ChatGPT/OpenAI"
**✅ Say instead:** "We use a combination of classical statistical methods and modern language models. Our core analytics are interpretable — not black-box deep learning."

### ❌ "We're like Palantir but cheaper"
**✅ Say instead:** "Palantir does data exploration. We do Decision Governance — tracking whether the decisions MADE from data were actually correct. Different category entirely."

### ❌ "We can do everything"
**✅ Say instead:** "We do one thing exceptionally well: make strategic decisions board-defensible by creating institutional memory with a calibration feedback loop."

### ❌ "The AI is always right"
**✅ Say instead:** "Our system explicitly tells you when it's uncertain. We cap confidence, grade evidence quality, and show 'Insufficient Data' rather than guessing. That honesty is our competitive advantage."

### ❌ "We don't have competitors"
**✅ Say instead:** "No one does exactly what we do — Decision Governance as software. But companies currently 'solve' this with spreadsheets, consultants, and gut feel. Those are our real competitors."

### ❌ "It's just me"
**✅ Say instead:** "I'm the founder and architect. The platform is built on modern cloud infrastructure that scales without a large team. I'm hiring selectively as we grow."

### ❌ Technical jargon without context
Don't say "RLS" — say "database-level data isolation."
Don't say "Bayesian smoothing" — say "the system learns from your historical accuracy."
Don't say "Edge Functions" — say "secure server-side processing."

## The Meta-Rule
**Investors buy founders, not features.** Show that you understand the PROBLEM deeply. The product is proof of execution, but the conviction about WHY executive overconfidence is a solvable problem — that's what wins.
    `,
  },
];

// ─── Downloadable Content Generator ──────────────────────────────────────────

const generateHandbookText = (): string => {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let text = `
QUANTIVIS — FOUNDER'S HANDBOOK
Comprehensive Platform Guide & Investor Pitch Preparation
Generated: ${date}
${"━".repeat(60)}

`;
  SECTIONS.forEach((section, i) => {
    text += `\n${"═".repeat(60)}\n`;
    text += `CHAPTER ${i + 1}: ${section.title.toUpperCase()}\n`;
    text += `${section.subtitle}\n`;
    text += `${"═".repeat(60)}\n`;
    // Strip markdown formatting for plain text
    const clean = section.content
      .replace(/## /g, "\n▶ ")
      .replace(/### /g, "\n  ▸ ")
      .replace(/\*\*/g, "")
      .replace(/\|/g, " | ")
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, "---\n"))
      .replace(/`([^`]+)`/g, "'$1'")
      .trim();
    text += clean + "\n";
  });
  text += `\n${"━".repeat(60)}\n© ${new Date().getFullYear()} Quantivis Global. Confidential.\n`;
  return text;
};

// ─── Component ───────────────────────────────────────────────────────────────

const FounderHandbook = () => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([SECTIONS[0].id]));
  const [searchQuery, setSearchQuery] = useState("");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedSections(new Set(SECTIONS.map((s) => s.id)));
  const collapseAll = () => setExpandedSections(new Set());

  const downloadHandbook = () => {
    const content = generateHandbookText();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Quantivis_Founder_Handbook.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredSections = searchQuery
    ? SECTIONS.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SECTIONS;

  // Simple markdown-ish renderer
  const renderContent = (content: string) => {
    const lines = content.trim().split("\n");
    const elements: JSX.Element[] = [];

    let inTable = false;
    let tableRows: string[][] = [];
    let tableKey = 0;

    const flushTable = () => {
      if (tableRows.length < 2) return;
      const headers = tableRows[0];
      const body = tableRows.slice(2); // skip separator row
      elements.push(
        <div key={`table-${tableKey++}`} className="overflow-x-auto my-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {headers.map((h, i) => (
                  <th key={i} className="text-left py-2 px-3 font-semibold text-foreground text-xs uppercase tracking-wider">
                    {h.replace(/\*\*/g, "").trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className="border-b border-border/30 hover:bg-muted/20">
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-2 px-3 text-muted-foreground">
                      <span dangerouslySetInnerHTML={{
                        __html: cell.trim()
                          .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>')
                          .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
                      }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    };

    let inCodeBlock = false;
    let codeLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${i}`} className="bg-muted/50 border border-border/50 rounded-lg p-4 my-4 text-xs overflow-x-auto font-mono text-muted-foreground">
              {codeLines.join("\n")}
            </pre>
          );
          codeLines = [];
          inCodeBlock = false;
        } else {
          if (inTable) { flushTable(); inTable = false; }
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Table detection
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        inTable = true;
        const cells = line.split("|").filter(Boolean);
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        flushTable();
        inTable = false;
      }

      // Headers
      if (line.startsWith("## ")) {
        elements.push(
          <h2 key={i} className="text-[16px] font-semibold tracking-tight mt-8 mb-3 text-foreground tracking-tight">
            {line.replace("## ", "")}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3 key={i} className="text-[14px] font-semibold mt-6 mb-2 text-foreground">
            {line.replace("### ", "")}
          </h3>
        );
      } else if (line.startsWith("> ")) {
        elements.push(
          <blockquote key={i} className="border-l-3 border-primary/50 pl-4 py-2 my-3 italic text-muted-foreground bg-primary/5 rounded-r-lg pr-4">
            <span dangerouslySetInnerHTML={{
              __html: line.replace("> ", "")
                .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground not-italic">$1</strong>')
            }} />
          </blockquote>
        );
      } else if (line.trim().startsWith("- **")) {
        elements.push(
          <div key={i} className="flex items-start gap-2 ml-4 my-1.5">
            <span className="text-primary mt-1.5 text-xs">●</span>
            <span className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{
              __html: line.trim().replace(/^- /, "")
                .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>')
                .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
            }} />
          </div>
        );
      } else if (line.trim().startsWith("- ")) {
        elements.push(
          <div key={i} className="flex items-start gap-2 ml-4 my-1">
            <span className="text-muted-foreground mt-1.5 text-xs">•</span>
            <span className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{
              __html: line.trim().replace(/^- /, "")
                .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>')
                .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
            }} />
          </div>
        );
      } else if (line.trim().startsWith("**Q:")) {
        elements.push(
          <div key={i} className="mt-6 mb-1 text-sm font-semibold text-foreground" dangerouslySetInnerHTML={{
            __html: line.trim().replace(/\*\*([^*]+)\*\*/g, '$1')
          }} />
        );
      } else if (line.trim().startsWith("A: ")) {
        elements.push(
          <p key={i} className="text-sm text-muted-foreground mb-4 ml-4 leading-relaxed" dangerouslySetInnerHTML={{
            __html: line.trim().replace(/^A: /, "")
              .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>')
              .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
          }} />
        );
      } else if (line.trim().startsWith("### ❌") || line.trim().startsWith("### ✅") || line.trim().startsWith("❌") || line.trim().startsWith("✅")) {
        elements.push(
          <p key={i} className="text-sm font-semibold mt-4 mb-1" dangerouslySetInnerHTML={{
            __html: line.trim()
              .replace(/### /, "")
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          }} />
        );
      } else if (line.trim() === "") {
        // skip
      } else {
        elements.push(
          <p key={i} className="text-sm text-muted-foreground my-2 leading-relaxed" dangerouslySetInnerHTML={{
            __html: line.trim()
              .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>')
              .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
          }} />
        );
      }
    }

    if (inTable) flushTable();

    return <div>{elements}</div>;
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Quantivis" className="h-8" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadHandbook}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
            >
              <Download className="w-4 h-4" />
              Download Handbook
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-4xl">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <BookOpen className="w-3.5 h-3.5" />
            Confidential — Founder's Eyes Only
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 tracking-tight">
            Founder's Handbook
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Everything you need to understand, explain, and pitch Quantivis.
            Study this before any investor meeting, demo, or competition.
          </p>
        </div>

        {/* Table of Contents */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-6 mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Table of Contents</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {SECTIONS.map((section, i) => (
              <button
                key={section.id}
                onClick={() => {
                  setExpandedSections((prev) => new Set([...prev, section.id]));
                  sectionRefs.current[section.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex items-center gap-3 text-left p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <span className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium group-hover:text-primary transition-colors">{section.title}</div>
                  <div className="text-xs text-muted-foreground">{section.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Search + Controls */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search the handbook..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border/50 bg-card/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button onClick={expandAll} className="text-xs text-primary hover:underline whitespace-nowrap">Expand All</button>
          <button onClick={collapseAll} className="text-xs text-muted-foreground hover:underline whitespace-nowrap">Collapse</button>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {filteredSections.map((section, i) => {
            const isOpen = expandedSections.has(section.id);
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
                className={`rounded-xl border transition-colors ${isOpen ? "border-primary/30 bg-card/80" : "border-border/50 bg-card/30 hover:border-border"}`}
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-4 p-5 text-left"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isOpen ? "bg-primary/20" : "bg-primary/10"}`}>
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">Ch.{i + 1}</span>
                      <h2 className="text-base font-semibold truncate">{section.title}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-6 pt-0 border-t border-border/30">
                    <div className="pt-4">
                      {renderContent(section.content)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
          <Lightbulb className="w-8 h-8 text-primary mx-auto mb-3" />
          <h2 className="text-[16px] font-semibold tracking-tight tracking-tight mb-2">You've Got This</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-4">
            You built a platform that most funded startups with 5-person teams haven't achieved.
            The product speaks for itself — now you just need to speak for the product.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={downloadHandbook}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
            >
              <Download className="w-4 h-4" />
              Download for Offline Study
            </button>
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Practice with Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/30 py-8 mt-12">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Quantivis Global · This document is confidential
          </p>
        </div>
      </footer>
    </div>
  );
};

export default FounderHandbook;

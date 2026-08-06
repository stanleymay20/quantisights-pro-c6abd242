import {
  BookOpen, Database, Shield, Zap, BarChart3, Target, Layers, Activity,
  Scale, Timer, Network, ShieldAlert, GitCompare, Gauge, FileText, Users,
  Crown, Shuffle, Search, Upload, CreditCard, Settings, Building2,
  TrendingUp, Radio, Webhook, Globe, Key, Brain, GitBranch, Lock,
  Eye, AlertTriangle, Cpu, BarChart, LineChart, PieChart, Workflow,
  ServerCrash, Fingerprint, Code2, Palette, Languages, Presentation, type LucideIcon,
} from "lucide-react";

export interface DocSection {
  id: string;
  title: string;
  icon: LucideIcon;
  content: string;
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "overview",
    title: "Platform Overview",
    icon: BookOpen,
    content: `
## Quantivis — Autonomous Decision Governance Infrastructure

Quantivis is a **Decision Intelligence Operating System** that replaces traditional BI tools and strategy consultants with an AI-driven, probabilistic governance platform for institutional capital. It ingests multi-source operational data, computes KPIs via a formula engine, and delivers role-specific executive intelligence across CEO, CFO, CMO, and COO command modes.

### Core Value Proposition
- **Decision Governance Infrastructure** — reduces systematic overestimation in strategic judgment through automated calibration, audit trails, and epistemic confidence capping
- **Board-Defensible Decisions** — every recommendation carries traceable evidence, sample sizes, variance scores, and classified output types (OBSERVED_FACT vs AI_RECOMMENDATION)
- **Institutional Memory** — captures the full \`Decision → Assumptions → Outcome → Attribution\` lifecycle, building organizational learning over time
- **Real-time Strategic Oversight** — not retrospective reporting; dashboards update within milliseconds of new data arriving (Growth+ tiers)
- **Autonomous Intelligence Loop** — a 6-hour cron-driven orchestration pipeline replaces manual consulting cycles

### Architecture
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript + Tailwind CSS | Executive-grade UI with role-specific dashboards |
| Backend | Lovable Cloud (PostgreSQL + Edge Functions) | Data persistence, auth, serverless compute |
| AI Gateway | Lovable AI (Gemini 2.5, GPT-5 family) | Intelligence generation without API key management |
| Real-time | PostgreSQL CDC + WebSocket | Sub-500ms metric streaming |
| Auth | Email/Password + MFA (TOTP) + SSO/SAML | Enterprise authentication |
| Billing | Stripe (Checkout + Customer Portal + Webhooks) | Subscription management |

### Target Users
| Role | Use Case |
|------|----------|
| **CEO** | Strategic alignment, growth trajectory, organizational risk posture |
| **CFO** | Financial risk, cash flow forecasting, compliance readiness |
| **CMO** | Customer acquisition efficiency, retention optimization, brand health |
| **COO** | Operational efficiency, execution velocity, SLA management |
| **Board Members** | Governance reports, convergence analysis, fiduciary oversight |
| **Strategy Teams** | Scenario modeling, Monte Carlo simulation, decision trees |
| **PE/VC Firms** | Portfolio risk heatmaps, cross-company benchmarking, fund-level analytics |
| **Data Engineering** | REST API ingestion, warehouse connectors, dbt artifact sync, pipeline observability |

### What Quantivis Is NOT
Quantivis is a **probabilistic decision-support system**, not a fiduciary advisor. All outputs are classified by evidence type (Observed Fact, Statistical Inference, Heuristic Estimate, AI Recommendation) and carry transparent confidence bounds. The platform enforces executive acknowledgment of organizational accountability before any decision can be approved.
    `,
  },
  {
    id: "data-architecture",
    title: "Data Architecture & Tiering",
    icon: Database,
    content: `
## Three-Tier Data Lake Architecture

Quantivis uses a tiered data architecture designed to support 100M+ metric rows across 1,000+ organizations without performance degradation.

### Tier 1: Raw Layer (Immutable Audit)
- **Table**: \`raw_records\` (JSONB)
- **Purpose**: Immutable audit trail for every ingested record
- **Guarantees**: Write-once (no UPDATE/DELETE), replay-capable, full provenance
- **Use**: Lineage tracking, compliance audits, data recovery

### Tier 2: Clean Layer (Normalized Metrics)
- **Table**: \`metrics\`
- **Purpose**: Deduplicated, validated, type-normalized operational data
- **Deduplication**: Composite unique index on \`(organization_id, metric_type, date, source_id)\`
- **Validation**: ISO dates, finite numbers (|value| ≤ 1T), data age < 5 years

### Tier 3: Analytical Layer (Pre-Computed Rollups)
- **Tables**: \`metric_rollups\`, \`metric_latest\`, \`metric_aggregates\`
- **Purpose**: Pre-aggregated data for instant dashboard rendering
- **Period Types**: daily, weekly, monthly, quarterly, yearly
- **Refresh**: Async via \`compute-rollups\` Edge Function (background job queue)

### Materialized Views
| View | Purpose | Refresh |
|------|---------|---------|
| \`metric_rollups\` | Period-aggregated metrics (sum, avg, min, max, count) | On-demand via async job |
| \`metric_latest\` | Latest value per metric type per org | On-demand via async job |
| \`metric_aggregates\` | Legacy monthly/quarterly/yearly rollups | On ingestion |

### Async Compute Queue
For datasets exceeding 100K rows, analytics are processed asynchronously:
1. Frontend submits a compute job to \`analytics_compute_jobs\`
2. \`compute-rollups\` Edge Function processes in server-side SQL chunks
3. Results written to \`metric_rollups\` / \`metric_latest\`
4. Frontend polls job status and renders when complete

### Why Not Direct Aggregation?
At scale (100M+ rows), real-time \`GROUP BY\` queries on the \`metrics\` table would timeout. The rollup architecture ensures dashboard load times remain under 200ms regardless of dataset size.
    `,
  },
  {
    id: "data-ingestion",
    title: "Data Ingestion & Connectors",
    icon: Upload,
    content: `
## Data Ingestion Pipeline

### Ingestion Channels (5 Production Paths)

| Channel | Auth | Max Records | Idempotent | Use Case |
|---------|------|-------------|------------|----------|
| **CSV Upload** | Session JWT | 50,000 | By file hash | Analyst ad-hoc uploads |
| **REST API** (\`/api-ingest\`) | JWT or API key | 50,000/request | \`x-request-id\` header | ETL pipelines, Airflow DAGs |
| **Webhook** (\`/webhook-ingest\`) | SHA-256 API key | 10,000/request | \`x-request-id\` header | CRM/ERP push events |
| **Database Connector** (\`/db-connector\`) | JWT | Unlimited (chunked) | By sync job ID | Warehouse scheduled sync |
| **dbt Artifact Sync** (\`/dbt-sync\`) | JWT or API key | N/A | By artifact hash | CI/CD post-hook |

### Warehouse Connectors
| Connector | Capabilities | Status |
|-----------|-------------|--------|
| PostgreSQL | Test, Discover Schema, Full Sync | Production |
| Snowflake | Test, Discover Schema, Full Sync | Production |
| BigQuery | Test, Discover Schema, Full Sync | Production |
| Amazon Redshift | Test, Discover Schema, Full Sync | Production |
| MySQL | Test, Connect | Beta |
| SQL Server | Test, Connect | Beta |

### Validation Rules (All Channels)
Every record passes through the same validation pipeline:
- **Date**: Must be valid ISO 8601, within 5 years of current date
- **Value**: Must be a finite number, \`|value| ≤ 1,000,000,000,000\`
- **Metric Type**: Non-empty string, max 100 characters
- **Region/Segment**: Optional, max 100 characters each

### Pre-Upsert Deduplication
Before database insertion, the pipeline applies a Map-based "last-write-wins" deduplication:
1. Records are keyed by \`\${metric_type}|\${date}|\${region}|\${segment}\`
2. Duplicate keys within the same batch → last occurrence wins
3. Cross-batch deduplication via composite unique index (upsert)

### Micro-Batch Insertion
Large payloads (>1,000 records) are split into micro-batches of 1,000 records each, inserted with independent try-catch blocks. This ensures partial failures don't block the entire ingestion — the response includes exact counts of inserted vs. rejected records.

### Data Quality Scoring
Every dataset ingestion triggers automated quality checks scored 0–100:
- **Completeness**: Percentage of non-null values across required fields
- **Consistency**: Cross-field validation (e.g., dates in sequence, values within expected ranges)
- **Freshness**: Time since last data point vs. configured staleness policy (default: 24h)
- **Provenance**: Source type, upload ID, uploader ID all tracked

### Dataset Versioning & Rollback
All datasets maintain a version history:
- Column mapping snapshot per version
- Row count at time of version
- Change summary (human-readable diff)
- Rollback endpoint: \`/rollback-dataset-version\` restores prior version state
    `,
  },
  {
    id: "kpi-engine",
    title: "KPI Formula Engine",
    icon: BarChart3,
    content: `
## KPI Builder & Computation Engine

### Formula DSL
KPIs are defined using a formula language that references metric types:
\`\`\`
revenue / customer_count           → Revenue per Customer
(revenue - costs) / revenue * 100  → Gross Margin %
new_customers / total_leads * 100  → Conversion Rate %
mrr * 12                           → ARR (Annualized)
\`\`\`

### Aggregation Types
| Type | Behavior | Use Case |
|------|----------|----------|
| \`sum\` | Total across all matching records | Revenue, costs, counts |
| \`avg\` | Arithmetic mean | Rates, averages, unit economics |
| \`latest\` | Most recent value by date | Current balances, headcount |
| \`weighted_avg\` | Quality-weighted average | Composite scores |

### Computation Pipeline
1. \`compute-kpi\` Edge Function fetches dependent metrics from the clean layer
2. Formula is parsed and evaluated against the filtered dataset
3. Results are versioned with \`computation_version\` and \`formula_snapshot\`
4. KPI values stored with full input traceability (\`input_metric_ids\` array)
5. Targets (if set) are compared automatically — gap-to-target and trend direction computed

### Industry-Specific Templates
Pre-configured KPI sets for rapid onboarding:

| Industry | Example KPIs |
|----------|-------------|
| **SaaS** | MRR, ARR, Churn Rate, LTV, CAC, LTV:CAC Ratio, Net Revenue Retention |
| **E-commerce** | AOV, Conversion Rate, Cart Abandonment, Return Rate |
| **Professional Services** | Utilization Rate, Revenue per Employee, Project Margin |
| **Manufacturing** | OEE, Yield Rate, Cycle Time, Defect Rate |
| **Financial Services** | AUM, Fee Income, Cost-to-Income Ratio |
| **Healthcare** | Patient Throughput, Readmission Rate, Revenue per Bed |

### Targets & Tracking
Each KPI supports date-bound target-setting:
- Target value + target date
- Automatic gap-to-target computation
- Trend direction (improving/stable/degrading) based on rolling window
- Alerting when KPI deviates >10% from target trajectory

### Nuance: Formula Evaluation Safety
The formula engine uses a sandboxed evaluator — it does NOT use \`eval()\`. Operators are parsed into an AST and evaluated against a known variable map. Unknown variables return \`null\` (formula fails gracefully with an "insufficient data" status rather than erroring).
    `,
  },
  {
    id: "decision-intelligence",
    title: "Decision Intelligence Suite",
    icon: Brain,
    content: `
## 20+ Institutional-Grade Decision Frameworks

Quantivis implements the most comprehensive decision intelligence suite available in any SaaS platform, based on the *Probabilistic Governance Framework for Institutional Capital* and the book *Decision Intelligence: The Operating System for Billion-Dollar Decisions*.

### Core Decision Lifecycle
\`\`\`
AI Recommendation → Executive Review → Simulation → Approval → Execution → Outcome Measurement → Calibration Learning
\`\`\`

### Framework Inventory

#### Probabilistic Modeling
| Framework | Purpose | Key Output |
|-----------|---------|------------|
| **Monte Carlo Simulation** | Stochastic risk quantification (GBM paths) | P10/P50/P90, VaR(95%), probability distributions |
| **Bayesian Prior → Posterior** | Confidence evolution over time | Prior/posterior charts, calibration curves |
| **Value of Information (VoI)** | Should we gather more data before deciding? | EVPI, EVSI, decide-now vs. wait recommendation |
| **Decision Impact Simulation** | Model revenue/cost/churn effects of a decision | Net impact, ROI probability, time-to-impact |

#### Strategic Reasoning
| Framework | Purpose | Key Output |
|-----------|---------|------------|
| **Regret Minimization** | Minimax regret across scenarios | Regret matrix, minimum-maximum-regret ranking |
| **Decision Trees & Option Value** | Branching outcome modeling with real options | Option value = max(act, defer, abandon) − act |
| **Sensitivity Analysis** | Which inputs drive the most outcome variance? | Tornado charts, elasticity rankings |
| **Decision Velocity Curve** | Speed-accuracy tradeoff analysis | Optimal cycle time, Paralysis Index, velocity trend |
| **Decision Fatigue Index** | Is the org overwhelmed by pending decisions? | Score 0-100, stale decision count, queue depth |
| **Scenario Comparison** | Side-by-side evaluation of strategic options | Multi-dimensional comparison matrix |
| **Cost of Delay** | Financial exposure from inaction | Daily cost estimate, urgency classification |

#### Decision Economics (NEW)
| Framework | Purpose | Key Output |
|-----------|---------|------------|
| **DROI Calculator** | Quantify financial return from better decisions | DROI multiplier, net revenue gain, improvement % |
| **TCI Calculator** | Compounding cost of NOT deciding | Direct loss, opportunity cost, Decision Entropy score |
| **Decision Fitness Assessment** | 7-dimension organizational readiness | Composite score (0–100), per-dimension breakdown |
| **Decision Maturity Assessment** | 15-question diagnostic with roadmap | Phase classification, actionable recommendations |

#### Causal Science
| Framework | Purpose | Key Output |
|-----------|---------|------------|
| **Directed Acyclic Graphs (DAGs)** | Model causal relationships between variables | Visual DAG, intervention effects |
| **Granger-like Temporal Precedence** | Does metric A predict metric B? | Temporal lag analysis, predictive strength |
| **Counterfactual Analysis** | What would have happened without the decision? | Counterfactual scenario, actual vs. baseline delta |

#### Cognitive Integrity
| Framework | Purpose | Key Output |
|-----------|---------|------------|
| **Cognitive Bias Detection** | Identify anchoring, confirmation bias, sunk cost | Bias name, severity, mitigation suggestion |
| **Calibration Assessment** | How well-calibrated is the decision-maker? | Brier score, overconfidence/underconfidence rating |
| **Adaptive Calibration Engine** | Auto-adjust confidence based on historical accuracy | Band corrections, rolling accuracy, model version |

#### Portfolio-Level
| Framework | Purpose | Key Output |
|-----------|---------|------------|
| **Correlation-Adjusted Portfolio Risk** | Adjusted VaR accounting for inter-decision correlation | σ²_portfolio with Cholesky decomposition, concentration risk |
| **Portfolio Health Radar** | Multi-dimensional org health visualization | Radar chart (requires ≥3 real data dimensions) |

### Free Strategy Session (Conversion Engine)
The \`/free-analysis\` endpoint provides instant McKinsey-level business diagnosis without requiring signup. Users paste metrics or upload CSV → AI generates Executive Summary, Key Findings, Hidden Loss Estimation, Root Cause Analysis, and Priority Action Plan. This replaces the traditional "book a demo" funnel with an instant-value diagnostic.

### Nuance: Model Calibration Loop
After 10+ completed decisions with measured outcomes, the system computes rolling calibration error and automatically adjusts internal confidence scaling. This is stored in \`calibration_models\` with versioning — you can see how the model's accuracy has improved over time. The adjustment factor is applied multiplicatively to all future raw confidence scores.

### Nuance: Why Classical Statistics, Not Deep Learning?
Quantivis deliberately uses classical statistics (regression, Bayesian updating, Monte Carlo) and epistemic confidence capping rather than neural networks. This is an architectural decision prioritizing:
1. **Interpretability** — every output can be audited and explained
2. **Transparency** — no black-box model weights
3. **Institutional Trust** — board members can verify the math
4. **Small-N Performance** — deep learning fails with < 1000 samples; classical methods work with < 30
    `,
  },
  {
    id: "monte-carlo",
    title: "Monte Carlo & Simulation",
    icon: Shuffle,
    content: `
## Strategic Simulation Engine

### Dual-Layer Architecture
1. **Deterministic War-Room** — multi-variable scenario modeling with direct parameter control (revenue Δ%, cost Δ%, churn Δ%, implementation cost, time-to-impact)
2. **Probabilistic Monte Carlo** — stochastic risk quantification using Geometric Brownian Motion (GBM)

### Monte Carlo Engine Details
- **Model**: Geometric Brownian Motion for path simulation
- **Runs**: Configurable up to 50,000 paths per simulation
- **Correlation**: Cholesky decomposition for correlated multi-variable effects
- **Distribution**: Log-normal (prevents negative values for financial metrics)

### Output Metrics
| Metric | Description |
|--------|-------------|
| Expected Value (Mean) | Average outcome across all simulated paths |
| Median (P50) | Middle outcome — more robust than mean for skewed distributions |
| P10 (Pessimistic) | 10th percentile — "bad case" scenario |
| P90 (Optimistic) | 90th percentile — "good case" scenario |
| VaR(95%) | Value-at-Risk: maximum loss at 95% confidence |
| P(ROI > 0) | Probability of achieving positive return on investment |
| P(Cash Stress) | Probability of cash flow falling below critical threshold |

### Decision Impact Simulation
Each pending advisory/decision can be modeled with:
- Revenue delta percentage (e.g., +12% from expansion)
- Cost delta percentage (e.g., -5% from efficiency)
- Churn change percentage (e.g., -2% from retention program)
- Implementation cost (one-time)
- Time to impact (months until effect materializes)

### War-Room Mode
When projected risk exceeds 80/100, the system triggers **War-Room Mode**:
- High-urgency red UI state
- Emergency action plans auto-generated
- Escalation protocols activated
- Board notification triggered (Enterprise tier)

### Confidence Governance on Simulations
All simulation outputs carry a multi-layer confidence envelope:
- **Raw confidence** — from the statistical model
- **Capped confidence** — epistemic limit based on input data volume
- **Data sufficiency rating** — limited / moderate / sufficient
- **Sample size disclosure** — exact N used in computation
- **Variance score** — coefficient of variation of input data

### Nuance: Why GBM?
Geometric Brownian Motion is the industry-standard model for financial path simulation (used by quantitative finance for option pricing). It has known limitations (assumes log-normal returns, constant volatility) — the platform compensates by:
1. Using historical volatility from the actual dataset (not assumed)
2. Applying Cholesky decomposition when multiple variables are correlated
3. Capping confidence based on data volume (preventing overconfident thin-data simulations)
    `,
  },
  {
    id: "epistemic-integrity",
    title: "Epistemic Integrity & Anti-Hallucination",
    icon: ShieldAlert,
    content: `
## Epistemic Integrity Framework

This is the system that prevents Quantivis from behaving like a "confident bullshitter." Every AI output is governed by multiple integrity layers.

### Layer 1: Confidence Capping
All AI-generated confidence scores are hard-capped based on data volume:
| Data Points | Maximum Confidence | Rationale |
|-------------|-------------------|-----------|
| < 12 | 60% | Insufficient for trend detection |
| < 30 | 75% | Moderate — some patterns visible |
| ≥ 30 | 90% | Sufficient — never 100% (epistemic humility) |

The cap is never 100%. This is deliberate — all models have irreducible uncertainty.

### Layer 2: Evidence Classification
Every output is classified into one of four evidence types:
| Type | Symbol | Meaning | Example |
|------|--------|---------|---------|
| \`OBSERVED_FACT\` | 📊 | Directly computed from data | "Revenue was $4.2M in Q1" |
| \`STATISTICAL_INFERENCE\` | 📈 | Derived via statistical method | "Revenue trend is +3.2%/month (R²=0.87)" |
| \`HEURISTIC_ESTIMATE\` | 🔶 | Rule-based approximation | "Cost of delay ≈ $12K/week based on severity model" |
| \`AI_RECOMMENDATION\` | 🤖 | AI-generated strategic advice | "Consider expanding to EMEA based on growth signals" |

### Layer 3: Decision Quality Score (Grades A-F)
Each recommendation receives an internal quality grade:
- **Grade A**: Full evidence chain — sample size, baseline, financial basis, statistical grounding
- **Grade B**: Strong evidence with minor gaps
- **Grade C**: Moderate evidence — usable but with caveats
- **Grade D**: Weak evidence — surfaced with heavy disclaimers
- **Grade F**: Fails integrity check — **recommendation suppressed**, "Approve" button disabled

### Layer 4: Contextual Grounding
AI prompts are engineered with strict grounding rules:
- Must reference the **specific dataset name** in every insight
- Must cite **exact metric values and dates** (not vague "revenue increased")
- Must include **sample size and variance** in statistical claims
- Must label any forward-looking statement as \`PROJECTED\`
- Must never fabricate baseline values or synthetic trends

### Layer 5: Data Fidelity Policy
Strategic visualizations (EBITDA Bridge, KPI sparklines, Portfolio Radar) must:
- Never use fabricated/synthetic values
- Never display sine-wave placeholders
- Show "Insufficient Data" if below minimum threshold (typically 8 data points)
- Only display monetary estimates (€/week, $/day) if derived from validated financial fields
- Default to relative scores (0-100) when financial basis is unavailable

### Nuance: The "Insufficient Data" Problem
Many BI tools show impressive-looking charts with 3 data points. Quantivis deliberately refuses to do this. A Portfolio Health Radar with < 3 real data dimensions shows an honest empty state. An EBITDA Bridge with no actual EBITDA data shows "Insufficient Financial Data." This design choice prioritizes **trust over impressiveness**.

### Nuance: ConfidenceBadge Component
The \`ConfidenceBadge\` UI component renders complex metadata:
- Raw confidence (what the model computed)
- Capped confidence (what we show, with the cap reason)
- Data sufficiency rating
- Variance score
- Tooltip explaining the gap between raw and capped values
    `,
  },
  {
    id: "executive-modes",
    title: "Executive Command Modes",
    icon: Crown,
    content: `
## Role-Specific Executive Intelligence

### Supported Roles
| Role | Focus Area | Priority KPIs | Risk Dimensions |
|------|-----------|---------------|-----------------|
| **CEO** | Strategic alignment, growth trajectory | Revenue, Growth Rate, ECI | Market risk, strategic drift |
| **CFO** | Financial risk, cash flow, compliance | Margins, Cash Flow, Burn Rate | Liquidity, regulatory exposure |
| **CMO** | Customer acquisition, retention | CAC, LTV, Churn, Conversion | Acquisition efficiency, brand decay |
| **COO** | Operational efficiency, execution | Utilization, Cycle Time, SLA | Process bottlenecks, capacity |

### Strategic Risk Index (SRI)
Each role receives a **0-100 risk score** computed deterministically from:
1. KPI deviation from targets (weighted by role priority)
2. Trend direction and velocity (improving/stable/degrading)
3. Cross-role conflict penalties (CEO-CFO divergence, etc.)
4. Data quality index (low quality → risk inflation)
5. Volatility divergence penalty

### Executive Briefs
AI-generated strategic briefs with caching:
- **Cache TTL**: 6 hours (cost optimization — AI calls are expensive)
- **Cache Bust**: When risk score changes > 10 points OR new critical alert
- **Structure**: JSON response with sections (key_findings, risks, recommendations)
- **Channels**: In-app, email digest, Slack (via webhook)

### Morning Brief
Daily automated intelligence dispatch containing:
- Top 3 risks requiring attention
- KPI movements since last brief
- Pending decisions in queue
- Data freshness status

### Alert System
Persistent, database-driven alerts (\`executive_alerts\` table):
| Field | Purpose |
|-------|---------|
| Severity | info / warning / critical |
| Role routing | Which executive role sees this alert |
| Channel | in-app, email, Slack webhook |
| Escalation threshold | Auto-escalate if unacknowledged after N hours |
| Cooldown | Prevent alert fatigue (minimum hours between same-type alerts) |

### Nuance: Why Cache for 6 Hours?
AI brief generation costs ~$0.02-0.08 per call (depending on model). With 4 roles × multiple page views per day × 1000 orgs, uncached briefs would cost $500+/day. The 6-hour cache with risk-score-based invalidation provides freshness where it matters (when things change) and cost control when things are stable.
    `,
  },
  {
    id: "convergence",
    title: "Executive Convergence Index",
    icon: Layers,
    content: `
## Multi-Role Convergence Engine (ECI)

### What It Measures
The Executive Convergence Index quantifies **structural alignment across the C-suite** on a 0-100 scale. It answers: "Are our executives pulling in the same direction?"

### Computation Formula
\`\`\`
ECI = 100
    − (Role Risk Dispersion × 0.4)      // How spread apart are role risk scores?
    − (Conflict Penalty × 0.35)          // Are there zero-sum conflicts?
    − (Volatility Divergence × 0.25)     // Is one role's data much noisier?
\`\`\`

### Alignment Status Classification
| Score | Status | Board Interpretation |
|-------|--------|---------------------|
| ≥ 70 | ✅ Aligned | C-suite priorities are structurally coherent |
| ≥ 40 | ⚠️ Tension | Some role conflicts need resolution |
| ≥ 20 | 🔴 Misalignment | Significant strategic divergence — board should investigate |
| < 20 | 🚨 Structural Conflict | Immediate board-level intervention required |

### Automatic Conflict Detection
The engine identifies when role-specific priorities create zero-sum dynamics:

| Conflict | Detection Rule | Penalty |
|----------|---------------|---------|
| CEO vs CFO Divergence | Risk scores differ by > 30 points | -15 to ECI |
| Growth vs Cash | CMO risk < 40 while CFO risk > 75 | -15 to ECI |
| Innovation vs Efficiency | COO risk > 70 while CEO risk < 50 | -8 to ECI |
| Operational Imbalance | Max role volatility > 80 while min < 40 | -25 to ECI |

### Trigger Model
| Trigger | Frequency | Tier |
|---------|-----------|------|
| Automatic | On KPI recomputation | Growth+ |
| Manual | On-demand refresh button | Growth+ |
| Scheduled | Every 6 hours via cron (\`convergence-reconcile\`) | Enterprise |

### Usage Limits
- **Starter**: Disabled entirely
- **Growth**: 10 computations/day
- **Enterprise**: Unlimited

### Nuance: Configurable Thresholds
All conflict detection rules and scoring parameters are configurable via environment variables (see \`system-config.ts\`). This means enterprises can tune the sensitivity of conflict detection to match their organizational culture — a flat startup might tolerate higher divergence than a regulated bank.
    `,
  },
  {
    id: "advisory",
    title: "Advisory Engine & Lifecycle",
    icon: Zap,
    content: `
## Prescriptive Advisory Engine

### Advisory Types
| Type | Scope | Example |
|------|-------|---------|
| **Strategic** | Growth, market positioning | "EMEA expansion shows 73% probability of positive ROI based on 18 months of growth data" |
| **Operational** | Efficiency, process optimization | "Cycle time degradation of 12% over 90 days suggests capacity constraint" |
| **Financial** | Cost management, risk mitigation | "Cash runway at current burn rate: 14 months. Consider extending before fundraise." |
| **Compliance** | Regulatory, governance | "3 KPIs missing audit trail data — governance gap identified" |

### Lifecycle States
\`\`\`
open → in_progress → resolved | dismissed
\`\`\`

Each transition is logged in the \`audit_log\` with actor ID, timestamp, and reason.

### Ranking: Cost of Delay Algorithm
Advisories are prioritized by a composite **Cost of Delay (CoD)** score (0-100):
\`\`\`
CoD = Severity Base Score (0-40)
    + Confidence Contribution (0-20)
    + Age Decay Bonus (0-20, increases with unresolved age)
    + Signal Delta Bonus (0-10, based on metric change magnitude)
    + Entity Breadth (0-5, more affected entities = higher urgency)
    + Trend Acceleration Bonus (0-5)
    × Metric Urgency Multiplier (1.0-1.3, churn/retention get higher urgency)
\`\`\`

All 15+ CoD parameters are configurable via environment variables.

### Urgency Classification
| CoD Score | Label | Action Window |
|-----------|-------|---------------|
| ≥ 80 | 🔴 Critical | 3 days |
| ≥ 55 | 🟠 High | 7 days |
| ≥ 30 | 🟡 Medium | 14 days |
| < 30 | 🟢 Low | 21 days |

### Playbook System
Each advisory includes structured playbook steps:
\`\`\`json
{
  "steps": [
    { "action": "Review churn cohort data", "outcome": "Identify at-risk segments", "timeline": "Day 1-2" },
    { "action": "Deploy retention campaign", "outcome": "Reduce churn by 1.5%", "timeline": "Day 3-7" },
    { "action": "Measure 30-day retention", "outcome": "Validate intervention", "timeline": "Day 30" }
  ]
}
\`\`\`

### Versioning & Auditability
- Each advisory carries \`generation_version\` (incremented on re-analysis)
- Links to specific data snapshots via \`data_snapshot_date\`
- Full \`source_evidence\` JSON (metric IDs, statistical tests, data ranges)
- Resolution summaries required when closing
    `,
  },
  {
    id: "copilot",
    title: "AI Executive Copilot",
    icon: Search,
    content: `
## "Ask Quantivis" — Conversational Strategic AI

### Architecture
The Executive Copilot is a **conversational reasoning engine** that interprets live executive risk data, KPI signals, and historical trends. It is NOT a general-purpose chatbot — it is grounded exclusively in the organization's data.

### Technical Implementation
| Component | Detail |
|-----------|--------|
| Delivery | Server-Sent Events (SSE) for real-time streaming |
| Model | Gemini 2.5 Flash (default) or GPT-5 (Enterprise) |
| Context Window | Up to 10,000 most recent metrics injected as grounding data |
| Session Persistence | 30-day message retention in \`copilot_messages\` table |
| Role Awareness | Adapts tone and focus based on selected executive role |

### Usage Limits
| Tier | Daily Messages |
|------|---------------|
| Starter | 20 |
| Growth | 100 |
| Enterprise | Unlimited |

### Grounding Protocol
Every copilot response is governed by strict epistemic rules:
1. Must reference specific metrics, dates, and values from the org's data
2. Must disclose sample sizes when making statistical claims
3. Must label forward-looking statements as projections
4. Must never provide financial, legal, or medical advice
5. Must cite confidence levels with data-volume-based caps

### What the Copilot Can Do
- Explain why a specific KPI is trending up or down
- Identify the root cause of a risk score increase
- Compare two time periods ("How did Q1 compare to Q4?")
- Suggest which pending decision has the highest expected value
- Explain the reasoning behind an advisory recommendation

### What the Copilot Cannot Do
- Access external data (internet, news, competitor data)
- Execute decisions or modify data
- Provide guarantees about future outcomes
- Override epistemic confidence caps

### Nuance: PII Redaction
Before any organizational data is sent to the AI model, it passes through an automatic PII redaction layer that strips:
- Email addresses
- Phone numbers
- IBANs and credit card numbers
- Social Security Numbers
- UUIDs (replaced with opaque identifiers)

This redaction is **enabled by default** and can only be disabled per-organization by an admin (the "AI Data Boundary" toggle).
    `,
  },
  {
    id: "causal-inference",
    title: "Causal Inference Engine",
    icon: GitBranch,
    content: `
## Causal Science Module

### Overview
The Causal Inference module goes beyond correlation to answer: **"Did X actually cause Y?"**

### Directed Acyclic Graphs (DAGs)
Users define causal relationships between variables:
\`\`\`
Marketing Spend → Leads → Customers → Revenue
                                    ↘ Churn
Pricing Change → Revenue
             → Customer Satisfaction → Churn
\`\`\`

### Supported Analysis Types
| Method | Question Answered | Requirements |
|--------|-------------------|-------------|
| **Temporal Precedence** | Does changes in A predict later changes in B? | ≥ 12 time-series data points |
| **Intervention Analysis** | What happened after we changed X? | Pre/post intervention data |
| **Counterfactual** | What would have happened if we hadn't acted? | Completed decision with outcome data |
| **Confounding Detection** | Is there a hidden variable driving both A and B? | ≥ 3 variables in the DAG |

### Counterfactual Analysis (Post-Decision)
After a decision has been executed and outcomes measured:
1. System computes the **baseline trajectory** (what would have happened without the decision)
2. Compares actual outcome vs. baseline
3. Quantifies the **true attributable impact** of the decision
4. Updates the calibration model with prediction accuracy data

### Storage
- \`causal_models\` — DAG structure, inference results, confidence scores
- \`counterfactual_analyses\` — per-entity counterfactual scenarios with sensitivity rankings

### Nuance: Causal ≠ Correlational
The platform explicitly labels causal claims differently from correlational observations. A correlation (R² = 0.85 between marketing spend and revenue) is labeled \`STATISTICAL_INFERENCE\`. A causal claim ("Marketing spend caused revenue to increase") requires a valid DAG with intervention data and is labeled as such — with the caveat that observational causal inference has inherent limitations.
    `,
  },
  {
    id: "cognitive-bias",
    title: "Cognitive Bias Detection",
    icon: AlertTriangle,
    content: `
## Cognitive Bias Detection Engine

### Purpose
Identifies systematic cognitive biases in organizational decision-making patterns, providing "institutional self-awareness."

### Detected Bias Types
| Bias | Detection Method | Example |
|------|-----------------|---------|
| **Anchoring** | First estimate disproportionately influences final decision | Initial budget estimate unchanged despite new data |
| **Confirmation Bias** | Selective attention to supporting evidence | Ignoring negative signals when a project is "pet" initiative |
| **Sunk Cost Fallacy** | Continuing investment based on past spend, not future value | Maintaining failing product line because of prior R&D investment |
| **Overconfidence** | Systematic overestimation of prediction accuracy | Confidence scores consistently higher than actual hit rates |
| **Status Quo Bias** | Preference for no action despite evidence for change | Dismissing advisories at higher rate than baseline |
| **Recency Bias** | Overweighting recent events vs. historical patterns | Panic response to one bad quarter despite 8 quarters of growth |

### How It Works
1. The \`cognitive-bias-detect\` Edge Function analyzes patterns in the Decision Ledger
2. AI examines decision timing, confidence patterns, and advisory response rates
3. Biases are scored by severity (low/medium/high) and confidence (0-100%)
4. Each detection includes a specific mitigation suggestion
5. Users can dismiss detections (with a reason), which trains the model

### Integration with Decision Flow
When a cognitive bias is detected on a pending decision:
- A warning banner appears on the decision card
- The bias type and mitigation are shown inline
- The decision can still proceed (it's a nudge, not a block)
- Dismissal reasons are tracked for calibration

### Nuance: Bias Detection is Itself Biased
The platform acknowledges that automated bias detection has its own limitations — it can produce false positives (flagging legitimate strategic patience as "status quo bias") and false negatives. Detection confidence is explicitly displayed, and the system never claims certainty about cognitive processes.
    `,
  },
  {
    id: "forecasting",
    title: "Predictive Forecasting",
    icon: TrendingUp,
    content: `
## Predictive Forecasting Engine

### Statistical Methods (Server-Side)
The forecasting engine uses classical statistics computed on the server, NOT AI-generated numbers:

| Method | Use Case | Requirements |
|--------|----------|-------------|
| **Holt's Exponential Smoothing** | Metrics with trend but no strong seasonality | ≥ 8 data points |
| **Linear Regression** | Steady-state trends | ≥ 8 data points |
| **Prediction Intervals** | Uncertainty quantification | ≥ 12 data points for 80% CI |

### Why Not AI for Forecasting?
AI models (LLMs) are notoriously poor at numerical forecasting — they "hallucinate" numbers with false precision. Quantivis uses AI **only for narrative interpretation** of statistically computed forecasts. The numbers come from math; the story comes from AI.

### Forecast Output
\`\`\`json
{
  "forecast_values": [4200000, 4350000, 4500000],
  "prediction_interval_80": {
    "lower": [3900000, 3950000, 3850000],
    "upper": [4500000, 4750000, 5150000]
  },
  "trend_direction": "increasing",
  "trend_strength": 0.87,
  "method_used": "holt_exponential_smoothing",
  "data_points_used": 24,
  "ai_narrative": "Revenue shows a sustained upward trend..."
}
\`\`\`

### Validation Guard
The frontend includes a mandatory validation guard that prevents malformed requests:
- Organization must be selected
- Dataset must be active
- Metric must be specified
- Descriptive toast feedback for each missing field

### Nuance: Prediction Intervals vs. Point Forecasts
The system always shows prediction intervals (bands), never just point forecasts. A point forecast of "$4.5M next quarter" is misleading — the prediction interval "$3.85M – $5.15M at 80% confidence" is honest. The UI renders both, but the interval is prominent.
    `,
  },
  {
    id: "reporting",
    title: "Reporting & Strategy Pack",
    icon: FileText,
    content: `
## Enterprise Reporting Suite

### Report Types
| Type | Content | Use Case | Tier |
|------|---------|----------|------|
| **Executive Summary** | KPI overview, risk score, key insights | Weekly board updates | All |
| **Diagnostic Report** | Root cause analysis, trend detection | Operational reviews | All |
| **Risk & Compliance** | Risk indices, convergence, conflicts | Governance meetings | Growth+ |
| **Growth Analysis** | Revenue trends, cohort analysis, forecasts | Strategy planning | Growth+ |

### Strategy Pack (5-Slide Consulting Deliverable)
1. **Executive Posture** — governance banner with overall health status
2. **Risk Heatmap** — 4×4 matrix (role × risk dimension)
3. **Probabilistic Outlook** — Monte Carlo distributions with P10/P90 bounds
4. **Decision Comparison** — side-by-side ROI and impact modeling
5. **Transparency Panel** — evidence chain, rationale, confidence logic

### Board Governance Report
Print-optimized document designed for board meeting distribution:
- Color-coded Governance Posture Banner (Green / Amber / Red)
- 30-day ECI trend chart with role-specific risk movement
- Risk Attribution breakdown of ECI components
- AI-refined board intervention recommendations (Enterprise tier)
- Full conflict disclosure with resolution suggestions

### Export
All reports are print-optimized (CSS \`@media print\` rules) and exportable as PDF via browser print dialog.

### Nuance: AI Brief Caching
AI-generated report sections are cached for 24 hours to prevent excessive API costs. The cache key includes organization ID, report type, and a hash of the underlying data. If data changes significantly (new ingestion, risk score shift), the cache is automatically invalidated.
    `,
  },
  {
    id: "portfolio",
    title: "Portfolio & Multi-Entity Management",
    icon: Building2,
    content: `
## Portfolio Intelligence (PE/VC Module)

### Overview
The Portfolio module enables PE/VC firms and multi-business-unit enterprises to manage and compare multiple companies/entities within a single organizational view.

### Portfolio Company Management
- Add companies with sector, stage, investment date, and amount
- Track company-specific KPIs and health metrics
- Compare performance across the portfolio

### Portfolio Risk Heatmap
A grid visualization showing risk levels across companies and dimensions:
- Rows: Portfolio companies
- Columns: Risk dimensions (Financial, Operational, Market, Strategic)
- Cells: Color-coded risk scores (green/amber/red)

### Portfolio-Level KPI Bar
Aggregated metrics across all portfolio companies:
- Total portfolio value
- Weighted average growth rate
- Portfolio-wide risk score
- Diversification index

### Cross-Company Benchmarking
Compare any metric across portfolio companies:
- Percentile rankings within the portfolio
- Gap-to-best-performer analysis
- Sector-adjusted comparisons

### Nuance: Portfolio Radar Minimum Threshold
The Portfolio Health Radar chart requires **≥ 3 real data dimensions** to render. With fewer dimensions, it shows an honest "Insufficient Data" empty state rather than a misleading sparse radar plot.
    `,
  },
  {
    id: "sso-saml",
    title: "SSO/SAML & Enterprise Auth",
    icon: Fingerprint,
    content: `
## Enterprise Authentication

### Authentication Methods
| Method | Status | Tier |
|--------|--------|------|
| Email/Password | Production | All |
| Multi-Factor (TOTP) | Production | All |
| SSO/SAML 2.0 | Production | Enterprise |

### SSO/SAML Configuration
Enterprise organizations can configure SAML-based Single Sign-On:
1. Admin navigates to Settings → SSO Configuration
2. Enters IdP metadata: Entity ID, SSO URL, Certificate, Attribute Mapping
3. Specifies email domain(s) to enforce SSO (e.g., \`@acme.com\`)
4. Tests the connection
5. Enables enforcement (optional — can be "optional" or "enforced")

### SSO Enforcement
When SSO is enforced for a domain:
- Users with matching email domains see **"Sign in with SSO"** instead of email/password
- The login page auto-detects the domain from the email field
- Password-based login is blocked for enforced domains
- MFA is delegated to the Identity Provider

### Supported Identity Providers
Any SAML 2.0 compliant IdP:
- Okta
- Azure AD / Entra ID
- Google Workspace
- OneLogin
- JumpCloud
- PingIdentity

### SSO Database Schema
\`\`\`sql
sso_configs (
  id, organization_id, provider_name, entity_id,
  sso_url, certificate, attribute_mapping,
  email_domains, enforcement_level, is_active,
  created_at, updated_at
)
\`\`\`

### Domain Resolution
The \`resolve_sso_for_email\` database function:
1. Extracts domain from email address
2. Searches active SSO configs for matching domain
3. Returns SSO URL and provider name if found
4. Returns null if no SSO — user proceeds with email/password

### Nuance: SSO + MFA
When SSO is active, MFA is handled by the Identity Provider, not by Quantivis. The platform trusts the IdP's authentication assertion. If an organization uses SSO with an IdP that doesn't enforce MFA, Quantivis cannot independently add MFA — this is a design limitation documented in the security posture page.
    `,
  },
  {
    id: "realtime-streaming",
    title: "Realtime Data Streaming",
    icon: Radio,
    content: `
## Realtime Metric Streaming

### Overview
Dashboards auto-update within milliseconds of new data arriving — no manual refresh required. This is powered by PostgreSQL Change Data Capture (CDC) over WebSocket.

### Data Modes
| Mode | Mechanism | Tier | Latency |
|------|-----------|------|---------|
| Batch | CSV upload, connector sync, webhook POST | All tiers | On-demand |
| Realtime | PostgreSQL LISTEN/NOTIFY via WebSocket | Growth & Enterprise | < 500ms |

### How It Works
1. Data arrives via any ingestion channel
2. PostgreSQL fires a change event on the \`metrics\` table
3. The \`supabase_realtime\` publication broadcasts the event
4. Connected Growth/Enterprise clients receive the payload via WebSocket
5. Dashboard state updates in-place (sorted insert, no full refetch)

### Events Handled
| Event | Behavior |
|-------|----------|
| INSERT | New metric sorted into timeline, derived KPIs recomputed |
| UPDATE | Existing metric replaced in-place |
| DELETE | Metric removed, derived values recalculated |

### Subscription Gating
- **Starter**: Batch-only — data loads on page navigation
- **Growth**: Full realtime — all events streamed live
- **Enterprise**: Full realtime + priority channel allocation

### UI Indicators
The \`useMetrics\` hook exposes:
- \`isStreaming\` — true when WebSocket is active
- \`canStream\` — true when user's tier permits realtime

### Technical Details
- Channel: \`metrics-live-{organization_id}\`
- Filter: \`organization_id=eq.{orgId}\`
- Protocol: Phoenix Channels over WebSocket
- Reconnection: Automatic with exponential backoff

### Nuance: Realtime ≠ Real-Time Analytics
Realtime streaming means the **dashboard updates live** when new data arrives. It does NOT mean "real-time OLAP queries on streaming data." Complex analytics (Monte Carlo, forecasting) are still computed on-demand or via the async compute queue. The distinction matters for expectations.
    `,
  },
  {
    id: "orchestration",
    title: "Autonomous Orchestration",
    icon: Activity,
    content: `
## 6-Hour Autonomous Intelligence Loop

The Executive Orchestration Engine replicates a full consulting engagement cycle automatically.

### Pipeline Steps (executed every 6 hours)
| Step | Function | Purpose |
|------|----------|---------|
| 1 | \`connector-pull\` | Pull latest data from all active integrations |
| 2 | \`compute-kpi\` | Re-evaluate all active KPI formulas |
| 3 | \`compute-rollups\` | Refresh materialized aggregations |
| 4 | \`diagnostic-engine\` | AI-driven root cause detection |
| 5 | \`prescriptive-advisory\` | Generate strategic recommendations |
| 6 | \`compute-executive-signals\` | Recompute role-specific risk indices |
| 7 | \`convergence-reconcile\` | Update ECI and detect conflicts |
| 8 | \`executive-brief\` | Generate role-specific intelligence memos |
| 9 | \`send-executive-alert\` | Dispatch critical alerts to configured channels |

### Trigger Types
| Trigger | Condition |
|---------|-----------|
| **Scheduled** | pg_cron every 6 hours |
| **Manual** | Admin-triggered on demand |
| **Event-driven** | Data upload OR critical threshold breach |

### Monitoring (\`orchestration_runs\` table)
Each run is logged with:
- Start/completion timestamps
- Duration in milliseconds
- Steps completed (JSON array)
- Error messages (if any)
- Trigger type (scheduled/manual/event)

### Pipeline Observability
The \`/pipeline-observability\` page provides:
- Run history with status indicators
- Step-level timing breakdown
- Error logs with stack traces
- Retry capabilities for failed steps

### Nuance: Independent Failure Isolation
Each pipeline step runs in its own try-catch block. If the diagnostic engine fails, the advisory engine still runs. If the connector pull times out, KPIs are still recomputed from existing data. This prevents cascading failures in the intelligence loop.
    `,
  },
  {
    id: "security",
    title: "Security Architecture",
    icon: Shield,
    content: `
## Enterprise Security Posture

### Authentication Stack
| Layer | Implementation |
|-------|---------------|
| Email/Password | bcrypt-hashed, email verification required |
| MFA | TOTP (Time-based One-Time Password), RFC 6238 |
| SSO/SAML | SAML 2.0 with domain enforcement |
| Session | JWT with automatic refresh, configurable expiry |
| Open Redirect Protection | Login redirect parameter validated (relative paths only) |

### Authorization (RBAC)
| Role | Permissions |
|------|------------|
| **Owner** | Full access, billing, team management, data deletion, SSO config |
| **Admin** | Data management, KPI creation, advisory access, settings |
| **Viewer** | Read-only access to dashboards and reports |

### Row-Level Security (RLS)
**100% of data-derived tables** enforce organization-level isolation:
- \`is_org_member(auth.uid(), organization_id)\` for read access
- \`get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin')\` for write access
- Service-role functions for system operations (orchestration, webhooks)

### Viewer Role Restrictions
Viewer roles are blocked at the **database policy layer** from:
- Decision Ledger (write)
- Metrics (write)
- Advisory instances (write)
- Simulation creation
- Settings modification

### Data Protection
| Measure | Detail |
|---------|--------|
| Encryption at rest | AES-256 via cloud provider |
| Encryption in transit | TLS 1.3 |
| Data isolation | Organization-scoped RLS, no cross-tenant queries possible |
| Audit logging | Immutable \`audit_log\` table (INSERT-only, no UPDATE/DELETE) |
| Intelligence audit | \`intelligence_audit_trail\` — immutable record of all AI operations |
| PII redaction | Automatic stripping of emails, phones, IBANs, SSNs, credit cards before AI processing |
| AI Data Boundary | Toggle to allow/block raw strategic text in AI prompts (disabled by default) |
| Data retention | Configurable per-organization \`data_retention_days\` |

### API Security
| Mechanism | Scope |
|-----------|-------|
| JWT authentication | All analytical Edge Functions |
| SHA-256 API key hashing | Webhook ingestion (keys never stored in plaintext) |
| Idempotency (\`x-request-id\`) | All ingestion endpoints |
| Rate limiting | 10,000 records/request, 50,000/hour/source |
| CORS | Restricted to application domain |

### Compliance Readiness
| Standard | Status |
|----------|--------|
| GDPR | Implemented (DPA, data export, right to erasure, subprocessor disclosure) |
| SOC 2 Type II | Architecture aligned, enterprise-grade controls in place |
| Cookie consent | Implemented with granular control |
| Data portability | \`/data-export\` endpoint exports all org data as JSON |

### Nuance: Immutable Audit Trail
The \`audit_log\` and \`intelligence_audit_trail\` tables have database-level DENY policies on UPDATE and DELETE. Even with service-role access, historical audit records cannot be modified. This is a non-negotiable architectural constraint for governance compliance.
    `,
  },
  {
    id: "webhook-api",
    title: "Webhook & REST API",
    icon: Webhook,
    content: `
## Programmatic Data Ingestion API

### REST API Endpoint: \`/api-ingest\`
**Auth**: JWT or \`x-api-key\` header
**Max**: 50,000 records per request
**Idempotency**: Required \`x-request-id\` header

\`\`\`bash
curl -X POST \\
  https://<project-url>/functions/v1/api-ingest \\
  -H "Authorization: Bearer <JWT>" \\
  -H "x-request-id: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "dataset_name": "quarterly_revenue",
    "records": [
      { "date": "2025-01-01", "value": 4200000, "metric_type": "revenue", "region": "NA" }
    ]
  }'
\`\`\`

### Webhook Endpoint: \`/webhook-ingest\`
**Auth**: \`x-api-key\` header (SHA-256 verified)
**Max**: 10,000 records per request

### dbt Artifact Sync: \`/dbt-sync\`
**Auth**: JWT or \`x-api-key\`
**Artifacts**: manifest.json, run_results.json, source freshness

### Response Format
\`\`\`json
{
  "success": true,
  "records_inserted": 45,
  "records_rejected": 2,
  "records_deduplicated": 3,
  "validation_errors": ["Record 3: invalid date"],
  "job_id": "uuid"
}
\`\`\`

### Error Codes
| Code | Meaning |
|------|---------|
| 200 | Success (partial success possible — check records_rejected) |
| 400 | Invalid payload structure |
| 401 | Missing or invalid authentication |
| 409 | Duplicate x-request-id (idempotency — safe to ignore) |
| 429 | Rate limit exceeded |
| 500 | Server error (retry with same x-request-id) |

### Nuance: Partial Success
A 200 response does NOT mean all records were inserted. Always check \`records_rejected\` and \`validation_errors\` in the response. The API is designed for "best effort" — valid records are inserted even if some records in the batch fail validation.
    `,
  },
  {
    id: "billing",
    title: "Subscription & Billing",
    icon: CreditCard,
    content: `
## Stripe-Powered Subscription System

### Tier Comparison
| Feature | Essentials (€499/mo) | Governance (€1,999/mo) | Enterprise (custom) |
|---------|:-:|:-:|:-:|
| Data Sources | 1 | Unlimited | Unlimited |
| Datasets | 1 | Unlimited | Unlimited |
| Simulations/day | 5 | 50 | Unlimited |
| Copilot messages/day | 20 | 100 | Unlimited |
| Convergence/day | — | 10 | Unlimited |
| Realtime Streaming | — | ✓ | ✓ |
| Executive Modes | 1 role | 4 roles | 4 roles + AI briefs |
| Team Members | 2 | 10 | Unlimited |
| Reports | Basic | Full suite | Full + Board Report |
| Strategy Pack | — | ✓ | ✓ |
| Board Governance Report | — | — | ✓ |
| SSO/SAML | — | — | ✓ |
| API Access | — | — | ✓ |
| Priority Support | — | — | ✓ |

### Billing Infrastructure
- **Checkout**: Stripe Checkout Sessions with success/cancel URLs
- **Management**: Stripe Customer Portal (plan changes, payment method, invoices)
- **Sync**: Webhook-driven status updates (\`stripe-webhook\` Edge Function)
- **Enforcement**: Server-side tier checks via \`check-subscription\` Edge Function
- **Upgrades**: Prorated billing on mid-cycle plan changes

### Feature Gating
The \`useSubscriptionGate\` hook enforces tier-based access:
\`\`\`typescript
const { canAccess } = useSubscriptionGate();
if (!canAccess("simulations")) {
  // Show upgrade prompt
}
\`\`\`

### Gated Features Map
| Feature Key | Required Tiers |
|------------|---------------|
| simulations | Growth, Enterprise |
| convergence | Growth, Enterprise |
| boardExport | Growth, Enterprise |
| advisory | Growth, Enterprise |
| copilot | Growth, Enterprise |
| livestream | Growth, Enterprise |
| sso | Enterprise |

### Nuance: Workspace Quotas
Beyond feature gating, organizations have quantitative quotas (data sources, KPIs, team members) tracked by the \`useWorkspaceQuota\` hook. Exceeding a quota shows a gentle upgrade prompt rather than hard-blocking functionality.
    `,
  },
  {
    id: "team",
    title: "Team & Organization",
    icon: Users,
    content: `
## Multi-Tenant Organization System

### Organization Model
Each user belongs to an organization created on signup:
- Shared data namespace (all metrics scoped to org)
- Team member management with role-based access
- Subscription and billing scope
- Configurable data retention policy
- Organization-level AI Data Boundary setting

### Invitation System
1. Admin sends invitation (email + role selection)
2. Invitation token generated with 7-day expiry
3. Invitee receives email with accept link
4. On acceptance: email verification → membership creation → default workspace assignment
5. Token invalidated after use (single-use)

### Multi-Organization Support
Users can be members of multiple organizations:
- \`organization_members\` table tracks memberships with roles
- Org switcher in the dashboard sidebar for seamless context switching
- All data queries are scoped to the currently-selected organization

### Workspace & Project Hierarchy
\`\`\`
Organization
  └── Workspace(s)
        └── Project(s)
              └── Dataset(s)
\`\`\`

Every analytical query requires the full context: \`organization_id\` → \`project_id\` → \`dataset_id\`. This is enforced by the \`useActiveDataContext\` hook — no module can query data without a fully resolved context.

### Nuance: Active Data Contract
The "Active Data Contract" is an architectural invariant: every data-dependent hook (\`useMetrics\`, \`useAggregates\`, \`useInsights\`, \`usePortfolioCompanies\`) and every Edge Function call MUST include \`organization_id\` and \`dataset_id\`. All \`as any\` type casts in the data layer have been removed. This prevents cross-organization data leaks at every level.
    `,
  },
  {
    id: "edge-functions",
    title: "Edge Functions Reference",
    icon: Cpu,
    content: `
## Backend Functions Reference

### Intelligence Functions
| Function | Purpose |
|----------|---------|
| \`generate-insights\` | AI-driven insight generation from KPI data |
| \`ai-kpi-analysis\` | Deep KPI trend analysis with statistical grounding |
| \`ai-scenario-analysis\` | AI-powered scenario evaluation |
| \`diagnostic-engine\` | Automated root cause analysis |
| \`prescriptive-advisory\` | Generate strategic recommendations |
| \`executive-brief\` | Role-specific executive intelligence |
| \`executive-copilot\` | Conversational AI copilot (SSE streaming) |
| \`cognitive-bias-detect\` | Analyze decision patterns for cognitive biases |
| \`causal-inference\` | DAG-based causal analysis |
| \`counterfactual-explain\` | Post-decision counterfactual analysis |
| \`predictive-forecast\` | Statistical forecasting (Holt's + Linear Regression) |

### Simulation Functions
| Function | Purpose |
|----------|---------|
| \`monte-carlo-sim\` | Monte Carlo risk simulation (GBM) |
| \`simulate-scenario\` | Deterministic scenario modeling |
| \`decision-impact-sim\` | Decision outcome simulation |
| \`strategic-simulation\` | Multi-variable strategic simulation |

### Orchestration Functions
| Function | Purpose |
|----------|---------|
| \`executive-orchestration\` | Trigger full 9-step intelligence pipeline |
| \`convergence-reconcile\` | ECI recomputation + conflict detection |
| \`compute-executive-signals\` | Role-specific signal computation |
| \`compute-kpi\` | KPI formula evaluation |
| \`compute-rollups\` | Refresh materialized aggregations |
| \`pipeline-orchestrator\` | Scheduled sync with retry logic |
| \`refresh-aggregates\` | Legacy aggregate refresh |

### Data Functions
| Function | Purpose |
|----------|---------|
| \`api-ingest\` | REST API batch ingestion (50K records) |
| \`webhook-ingest\` | Webhook payload ingestion |
| \`db-connector\` | Direct warehouse sync |
| \`dbt-sync\` | dbt artifact sync |
| \`connector-pull\` | Pull from configured data sources |
| \`data-profiler\` | Statistical profiling of datasets |
| \`data-export\` | GDPR data portability export |
| \`schema-contract\` | Schema validation for incoming data |
| \`seed-demo-data\` | Generate demo dataset |
| \`rollback-dataset-version\` | Revert dataset to prior version |
| \`transform-metrics\` | Metric transformation pipeline |

### Notification Functions
| Function | Purpose |
|----------|---------|
| \`send-executive-alert\` | Dispatch alerts to configured channels |
| \`test-executive-alert\` | Test alert delivery |
| \`morning-brief\` | Daily intelligence digest |
| \`weekly-executive-brief\` | Weekly scheduled digest |
| \`weekly-calibration-digest\` | Weekly calibration summary |

### Billing Functions
| Function | Purpose |
|----------|---------|
| \`create-checkout\` | Initiate Stripe Checkout |
| \`customer-portal\` | Redirect to Stripe Portal |
| \`check-subscription\` | Verify subscription status |
| \`stripe-webhook\` | Handle Stripe events |

### Authentication
All functions require a valid JWT in the \`Authorization: Bearer <token>\` header, except:
- \`stripe-webhook\` — Stripe signature verification
- \`webhook-ingest\` — SHA-256 API key authentication
- \`pipeline-orchestrator\` — Service role key
    `,
  },
  {
    id: "data-model",
    title: "Database Schema Reference",
    icon: Database,
    content: `
## Complete Database Schema

### Core Tables
| Table | Purpose | RLS Policy |
|-------|---------|------------|
| \`organizations\` | Tenant container | Owner/member access |
| \`profiles\` | User profile data | Self + org member read |
| \`organization_members\` | Role assignments | Org-scoped |
| \`user_roles\` | App-level roles | Self-read |
| \`workspaces\` | Workspace containers within orgs | Org member access |
| \`projects\` | Projects within workspaces | Org member access |

### Data Tables
| Table | Purpose |
|-------|---------|
| \`metrics\` | Clean operational data (Tier 2) |
| \`datasets\` | Dataset metadata |
| \`dataset_versions\` | Version history with rollback |
| \`data_sources\` | Connector configurations |
| \`data_sync_jobs\` | Sync job tracking |
| \`data_quality_checks\` | Automated quality audit results |
| \`connector_configs\` | Warehouse connection details |
| \`metric_rollups\` | Pre-computed period aggregations |
| \`metric_latest\` | Latest value per metric type |
| \`metric_aggregates\` | Legacy rollup table |

### Intelligence Tables
| Table | Purpose |
|-------|---------|
| \`kpis\` | KPI definitions with formulas |
| \`kpi_values\` | Computed KPI values |
| \`kpi_targets\` | KPI goals and tracking |
| \`insights\` | AI-generated insights |
| \`advisory_instances\` | Prescriptive recommendations |
| \`ai_explanations\` | Feature attribution for AI outputs |

### Decision Tables
| Table | Purpose |
|-------|---------|
| \`decision_ledger\` | Full decision lifecycle |
| \`decision_simulations\` | Simulation results |
| \`decision_contexts\` | Decision framing metadata |
| \`decision_approvals\` | Approval workflow |
| \`decision_comments\` | Threaded discussion on decisions |
| \`cognitive_bias_detections\` | Detected biases on decisions |

### Executive Tables
| Table | Purpose |
|-------|---------|
| \`executive_modes\` | Role configurations |
| \`executive_risk_index\` | Risk scores per role |
| \`executive_briefs\` | AI-generated briefs (cached) |
| \`executive_alerts\` | Alert instances |
| \`executive_conflicts\` | Cross-role conflicts |
| \`executive_convergence_index\` | ECI snapshots |
| \`orchestration_runs\` | Pipeline run logs |

### Calibration Tables
| Table | Purpose |
|-------|---------|
| \`calibration_models\` | Model versions with band corrections |
| \`calibration_assessments\` | User calibration quiz results |

### Causal Tables
| Table | Purpose |
|-------|---------|
| \`causal_models\` | DAG structures and inference results |
| \`counterfactual_analyses\` | Counterfactual scenario comparisons |

### Audit Tables (Immutable)
| Table | Purpose | Write Policy |
|-------|---------|-------------|
| \`audit_log\` | Administrative action log | INSERT-only (no UPDATE/DELETE) |
| \`intelligence_audit_trail\` | AI operation log | INSERT-only (no UPDATE/DELETE) |

### Enterprise Tables
| Table | Purpose |
|-------|---------|
| \`sso_configs\` | SAML SSO configuration per org |
| \`analytics_compute_jobs\` | Async computation queue |
| \`industry_benchmarks\` | Industry comparison data |
| \`benchmark_scores\` | Organization vs. benchmark results |
| \`alert_playbooks\` | Automated alert response rules |
    `,
  },
  {
    id: "configuration",
    title: "System Configuration",
    icon: Settings,
    content: `
## Runtime Configuration (47+ Parameters)

The platform is 100% data-driven through a centralized configuration service (\`src/lib/system-config.ts\`). All intelligence parameters can be tuned via environment variables without code changes.

### Cost of Delay Parameters
| Variable | Default | Purpose |
|----------|---------|---------|
| \`VITE_COD_SEVERITY_CRITICAL\` | 40 | Base score for critical severity |
| \`VITE_COD_SEVERITY_HIGH\` | 28 | Base score for high severity |
| \`VITE_COD_SEVERITY_MEDIUM\` | 16 | Base score for medium severity |
| \`VITE_COD_SEVERITY_LOW\` | 6 | Base score for low severity |
| \`VITE_COD_CONFIDENCE_MAX\` | 20 | Max confidence contribution to CoD |
| \`VITE_COD_AGE_DECAY_RATE\` | 0.7 | How fast score increases with age |
| \`VITE_COD_AGE_DECAY_MAX\` | 20 | Maximum age-based bonus |
| \`VITE_COD_URGENCY_CHURN\` | 1.3 | Urgency multiplier for churn metrics |
| \`VITE_COD_URGENCY_REVENUE\` | 1.2 | Urgency multiplier for revenue metrics |

### Value of Information Parameters
| Variable | Default | Purpose |
|----------|---------|---------|
| \`VITE_VOI_UNCERTAINTY_REDUCTION\` | 0.03 | Expected uncertainty reduction per data point |
| \`VITE_VOI_COST_PER_DATAPOINT\` | 0.001 | Normalized cost of acquiring one data point |
| \`VITE_VOI_SAMPLE_INFO_RATIO\` | 0.6 | EVSI as fraction of EVPI |
| \`VITE_VOI_DECIDE_NOW_CONF\` | 0.75 | Confidence threshold for "decide now" recommendation |

### Portfolio Risk Parameters
| Variable | Default | Purpose |
|----------|---------|---------|
| \`VITE_PORTFOLIO_VAR_CONF\` | 1.645 | Z-score for VaR (1.645 = 95%, 2.326 = 99%) |
| \`VITE_PORTFOLIO_HIGH_CORR\` | 0.5 | Threshold for "high correlation" warning |
| \`VITE_PORTFOLIO_HIGH_CONC\` | 60 | Threshold for "high concentration" warning |

### Convergence Parameters
| Variable | Default | Purpose |
|----------|---------|---------|
| \`VITE_CONV_ALIGNED\` | 80 | ECI score threshold for "Aligned" status |
| \`VITE_CONV_TENSION\` | 60 | ECI score threshold for "Tension" status |
| \`VITE_CONV_MISALIGNMENT\` | 40 | ECI score threshold for "Misalignment" |
| \`VITE_CONV_CEO_CFO_DIV\` | 30 | CEO-CFO divergence penalty trigger |
| \`VITE_CONV_RECONCILE_INTERVAL\` | 21600000 | Auto-reconcile interval (ms, 6 hours) |

### Nuance: Why Environment Variables?
Using environment variables rather than database configuration allows:
1. **Zero-downtime tuning** — change thresholds without redeployment
2. **Per-environment config** — different thresholds for staging vs. production
3. **Safe defaults** — every parameter has a hardcoded fallback in \`system-config.ts\`
4. **No database dependency** — configuration loads even if the database is down
    `,
  },
  {
    id: "legal-compliance",
    title: "Legal & Compliance",
    icon: Globe,
    content: `
## Legal Framework & GDPR Compliance

### Documentation Pages
| Document | Route | Purpose |
|----------|-------|---------|
| Terms of Service | \`/terms\` | Platform usage terms (includes non-fiduciary disclaimer) |
| Privacy Policy | \`/privacy\` | Data collection & processing practices |
| Cookie Policy | \`/cookie-policy\` | Cookie consent & management |
| Data Processing Agreement | \`/data-processing\` | GDPR DPA for enterprise customers |
| Data Retention Policy | \`/data-retention\` | Retention schedules by data type |
| Subprocessor Disclosure | \`/subprocessors\` | Third-party data processors |

### GDPR Rights Implementation
| Right | Implementation |
|-------|---------------|
| **Access** | Users can view all personal data via the application |
| **Portability** | \`/data-export\` endpoint exports all organization data as JSON |
| **Erasure** | \`delete-account\` Edge Function removes all user data |
| **Rectification** | Profile and organization data editable in settings |
| **Consent** | Cookie banner with granular control |

### Liability Protection Framework
Quantivis implements multi-layer liability protection:
1. **IntelligenceDisclaimer** components on all strategic surfaces
2. **DecisionResponsibilityDialog** — enforces executive acknowledgment before decision approval
3. **Terms of Service** — hardened with non-fiduciary status, decision responsibility clauses
4. **Evidence Classification** — all outputs labeled by evidence type to prevent misuse

### Audit Trail
All administrative actions logged in \`audit_log\`:
- Actor ID and type (user/system)
- Action type (create/update/delete)
- Resource type and ID
- IP address
- Full payload snapshot
- Timestamp
- Immutable (no UPDATE/DELETE policies at database level)

### Nuance: Non-Fiduciary Status
The platform's Terms of Service explicitly state that Quantivis is NOT a fiduciary advisor. All AI outputs are labeled as decision-support tools, not recommendations to act. The \`DecisionResponsibilityDialog\` requires executives to acknowledge: "I understand that this is a probabilistic analysis and that organizational accountability for this decision rests with the approving executive."
    `,
  },
  {
    id: "visualizations",
    title: "Visualization & Charts",
    icon: BarChart3,
    content: `
## Analytical Visualization Suite

### Chart Types Available
| Chart | Component | Use Case |
|-------|-----------|----------|
| Revenue Trend | \`RevenueChart\` | Time-series revenue with period comparison |
| Revenue vs Plan | \`RevenueVsPlanChart\` | Actual vs. target tracking |
| EBITDA Bridge | \`EBITDABridgeChart\` | Waterfall from revenue to EBITDA |
| Cash Runway | \`CashRunwayChart\` | Months of runway at current burn |
| Funnel | \`FunnelChart\` | Conversion funnel stages |
| Heatmap | \`HeatmapChart\` | Risk or performance matrices |
| Radar | \`RadarChart\` | Multi-dimensional health radar |
| Scatter/Bubble | \`ScatterBubbleChart\` | Correlation visualization |
| Box Plot | \`BoxPlotChart\` | Distribution analysis |
| Treemap | \`TreemapChart\` | Proportional breakdown |
| Sankey | \`SankeyChart\` | Flow analysis |
| Waterfall | \`WaterfallChart\` | Sequential value changes |
| Gauge | \`GaugeChart\` | Single-metric target tracking |
| Scenario Impact | \`ScenarioImpactChart\` | Before/after scenario comparison |

### Data Fidelity Rules
All visualizations follow strict rules:
1. **No fabricated values** — charts render only validated, real data
2. **No synthetic trends** — sine-wave placeholders are prohibited
3. **Minimum data thresholds** — charts show "Insufficient Data" below minimums
4. **No fake precision** — monetary values only if derived from financial fields
5. **Transparent empty states** — honest messaging when data is unavailable

### Lazy Loading
Complex analytical charts (Monte Carlo distributions, correlation matrices) are lazy-loaded in the Analytics Panel to minimize initial dashboard load time and cognitive overhead.

### Print Optimization
All report-facing visualizations include \`@media print\` CSS rules for high-fidelity PDF export via browser print dialog.
    `,
  },
  {
    id: "industry-detection",
    title: "Industry Detection & Universality",
    icon: Globe,
    content: `
## Universal Industry Support

### Automatic Industry Detection
When data is ingested, the system automatically detects the industry based on metric types present:

| Detected Metrics | Inferred Industry |
|-----------------|-------------------|
| mrr, arr, churn_rate, cac, ltv | SaaS |
| aov, cart_abandonment, gmv | E-commerce |
| gdp, inflation, unemployment | Economic/Government |
| oee, yield_rate, cycle_time | Manufacturing |
| aum, fee_income, nav | Financial Services |
| patient_count, readmission_rate | Healthcare |
| utilization, billable_hours | Professional Services |
| enrollment, graduation_rate | Education |

### Nuance: Domain-Agnostic by Design
The insight engine is deliberately **domain-agnostic**. It does not have hardcoded rules for "SaaS metrics" or "manufacturing KPIs." Instead, it:
1. Detects any metric types present in the data
2. Computes statistical context (slopes, volatility, shifts) regardless of domain
3. Uses AI to interpret the statistical patterns within the detected industry context
4. Adapts confidence thresholds based on data volume, not industry

This means Quantivis works equally well for a SaaS startup, a government ministry, a manufacturing plant, or a hedge fund — as long as the data is structured as time-series metrics.

### Custom Metric Types
Users are not limited to pre-defined metric types. Any string can be a metric type:
- \`employee_satisfaction_score\`
- \`carbon_emissions_tons\`
- \`regulatory_compliance_rate\`
- \`warehouse_utilization_pct\`

The system will analyze trends, detect anomalies, and generate insights for ANY metric type without pre-configuration.
    `,
  },

  // ─── NEW ENTERPRISE SECTIONS ───

  {
    id: "granular-rbac",
    title: "Granular RBAC & Permissions",
    icon: Lock,
    content: `
## Granular Role-Based Access Control

Quantivis implements a **database-enforced, permission-level RBAC system** that goes beyond simple role checks. Every feature surface is gated by fine-grained permissions that can be customized per organization.

### Role Hierarchy
The platform supports five built-in roles, each with escalating default privileges:

| Role | Default Access |
|------|---------------|
| \`viewer\` | Dashboard view only |
| \`analyst\` | All \`.view\` permissions |
| \`executive\` | All \`.view\` permissions + reports |
| \`admin\` | Full access except billing/ownership |
| \`owner\` | Unrestricted |

### Permission Types
Permissions follow a \`resource.action\` convention:

- \`dashboard.view\` / \`dashboard.edit\` — Dashboard read/write
- \`decisions.view\` / \`decisions.approve\` — Decision ledger access
- \`data.upload\` / \`data.delete\` — Data management
- \`team.manage\` — Team member administration
- \`billing.manage\` — Subscription and payment access
- \`settings.manage\` — Organization settings
- \`reports.generate\` — Report creation
- \`simulations.run\` — Monte Carlo and scenario simulations
- \`copilot.use\` — Executive Copilot access
- \`embed.manage\` — Embeddable dashboard token management
- \`branding.manage\` — White-label customization

### Database Architecture
Permissions are stored in the \`role_permissions\` table with a composite unique constraint on \`(organization_id, role, permission)\`. A \`has_permission()\` SECURITY DEFINER function provides a single entry point for all permission checks, with intelligent fallback defaults when no explicit override exists.

### Frontend Enforcement
The \`<PermissionGate>\` component wraps any UI element to conditionally render based on permissions:

\`\`\`tsx
<PermissionGate permission="decisions.approve">
  <ApproveButton />
</PermissionGate>
\`\`\`

The \`usePermissions()\` hook provides programmatic access:
\`\`\`tsx
const { hasPermission } = usePermissions();
if (hasPermission("simulations.run")) { /* ... */ }
\`\`\`

### Custom Overrides
Organization owners can override default permissions per role via the \`role_permissions\` table, enabling configurations like:
- Giving \`analyst\` role \`simulations.run\` access
- Restricting \`admin\` from \`billing.manage\`
- Enabling \`viewer\` to access \`reports.generate\`
    `,
  },

  {
    id: "embeddable-dashboards",
    title: "Embeddable Dashboards",
    icon: Code2,
    content: `
## Embeddable Dashboard System

Quantivis supports **token-authenticated embeddable dashboards** that can be embedded in external portals, LP reports, or client-facing applications via a simple iframe.

### How It Works
1. **Generate Token** — Admins/owners create embed tokens from Settings → Embeds
2. **Copy Embed Code** — An iframe snippet is generated with the token
3. **Embed Anywhere** — Paste into any HTML page, Notion, Confluence, or investor portal

### Token Security
- Tokens are 32-byte cryptographically random hex strings
- Each token is scoped to a single organization
- Optional expiration dates (auto-deactivated after expiry)
- Tokens can be revoked instantly by the admin
- Public \`anon\` role can only read active, non-expired tokens

### Embed URL Format
\`\`\`
https://your-domain.com/embed?token=<64-char-hex-token>
\`\`\`

### iframe Integration
\`\`\`html
<iframe 
  src="https://quantivis.app/embed?token=abc123..."
  width="100%" 
  height="600" 
  frameborder="0"
></iframe>
\`\`\`

### Dashboard Types
- \`kpi_overview\` — Metric cards with latest values and change percentages
- More types (funnel, cohort, executive summary) planned for future releases

### Data Isolation
Embedded dashboards pull from the \`metric_latest\` materialized view, ensuring:
- Read-only access (no mutations possible)
- Organization-scoped data only
- No authentication required for viewers (token-based)
- No access to raw data, decisions, or sensitive intelligence
    `,
  },

  {
    id: "white-label-branding",
    title: "White-Label & Branding",
    icon: Palette,
    content: `
## White-Label Organization Branding

Enterprise organizations can fully customize the platform's visual identity to match their corporate brand, enabling deployment as a white-labeled internal tool or client-facing product.

### Configurable Elements

| Element | Description |
|---------|-------------|
| **Company Name** | Replaces "Quantivis" in headers and exports |
| **Primary Color** | Main brand color (HSL format) — buttons, accents, active states |
| **Accent Color** | Secondary brand color — gradients, highlights |
| **Logo URL** | Custom logo displayed in navigation and reports |
| **Favicon URL** | Browser tab icon |
| **Custom Domain** | Map \`intelligence.acme.com\` to the platform |

### HSL Color Format
Colors use HSL notation for seamless integration with the Tailwind CSS design system:
\`\`\`
246 59% 50%    → Indigo (default primary)
263 70% 50%    → Violet (default accent)
142 76% 36%    → Emerald (example custom)
\`\`\`

### Branding in Exports
When PowerPoint or PDF reports are generated, the organization's branding colors and company name are automatically applied to:
- Title slides
- Header bars
- Chart accent colors
- Footer attribution

### Database Schema
Branding is stored in the \`org_branding\` table with a unique constraint on \`organization_id\`, ensuring exactly one branding configuration per organization. Public read access is enabled for embed/white-label rendering scenarios.
    `,
  },

  {
    id: "internationalization",
    title: "Internationalization (i18n)",
    icon: Languages,
    content: `
## Multi-Language Support

Quantivis supports **5 languages** out of the box with a fully extensible internationalization framework powered by \`react-i18next\`.

### Supported Languages

| Code | Language | Direction |
|------|----------|-----------|
| \`en\` | English | LTR |
| \`de\` | Deutsch (German) | LTR |
| \`fr\` | Français (French) | LTR |
| \`es\` | Español (Spanish) | LTR |
| \`ar\` | العربية (Arabic) | RTL |

### Auto-Detection
The system automatically detects the user's preferred language using:
1. \`localStorage\` (persisted selection)
2. Browser \`navigator.language\` (fallback)
3. English (final fallback)

### Translation Coverage
Translations cover:
- **Navigation** — All sidebar menu items
- **Common UI** — Buttons (Save, Cancel, Delete, etc.)
- **Authentication** — Login, Register, Password Reset flows
- **Dashboard** — KPI labels, chart titles, insight headers
- **Decisions** — Status labels, confidence terms
- **Reports** — Generation buttons, export labels
- **Settings** — All configuration sections

### Using Translations in Components
\`\`\`tsx
import { useTranslation } from "react-i18next";

const MyComponent = () => {
  const { t } = useTranslation();
  return <h1>{t("dashboard.title")}</h1>;
};
\`\`\`

### Adding New Languages
1. Create a new JSON file in \`src/i18n/locales/\`
2. Add the language to \`src/i18n/index.ts\` resources
3. Add to the \`LanguageSelector\` component

### RTL Support
Arabic (\`ar\`) is fully supported with right-to-left text direction. The layout system automatically adjusts when Arabic is selected.
    `,
  },

  {
    id: "powerpoint-export",
    title: "PowerPoint Export",
    icon: Presentation,
    content: `
## Executive PowerPoint Export

Quantivis generates **board-ready PowerPoint presentations** (.pptx) with professional formatting, branded slide masters, and automated content population.

### Slide Structure
Every exported deck includes:

1. **Title Slide** — Report name, company branding, date, confidentiality notice
2. **Content Slides** — Configurable per report type:
   - Bullet-point summaries
   - Data tables with styled headers
   - Subtitle context
   - Footnotes and caveats
3. **Disclaimer Slide** — Epistemic integrity notice, confidence capping disclosure, fiduciary disclaimer

### Branding Integration
When organization branding is configured:
- **Primary Color** → Slide headers, table headers, accent shapes
- **Accent Color** → Company name, highlights
- **Company Name** → Replaces default attribution
- Background: Dark slate (\`#0F172A\`) for executive aesthetic

### Technical Details
- Format: Office Open XML (.pptx) — compatible with PowerPoint, Keynote, Google Slides
- Library: \`pptxgenjs\` (zero server-side dependencies)
- Generation: Client-side (no data leaves the browser)
- File naming: \`{report-title}-{date}.pptx\`

### Usage
\`\`\`tsx
import { exportToPowerPoint } from "@/lib/pptx-export";

await exportToPowerPoint({
  companyName: "Acme Corp",
  reportTitle: "Q1 Board Intelligence Report",
  date: "2026-03-08",
  slides: [
    {
      title: "Executive Summary",
      subtitle: "Key findings from Q1 analysis",
      bullets: [
        "Revenue grew 12.3% QoQ (P75 benchmark: 8.1%)",
        "Decision accuracy improved to 73% (from 61% in Q4)",
        "3 high-confidence advisories require board attention",
      ],
    },
    {
      title: "KPI Performance",
      table: {
        headers: ["Metric", "Current", "Target", "Status"],
        rows: [
          ["MRR", "€2.1M", "€2.0M", "✓ On Track"],
          ["Churn", "4.2%", "3.5%", "⚠ Watch"],
        ],
      },
    },
  ],
});
\`\`\`

### Comparison: PDF vs PPTX

| Feature | PDF Export | PPTX Export |
|---------|-----------|-------------|
| Editability | Read-only | Fully editable |
| Use case | Board record | Board presentation |
| Charts | Embedded images | Native shapes |
| File size | Smaller | Larger |
| Best for | Compliance archives | Live board meetings |
    `,
  },
  {
    id: "decision-fitness",
    title: "Decision Fitness & Maturity Assessment",
    icon: Activity,
    content: `
## Decision Fitness Assessment

The Decision Fitness module is a structured diagnostic tool based on the 7-dimension framework from *Decision Intelligence: The Operating System for Billion-Dollar Decisions*.

### The 7 Dimensions
| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Strategic Clarity** | 20% | Mission alignment, objective specificity, stakeholder coherence |
| **Structural Agility** | 15% | Org design for speed, escalation paths, decision rights |
| **Systems & Tools** | 15% | Data infrastructure, decision support tooling, automation |
| **Shared Decision Culture** | 15% | Psychological safety, dissent tolerance, learning orientation |
| **Analytical Acumen** | 15% | Statistical literacy, evidence standards, analytical depth |
| **Staff Enablement** | 10% | Training, empowerment, decision delegation patterns |
| **Leadership Style** | 10% | Decision modeling, accountability, feedback culture |

### Scoring
Each dimension is scored 0–100 via weighted survey questions. The composite **Decision Fitness Score** is a weighted average across all 7 dimensions. Scores are classified:
- **85–100**: Decision-Ready Organization
- **65–84**: Developing — key gaps identified
- **40–64**: Emerging — systematic improvement needed
- **0–39**: At Risk — fundamental capability gaps

### Decision Maturity Roadmap
Organizations are mapped to a 3-phase maturity journey:

| Phase | Focus | Duration | Key Activities |
|-------|-------|----------|---------------|
| **Foundation** (Phase 1) | Decision Ledger + Data Quality | Months 1–3 | Log decisions, establish data pipelines, baseline calibration |
| **Expansion** (Phase 2) | Calibration + Intelligence | Months 4–8 | Activate calibration engine, deploy AI advisory, train teams |
| **Strategic Embedding** (Phase 3) | Governance + Culture | Months 9–12 | Board integration, bias detection, institutional memory |

## DROI & TCI Calculators

### Decision Return on Investment (DROI)
Quantifies the financial return from improving decision quality:
\`\`\`
DROI Multiplier = 1 + (False Positive Reduction / 100) + (Success Rate / 200)
Improved Revenue = Revenue at Risk × DROI Multiplier
Net Gain = Improved Revenue − Revenue at Risk
\`\`\`

### Total Cost of Inaction (TCI)
Calculates the compounding cost of NOT making a decision:
\`\`\`
Direct Loss = Monthly Revenue Loss × Time Horizon
Compounded Opportunity = Direct Loss × (1 + Growth Rate)^months − Direct Loss
Competitive Multiplier = 1.0 – 2.0 (based on competitive pressure)
Total TCI = (Direct Loss + Compounded Opportunity) × Competitive Multiplier
\`\`\`

The TCI includes a **Decision Entropy** metric — the rate at which strategic options narrow as time passes without action.

## Decision Velocity Curve

Analyzes the relationship between decision speed and accuracy:
- **Sweet Spot Identification** — finds the optimal decision cycle time
- **Paralysis Index** — percentage of decisions older than 30 days still pending
- **Velocity Trend** — whether the organization is getting faster or slower over time
- **Accuracy Correlation** — does faster deciding correlate with worse outcomes?

## Free Strategy Session

A conversion-oriented diagnostic that provides instant business intelligence:
1. User inputs key metrics (revenue, costs, growth, churn) or uploads CSV
2. AI generates a McKinsey-level diagnosis: Executive Summary, Key Findings, Hidden Loss Estimation, Root Cause Analysis, Priority Action Plan
3. Soft conversion prompt to activate full platform

This replaces the traditional "book a demo" funnel with an **instant-value diagnostic** that demonstrates platform capability before signup.
    `,
  },
];

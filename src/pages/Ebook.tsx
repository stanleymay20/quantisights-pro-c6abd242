import { useState, useRef } from "react";
import { Book, ChevronRight, ChevronDown, ArrowUp, Menu, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const chapters = [
  {
    id: 1,
    title: "What Is Quantivis?",
    sections: [
      {
        heading: "The Problem We Solve",
        content: `Every year, leadership teams make hundreds of high-stakes strategic decisions — market entry, resource allocation, hiring plans, product pivots — based on gut instinct dressed up in spreadsheets. Studies show that executive overconfidence leads to a systematic overestimation of outcomes by 30–70%, costing organizations millions in misallocated capital and missed opportunities.\n\nQuantivis exists to close this gap. We are a **Decision Governance** platform — purpose-built to make every strategic decision *board-defensible*, evidence-backed, and continuously calibrated against real-world outcomes.`
      },
      {
        heading: "Who Is It For?",
        content: `Quantivis is designed for the executive operating layer:\n\n• **CEOs & COOs** — Who need a single command center for strategic decisions\n• **CFOs** — Who require defensible financial projections and audit trails\n• **PE/VC Fund Managers** — Who oversee portfolio companies and need cross-entity intelligence\n• **Board Members** — Who demand transparent governance and risk attribution\n• **Strategy Consultants** — Who advise clients on data-driven transformation\n\nIf your organization makes decisions worth more than €100K, and those decisions currently live in email threads, slide decks, and meeting notes — Quantivis replaces that chaos with a permanent institutional memory.`
      },
      {
        heading: "The Core Value Proposition",
        content: `We call it **Decision Governance Infrastructure**.\n\nTraditional BI tools tell you *what happened*. Quantivis tells you *what to decide*, tracks *whether you were right*, and *automatically recalibrates* your next decision based on your organization's unique bias patterns.\n\nThe result: a compounding intelligence loop where every decision makes the next one better. Over time, your organization doesn't just collect data — it develops genuine institutional wisdom.`
      }
    ]
  },
  {
    id: 2,
    title: "Architecture & Technology Stack",
    sections: [
      {
        heading: "Frontend Architecture",
        content: `Quantivis is built on a modern, performant web stack:\n\n• **React 18** with TypeScript for type-safe component architecture\n• **Vite** for sub-second hot module replacement and optimized builds\n• **Tailwind CSS** with a custom design system for consistent, themeable UI\n• **shadcn/ui** component library for accessible, production-grade UI primitives\n• **TanStack Query** for intelligent server-state management with stale-time caching\n• **Recharts** for data visualization (bar, line, radar, treemap, waterfall, sankey)\n• **Framer Motion** for polished animations and transitions\n\nAll analytical modules are **lazy-loaded** to minimize initial bundle size. The app achieves sub-2-second Time to Interactive on standard connections.`
      },
      {
        heading: "Backend & Data Layer",
        content: `The backend runs entirely on **Lovable Cloud**, providing:\n\n• **PostgreSQL** database with Row Level Security (RLS) on 100% of tables\n• **Edge Functions** (Deno runtime) for serverless compute — AI inference, simulations, report generation\n• **Realtime subscriptions** for live data updates across collaborative sessions\n• **Object Storage** for secure dataset and report file management\n• **Authentication** with email/password, SSO (SAML/OIDC), MFA, and Passkeys\n\nThe architecture is designed for **zero-trust multi-tenancy** — every query, every function call, every data access path is scoped to the authenticated user's organization and workspace.`
      },
      {
        heading: "The Context Hierarchy",
        content: `Data isolation follows a strict four-level hierarchy:\n\n**Organization → Workspace → Project → Dataset**\n\n• **Organization**: The top-level tenant boundary. All RLS policies enforce org membership.\n• **Workspace**: Sub-divisions within an org (e.g., "PE Fund I", "DACH Region"). Workspace members can only see their workspace's data.\n• **Project**: A strategic initiative or analysis context within a workspace.\n• **Dataset**: The actual data artifact — CSV uploads, database connections, or API ingestions.\n\nSwitching context at any level automatically cascades downstream — selecting a new Organization clears Workspace, Project, and Dataset selections to prevent cross-tenant data leakage.`
      }
    ]
  },
  {
    id: 3,
    title: "Getting Started: Onboarding",
    sections: [
      {
        heading: "Account Creation",
        content: `New users register with email and password. Upon signup:\n\n1. A **personal Organization** is automatically created\n2. A **default Workspace** ("Default") is provisioned\n3. The user is assigned the **owner** role with full administrative privileges\n4. Default **workspace quotas** (starter tier) are applied\n5. A **user profile** is created with the provided name\n\nEmail verification is required before sign-in. This prevents unauthorized account creation and ensures audit trail integrity from day one.`
      },
      {
        heading: "The Onboarding Flow",
        content: `After first login, users are guided through a structured onboarding:\n\n1. **Organization Identity** — Set your company name, industry, and mission\n2. **Data Connection** — Upload a CSV or connect a database (Postgres, Snowflake, BigQuery)\n3. **First Analysis** — The system automatically detects your data schema, suggests KPI mappings, and generates initial insights\n4. **Decision Context** — Create your first decision context (e.g., "Q2 Market Expansion")\n\nThe onboarding is completed via a dedicated Edge Function that records completion status and unlocks the full dashboard experience.`
      },
      {
        heading: "Demo Mode",
        content: `For evaluation purposes, Quantivis offers a **Demo Mode** that provisions a complete sandbox environment:\n\n• Pre-loaded PE Portfolio dataset with realistic financial metrics\n• Pre-generated insights, KPIs, and decision queue items\n• Full access to all analytical modules\n• Rate-limited to 5 demo sessions per hour per IP to prevent abuse\n\nDemo sessions are automatically cleaned up after 24 hours. No credit card required.`
      }
    ]
  },
  {
    id: 4,
    title: "The Command Center (Dashboard)",
    sections: [
      {
        heading: "Decisions-First Philosophy",
        content: `The dashboard is not a wall of charts. It is an **Executive Operating System** — a command center where the primary unit of work is the *decision*, not the metric.\n\nThe top-level view presents:\n\n• **Protection Status** — A single widget showing organizational risk posture: Covered, Watch, or Exposed\n• **AI Decision Queue** — Prioritized list of decisions requiring attention, ranked by Cost of Delay\n• **Quick Decision Log** — One-tap interface for logging decisions with confidence scores\n• **Calibration Progress** — Real-time view of your organization's prediction accuracy\n• **Data Quality Scorecard** — Health status of ingested datasets`
      },
      {
        heading: "The Decision Queue",
        content: `The Decision Queue is the heart of Quantivis. It aggregates actionable items from:\n\n• Critical data signals (anomalies, threshold breaches)\n• Proactive risk detection (trend reversals, competitor signals)\n• AI-generated advisories (prescriptive recommendations)\n• Pending approvals (governance workflow items)\n\nEach decision card shows:\n\n• **Cost of Delay** — Financial exposure that grows with inaction, calculated using insight severity, confidence, record age (exponential decay model), and revenue metrics\n• **Confidence Score** — AI's calibrated prediction of outcome probability\n• **Source Evidence** — Links to the underlying data, models, and logic\n• **One-Tap Actions** — Approve, Dismiss (with reason), or Modify\n\nEvery action triggers a **Board-Defensible confirmation banner** and is permanently recorded in the Decision Ledger.`
      },
      {
        heading: "KPI Cards & Analytics Panel",
        content: `Below the command center, the dashboard provides:\n\n• **Dynamic KPI Cards** — Auto-detected from your dataset schema. Revenue, churn, cost, customer count — whatever your data contains, presented with trend indicators and period-over-period deltas.\n• **Executive Intelligence Panel** — AI-generated narrative summaries of your current business state\n• **Analyst Insights** — Detailed statistical findings with confidence intervals\n• **Cross-Context Analytics** — Comparative views across decision contexts\n\nThe full analytics panel (charts: waterfall, treemap, heatmap, funnel, radar, scatter-bubble, box-plot) is **lazy-loaded** behind a toggle to minimize cognitive load. Executives see decisions first; analysts can drill into charts on demand.`
      }
    ]
  },
  {
    id: 5,
    title: "Data Ingestion & Management",
    sections: [
      {
        heading: "CSV Upload",
        content: `The simplest ingestion path. Users upload CSV files which are:\n\n1. Parsed and validated client-side\n2. Stored securely in encrypted object storage (private bucket)\n3. Profiled for data quality (completeness, type consistency, outliers)\n4. Schema-mapped using AI-assisted column detection\n5. Versioned — every re-upload creates a new dataset version with change summary\n\nThe system supports rollback to any previous version via a dedicated Edge Function, enabling safe experimentation with data transformations.`
      },
      {
        heading: "Database Connectors",
        content: `For enterprise deployments, Quantivis connects directly to:\n\n• **PostgreSQL** — Native connector with SSL support\n• **Snowflake** — OAuth-based connection with warehouse selection\n• **BigQuery** — Service account authentication with project/dataset scoping\n• **Custom APIs** — Webhook ingestion and REST API endpoints\n• **dbt** — Sync models and lineage metadata\n\nConnector configurations are stored with credentials hashed via a vault key. Connection status is continuously monitored, and sync jobs are tracked with full observability (records synced, errors, duration).`
      },
      {
        heading: "Data Quality & Lineage",
        content: `Every dataset undergoes continuous quality assessment:\n\n• **Completeness checks** — Missing value analysis per column\n• **Consistency checks** — Type validation, range verification\n• **Freshness monitoring** — Configurable staleness policies (e.g., "flag if not refreshed in 24 hours")\n• **Data Lineage** — Visual graph showing data flow from source → transformation → dataset → metric → insight\n\nData stewards (a dedicated RBAC role) have elevated governance capabilities including ownership assignment, freshness policy configuration, and quality threshold management.`
      }
    ]
  },
  {
    id: 6,
    title: "Decision Intelligence Engine",
    sections: [
      {
        heading: "The ADI Loop",
        content: `The Artificial Decision Intelligence (ADI) loop is Quantivis's core differentiator. It operates as a continuous learning cycle:\n\n**Decide → Predict → Observe → Calibrate → Improve**\n\n1. A decision is logged with a confidence score (e.g., "I'm 80% confident this pricing change will increase revenue by 15%")\n2. The AI generates its own prediction using available data\n3. After the outcome period, actual results are measured against predictions\n4. The calibration engine computes error patterns (overconfidence? underconfidence? domain-specific biases?)\n5. Future predictions are adjusted using learned correction factors\n\nOver time, this creates an organization-specific calibration model that gets progressively more accurate.`
      },
      {
        heading: "Adaptive Calibration Engine",
        content: `The calibration engine uses Bayesian methods with practical safeguards:\n\n• **Training Window**: Most recent 500 completed decisions (configurable)\n• **Smoothing**: Laplace/Beta smoothing prevents small-sample volatility\n• **Confidence Bands**: Decisions are grouped into bands (e.g., 60-70%, 70-80%) and correction factors are computed per band\n• **Success Signal**: Prioritizes 'prediction_accuracy_score' (0-100), falls back to 'outcome_delta' with a neutral zone (±1%)\n• **Drift Detection**: Monitors MAE deltas and bias direction stability between model versions to alert on degradation\n\nThe engine stores versioned calibration models, enabling comparison of organizational accuracy across time periods. Every AI-generated confidence score in the platform passes through this calibration layer before being displayed.`
      },
      {
        heading: "Seven Inference Surfaces",
        content: `The adaptive calibration is applied universally across seven surfaces:\n\n1. **Executive Copilot** — Conversational AI for strategic queries\n2. **Diagnostics Engine** — Root cause analysis of metric movements\n3. **Monte Carlo Simulations** — Probability distributions for scenario outcomes\n4. **Board Reports** — Automated governance documentation\n5. **Prescriptive Advisory** — Actionable recommendations with playbook steps\n6. **Predictive Forecasting** — Time-series projections with confidence intervals\n7. **Decision Impact Simulations** — What-if analysis for pending decisions\n\nEvery confidence score displayed anywhere in the platform includes a **Confidence Badge** showing raw score, calibration adjustment, and data quality index — full transparency with no black boxes.`
      }
    ]
  },
  {
    id: 7,
    title: "Scenario Analysis & Simulations",
    sections: [
      {
        heading: "Monte Carlo Simulations",
        content: `Quantivis runs Monte Carlo simulations to model uncertainty:\n\n• Define input variables with probability distributions (normal, triangular, uniform)\n• Run 1,000–10,000 iterations\n• View output as probability density functions with P10, P50, P90 ranges\n• Compare multiple scenarios side-by-side\n• Factor in correlated variables and portfolio-level risk\n\nResults are presented as interactive charts showing the full distribution of possible outcomes — not just a single point estimate. This helps executives understand the *range* of possibilities, not just the expected value.`
      },
      {
        heading: "Scenario Branching",
        content: `Create branching decision trees:\n\n• **Base Case** — Most likely outcome given current trajectory\n• **Upside Case** — Best realistic scenario with probability weighting\n• **Downside Case** — Worst realistic scenario with risk mitigation plans\n• **Custom Branches** — User-defined scenarios with arbitrary assumptions\n\nEach branch calculates expected value, ROI probability, and net present value. The system recommends the branch that maximizes **regret-minimized expected value** — the option you're least likely to regret regardless of which future materializes.`
      },
      {
        heading: "Strategic Simulation",
        content: `The Strategic Simulation engine models complex multi-variable interactions:\n\n• Revenue impact of pricing changes across customer segments\n• Market share dynamics under competitive scenarios\n• Resource allocation optimization across business units\n• Sensitivity analysis showing which variables have the most impact\n\nAll simulation results are tagged with confidence scores that pass through the adaptive calibration engine, ensuring that organizational bias patterns are accounted for in every projection.`
      }
    ]
  },
  {
    id: 8,
    title: "The Decision Ledger",
    sections: [
      {
        heading: "Permanent Institutional Memory",
        content: `The Decision Ledger is an immutable record of every strategic decision made within the organization:\n\n• **Decision metadata**: Type, context, timestamp, decision-maker\n• **Confidence at decision**: What the decision-maker believed would happen\n• **AI prediction**: What the system predicted would happen\n• **Chosen action**: What was actually decided\n• **Baseline & expected values**: Quantified targets\n• **Actual outcomes**: Measured results after the outcome period\n• **Calibration error**: Difference between prediction and reality\n\nThis is not a todo list or a project tracker. It is a **governance artifact** — the kind of documentation that boards, auditors, and investors increasingly demand to verify that strategic decisions were made with proper rigor.`
      },
      {
        heading: "Decision Lifecycle",
        content: `Every decision moves through a defined lifecycle:\n\n1. **Pending** — Generated by AI or logged manually, awaiting review\n2. **Decided** — Action chosen, confidence recorded, clock starts\n3. **Executing** — Implementation underway, tracking milestones\n4. **Outcome Measured** — Results captured, calibration error computed\n5. **Archived** — Enters the calibration training set\n\nDecisions can be modified mid-flight with full version history. The system tracks execution timing (started_at, completed_at) to measure decision velocity — a key organizational health metric.`
      },
      {
        heading: "Decision Comments & Collaboration",
        content: `Each decision supports threaded comments with:\n\n• @mentions to notify team members\n• Nested replies for focused discussions\n• Full audit trail (created_at, updated_at, user_id)\n• Organization-scoped visibility\n\nThis transforms decisions from individual acts into collaborative, documented governance processes.`
      }
    ]
  },
  {
    id: 9,
    title: "Executive Intelligence",
    sections: [
      {
        heading: "Executive Copilot",
        content: `A conversational AI interface for strategic queries:\n\n• "What's our biggest risk this quarter?"\n• "Show me decisions where we were overconfident"\n• "Compare our churn rate to industry benchmarks"\n• "Draft talking points for the board meeting"\n\nThe Copilot maintains session context, remembers previous queries, and grounds all responses in your actual data. It uses structured responses (not just free text) to provide actionable cards with source evidence links.\n\nUsage is tracked per organization with daily limits based on subscription tier.`
      },
      {
        heading: "Morning Brief",
        content: `An automated daily intelligence briefing covering:\n\n• Overnight metric movements and anomalies\n• Decision queue updates (new items, approaching deadlines)\n• Calibration score changes\n• Market signals relevant to your industry\n• Data freshness alerts\n\nDelivered as an in-app notification with optional email delivery via the integrated email service.`
      },
      {
        heading: "Board Report Generation",
        content: `One-click generation of board-ready reports including:\n\n• **Executive Summary** — AI-generated narrative of organizational performance\n• **Risk Attribution** — Which decisions contributed to current risk posture\n• **Governance Actions** — Audit trail of key decisions and their rationale\n• **Trend Intelligence** — Multi-period analysis with statistical significance\n• **Simulation Results** — Monte Carlo outcomes for strategic initiatives\n• **Conflict Detection** — Flagged decisions that may conflict with stated mission/values\n\nReports are generated as downloadable documents (PDF, PPTX) and stored securely in the reports storage bucket.`
      }
    ]
  },
  {
    id: 10,
    title: "Prescriptive Advisory System",
    sections: [
      {
        heading: "How Advisories Work",
        content: `The Prescriptive Advisory system goes beyond descriptive analytics ("here's what happened") and predictive analytics ("here's what might happen") to provide **prescriptive intelligence** ("here's what you should do").\n\nAdvisories are generated by the AI engine and include:\n\n• **Title & Action** — Clear, actionable recommendation\n• **Category & Priority** — Classified by domain and urgency\n• **Rationale** — Why this recommendation is being made\n• **Expected Impact** — Quantified benefit of acting\n• **Playbook Steps** — Step-by-step execution guide\n• **KPIs Affected** — Which metrics will be impacted\n• **Confidence Score** — Calibrated probability of success\n• **Source Evidence** — Links to underlying data and models`
      },
      {
        heading: "Advisory Lifecycle",
        content: `Advisories follow a governance-compliant lifecycle:\n\n1. **Active** — Generated and awaiting review\n2. **Assigned** — Delegated to a team member\n3. **In Progress** — Being executed\n4. **Resolved** — Completed with resolution summary\n5. **Dismissed** — Rejected with documented reason\n\nEvery state transition is recorded in the audit trail. Dismissed advisories with documented reasons feed back into the calibration engine to improve future recommendation relevance.`
      },
      {
        heading: "Cognitive Bias Detection",
        content: `The platform continuously monitors decision patterns for cognitive biases:\n\n• **Anchoring Bias** — Over-reliance on first piece of information\n• **Confirmation Bias** — Seeking only supporting evidence\n• **Sunk Cost Fallacy** — Continuing investment due to past spending\n• **Availability Heuristic** — Overweighting recent/memorable events\n• **Overconfidence Bias** — Systematic overestimation of prediction accuracy\n\nDetected biases are flagged with severity levels, evidence, and specific mitigation suggestions. They can be acknowledged or dismissed (with documented reasons) to prevent alert fatigue.`
      }
    ]
  },
  {
    id: 11,
    title: "Portfolio Management",
    sections: [
      {
        heading: "Portfolio Company Tracking",
        content: `For PE/VC firms and multi-entity organizations, Quantivis provides a portfolio view:\n\n• **Company Registry** — Track portfolio companies with sector, stage, investment date, and check size\n• **Performance Metrics** — Revenue, EBITDA, growth rate, burn rate per company\n• **Health Radar** — Multi-dimensional assessment (financial, operational, market, team)\n• **Risk Heatmap** — Cross-portfolio risk visualization by dimension and company\n• **KPI Bar** — Aggregated portfolio-level metrics\n\nEach portfolio company can have its own dataset, enabling company-specific analysis within the portfolio context.`
      },
      {
        heading: "Cross-Entity Intelligence",
        content: `The platform enables cross-portfolio analysis:\n\n• **Benchmark Comparison** — How does Company A compare to Company B on key metrics?\n• **Correlation Detection** — Which companies' performance is correlated (risk concentration)?\n• **Sector Analysis** — Portfolio exposure by sector, geography, and stage\n• **Aggregate Forecasting** — Portfolio-level revenue and cash flow projections\n\nThis transforms fragmented portfolio monitoring into a unified intelligence layer.`
      }
    ]
  },
  {
    id: 12,
    title: "Benchmarking & Market Intelligence",
    sections: [
      {
        heading: "Industry Benchmarks",
        content: `Quantivis maintains a library of industry benchmark datasets:\n\n• **Percentile Rankings** — Where does your organization rank on key metrics (P25, P50, P75, P90)?\n• **Gap Analysis** — Distance to best-in-class performance per metric\n• **Trend Comparison** — Are you improving faster or slower than the industry?\n• **Quartile Classification** — Automatic quartile assignment with trend indicators\n\nBenchmarks are segmented by industry, company size, and geography for relevant peer comparison.`
      },
      {
        heading: "Market Signal Monitoring",
        content: `The Market Intelligence module tracks external signals:\n\n• Competitor activity and market positioning changes\n• Regulatory developments affecting your industry\n• Macroeconomic indicators relevant to your business model\n• Technology trend shifts that may impact strategy\n\nSignals are ingested via the fetch-market-signals Edge Function and correlated with internal data to generate contextualized insights.`
      },
      {
        heading: "Causal Inference",
        content: `Beyond correlation, Quantivis models causal relationships:\n\n• Define causal DAGs (Directed Acyclic Graphs) linking business variables\n• Run causal inference to determine which variables actually *cause* outcomes\n• Counterfactual analysis — "What would have happened if we hadn't made that decision?"\n• Sensitivity ranking — Which factors have the strongest causal impact?\n\nThis prevents the common analytical error of confusing correlation with causation in strategic decision-making.`
      }
    ]
  },
  {
    id: 13,
    title: "Governance & Compliance",
    sections: [
      {
        heading: "Immutable Audit Trail",
        content: `The governance layer is built on an immutable audit trail:\n\n• **Write-once architecture** — No UPDATE or DELETE operations are permitted on audit tables\n• **Comprehensive logging** — Every action (data access, decision, configuration change) is recorded\n• **Actor attribution** — Full identity chain (user_id, IP address, user agent, device fingerprint)\n• **Resource tracking** — What was accessed, modified, or decided\n• **Payload capture** — Full before/after state for configuration changes\n\nThis audit trail is protected by database-level DENY policies, ensuring that even service-role functions cannot modify historical records.`
      },
      {
        heading: "Governance Maturity Model",
        content: `Quantivis provides a Governance Maturity assessment framework:\n\n• **Level 1: Ad Hoc** — Decisions made informally with no documentation\n• **Level 2: Documented** — Decisions recorded but not tracked\n• **Level 3: Measured** — Outcomes tracked against predictions\n• **Level 4: Calibrated** — Organizational bias patterns identified and corrected\n• **Level 5: Adaptive** — Continuous learning loop with automated improvement\n\nThe platform provides a score and actionable recommendations for advancing to the next maturity level.`
      },
      {
        heading: "Decision Approval Workflows",
        content: `For high-stakes decisions, governance rules can require approval workflows:\n\n• **Approval Chains** — Define who must approve decisions above certain thresholds\n• **Four-Eyes Principle** — Require at least two independent reviewers\n• **Escalation Paths** — Auto-escalate if approval is not received within a deadline\n• **Verdict Recording** — Approvers provide comments and formal verdict (approved/rejected/deferred)\n\nAll approval actions are permanently recorded and linked to the decision in the ledger.`
      }
    ]
  },
  {
    id: 14,
    title: "Authentication & Enterprise Security",
    sections: [
      {
        heading: "Authentication Methods",
        content: `Quantivis supports a comprehensive authentication stack:\n\n• **Email/Password** — Standard registration with email verification\n• **SSO (SAML 2.0 / OIDC)** — Federated identity with Entra ID, Okta, Google Workspace\n• **MFA** — TOTP-based multi-factor authentication\n• **Passkeys / FIDO2** — Phishing-resistant biometric authentication\n• **SCIM 2.0** — Automated user provisioning and deprovisioning\n\nThe SSO configuration supports domain-based auto-detection — users from configured domains are automatically redirected to their organization's identity provider.`
      },
      {
        heading: "Session Security",
        content: `Session management follows zero-trust principles:\n\n• **Session Timeout** — Configurable inactivity timeout with warning dialog\n• **Concurrent Session Limits** — Prevent account sharing\n• **Login Anomaly Detection** — AI-powered detection of unusual login patterns (new device, location, time)\n• **Risk Scoring** — Each authentication event receives a risk score (0-100)\n• **Device Fingerprinting** — Track device identity across sessions\n• **Step-Up Authentication** — Require re-authentication for sensitive operations\n\nAll authentication events are logged to the auth_events table with full metadata for security audit.`
      },
      {
        heading: "WebAuthn / Passkey Security",
        content: `The Passkey implementation includes specific security measures:\n\n• **Challenge Expiry** — WebAuthn challenges expire after 5 minutes\n• **Replay Protection** — used_at timestamp prevents challenge reuse\n• **User Scoping** — Challenges are bound to the authenticated user's ID\n• **Ceremony Validation** — Full attestation verification via dedicated Edge Function\n\nThis meets CISA and NIST guidelines for phishing-resistant authentication.`
      }
    ]
  },
  {
    id: 15,
    title: "Multi-Tenancy & Data Isolation",
    sections: [
      {
        heading: "Row Level Security (RLS)",
        content: `Every table in the database has RLS enabled. Policies enforce:\n\n• **Organization Isolation** — Users can only access data belonging to their organization\n• **Workspace Isolation** — Within an organization, workspace members can only see their workspace's data\n• **Role-Based Access** — Sensitive tables (SSO configs, embed tokens) are restricted to owner/admin roles\n• **Self-Access Patterns** — Users can always view their own records (profiles, calibration assessments)\n\nIsolation is enforced via SECURITY DEFINER functions (is_org_member, is_workspace_member, get_user_org_role) that execute with elevated privileges to check membership without recursive RLS issues.`
      },
      {
        heading: "The Active Data Contract",
        content: `Every analytical query — whether from the frontend or an Edge Function — must satisfy the **Active Data Contract**:\n\n1. **organization_id** must be present and valid\n2. **dataset_id** must be present and belong to the specified organization\n3. The requesting user must be an authenticated member of the organization\n\nThe contract is enforced both in the UI (guard clauses that prevent function invocation) and in Edge Functions (enforceDatasetContract validation). If either ID is missing, the request is rejected with a 400 error — no data is ever returned without proper scoping.\n\nThis prevents cross-tenant data leakage even in the case of frontend bugs or misconfigured queries.`
      },
      {
        heading: "Context Cascade Security",
        content: `When users switch organizational context (Organization, Workspace, or Project), all downstream state is automatically cleared:\n\n• Switching Organization → clears Workspace, Project, and Dataset\n• Switching Workspace → clears Project and Dataset\n• Switching Project → clears Dataset\n\nThis cascade is implemented in both sessionStorage management and React context providers, ensuring that stale data from a previous context never leaks into a new one.`
      }
    ]
  },
  {
    id: 16,
    title: "Role-Based Access Control (RBAC)",
    sections: [
      {
        heading: "Organization Roles",
        content: `The platform defines the following organization-level roles:\n\n• **Owner** — Full administrative control, billing management, organization deletion\n• **Admin** — User management, SSO configuration, data source management\n• **Analyst** — Data upload, KPI configuration, insight generation\n• **Executive** — Read access to dashboards, reports, and decision queue\n• **Viewer** — Read-only access to shared dashboards\n• **Steward** — Data governance specialist with quality management capabilities\n\nRoles are stored in a dedicated organization_members table (never on the user profile) to prevent privilege escalation attacks.`
      },
      {
        heading: "Workspace Roles",
        content: `Within workspaces, additional granularity is provided:\n\n• **workspace_admin** — Full control within the workspace scope\n• **workspace_member** — Standard access within workspace boundaries\n\nWorkspace membership is checked via the is_workspace_member SECURITY DEFINER function, ensuring that even organization admins cannot access workspaces they're not members of (unless explicitly added).`
      },
      {
        heading: "Permission System",
        content: `Fine-grained permissions are managed via the role_permissions table:\n\n• Permissions follow the pattern: resource.action (e.g., "dashboard.view", "decisions.create")\n• Custom permission overrides can be configured per organization\n• The has_permission function provides a fallback hierarchy:\n  - Owner/Admin → all permissions granted\n  - Analyst/Executive → all .view permissions granted\n  - Viewer → only dashboard.view granted\n  - Custom overrides take precedence over defaults\n\nThe PermissionGate component wraps UI elements to show/hide based on the current user's permissions.`
      }
    ]
  },
  {
    id: 17,
    title: "AI Models & Explainability",
    sections: [
      {
        heading: "Supported AI Models",
        content: `Quantivis integrates with multiple AI providers through Lovable AI:\n\n• **Google Gemini 2.5 Pro** — Complex reasoning, multimodal analysis, large context windows\n• **Google Gemini 2.5 Flash** — Balanced speed and capability for standard analytical tasks\n• **OpenAI GPT-5** — Powerful all-round reasoning for strategic queries\n• **OpenAI GPT-5 Mini** — Cost-effective inference for high-volume operations\n\nModel selection is automatic based on task complexity. All AI calls include PII redaction as a preprocessing step to prevent sensitive data from being sent to external models.`
      },
      {
        heading: "Anti-Hallucination Framework",
        content: `Every AI-generated output passes through an anti-hallucination pipeline:\n\n• **Source Evidence Requirement** — All claims must be traceable to specific data points\n• **Confidence Capping** — AI confidence is capped based on data quality index and sample size\n• **Output Classification** — Every AI output is classified (fact, inference, recommendation, speculation) with visible badges\n• **Traceability Panel** — Users can inspect the full chain: data → model → inference → display\n• **Human-in-the-Loop** — Critical decisions require human confirmation before execution\n\nThe platform never presents AI outputs as certainties. Every recommendation includes explicit uncertainty quantification.`
      },
      {
        heading: "AI Explanations",
        content: `For every AI-generated insight, the system stores:\n\n• **Feature Attributions** — Which data features most influenced the output\n• **Confidence Breakdown** — How confidence was computed (raw score, calibration adjustment, quality penalty)\n• **Explanation Narrative** — Human-readable description of the reasoning process\n• **Model Used** — Which AI model generated the output\n\nThis enables full explainability audits — a requirement for many regulated industries and enterprise governance frameworks.`
      }
    ]
  },
  {
    id: 18,
    title: "Integrations & API",
    sections: [
      {
        heading: "Data Connectors",
        content: `Native integrations for data ingestion:\n\n• **PostgreSQL** — Direct database connection with SSL\n• **Snowflake** — OAuth-based warehouse access\n• **BigQuery** — Service account authentication\n• **dbt** — Model sync and lineage metadata\n• **REST APIs** — Webhook ingestion for custom data sources\n• **Slack** — Notification delivery for alerts and briefs\n\nAll connectors support configurable sync schedules, schema discovery, and table selection.`
      },
      {
        heading: "Embedded Dashboards",
        content: `Quantivis dashboards can be embedded in external applications:\n\n• Generate secure embed tokens with scoped permissions (specific dashboard type, allowed metrics)\n• Tokens have configurable expiry dates\n• Validation occurs via SECURITY DEFINER RPC (validate_embed_token) — no direct table access\n• Embedded views respect all existing data policies and role restrictions\n\nThis enables white-label deployment for consulting firms and portfolio management companies.`
      },
      {
        heading: "Export Capabilities",
        content: `Data and reports can be exported in multiple formats:\n\n• **PDF** — Board reports and governance documentation\n• **PPTX** — Strategy Pack presentations with executive formatting\n• **CSV** — Raw data exports with column selection\n• **JSON** — Programmatic data access for downstream systems\n\nAll exports are logged in the audit trail with the exporting user, timestamp, and scope of data included.`
      }
    ]
  },
  {
    id: 18.5,
    title: "Decision Fitness & Organizational Maturity",
    sections: [
      {
        heading: "The 7-Dimension Decision Fitness Framework",
        content: `Based on the book *Decision Intelligence: The Operating System for Billion-Dollar Decisions*, the Decision Fitness Assessment evaluates organizations across seven critical dimensions:\n\n1. **Strategic Clarity** (20%) — Mission alignment, objective specificity, stakeholder coherence\n2. **Structural Agility** (15%) — Org design for speed, escalation paths, decision rights\n3. **Systems & Tools** (15%) — Data infrastructure, decision support tooling, automation\n4. **Shared Decision Culture** (15%) — Psychological safety, dissent tolerance, learning orientation\n5. **Analytical Acumen** (15%) — Statistical literacy, evidence standards, analytical depth\n6. **Staff Enablement** (10%) — Training, empowerment, decision delegation\n7. **Leadership Style** (10%) — Decision modeling, accountability, feedback culture\n\nThe composite score (0–100) classifies organizations as Decision-Ready (85+), Developing (65–84), Emerging (40–64), or At Risk (0–39).`
      },
      {
        heading: "DROI & TCI: Quantifying Decision Value",
        content: `Two proprietary calculators help executives quantify the value of better decisions:\n\n**Decision Return on Investment (DROI)**\nMeasures the financial return from improving decision quality:\n• DROI Multiplier = 1 + (False Positive Reduction / 100) + (Success Rate / 200)\n• Projects how much additional revenue is captured by reducing decision errors\n\n**Total Cost of Inaction (TCI)**\nCalculates the compounding cost of NOT deciding:\n• Direct revenue loss from delays\n• Compounded opportunity cost using growth rates\n• Competitive pressure multiplier (1.0x – 2.0x)\n• Decision Entropy metric — the rate at which options narrow over time\n\nBoth tools use real organizational data to produce concrete financial estimates, not theoretical projections.`
      },
      {
        heading: "Decision Velocity & Maturity Roadmap",
        content: `**Decision Velocity Curve**\nAnalyzes the speed-accuracy tradeoff in organizational decision-making:\n• Identifies the optimal decision cycle time ("sweet spot")\n• Calculates a Paralysis Index based on aging pending decisions\n• Tracks velocity trends over time\n• Correlates speed with outcome quality\n\n**3-Phase Maturity Roadmap**\nOrganizations progress through:\n\n1. **Foundation** (Months 1–3) — Decision Ledger, data quality baselines, initial calibration\n2. **Expansion** (Months 4–8) — Calibration engine activation, AI advisory deployment, team training\n3. **Strategic Embedding** (Months 9–12) — Board integration, cognitive bias detection, institutional memory\n\nEach phase has measurable milestones and a readiness assessment before progressing.`
      }
    ]
  },
  {
    id: 19,
    title: "Pricing & Subscription Model",
    sections: [
      {
        heading: "Subscription Tiers",
        content: `Quantivis offers three subscription tiers:\n\n**Starter (€99/month)**\n• 1 organization, 1 dataset, 2 seats\n• Core dashboards and CSV upload\n• Data quality scoring\n• Basic KPI tracking\n\n**Growth (€499/month)**\n• Unlimited datasets, 10 seats\n• AI advisory, forecasting, Monte Carlo simulations\n• Executive Copilot (100 queries/day)\n• Board report generation\n• Calibration engine, prescriptive advisory\n\n**Enterprise (€18K–€72K/year)**\n• Unlimited everything, unlimited seats\n• Cognitive bias detection, scenario war room\n• SSO/SAML, SCIM provisioning, custom RBAC\n• Dedicated support and SLA guarantees\n• Multi-org portfolio governance`
      },
      {
        heading: "Usage Metering",
        content: `Usage is tracked per workspace across multiple dimensions:\n\n• **Datasets Created** — Number of active datasets\n• **Rows Ingested** — Daily row ingestion count\n• **API Calls** — Edge Function invocations\n• **Simulations** — Monte Carlo and scenario simulation runs\n• **Copilot Queries** — AI conversation turns\n\nQuotas are enforced via the check_workspace_quota SECURITY DEFINER function, with graceful degradation (warning → soft limit → hard block) rather than abrupt cutoffs.`
      },
      {
        heading: "Billing Integration",
        content: `Billing is managed through Stripe:\n\n• Secure checkout via create-checkout Edge Function\n• Customer portal for subscription management\n• Webhook-based event processing for real-time status updates\n• Prorated upgrades and downgrades\n• Invoice history and payment method management\n\nSubscription status is cached and checked via the check-subscription Edge Function to minimize latency on page loads.`
      }
    ]
  },
  {
    id: 20,
    title: "Pilot Readiness & What's Next",
    sections: [
      {
        heading: "Current Security Posture",
        content: `As of the latest audit, the platform meets the following security standards:\n\n✅ RLS enabled on 100% of tables\n✅ Multi-tenant isolation with SECURITY DEFINER functions\n✅ Immutable audit trail (write-once, no update/delete)\n✅ MFA and Passkey support with replay protection\n✅ SSO (SAML/OIDC) with domain-based auto-detection\n✅ SCIM 2.0 for automated user lifecycle management\n✅ Rate limiting on public endpoints\n✅ PII redaction in AI pipelines\n✅ Encrypted storage for datasets and reports\n✅ Webhook signature validation\n✅ Active Data Contract enforcement on all analytical functions\n\nEnterprise-grade security controls are fully implemented. All technical foundations for formal compliance certifications are in place.`
      },
      {
        heading: "Pilot Customer Requirements",
        content: `To run a successful pilot, organizations need:\n\n1. **A dataset** — At minimum, one CSV with time-series business metrics\n2. **An executive sponsor** — Someone who will log decisions and review outcomes\n3. **30 days** — Enough time to close the first decision → outcome loop\n4. **3-5 active users** — To test collaboration, RBAC, and governance workflows\n\nThe platform is designed for self-serve onboarding with optional guided setup calls. Demo mode can be used for initial evaluation before committing to a pilot.`
      },
      {
        heading: "Roadmap",
        content: `Recently shipped capabilities:\n\n✅ **Decision Fitness Assessment** — 7-dimension organizational readiness diagnostic\n✅ **DROI Calculator** — Decision Return on Investment quantification\n✅ **TCI Calculator** — Total Cost of Inaction with Decision Entropy metric\n✅ **Decision Velocity Curve** — Speed-accuracy tradeoff analysis with Paralysis Index\n✅ **Decision Maturity Assessment** — 15-question diagnostic with 3-phase roadmap\n✅ **Free Strategy Session** — Instant McKinsey-level business diagnosis (no signup)\n\nUpcoming capabilities on the development roadmap:\n\n• **Mobile app** — Executive decision queue on iOS/Android\n• **Slack bot** — Decision logging and morning briefs in Slack\n• **Advanced causal models** — Automated DAG discovery from data\n• **Multi-language AI** — Copilot in German, French, Arabic, Spanish\n• **SOC2 Type II** — Formal compliance certification\n• **On-premise deployment** — For regulated industries requiring data sovereignty\n• **API marketplace** — Third-party integrations and custom analytics modules\n\nThe core product philosophy remains unchanged: every feature must serve the Decision → Outcome → Learning loop. Analytics without accountability is just expensive distraction.`
      }
    ]
  }
];

const Ebook = () => {
  const [activeChapter, setActiveChapter] = useState(1);
  const [tocOpen, setTocOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentChapter = chapters.find(c => c.id === activeChapter)!;
  const progress = Math.round((activeChapter / chapters.length) * 100);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-secondary/60 transition-colors"
              aria-label="Toggle table of contents"
            >
              {tocOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Book className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">The Quantivis Handbook</h1>
              <p className="text-xs text-muted-foreground">
                Companion guide to <em>"Decision Intelligence: The Operating System for Billion-Dollar Decisions"</em>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => {
                const md = chapters.map(ch => {
                  const body = ch.sections.map(s =>
                    `### ${s.heading}\n\n${s.content.replace(/\\n/g, "\n")}`
                  ).join("\n\n");
                  return `## Chapter ${String(ch.id).padStart(2, "0")}: ${ch.title}\n\n${body}`;
                }).join("\n\n---\n\n");
                const full = `# Quantivis — The Complete Guide\n\n${md}\n`;
                const blob = new Blob([full], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "quantivis-ebook.md";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <span className="text-xs text-muted-foreground hidden sm:block">
              {activeChapter} / {chapters.length}
            </span>
            <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full">
        {/* Table of Contents - Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-40 w-72 bg-background border-r border-border/60 pt-16 transform transition-transform duration-300
            lg:relative lg:inset-auto lg:z-auto lg:pt-0 lg:transform-none lg:block lg:w-72 lg:shrink-0
            ${tocOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          <ScrollArea className="h-[calc(100vh-57px)] px-3 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-3">
              Table of Contents
            </p>
            <nav className="space-y-0.5">
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setActiveChapter(ch.id);
                    setTocOpen(false);
                    scrollToTop();
                  }}
                  className={`
                    w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all
                    ${activeChapter === ch.id
                      ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }
                  `}
                >
                  <span className="text-xs font-mono mr-2 opacity-60">{String(ch.id).padStart(2, "0")}</span>
                  {ch.title}
                </button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Overlay for mobile TOC */}
        {tocOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setTocOpen(false)}
          />
        )}

        {/* Main Content */}
        <main ref={contentRef} className="flex-1 overflow-y-auto h-[calc(100vh-57px)]">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
            {/* Chapter Header */}
            <div className="mb-10">
              <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
                Chapter {String(currentChapter.id).padStart(2, "0")}
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-2 leading-tight">
                {currentChapter.title}
              </h2>
              <div className="w-16 h-1 bg-primary/60 rounded-full mt-4" />
            </div>

            {/* Sections */}
            <div className="space-y-10">
              {currentChapter.sections.map((section, idx) => (
                <section key={idx}>
                  <h3 className="text-[14px] font-semibold text-foreground mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    {section.heading}
                  </h3>
                  <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed">
                    {section.content.split("\n\n").map((para, pIdx) => {
                      if (para.startsWith("• ") || para.includes("\n• ")) {
                        const items = para.split("\n").filter(l => l.startsWith("• "));
                        return (
                          <ul key={pIdx} className="space-y-1.5 my-3">
                            {items.map((item, iIdx) => (
                              <li key={iIdx} className="flex gap-2 text-sm">
                                <span className="text-primary mt-1 shrink-0">•</span>
                                <span dangerouslySetInnerHTML={{
                                  __html: item.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
                                }} />
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      if (para.match(/^\d+\./)) {
                        const items = para.split("\n").filter(l => l.match(/^\d+\./));
                        return (
                          <ol key={pIdx} className="space-y-1.5 my-3">
                            {items.map((item, iIdx) => (
                              <li key={iIdx} className="flex gap-2 text-sm">
                                <span className="text-primary font-bold shrink-0">{iIdx + 1}.</span>
                                <span dangerouslySetInnerHTML={{
                                  __html: item.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
                                }} />
                              </li>
                            ))}
                          </ol>
                        );
                      }
                      if (para.startsWith("✅")) {
                        const items = para.split("\n").filter(l => l.startsWith("✅"));
                        return (
                          <ul key={pIdx} className="space-y-1.5 my-3">
                            {items.map((item, iIdx) => (
                              <li key={iIdx} className="flex gap-2 text-sm">
                                <span className="shrink-0">✅</span>
                                <span dangerouslySetInnerHTML={{
                                  __html: item.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
                                }} />
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p
                          key={pIdx}
                          className="text-sm mb-3"
                          dangerouslySetInnerHTML={{
                            __html: para.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-14 pt-8 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                disabled={activeChapter === 1}
                onClick={() => {
                  setActiveChapter(prev => prev - 1);
                  scrollToTop();
                }}
              >
                ← Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {activeChapter} / {chapters.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={activeChapter === chapters.length}
                onClick={() => {
                  setActiveChapter(prev => prev + 1);
                  scrollToTop();
                }}
              >
                Next →
              </Button>
            </div>
          </div>

          {/* Scroll to top FAB */}
          <button
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-20"
            aria-label="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </main>
      </div>
    </div>
  );
};

export default Ebook;

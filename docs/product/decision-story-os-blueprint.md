# Quantivis Decision Story OS — Evolution Blueprint

**Applying *Storytelling with Data* (Cole Nussbaumer Knaflic) to turn Quantivis from an analytics platform into a Decision Intelligence Operating System.**

Status: proposal / design document. Nothing in this document has been implemented. It is written against the actual Quantivis codebase as of this commit — real tables (`decision_ledger`, `advisory_instances`, `kpis`, `insights`, `executive_risk_index`), real edge functions (`generate-insights`, `prescriptive-advisory`, `executive-brief`, `generate-board-report`, `embed-decisions`, `causal-inference`, `cognitive-bias-detect`, `decision-replay`, `counterfactual-explain`, `decision-impact-sim`, `monte-carlo-sim`, `adaptive-calibration`, `weekly-calibration-digest`, `executive-copilot`, `executive-orchestration`, `executive-convergence`, `nlq-query`, `predictive-forecast`), and real UI (`DecisionLedger.tsx`, `DecisionQueue.tsx`, `src/components/decision-intelligence/*`, `src/components/board-report/*`, `src/pages/BoardReport.tsx`, `src/pages/PitchDeck.tsx`) — rather than describing a hypothetical product.

---

## 0. The single idea everything below derives from

> People don't act on data. People act on a **story that data supports** — a specific claim, for a specific person, with the evidence attached, that ends in a decision they can defend.

Quantivis today computes the evidence half of that sentence extremely well: `compute-kpi`, `causal-inference`, `predictive-forecast`, `cognitive-bias-detect`, `adaptive-calibration`, and the `decision_ledger` outcome-tracking loop are already more rigorous than most enterprise BI stacks. What's missing is the **narrative half** — the deliberate construction, for a specific audience, of a story with a beginning (context), a middle (evidence → insight), and an end (a decision, made explicit and defensible).

Every part of this blueprint is a translation of one *Storytelling with Data* principle into a concrete subsystem that sits **on top of** the existing analytics engine — nothing here proposes replacing `compute-kpi`, `causal-inference`, or the calibration pipeline. It proposes a new layer that consumes their output and turns it into a story.

| SWD Principle | Quantivis Translation |
|---|---|
| Understand the context (who, what, how) | **Audience Intelligence Layer** (§3) |
| Choose an effective visual | **Visualization Intelligence Engine** (§12) |
| Eliminate clutter | Clutter-removal rules inside the same engine |
| Focus attention where you want it | Pre-attentive highlighting rules (§12.3) |
| Think like a designer (affordances, accessibility, aesthetics) | **Decision Design System** (§15) |
| Tell a story (narrative arc, the Big Idea) | **Decision Story Engine** (§13) + **Big Idea Generator** (§11.3) |

---

## 1. Executive Vision

Quantivis becomes the first platform where **every AI-generated recommendation is a complete, audience-adapted decision story**, not a chart with a caption. The unit of the product stops being "a dashboard" and becomes "a **Decision Story**" — a structured object with context, evidence, narrative, recommendation, risk, and a closed feedback loop back to the outcome. Dashboards, board reports, investor decks, and Slack alerts all become *renderings* of the same underlying Decision Story for different audiences, not separately maintained artifacts.

The wedge this opens against Tableau, Power BI, Looker, Qlik, ThoughtSpot, and Palantir Foundry: none of them own the **decision** — they own the chart. Quantivis already owns the decision (`decision_ledger`, approval gates, outcome tracking — see `docs/security/decision-ledger-transition-integrity.md`). This blueprint makes that ownership visible, defensible, and communicable at every organizational altitude from a data scientist to a board member, from the same evidence, without re-authoring anything by hand.

## 2. Product Philosophy

Four non-negotiable rules, enforced structurally (in schema and pipeline, not just in UI copy) so they can't be bypassed by an unusually enthusiastic PM shipping "one more chart":

1. **No orphan visuals.** A chart may only render inside a Decision Story context object. If there is no `decision_story_id`, the visualization API refuses to render more than a raw table. This is the structural fix to "decorative dashboards."
2. **No hallucinated narrative.** Every sentence the Narrative AI (§11) produces must resolve to a citation into the Decision Evidence Graph (§9). Generation is retrieval-grounded, not free-form; a claim with no evidence node is a build failure, not a runtime warning (see hallucination-prevention gate, §11.5).
3. **One evidence base, many audiences.** The CEO view, the board deck, and the data scientist's drill-down are three *renderings* of one Decision Story, produced by the Audience Intelligence Layer (§3) — never three separately written documents that can drift out of sync.
4. **Every recommendation closes the loop.** A Decision Story is not done at "recommendation." It is done when `decision_ledger.outcome_delta` is populated and lessons learned are written back into the calibration model (§17) that already exists (`adaptive-confidence.ts`, `weekly-calibration-digest`).

## 3. Audience Intelligence Layer

### 3.1 What it does
Given a Decision Story (§13) and a target audience, the layer decides: how much detail, which chart types, what order to read things in, what vocabulary, and what the call to action should look like. It is a **rendering transform**, not a re-analysis — the evidence is fixed; only the presentation changes. This directly operationalizes the book's "who/what/how" framing, applied per audience instead of once per report.

### 3.2 Audience profile schema

```sql
CREATE TABLE public.audience_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  audience_key TEXT NOT NULL,            -- 'ceo' | 'board' | 'investor' | 'operations' | 'finance' |
                                          -- 'sales' | 'marketing' | 'hr' | 'data_scientist' |
                                          -- 'business_analyst' | 'product_manager' | 'government' |
                                          -- 'healthcare' | 'manufacturing' | 'education'
  detail_level TEXT NOT NULL,             -- 'headline' | 'summary' | 'detailed' | 'technical'
  preferred_chart_types TEXT[] NOT NULL,  -- e.g. {'big_number','slope','bar'} vs {'scatter','box_plot','control_chart'}
  reading_order TEXT[] NOT NULL,          -- e.g. {'recommendation','impact','risk','evidence'} for CEO
                                          -- vs {'context','evidence','analysis','recommendation'} for analyst
  technical_depth TEXT NOT NULL,          -- 'none' | 'business_terms' | 'statistical' | 'full_methodology'
  vocabulary_profile TEXT NOT NULL,       -- 'plain' | 'financial' | 'clinical' | 'regulatory' | 'engineering'
  call_to_action_style TEXT NOT NULL,     -- 'single_decision' | 'options_menu' | 'faq' | 'approval_request'
  decision_style TEXT NOT NULL,           -- 'directive' | 'consultative' | 'evidence_first' | 'compliance_first'
  max_reading_minutes INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, audience_key)
);
```

Seed rows ship out of the box (org admins can override), e.g.:

| audience_key | detail_level | reading_order | technical_depth | max_reading_minutes |
|---|---|---|---|---|
| ceo | headline | recommendation → impact → risk → evidence | business_terms | 2 |
| board | summary | context → recommendation → risk → decision_request | business_terms | 3 |
| investor | summary | big_idea → evidence → trajectory → ask | financial | 3 |
| data_scientist | technical | context → analysis → model → confidence → recommendation | full_methodology | 10 |
| operations | detailed | situation → root_cause → recommendation → implementation | business_terms | 5 |
| healthcare | detailed | context → clinical_evidence → risk → recommendation | clinical | 5 |
| government | summary | context → evidence → compliance_impact → recommendation | regulatory | 4 |

### 3.3 How audience is resolved at request time
`role_type` already exists as a first-class concept (`executive-brief/index.ts` has a `ROLE_CONFIGS` map for `ceo`/`cfo`/`cmo`/`coo`). The Audience Intelligence Layer generalizes that pattern: `ROLE_CONFIGS` becomes rows in `audience_profiles`, resolved by the new `resolve-audience` shared helper (`supabase/functions/_shared/resolve-audience.ts`), which every rendering surface (dashboard, board report, email digest, Slack alert) calls before invoking the Narrative AI or Visualization Engine. Org admins can add custom audiences (e.g. "Regional VP") that inherit from a base profile and override individual fields.

## 4. Feature Architecture (system map)

```
                         ┌─────────────────────────────┐
                         │   Existing Analytics Core    │
                         │  compute-kpi · causal-inference │
                         │  predictive-forecast · anomaly  │
                         │  adaptive-calibration · advisory_instances │
                         └───────────────┬─────────────┘
                                         │ evidence
                                         ▼
                         ┌─────────────────────────────┐
                         │   Decision Evidence Graph    │  (§9)
                         │  signal→metric→analysis→     │
                         │  evidence→rule→model→llm→    │
                         │  recommendation→decision→    │
                         │  outcome→lesson              │
                         └───────────────┬─────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
        ┌───────────────────┐ ┌────────────────────┐ ┌──────────────────┐
        │ Decision Story     │ │ Narrative AI        │ │ Visualization    │
        │ Engine (§13)       │ │ (§11)                │ │ Intelligence     │
        │ builds the 16-field│ │ grounded generation  │ │ Engine (§12)     │
        │ story object       │ │ per audience/narrative│ │ chart-or-not,   │
        └─────────┬─────────┘ │ type                  │ │ chart-which,    │
                  │            └──────────┬──────────┘ │ clutter removal  │
                  │                       │             └─────────┬────────┘
                  ▼                       ▼                       ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │             Audience Intelligence Layer (§3)                    │
        │        resolves who is reading → detail/order/vocab/CTA         │
        └───────────────────────────────┬───────────────────────────────┘
                                        ▼
     ┌───────────┬───────────┬────────────┬────────────┬────────────────┐
     │ Story-    │ Decision  │ Decision   │ Presentation│ Collaborative  │
     │ Driven    │ Communi-  │ Presentation│ exports    │ Decision       │
     │ Dashboard │ cation    │ Generator   │ (PDF/PPTX/ │ Workspace (§16)│
     │ UI (§7-8) │ Score(§14)│ (feature)   │ email)     │                │
     └───────────┴───────────┴────────────┴────────────┴────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │   Decision Ledger (existing) │
                         │  + Decision Learning Loop(§17)│
                         └─────────────────────────────┘
```

Everything below §4 is a design of one of these boxes.

## 5. System Architecture

- **No new runtime.** Everything is additive to the existing Vite/React SPA + Supabase Postgres + Deno edge functions stack. No new services, no new infra dependency, no new database.
- **New edge functions** (Deno, following the existing `_shared/` conventions — `auth-guard.ts`, `cors.ts`, `rate-guard.ts`, `ai-validation.ts`):
  - `build-decision-story` — assembles the Decision Story object from `advisory_instances`, `insights`, `kpis`, `executive_risk_index`, and the Decision Evidence Graph.
  - `resolve-audience` (shared helper, not user-facing) — audience resolution.
  - `generate-narrative` — calls the LLM with the grounded prompt architecture (§11), one narrative type at a time.
  - `generate-big-idea` — the 7 summary formats (§11.3).
  - `score-decision-communication` — computes the 10-dimension score (§14).
  - `render-visualization-plan` — decides chart/table/text and clutter removal (§12), returns a Vega-Lite-like spec, not pixels; the frontend renders it with Recharts (already a dependency) or an SVG renderer for exports.
  - `generate-presentation` — assembles PPTX (via `pptxgenjs`, already a dependency) / PDF (via `jspdf`, already a dependency) from a Decision Story + audience profile.
  - `decision-evidence-trace` — read API over the Decision Evidence Graph for the audit/explainability UI (§9).
- **New tables** live in the same Postgres database, same RLS model (`is_org_member`, `get_user_org_role`), same audit conventions as `decision_ledger` (see §9-§14 for DDL).
- **No change to the existing analytics core.** `compute-kpi`, `causal-inference`, `cognitive-bias-detect`, `adaptive-calibration`, etc. are unmodified; they become *evidence producers* that the Decision Story Engine reads from, exactly as they already feed `prescriptive-advisory` and `generate-insights` today.
- **Realtime**: `decision_stories` and `decision_communication_scores` join the existing `supabase_realtime` publication (same pattern already used for `decision_ledger`, see migration `20260308145445`) so the Collaborative Decision Workspace (§16) updates live.

## 6. AI Architecture (overview — detail in §11)

Three LLM-touching subsystems, cleanly separated by responsibility so hallucination risk is isolated to the smallest possible surface:

1. **Evidence assembly (no LLM).** Deterministic SQL/TypeScript pulls facts from the Decision Evidence Graph. This is the majority of the pipeline and produces a typed `EvidenceBundle`.
2. **Narrative generation (LLM, grounded, low creative freedom).** The LLM's only job is to phrase the `EvidenceBundle` in the right voice for the right audience — it is explicitly *not* permitted to introduce new numbers, causal claims, or recommendations that don't already exist as nodes in the graph. Enforced by the validation gate in §11.5 (the same pattern the existing `ai-validation.ts` / `validateInsightArray` already uses for `generate-insights`).
3. **Confidence & risk framing (existing, reused).** `adaptive-confidence.ts`, `confidence-cap.ts`, and `calibration-correction.ts` are unchanged — the Narrative AI *reads* their output (`confidence_at_decision`, `data_sufficiency_rating`) and is required to state it, never to invent its own confidence language.

## 7. UX Principles

1. **Recommendation first, evidence on demand.** Default reading order for any audience with `detail_level = headline|summary` puts the decision above the fold; evidence is one click/scroll away, never absent.
2. **One idea per screen.** Following the book's "one message per slide/screen" rule: a Decision Story step (§8) shows one claim, its one supporting visual, and nothing else competing for attention. No multi-chart grids inside a story step — those exist only in the analyst-mode drill-down.
3. **Progressive disclosure, not progressive hiding.** Detail is always reachable (data lineage, methodology, raw metrics) — the design principle is ordering and defaults, never removing capability from technical audiences.
4. **The chart is a sentence, not a database dump.** Every visualization must have a title that is a *claim* ("Churn accelerated in EMEA after the March price change"), not a label ("Churn by Region").
5. **Confidence and risk are always visible, never buried in a tooltip.** Directly serves the existing calibration work (`confidence_at_decision`, `data_sufficiency_rating`) — a number nobody sees produces false confidence.
6. **Motion has meaning.** Framer Motion (already a dependency) is used only for state transitions that reinforce the story arc (§8) — step-to-step slide transforms, evidence reveal, not decorative animation.
7. **Every screen answers "so what should I do."** If a screen cannot be traced to a `decision_request` (§13), it should not exist as a standalone destination — this is the structural antidote to "decorative dashboard."

## 8. Decision Flow: the Story-Driven Journey (replaces chart→table→filter)

### 8.1 The eleven-step arc

```
Situation → Context → Evidence → Insight → Prediction → Recommendation →
Risks → Decision → Implementation → Outcome → Learning
```

Each step maps directly onto a field of the Decision Story object (§13.2, split into pre-publish and post-decision field groups) and onto a stage of the Decision Evidence Graph (§9). Concretely:

| Step | Decision Story field | Evidence Graph stage | Primary component |
|---|---|---|---|
| Situation | `context`, `business_question` | signal | `StorySituation.tsx` (new) |
| Context | `context`, `objective`, `audience` | metric | `StoryContext.tsx` (new) |
| Evidence | `evidence`, `supporting_evidence` | statistical_analysis → evidence | `StoryEvidence.tsx` (new), reuses `SensitivityAnalysis.tsx`, `CorrelatedPortfolioRisk.tsx` |
| Insight | `insights`, `analysis` | business_rule | `StoryInsight.tsx` (new) |
| Prediction | forward-looking evidence from `predictive-forecast`, `monte-carlo-sim` | model | reuses existing forecast/simulation components |
| Recommendation | `recommendation`, `alternative_actions` | llm_reasoning → recommendation | `StoryRecommendation.tsx` (new) |
| Risks | `risks`, `expected_business_impact` | — | reuses `RiskAttribution.tsx` |
| Decision | `decision_request` | decision | reuses `DecisionQueue.tsx`, `ModifyDecisionDialog.tsx`, the `approve_decision()`/`reject_decision()` RPCs |
| Implementation | execution_status fields (existing `decision_ledger` columns) | implementation | reuses `ExecutionDashboard.tsx` |
| Outcome | `decision_outcome`, `outcome_delta` | outcome | reuses `DecisionImpactAttribution.tsx` |
| Learning | `lessons_learned` | lessons_learned | new `StoryLearning.tsx`, feeds §17 |

### 8.2 Navigation model
- **Linear by default, jumpable by intent.** A left rail shows all 11 steps as a vertical progress tracker (reusing the visual language of `DecisionMaturityAssessment.tsx`'s stage indicators); clicking any step jumps there — this is "guided," not "gated." Executives reading in `reading_order` = `recommendation → impact → risk → evidence` simply see the rail reordered and pre-scrolled to Recommendation; the underlying step graph is unchanged.
- **Keyboard**: `→`/`space` advances one step, `←` goes back, matching the existing `PitchDeck.tsx`/`SlideData.tsx` presentation-mode keyboard handling already in the codebase (reused, not reinvented).
- **Transitions**: Framer Motion slide/fade between steps (150–250ms, matching Apple HIG-style restraint) — a horizontal slide in the direction of travel reinforces "this is a sequence," directly serving the book's narrative-arc principle. No parallax, no bounce, no decorative animation.
- **Progress tracking**: persisted per-user, per-story (`decision_story_reading_progress` table, §9.4) — reopening a story resumes where a reader left off, and shows teammates' read/ack state in the Collaborative Workspace (§16).

### 8.3 Layout skeleton (per step)

```
┌──────────────────────────────────────────────────────────────┐
│ [progress rail] │  STEP LABEL                    [confidence ▲]│
│  ● Situation     │  ────────────────────────────────────────  │
│  ● Context       │  Claim-as-title  (the "so what" sentence)  │
│  ● Evidence      │                                            │
│  ● Insight       │  ┌──────────────────────────────────────┐  │
│  ○ Prediction    │  │        ONE visual (§12 decides)        │  │
│  ○ Recommendation│  └──────────────────────────────────────┘  │
│  ○ Risks         │                                            │
│  ○ Decision      │  2-3 sentence narrative (grounded, §11)    │
│  ○ Implementation│                                            │
│  ○ Outcome       │  [Evidence trail ▾]   [Comment] [Challenge]│
│  ○ Learning      │  ──────────────────────────────────────── │
│                  │  [ ← Back ]              [ Continue → ]    │
└──────────────────────────────────────────────────────────────┘
```

## 9. Database Extensions

### 9.1 Decision Evidence Graph — schema
Extends, does not replace, `decision_ledger`. Every node type is its own table with a typed `node_kind` for graph traversal; edges are a single polymorphic table so the graph can be queried generically (for the audit UI) while individual node tables stay strongly typed (for the analytics core to keep writing to them exactly as it does today).

```sql
CREATE TYPE evidence_node_kind AS ENUM (
  'signal', 'metric', 'statistical_analysis', 'evidence',
  'business_rule', 'model', 'llm_reasoning',
  'recommendation', 'decision', 'implementation',
  'outcome', 'lesson_learned'
);

CREATE TABLE public.evidence_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  node_kind evidence_node_kind NOT NULL,
  -- polymorphic pointer back to the real, already-existing row this node represents
  source_table TEXT NOT NULL,      -- e.g. 'insights', 'kpis', 'advisory_instances', 'decision_ledger'
  source_id UUID NOT NULL,
  label TEXT NOT NULL,             -- short human-readable summary for graph rendering
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,  -- denormalized snapshot at node-creation time (for audit immutability)
  confidence NUMERIC,               -- carried through from confidence_at_decision / calibration where applicable
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_table, source_id)
);

CREATE TABLE public.evidence_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  from_node_id UUID NOT NULL REFERENCES public.evidence_nodes(id),
  to_node_id UUID NOT NULL REFERENCES public.evidence_nodes(id),
  edge_type TEXT NOT NULL DEFAULT 'derives_from', -- 'derives_from' | 'supports' | 'contradicts' | 'supersedes'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX evidence_edges_from_idx ON public.evidence_edges(from_node_id);
CREATE INDEX evidence_edges_to_idx   ON public.evidence_edges(to_node_id);
CREATE INDEX evidence_nodes_org_kind_idx ON public.evidence_nodes(organization_id, node_kind);
```

RLS mirrors `decision_ledger` exactly: `SELECT` for `is_org_member`, `INSERT` restricted to `service_role` (edge functions write nodes/edges as they compute; end users never write graph nodes directly — this makes the graph tamper-evident by the same deny-by-default principle already established for `decision_ledger` transitions).

### 9.2 Decision Story object

```sql
CREATE TABLE public.decision_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  decision_ledger_id UUID REFERENCES public.decision_ledger(id),
  advisory_instance_id UUID REFERENCES public.advisory_instances(id),
  root_evidence_node_id UUID REFERENCES public.evidence_nodes(id),

  context TEXT NOT NULL,
  business_question TEXT NOT NULL,
  objective TEXT NOT NULL,
  primary_audience TEXT NOT NULL,           -- FK-by-value into audience_profiles.audience_key
  evidence JSONB NOT NULL DEFAULT '[]',     -- ordered list of evidence_node_id references + rendered summaries
  analysis TEXT NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]',
  narrative JSONB NOT NULL DEFAULT '{}',    -- one entry per narrative_type (§10), each grounded + versioned
  recommendation TEXT NOT NULL,
  risks JSONB NOT NULL DEFAULT '[]',
  expected_business_impact JSONB NOT NULL DEFAULT '{}',  -- { metric, magnitude, unit, confidence_interval }
  confidence NUMERIC NOT NULL,
  alternative_actions JSONB NOT NULL DEFAULT '[]',
  decision_request JSONB NOT NULL DEFAULT '{}',    -- what's being asked of the approver, and by when
  decision_outcome JSONB,                          -- populated after decision_ledger resolves
  lessons_learned TEXT,

  communication_score_id UUID,   -- FK to decision_communication_scores, nullable until scored
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.3 Big Idea summaries

```sql
CREATE TABLE public.decision_story_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_story_id UUID NOT NULL REFERENCES public.decision_stories(id),
  summary_type TEXT NOT NULL, -- 'one_sentence' | 'three_minute_brief' | 'elevator_pitch' | 'board_summary' |
                              -- 'email_summary' | 'decision_summary' | 'linkedin_summary' | 'investor_summary'
  content TEXT NOT NULL,
  grounding_node_ids UUID[] NOT NULL,  -- every claim in `content` must trace to one of these evidence_nodes
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (decision_story_id, summary_type)
);
```

### 9.4 Reading progress & collaboration (used by §8.2 and §16)

```sql
CREATE TABLE public.decision_story_reading_progress (
  decision_story_id UUID NOT NULL REFERENCES public.decision_stories(id),
  user_id UUID NOT NULL,
  current_step TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_story_id, user_id)
);
```

(§14 and §16 tables follow in their own sections to keep schema next to the concept it serves.)

## 10. API Design

All new endpoints are Supabase Edge Functions under `supabase/functions/`, following the existing `auth-guard.ts` + `verifyOrgMembership` + dataset/story ownership-check pattern already used by `prescriptive-advisory`.

| Endpoint | Method | Input | Output | Notes |
|---|---|---|---|---|
| `build-decision-story` | POST | `{ organization_id, advisory_instance_id }` | `DecisionStory` (draft) | Pulls evidence, does NOT call the LLM yet |
| `generate-narrative` | POST | `{ decision_story_id, narrative_type, audience_key }` | `{ narrative_type, content, grounding_node_ids, confidence }` | One call per narrative type (§11); cacheable per (story, type, audience) |
| `generate-big-idea` | POST | `{ decision_story_id, summary_type }` | `DecisionStorySummary` | §11.3, one of 8 formats |
| `render-visualization-plan` | POST | `{ decision_story_id, step }` | `VisualizationPlan` (chart-or-not, spec, highlight rules) | §12; frontend renders with Recharts |
| `score-decision-communication` | POST | `{ decision_story_id }` | `DecisionCommunicationScore` | §14 |
| `decision-evidence-trace` | GET | `?decision_story_id=` or `?decision_ledger_id=` | Evidence graph subtree, ready for the audit UI | Read-only, RLS-scoped |
| `generate-presentation` | POST | `{ decision_story_id, audience_key, format }` | signed URL to PPTX/PDF | `format`: `board_deck`\|`investor_deck`\|`one_pager`\|`email_brief`\|`speaker_notes` |
| `list-decision-stories` | GET | `?organization_id=&status=` | paginated list | Standard list endpoint |
| `comment-on-story` (existing pattern, extended) | POST | `{ decision_story_id, step, body, evidence_node_id? }` | `DecisionComment` | Reuses `DecisionComments.tsx` wiring; every comment can optionally anchor to an evidence node (§16) |

Every write endpoint enforces the same **dataset/story contract** pattern already in `prescriptive-advisory/index.ts` (`dataset_id required by Active Data Contract`) — here, `decision_story_id` must belong to `organization_id`, checked before any read, exactly like the existing `dsCheck` block.

## 11. LLM Prompt Architecture (Narrative AI)

### 11.1 Design constraint
The LLM never sees raw metrics and free-associates a story. It receives a **pre-computed, typed `EvidenceBundle`** (produced deterministically in step 1 of §6) and is instructed to phrase it, not invent it. This is a stricter version of what `generate-insights` already does (it computes `changePct`, `trendPct`, `mean` etc. in TypeScript *before* calling the LLM, per the code read from that file) — Narrative AI generalizes that pattern across all 9 narrative types.

### 11.2 The nine narrative types (Part 5)

| Narrative type | Audience default | Distinguishing instruction |
|---|---|---|
| Executive | CEO, board | Lead with decision + impact, ≤150 words |
| Business | Ops, sales, marketing | Plain vocabulary, action-oriented |
| Technical | Data scientist, analyst | Full methodology, confidence intervals, model assumptions |
| Operational | Operations | Process/workflow framing, implementation steps |
| Risk | Board, compliance, government | Leads with downside, quantified where evidence supports it |
| Customer | Product, CX | Impact on customer experience/retention |
| Investment | Investor | Unit economics framing, trajectory vs. benchmark |
| Policy | Government, healthcare, education | Regulatory/compliance framing, cites applicable rule if in evidence |
| Audit | Data scientist, compliance | Full evidence trail, every claim inline-cited to a node id |

### 11.3 Big Idea Generator — prompt skeleton (Part 3)

```
SYSTEM:
You are generating a {summary_type} for a Quantivis Decision Story.
You may ONLY state facts present in EVIDENCE_BUNDLE below. Every sentence
must be attributable to at least one node id in EVIDENCE_BUNDLE.nodes.
If EVIDENCE_BUNDLE does not contain enough information to answer a
required field, output "insufficient evidence" for that field — never
fill the gap with a plausible-sounding guess.

Constraints for {summary_type}:
  one_sentence        -> exactly 1 sentence, ≤30 words, must name the decision and the primary metric impact
  three_minute_brief  -> 4 short paragraphs: situation, evidence, recommendation, ask
  elevator_pitch      -> ≤75 words, no jargon, ends in a question the listener can say yes to
  board_summary       -> ≤200 words, matches audience_profiles(board).vocabulary_profile
  email_summary       -> subject line + 3 bullet points + 1 CTA line
  decision_summary     -> states decision_request verbatim, lists alternatives considered, states confidence
  linkedin_summary     -> ≤150 words, no confidential figures (redaction pass applies, see ai-redaction.ts)
  investor_summary     -> leads with the metric investors track for this org's detected industry (reuses the
                          detectIndustryFromMetrics KPI framework already in generate-insights/index.ts)

EVIDENCE_BUNDLE:
{typed JSON: recommendation, confidence, expected_business_impact, risks[], evidence[] with node ids}

USER: Generate the {summary_type}.
```

### 11.4 Retrieval strategy
No separate vector retrieval step for narrative generation itself — the evidence is already scoped and typed by `build-decision-story`. Vector search (`embed-decisions`, already implemented with pgvector) is used for one specific purpose: **finding similar past decisions** to cite as precedent in the narrative ("a similar pattern in Q2 led to a 4% lift after price adjustment — see Decision #1842"), via `match_decision_embeddings()` (already exists per the security doc read above). This is the only place retrieval augments generation beyond the evidence bundle, and cited precedents are themselves evidence nodes (`edge_type = 'supports'`), so they're subject to the same grounding check.

### 11.5 Hallucination prevention (the gate)
An earlier draft of this section validated only that cited node IDs exist and that *numeric* claims matched a node's payload — which does nothing to stop a fabricated qualitative or causal claim ("this decline was driven by the EMEA pricing change") from passing, since it can cite any real node without that node actually supporting the claim. The gate below closes that: existence-checking and numeric matching are necessary but explicitly **not sufficient**, and are supplemented with per-claim citation coverage plus an entailment check on every citation, not just numeric ones.

Reuses and extends the existing `ai-validation.ts` pattern, in three layers:

1. **Citation coverage (structural, deterministic).** LLM output is required to include an inline citation marker `[[node:<uuid>]]` after *every* declarative sentence that asserts a fact — not only sentences containing a number. `validateNarrativeGrounding` (new, same shape as `validateInsightArray`) parses the narrative into sentences and **rejects** the response outright if any sentence makes a factual assertion (detected via a fixed list of claim-indicating patterns — comparatives, causal verbs like "caused"/"drove"/"led to", trend words) with zero citation markers attached. This is a hard, mechanical check with no semantic component, and it is what would have caught the "unsupported cause with no new number" failure mode: an uncited causal sentence fails at this layer regardless of what it claims.
2. **Reference validity + numeric match (structural, deterministic, as before).** Confirms every referenced node id exists in the `EvidenceBundle` that was actually sent, and rejects if any numeric claim in the text doesn't match a node's `payload` value within tolerance.
3. **Per-citation entailment check (LLM-assisted, narrower and more auditable than generation itself).** For every `[[node:<uuid>]]` marker that survives layers 1–2, a second, separate LLM call is issued — not the generation call — with only the single cited sentence and only that one node's `payload` as input, asked a strictly yes/no question: *"Does this evidence support this exact claim? Answer only YES or NO."* Any NO, or any answer that isn't cleanly YES/NO, rejects the narrative. This is a materially narrower task than open-ended narrative generation (one sentence, one fact, one binary judgment), which makes it far easier to audit and spot-check than the generation step itself — but it is still an LLM call, and this document does not claim it makes entailment failures impossible, only that it catches the class of "cites a real but non-supporting node" errors that layers 1–2 cannot. Full guaranteed semantic entailment validation is an open problem; this is a mitigation layered on top of the structural checks, not a substitute for human review of published stories (§16 collaboration flow still allows a "challenge" against any cited claim).
4. On rejection at any layer, the system falls back to a deterministic template narrative built directly from the evidence bundle (no LLM) rather than showing a broken or unvalidated narrative — mirroring the "insufficient quality data" hard-stop already present in `generate-insights/index.ts` (`qualityMetrics.length < 8`).
5. Every accepted narrative stores its `grounding_node_ids` in `decision_stories.narrative` and `decision_story_summaries.grounding_node_ids` — this is what makes citations clickable in the UI and auditable in the Decision Evidence Graph viewer (§9).

### 11.6 Confidence reporting
Narrative AI is prohibited from generating its own confidence language ("we're fairly confident that…"). It must render the numeric `confidence` field (already computed by `adaptive-confidence.ts`/`confidence-cap.ts`) through a fixed, audience-aware phrase table, e.g. board audience sees "High confidence (82%, based on 14 months of data)" while a data-scientist audience sees the full calibration detail (Brier score, sample size, `data_sufficiency_rating`) via `CalibrationCurve.tsx`/`BayesianPriorVisualization.tsx`, already built.

## 12. Visualization Intelligence Engine

### 12.1 Chart-or-not-or-table-or-text decision algorithm
Deterministic decision tree (not an LLM call — visual form should not hallucinate), run per story step:

Each evidence bundle is classified along two independent axes — **shape** (does it have a time dimension, categories, part-to-whole structure, or multiple variables?) and **reader need** (exact lookup vs. trend vs. comparison vs. deviation-from-target) — then mapped to a chart type. Shape is evaluated first and is not a single nested if/else, so a categorical dataset with no time dimension at all still reaches the categorical branch:

```
0. Classify evidence shape (not mutually exclusive with reader-need, evaluated independently):
     has_time_dimension   := series has ≥2 ordered timestamps
     is_categorical        := series is grouped by ≤7 discrete category labels, no time dimension required
     is_part_to_whole      := categories sum to a meaningful 100% of something
     is_deviation_from_target := a target/threshold value exists alongside the actual value(s)
     is_multivariate        := ≥2 independent variables plotted against each other

1. If evidence is a single number (or a comparison of 2 numbers) with no meaningful trend
      → TEXT or big-number tile (no chart). ("Revenue is up 12% this quarter.")
2. Else if is_deviation_from_target
      → SLOPE or BULLET chart (applies whether or not a time dimension is present)
3. Else if is_part_to_whole and category_count ≤ 5 and audience.detail_level != technical
      → simple STACKED BAR (never pie/donut/3D) — applies whether or not a time dimension is present
4. Else if is_categorical and category_count ≤ 7
      → BAR (horizontal if labels are long) — this fires for plain categorical comparisons with NO time
        dimension just as readily as for a single time slice broken out by category
5. Else if has_time_dimension and NOT is_categorical
      → LINE (1+ series, reader does not need to read off exact values at each point)
6. Else if category_count > 7, or the reader needs exact values at each point (lookup, not trend)
      → TABLE
7. Else if is_multivariate and audience.technical_depth in {statistical, full_methodology}
      → SCATTER / control chart / box plot (never shown to headline-detail audiences — collapsed to a text
        insight sentence instead, e.g. "Regions with lower support-ticket volume show 2.3x retention")
8. Else if >1 of the above is simultaneously required to support ONE claim
      → small multiples of the SAME chart type, never a mixed dashboard grid
```

This directly implements "choose the right visual" — including the explicit case (step 3) forbidding pie/donut/3D by construction, not by style guide — and, per review feedback on an earlier draft, categorical and part-to-whole selection no longer requires a time dimension to be reachable: an ordinary categorical dataset (e.g. revenue by region, no dates at all) resolves at step 4, independent of whether `has_time_dimension` is true.

### 12.2 Automatic clutter removal (rule engine, applied to every generated spec)
- Remove gridlines by default; add back only the single gridline needed to read the highlighted value.
- Remove legends when ≤2 series — label directly on the line/bar instead (data-label-over-legend, per the book).
- Ban 3D, ban shadow/bevel effects, ban decorative background images — enforced at the spec level: `VisualizationPlan.chart_style` has no field that can express these.
- Remove redundant axis labels/titles that repeat the claim-title already shown above the chart.
- Collapse duplicate legends/labels across small multiples into one shared legend.

### 12.3 Automatic highlighting (pre-attentive attributes, per the book's core technique)
The engine assigns **exactly one** dominant color (from the existing brand-neutral palette used by the design system, §15) to the data point(s) that matter; everything else renders in a single neutral gray. Rules:
- Outliers: highlighted if `|z-score| > threshold` from the existing anomaly-detection output already computed upstream.
- The recommendation's target metric: always highlighted, everything else in the same chart is context/gray.
- Forecast/actual boundary (from `predictive-forecast`): a vertical reference line + label, not a color change (avoids implying the forecast itself is "the anomaly").
- Thresholds/targets (e.g. OEE 85% world-class line from the existing `analysisFrameworks` in `generate-insights`): rendered as a reference line with a text label, never a second competing series color.
- Business risk regions: a subtle background band (low-saturation, colorblind-safe — see §15.4), never a saturated overlay that competes with the highlighted data.

### 12.4 Output contract
`render-visualization-plan` never returns pixels — it returns a typed `VisualizationPlan` (chart type, encoding channels, highlight targets, clutter-removal flags already applied) that the frontend renders via Recharts (interactive) or an SVG/PNG path via the same primitives used by `generate-presentation` (static, for exports) — one spec, two renderers, guaranteeing the on-screen chart and the exported chart are the same chart.

## 13. Decision Story Engine — Design (Part 1)

### 13.1 What replaces the dashboard
Instead of a user opening "Dashboard" and hunting for what matters, every `advisory_instance` that crosses a materiality threshold (existing logic in `prescriptive-advisory`) automatically triggers `build-decision-story`, which assembles the Decision Story object below (§13.2) and enters `status = 'draft'`. A human (or an auto-publish rule for low-risk/high-confidence stories) promotes it to `published` once the pre-publish field set is complete, at which point it appears in the audience's Story Feed (replacing the chart grid on `Dashboard.tsx`).

### 13.2 The required fields, split by lifecycle stage
The prompt names 17 conceptual fields. An earlier draft required all 17 before `status = 'published'` — but `decision_outcome` and `lessons_learned` can only exist once a *published* story has been decided and executed (§13.4), so requiring them pre-publish makes `published` unreachable. The fix is two separate, lifecycle-appropriate gates, and the field names below are corrected to match the actual `decision_stories` schema (§9.2): the prompt's `audience` is the column `primary_audience`, and the prompt's `supporting_evidence` is not a separate column — it is represented as additional entries in the `evidence` JSONB array (each still an `evidence_node_id` reference), so there is no dangling `supporting_evidence` field to satisfy.

**Pre-publish gate** (`build-decision-story` refuses to set `status = 'published'` unless all 14 are non-empty — this is what gives the "no orphan visuals" rule, §2, real teeth):
`context`, `business_question`, `objective`, `primary_audience`, `evidence` (inclusive of supporting evidence), `analysis`, `insights`, `narrative`, `recommendation`, `risks`, `expected_business_impact`, `confidence`, `alternative_actions`, `decision_request`.

**Post-decision gate** (checked separately, only once `decision_ledger.execution_status` reaches a terminal state — a published story that hasn't reached this point is simply "awaiting outcome," not invalid): `decision_outcome`, `lessons_learned`. The Decision Communication Score (§14) is computed once, at publish time, against the pre-publish 14; the Decision Learning Loop (§17) only counts a story as "closed" once the post-decision pair is also populated — these are two different completeness checks for two different purposes, not one 16/17-field gate.

### 13.3 Assembly pipeline
```
advisory_instances (trigger) 
   → build-decision-story
       1. Pull context: dataset, org, KPI, time window (deterministic SQL)
       2. Pull evidence: relevant insights, statistical outputs, causal-inference results, 
          cognitive-bias-detect flags → create evidence_nodes + evidence_edges
       3. Pull confidence: adaptive-confidence.ts / confidence-cap.ts output (unchanged)
       4. Resolve audience: resolve-audience helper using advisory_instances.role_type (see schema note
          below) or org default
       5. Call generate-narrative for the audience's default narrative_type
       6. Call render-visualization-plan per step
       7. Write decision_stories row, status='draft'
   → (async) generate-big-idea for the 8 summary types, cached for later reuse
   → (on publish) score-decision-communication runs against the pre-publish 14 fields (§13.2)
```

**Schema note on step 4 — this is a real gap, not a simplification.** `advisory_instances` (migration `20260225161019`) has no `role_type` column today, and `prescriptive-advisory/index.ts` accepts `role_type` in its request body (line 12) but never writes it onto the inserted advisory row (see the `rows.map(...)` insert block ~line 307) — the only place `role_type` is currently persisted is on `executive_risk_index`, a different table. As written, step 4 would either query a nonexistent column or silently always fall back to the org default, quietly losing per-advisory audience adaptation. This blueprint's Phase 2 (§18) must therefore include, as an explicit prerequisite: (a) `ALTER TABLE public.advisory_instances ADD COLUMN role_type text;`, and (b) a one-line fix to `prescriptive-advisory/index.ts`'s insert payload to carry the `role_type` already present in its request body onto the new row. Without both, step 4 degrades to "org default only," which is a safe but silent failure mode worth calling out rather than leaving implicit.

### 13.4 Decision flow (state machine)
```
draft → (review, §16) → published → (reader reaches "Decision" step) → decision_request raised
   → existing decision_ledger approve_decision()/reject_decision() RPCs fire (UNCHANGED — reused as-is)
   → decision_outcome populated when execution_status resolves (existing columns)
   → lessons_learned written (human or auto-summarized from outcome vs. expected_business_impact delta)
   → feeds Decision Learning Loop (§17)
```

## 14. Decision Communication Score (Part 7)

### 14.1 The ten dimensions

| Dimension | What it measures | Primary signal source |
|---|---|---|
| Context Quality | Is the business question and audience explicit and specific? | Presence/specificity check on `context`, `business_question`, `audience` fields |
| Evidence Quality | Sample size, data quality score, recency | Reuses existing `quality_score`/sample-size gates from `generate-insights`/`prescriptive-advisory` |
| Narrative Quality | Passes the grounding gate (§11.5); reading-level appropriate to audience | `validateNarrativeGrounding` result + Flesch-Kincaid check against `audience_profiles.vocabulary_profile` |
| Visual Clarity | Chart-or-not decision followed the algorithm (§12.1); clutter rules applied; ≤1 highlighted series | Static check on the `VisualizationPlan` |
| Decision Readiness | Is there an unambiguous `decision_request` with a deadline and named approver role? | Field-presence + schema check |
| Business Relevance | Does `expected_business_impact` tie to a KPI the audience's profile marks as tracked? | Cross-reference `audience_profiles`/org KPI priority list |
| Recommendation Quality | Is there exactly one primary recommendation plus ≥1 real alternative (not a strawman)? | Field-presence + LLM-free heuristic (alternative must differ materially in `expected_business_impact`) |
| Confidence Transparency | Is the numeric confidence shown, with basis (sample size / calibration), not just a qualitative word? | Presence check on rendered confidence phrase vs. `confidence` field |
| Actionability | Can the reader act within their role (decision_style match, e.g. board gets `approval_request`, not `single_decision`)? | Cross-reference `audience_profiles.call_to_action_style` |
| Executive Readability | Word count and reading order match `audience_profiles.max_reading_minutes`/`reading_order` | Static computation |

### 14.2 Weighting & overall score
Default weights (org-configurable):

```
Overall = 0.15·Decision_Readiness + 0.15·Evidence_Quality + 0.12·Confidence_Transparency
        + 0.12·Narrative_Quality + 0.10·Visual_Clarity + 0.10·Business_Relevance
        + 0.10·Actionability + 0.08·Recommendation_Quality + 0.05·Context_Quality
        + 0.03·Executive_Readability
```
Decision Readiness, Evidence Quality, and Confidence Transparency are weighted highest deliberately: a beautifully written story with no decision request or unstated confidence is exactly the "decorative dashboard" failure mode this whole blueprint exists to prevent.

### 14.3 Schema

```sql
CREATE TABLE public.decision_communication_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_story_id UUID NOT NULL REFERENCES public.decision_stories(id),
  context_quality NUMERIC NOT NULL,
  evidence_quality NUMERIC NOT NULL,
  narrative_quality NUMERIC NOT NULL,
  visual_clarity NUMERIC NOT NULL,
  decision_readiness NUMERIC NOT NULL,
  business_relevance NUMERIC NOT NULL,
  recommendation_quality NUMERIC NOT NULL,
  confidence_transparency NUMERIC NOT NULL,
  actionability NUMERIC NOT NULL,
  executive_readability NUMERIC NOT NULL,
  overall_score NUMERIC NOT NULL,
  improvement_recommendations JSONB NOT NULL DEFAULT '[]', -- e.g. [{dimension:'decision_readiness', fix:'Add a named approver and deadline'}]
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 14.4 Benchmarks & improvement loop
Scores are stored per-story and aggregated per-org over time (mirroring the existing `weekly-calibration-digest` cadence — a new `weekly-communication-digest` reuses that scheduling infra) so an org can see "Decision Readiness has improved from 61 to 84 over two quarters." Any dimension scoring below an org-configurable floor (default 60) auto-generates the specific fix in `improvement_recommendations` and blocks auto-publish (manual override still possible, logged).

## 15. Decision Design System (Part 10)

Built as an extension of the existing shadcn-ui + Tailwind + Radix primitives already in `src/components/ui/`, not a parallel system.

- **Typography**: a strict 4-level scale — Claim (chart/step title, the "so what" sentence), Body (narrative), Meta (confidence/timestamp/source), Numeral (a distinct tabular-figures font-feature setting for all metric displays, so numbers always align in tables and big-number tiles).
- **Spacing**: 8px base grid (matches existing Tailwind config scale); one-idea-per-screen enforced visually via a minimum whitespace margin around the single highlighted visual — no competing element may sit within that margin.
- **Color philosophy**: one **accent** color per organization (brand), reserved *exclusively* for the pre-attentive highlight (§12.3) — never used for decoration, navigation, or non-data UI chrome, so that when it appears on a chart, it always means "this is what matters." Everything else is a neutral gray scale. Risk uses a desaturated amber/red pair chosen for colorblind-safety (validated against deuteranopia/protanopia simulation), never pure red/green together.
- **Accessibility**: WCAG 2.2 AA minimum on all text/background pairs; every highlight-by-color is paired with a redundant encoding (position, label, or icon) so color is never the sole channel of meaning.
- **Visual hierarchy / attention guidance**: enforced by the Visualization Intelligence Engine's output contract (§12.4), not left to component authors — a component cannot render 2 "highlighted" series because the type doesn't allow it.
- **Annotation strategy**: reference lines and callout labels are first-class chart elements (rendered by the same spec, §12.4), not overlaid post-hoc images — this is what lets exports (§ presentation generator) match the live UI pixel-for-pixel in meaning if not in pixel size.
- **Confidence visualization**: a standard "confidence chip" component (extends existing `CalibrationCurve.tsx` visual language) — a small horizontal bar + numeric % + basis text, used identically everywhere confidence appears (story steps, board decks, Slack alerts).
- **Risk visualization**: a standard "risk band" component — severity dot (not full-saturation fill) + one-line description + link to full risk detail; reuses `RiskAttribution.tsx` visual language.
- **Recommendation styling**: a distinct card treatment (accent-colored left border, per the existing `board-report` `GovernanceActions.tsx` pattern) used only for the single primary recommendation per story — alternatives render in the neutral card style to keep the visual hierarchy honest.
- **Reusable components** (new, under `src/components/decision-story/`): `StoryStepShell`, `ClaimTitle`, `ConfidenceChip`, `RiskBand`, `RecommendationCard`, `EvidenceTrail`, `BigIdeaCard`, `AudienceSwitcher`, `CommunicationScoreBadge`.

## 16. Collaborative Decision Workspace (Part 11)

### 16.1 Capabilities
Review, comment, challenge assumptions, request more evidence, approve, reject, escalate, track implementation, capture lessons learned — all anchored to evidence, not floating chat.

### 16.2 Schema

```sql
CREATE TABLE public.decision_story_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_story_id UUID NOT NULL REFERENCES public.decision_stories(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  author_id UUID NOT NULL,
  step TEXT,                                   -- which of the 11 steps this comment anchors to
  evidence_node_id UUID REFERENCES public.evidence_nodes(id),  -- optional direct anchor
  comment_type TEXT NOT NULL DEFAULT 'comment', -- 'comment' | 'challenge' | 'evidence_request' | 'escalation'
  body TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This directly extends the already-existing `DecisionComments.tsx` component (currently used in `board-report`) — same UI pattern, new `comment_type` taxonomy and the `evidence_node_id` anchor, which is the actual innovation: a "challenge" always points at the specific evidence node being challenged, not at the story in the abstract.

### 16.3 Flow
- **Challenge assumption** → creates a comment with `comment_type='challenge'` anchored to an `evidence_node_id`; the story's Communication Score (§14) `evidence_quality` is flagged pending resolution.
- **Request additional evidence** → creates `comment_type='evidence_request'`; can optionally trigger a re-run of the relevant upstream analytics function (e.g. re-run `causal-inference` with a longer window) — same idempotency guarantees as the existing `idempotency.ts` shared helper.
- **Approve / reject / escalate** → these are the *decision* actions and deliberately reuse the existing `approve_decision()`/`reject_decision()` RPCs and `decision_ledger` state machine unchanged (§13.4) — the Collaborative Workspace is a richer front door onto the same trusted backend, not a parallel approval path (avoiding exactly the kind of bypass risk the `decision-ledger-transition-integrity` hardening work was written to close).
- **Track implementation** → surfaces existing `execution_status`/`ExecutionDashboard.tsx` inline in the story's Implementation step.
- **Lessons learned** → free text plus a structured `outcome_delta` vs. `expected_business_impact` comparison, feeding §17 directly.

## 17. Decision Learning Loop (Part 12)

### 17.1 What's measured (per implemented decision)
Accuracy (predicted vs. actual outcome_delta), ROI, business impact, prediction quality, user acceptance (was the recommendation followed as-is, modified, or rejected?), confidence calibration (reuses the existing Brier-score-style calibration pipeline: `adaptive-calibration`, `weekly-calibration-digest`, `CalibrationCurve.tsx`), recommendation effectiveness (delta vs. the best alternative that was *not* chosen, when knowable), decision latency (time from `published` to `decision_request` resolution).

### 17.2 Schema

```sql
CREATE TABLE public.decision_story_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_story_id UUID NOT NULL REFERENCES public.decision_stories(id),
  decision_ledger_id UUID NOT NULL REFERENCES public.decision_ledger(id),
  predicted_impact NUMERIC,
  actual_impact NUMERIC,
  prediction_error NUMERIC GENERATED ALWAYS AS (actual_impact - predicted_impact) STORED,
  acceptance_type TEXT NOT NULL,   -- 'as_is' | 'modified' | 'rejected' | 'escalated'
  decision_latency_seconds INT,
  communication_score_at_decision NUMERIC,
  calibration_delta NUMERIC,       -- confidence_at_decision vs. realized correctness
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 17.3 Feedback into future recommendations — three concrete mechanisms (no vague "ML improves over time" hand-wave)
1. **Calibration model update (existing mechanism, extended):** `decision_story_learning.calibration_delta` feeds the same `adaptive-calibration` function that already recalibrates `confidence_at_decision` — no new model, an additional input to one that already exists.
2. **Communication-quality feedback:** if stories with low `decision_readiness` sub-scores systematically show longer `decision_latency_seconds`, that correlation becomes an org-level insight surfaced back to §14's improvement recommendations — literally, low story quality measurably slows decisions, and the loop proves it with the org's own data instead of asserting it.
3. **Recommendation-pattern feedback:** `acceptance_type = 'rejected'` or `'modified'` patterns, grouped by `advisory_instances.decision_type`, are surfaced to whoever authors that decision-type's prompt templates (§11) as a "this recommendation pattern is being overridden 40% of the time" flag — a human-in-the-loop signal to revise the prompt or business rule, not silent auto-tuning of judgment calls.

## 18. Enterprise Roadmap

| Phase | Scope | Eng. effort | Risk | Dependencies | Business value | Technical complexity |
|---|---|---|---|---|---|---|
| **1 — Immediate wins** | `audience_profiles` table + seed data; `resolve-audience` helper wired into existing `executive-brief`/`generate-board-report` (generalizing `ROLE_CONFIGS`); Decision Design System components (§15) for confidence chips & risk bands, retrofitted onto existing board-report components | Small (2-3 wk) | Low — additive, no schema migration risk beyond one new table | None | Immediate visual/consistency lift on existing surfaces | Low |
| **2 — AI narrative engine** | `evidence_nodes`/`evidence_edges` (minimal viable graph), `generate-narrative` + grounding gate (§11.5), `decision_stories` table (draft-only, no publish gate yet) | Medium (4-6 wk) | Medium — hallucination-gate correctness is the critical path; mitigate with the deterministic-fallback-template safety net (§11.5.3) | Phase 1 | High — first real "story," not just prettier charts | Medium |
| **3 — Visualization intelligence** | `render-visualization-plan`, chart-or-not algorithm (§12.1), clutter/highlight rule engine, dual renderer (Recharts + export SVG) | Medium (4-5 wk) | Low-Medium — mostly deterministic logic, main risk is Recharts spec-coverage gaps for edge-case chart types | Phase 1 | High — directly visible quality jump | Medium |
| **4 — Decision Story Engine** | `advisory_instances.role_type` column + `prescriptive-advisory` insert fix (§13.3 schema note); full `build-decision-story` pipeline, 11-step journey UI (§8), pre-publish field gate (§13.2) | Large (6-8 wk) | Medium — orchestration complexity across many upstream functions; mitigate by building the pipeline as sequential, independently-retryable steps (reuse `retry.ts`) | Phases 2, 3 | Very high — this is the product's new core loop | High |
| **5 — Adaptive audience reporting** | Full `audience_profiles` matrix (15 audiences), Big Idea Generator (8 formats, §11.3), Presentation Generator (`generate-presentation`, reusing `pptxgenjs`/`jspdf`) | Medium-Large (5-7 wk) | Low — mostly composition of existing pieces | Phase 4 | Very high — this is what actually reaches CEOs/boards/investors without manual deck-building | Medium |
| **6 — Decision Communication Scoring** | `decision_communication_scores`, weighting model, improvement-recommendation engine, auto-publish gate | Medium (3-4 wk) | Low | Phases 4, 5 | High — makes quality measurable and improvable, an actual moat vs. competitors who ship raw charts | Low-Medium |
| **7 — Enterprise collaboration** | `decision_story_comments`, challenge/evidence-request/escalation flows, realtime wiring | Medium (4 wk) | Low — extends existing `DecisionComments.tsx` and realtime patterns | Phase 4 | Medium-High — needed for enterprise multi-stakeholder adoption | Low-Medium |
| **8 — Continuous learning system** | `decision_story_learning`, calibration feedback wiring, recommendation-pattern override tracking | Medium (4-5 wk) | Medium — requires enough decided/resolved stories to be statistically meaningful; mitigate by shipping the schema and dashboards early even while sample size grows | Phases 4, 6, 7 | Very high long-term — this is the compounding-advantage layer competitors can't easily copy without years of decision-outcome history | Medium |

Total: roughly 32–42 engineering-weeks for one focused team across all 8 phases, sequenced so that every phase after Phase 1 ships something independently demoable.

## 19. Competitive Analysis

| Capability | Tableau / Power BI / Looker / Qlik | ThoughtSpot | Palantir Foundry | **Quantivis (post-blueprint)** |
|---|---|---|---|---|
| Chart authoring | Excellent, manual | Search-driven, auto-chart | Manual/ontology-driven | Automatic, algorithmic (§12), grounded in the same evidence as the recommendation |
| Narrative generation | Bolt-on "AI summary" widgets, largely unstructured, not citation-checked | NLQ answers, not full narratives | Manual write-ups by analysts (AIP adds LLM copilots, but not a structured story schema) | Structured 9-narrative-type system, citation-gated against a typed evidence graph (§11) |
| Audience adaptation | None — one dashboard, manually duplicated per audience if at all | Limited (search results, not full reports) | Manual, per-deliverable | Systematic: one evidence base, 15 audience profiles, automatic re-rendering (§3) |
| Decision tracking | None native — decisions live in email/Slack, disconnected from the chart that prompted them | None | Operational workflows exist but are not narrative-linked by default | `decision_ledger` (already shipped) + full evidence-to-outcome graph (§9), native |
| Communication quality measurement | Doesn't exist as a concept | Doesn't exist | Doesn't exist | Decision Communication Score (§14) — a new, ownable category |
| Learning from outcomes | None — dashboards don't know what happened after they were viewed | None | Possible via custom pipelines, not a product feature | Decision Learning Loop (§17), feeding the existing calibration model automatically |
| Chart clutter / chart-junk prevention | Style guides at best (human-enforced) | N/A | N/A | Enforced at the type level in `VisualizationPlan` — physically cannot render 3D/pie/gridline-heavy charts (§12.2) |

The pattern across every competitor: they are chart platforms with decisions bolted on informally by their users. Quantivis, after this blueprint, is a **decision platform where the chart is a byproduct of the recommendation**, not the other way around.

## 20. Why This Redefines Business Intelligence

Every major BI platform optimizes the same variable: time-to-chart. Faster queries, prettier visuals, more connectors, more self-service. That variable has been optimized nearly to its ceiling across the industry — Power BI, Tableau, Looker, and Qlik are converging on capability, and ThoughtSpot's search-driven analytics and Palantir's ontology-driven operational layer are the two most serious attempts to escape that plateau, yet neither treats *the decision itself* as the unit of the product. A chart, however fast or beautiful, still requires a human to supply the story, choose the audience-appropriate framing, decide what's clutter, remember what happened last time, and manually rebuild the whole thing for the board versus the ops team versus the investor.

Quantivis already had the hardest part solved and invisible: a real decision ledger with approval gates, outcome tracking, adaptive calibration, and causal inference running under the hood. This blueprint's entire contribution is recognizing that **the missing variable isn't more analysis — it's the translation of analysis into a story a specific human can act on and be held accountable for**, and building that translation layer as rigorously as the analytics layer beneath it: a typed evidence graph instead of prose the LLM might invent, a deterministic visualization algorithm instead of a chart-picker menu, a measurable communication score instead of a vague "insights" feature, and a closed learning loop instead of a fire-and-forget dashboard.

That is the redefinition: **Business Intelligence platforms show you data. A Decision Intelligence Operating System hands you a defensible decision, phrased for whoever has to act on it, with the receipts attached, and it gets smarter every time you tell it what actually happened.** No competitor in the market is structured to do that today, because none of them start from a decision ledger — they start from a chart. Quantivis starts from the decision. This blueprint is how it becomes visibly, unmistakably true from the first screen a user opens.

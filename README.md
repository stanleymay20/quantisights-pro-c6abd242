# Quantivis

**Decision Intelligence & Data Quality Platform**

**Website:** https://www.quantivis.io

Quantivis is an AI-assisted decision-intelligence platform for turning messy operational data into validated analytical outputs, forecasts, structured insights and decision support.

The codebase demonstrates the engineering work between **raw data and a defensible decision**: ingestion, schema inference, validation, quality diagnostics, multi-tenant data handling, analytical workflows and governed application delivery.

## Data & analytics engineering evidence

This repository demonstrates hands-on work across:

- **PostgreSQL / SQL** — migrations, functions/RPCs, metric-processing and persistence workflows;
- **Data ingestion** — CSV and multi-metric datasets with schema, date, region, dimension and metric detection;
- **Data quality** — validation, dataset diagnostics, quality scoring and ingestion hardening;
- **Analytics** — KPI workflows, operational trends, forecasting and executive reporting;
- **Production-oriented data systems** — Supabase/PostgreSQL, authentication, multi-tenant workflows and Edge Functions;
- **Decision support** — converting analytical results into structured findings and recommendations rather than charts alone;
- **Release discipline** — CI/CD, security controls, audit evidence and staged readiness checks maintained in the repository.

Quantivis is a product codebase rather than a classroom notebook, so reliability, security, data contracts and maintainability are part of the analytical evidence.

## Decision pipeline

```text
Raw Data
   ↓
Schema & Type Detection
   ↓
Validation / Quality Diagnostics
   ↓
Analysis & Forecasting
   ↓
Structured Intelligence
   ↓
Human Decision
   ↓
Outcome / Feedback
```

A central design principle is that poor-quality or incomplete data should be made visible rather than silently converted into confident recommendations.

## Core capabilities

### Data ingestion and validation

Current capabilities include:

- CSV datasets;
- multi-metric operational and business datasets;
- automatic schema inference;
- metric and dimension detection;
- region and date detection;
- validation and diagnostics;
- dataset quality scoring.

Hardening work includes XLSX/multi-sheet ingestion, European number formats, Excel serial dates, large-dataset handling, PII detection and richer lineage/health scoring.

### Decision intelligence

Implemented or developed analytical workflows include:

- KPI analysis;
- trend analysis;
- forecasting;
- operational bottleneck analysis;
- supplier/customer analysis;
- structured executive reporting;
- decision and recommendation workflows.

## Development and public-interest relevance

Although Quantivis originated as an enterprise decision-intelligence product, the underlying pipeline is domain-agnostic: fragmented datasets still need validation, comparability and traceability whether the decision concerns a company, a public programme or an economic-development intervention.

Relevant development-oriented applications could include:

- SME and entrepreneurship indicators;
- financial-inclusion programme monitoring;
- regional economic-development data;
- programme KPI and outcome tracking;
- operational data-quality assessment for public-interest organisations.

These are **transferable use cases**, not claims that Quantivis is currently deployed by UN agencies, governments or development programmes.

Potential Sustainable Development Goal relevance includes **SDG 8 (Decent Work and Economic Growth), SDG 9 (Industry, Innovation and Infrastructure) and SDG 10 (Reduced Inequalities)** where the platform is applied to appropriate programmes and datasets. This is a problem-domain mapping, not a claim of measured SDG impact.

## Technology stack

**Frontend:** React · TypeScript · Vite · Tailwind CSS · shadcn/ui

**Backend/data:** Supabase · PostgreSQL / SQL · Edge Functions · authentication · Google OAuth

**Intelligence layer:** data profiling · analytical workflows · forecasting · insight generation · recommendation support

## Evidence and claim boundaries

The repository contains production-oriented engineering, but specific claims about business impact, forecast accuracy, institutional adoption or development outcomes require evidence from the relevant deployment and dataset. Roadmap items are kept separate from currently supported capabilities.

See `AUDIT.md` and `.github/workflows/` for the current engineering/release-quality evidence rather than relying on marketing statements.

## Development

```bash
git clone https://github.com/stanleymay20/quantisights-pro-c6abd242.git
cd quantisights-pro-c6abd242
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Platform provenance

The project originated on Lovable and retains Lovable preview/editor integration for that workflow. Production hosting, CI, release gates, database migrations, RLS policies and application/test code are maintained in this repository.

## Current engineering priorities

1. Data-ingestion hardening
2. Dataset health and lineage
3. XLSX ingestion
4. Privacy/PII controls
5. Forecasting validation
6. Decision traceability
7. Governance and audit controls
8. Reliable reporting automation

## License

Proprietary © Quantivis. All rights reserved.

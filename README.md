# Quantivis

**Enterprise Decision Intelligence Platform**

**Website:** https://www.quantivis.io

Quantivis is an AI-powered decision-intelligence platform that transforms raw business data into executive insights, operational intelligence, forecasts, risk analysis and decision support.

## Data & analytics engineering evidence

For data and analytics roles, this repository demonstrates hands-on work across the path from raw data to decision-ready outputs:

- **PostgreSQL / SQL** — database migrations, functions/RPCs, metric-processing and persistence workflows.
- **Data ingestion** — CSV and multi-metric business datasets with schema, date, region, dimension and metric detection.
- **Data quality** — validation, dataset diagnostics, quality scoring and ingestion hardening.
- **Analytics** — KPI dashboards, revenue and margin analysis, operational trends, forecasting and executive reporting.
- **Production data systems** — Supabase/PostgreSQL backend, authentication, multi-tenant application workflows and edge functions.
- **Decision support** — turning analytical results into structured insights and recommendations rather than displaying charts alone.

This is a production-oriented product codebase rather than a standalone classroom notebook, so the emphasis includes reliability, security, data contracts and maintainability alongside analytics.

## Vision

Quantivis helps executives, operators, analysts, founders, governments and enterprises move from:

```text
Raw Data → Validated Data → Intelligence → Decisions → Outcomes
```

The platform is designed to ingest messy real-world datasets and turn them into usable business intelligence while making data quality and uncertainty visible.

---

## Core capabilities

### Data ingestion

Supported today:

- CSV datasets
- Multi-metric business datasets
- Financial datasets
- Manufacturing datasets
- Revenue datasets
- Operational datasets
- KPI-oriented datasets

Current ingestion capabilities include:

- Automatic schema inference
- Metric detection
- Dimension detection
- Region detection
- Date detection
- Data validation
- Dataset diagnostics
- Quality scoring

Additional hardening in progress:

- Excel support (`.xlsx`)
- Multi-sheet imports
- European number parsing
- Excel serial dates
- Large-dataset streaming
- PII detection
- Dataset health scoring

---

## Decision Intelligence Engine

Example analytical use cases include:

- Revenue analysis
- Margin optimisation
- Operational bottleneck detection
- Supplier-risk analysis
- Customer-trend analysis
- Forecasting
- Executive reporting
- Strategic planning

---

## Technology stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

### Backend / data

- Supabase
- PostgreSQL / SQL
- Edge Functions
- Authentication
- Google OAuth

### Intelligence layer

- Decision Intelligence Engine
- Data Profiling Engine
- Executive Insight Generation
- Forecasting and Recommendation Systems

---

## Development

### Install

```bash
git clone https://github.com/stanleymay20/quantisights-pro-c6abd242.git
cd quantisights-pro-c6abd242
npm install
```

### Run locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

---

## Platform provenance

The project originated on [Lovable](https://lovable.dev) and keeps Lovable's
preview/editor integration (`.lovable/`, the `lovable-tagger` dev dependency,
and the `oauth.lovable.app` / `ai.gateway.lovable.dev` origins in the security
policy) for that workflow. Production hosting, CI, release gates, database
migrations, RLS policies, and the application/test code itself are maintained
independently in this repository — see `AUDIT.md` for the current release-quality
baseline and `.github/workflows/` for the enforced CI/CD pipeline.

---

## Authentication

Supported authentication methods include:

- Email / password
- Google OAuth
- MFA where enabled
- SSO/SAML for enterprise workflows

Future roadmap items are kept separate from currently supported capabilities.

---

## Enterprise-readiness roadmap

High-priority initiatives include:

1. Enterprise data-ingestion hardening
2. Dataset health scoring
3. XLSX ingestion
4. Data-lineage tracking
5. Executive-reporting automation
6. Forecasting improvements
7. Decision ledger
8. Governance and audit controls

---

## Repository goals

This repository is focused on:

- Enterprise-grade reliability
- Secure authentication
- High-quality data ingestion
- Data-quality visibility
- Executive intelligence workflows
- AI-assisted decision support
- Production deployment readiness

---

## License

Proprietary © Quantivis. All rights reserved.

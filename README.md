# Quantivis

Enterprise Decision Intelligence Platform

**Website:** https://www.quantivis.io

Quantivis is an AI-powered decision intelligence platform that transforms raw business data into executive insights, operational intelligence, forecasts, risk analysis, and decision support.

## Vision

Quantivis helps executives, operators, analysts, founders, governments, and enterprises move from:

```text
Raw Data → Intelligence → Decisions → Outcomes
```

The platform is designed to ingest messy real-world datasets and automatically generate actionable business intelligence.

---

# Core Capabilities

## Data Ingestion

Supported today:

- CSV datasets
- Multi-metric business datasets
- Financial datasets
- Manufacturing datasets
- Revenue datasets
- Operational datasets
- KPI dashboards

Current ingestion engine includes:

- Automatic schema inference
- Metric detection
- Dimension detection
- Region detection
- Date detection
- Data validation
- Dataset diagnostics
- Quality scoring

Additional hardening in progress:

- Excel support (.xlsx)
- Multi-sheet imports
- European number parsing
- Excel serial dates
- Large dataset streaming
- PII detection
- Dataset health scoring

---

# Decision Intelligence Engine

Quantivis is designed around executive decision support.

Examples:

- Revenue analysis
- Margin optimization
- Operational bottleneck detection
- Supplier risk analysis
- Customer trend analysis
- Forecasting
- Executive reporting
- Strategic planning

---

# Technology Stack

Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

Backend

- Supabase
- PostgreSQL
- Edge Functions
- Authentication
- Google OAuth

AI Layer

- Decision Intelligence Engine
- Data Profiling Engine
- Executive Insight Generation
- Forecasting & Recommendation Systems

---

# Development

## Install

```bash
git clone https://github.com/stanleymay20/quantisights-pro-ff2bbabf.git
cd quantisights-pro-ff2bbabf
npm install
```

## Run Locally

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

---

# Authentication

Supported authentication methods:

- Email / Password
- Google OAuth
- MFA (where enabled)
- SSO/SAML (enterprise)
- Passkeys (future roadmap)

---

# Enterprise Readiness Roadmap

High-priority initiatives:

1. Enterprise data ingestion hardening
2. Dataset health scoring
3. XLSX ingestion engine
4. Data lineage tracking
5. Executive reporting automation
6. Forecasting engine
7. Decision ledger
8. Governance and audit controls

---

# Repository Goals

This repository serves as the production codebase for Quantivis and is focused on:

- Enterprise-grade reliability
- Secure authentication
- High-quality data ingestion
- Executive intelligence workflows
- AI-powered decision support
- Production deployment readiness

---

# License

Proprietary © Quantivis. All rights reserved.
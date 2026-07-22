/**
 * Centralised route configuration.
 * Each entry maps a path to a lazy-loaded component and a layout wrapper.
 *
 * Layout keys:
 *   "public"   → SafeRoute only (no auth)
 *   "full"     → P  (sidebar + context bar)
 *   "minimal"  → PMinimal (no sidebar)
 *   "none"     → bare component (e.g. Index)
 */

import { lazy } from "react";
import { Navigate } from "react-router-dom";

// Eager: critical-path landing
import Index from "@/pages/Index";
const DecisionIntelligencePlatforms = lazy(() => import("@/pages/DecisionIntelligencePlatforms"));

// ── Auth ──
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));


// ── Intelligence Core ──
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Copilot = lazy(() => import("@/pages/Copilot"));
const CopilotAnalytics = lazy(() => import("@/pages/CopilotAnalytics"));
const KPIs = lazy(() => import("@/pages/KPIs"));
const Diagnostics = lazy(() => import("@/pages/Diagnostics"));
const Advisory = lazy(() => import("@/pages/Advisory"));
const Forecasting = lazy(() => import("@/pages/Forecasting"));
const NaturalLanguageQuery = lazy(() => import("@/pages/NaturalLanguageQuery"));
const MarketIntelligence = lazy(() => import("@/pages/MarketIntelligence"));

// ── Decision System ──
const DecisionLedger = lazy(() => import("@/pages/DecisionLedger"));
const ExecutiveBrief = lazy(() => import("@/pages/ExecutiveBrief"));
const DecisionReview = lazy(() => import("@/pages/DecisionReview"));
const DecisionOutcome = lazy(() => import("@/pages/DecisionOutcome"));
const EvidencePack = lazy(() => import("@/pages/EvidencePack"));
const ScenarioTemplates = lazy(() => import("@/pages/ScenarioTemplates"));
const ScenarioTemplateDetail = lazy(() => import("@/pages/ScenarioTemplateDetail"));
const Deliberation = lazy(() => import("@/pages/Deliberation"));
const AIBoardroom = lazy(() => import("@/pages/AIBoardroom"));
const DecisionIntelligence = lazy(() => import("@/pages/DecisionIntelligence"));
const DecisionFitness = lazy(() => import("@/pages/DecisionFitness"));
const ExecutionDashboard = lazy(() => import("@/pages/ExecutionDashboard"));
const CognitiveBiasDetection = lazy(() => import("@/pages/CognitiveBiasDetection"));
const CounterfactualExplanation = lazy(() => import("@/pages/CounterfactualExplanation"));
const CausalInference = lazy(() => import("@/pages/CausalInference"));
const CalibrationAssessment = lazy(() => import("@/pages/CalibrationAssessment"));
const Misses = lazy(() => import("@/pages/Misses"));
const DecisionAccuracy = lazy(() => import("@/pages/DecisionAccuracy"));
const Outcomes = lazy(() => import("@/pages/Outcomes"));
const DecisionHistory = lazy(() => import("@/pages/DecisionHistory"));
const DecisionRules = lazy(() => import("@/pages/DecisionRules"));

// ── Scenarios & Simulations ──
const Scenarios = lazy(() => import("@/pages/Scenarios"));
const Simulations = lazy(() => import("@/pages/Simulations"));
const ScenarioBranching = lazy(() => import("@/pages/ScenarioBranching"));

// ── Data ──
const DataUpload = lazy(() => import("@/pages/DataUpload"));
const DataConnectors = lazy(() => import("@/pages/DataConnectors"));
const DataSources = lazy(() => import("@/pages/DataSources"));
const DatasetExplorer = lazy(() => import("@/pages/DatasetExplorer"));
const DataCatalog = lazy(() => import("@/pages/DataCatalog"));
const DataLineage = lazy(() => import("@/pages/DataLineage"));
const PipelineObservability = lazy(() => import("@/pages/PipelineObservability"));
const DataHub = lazy(() => import("@/pages/DataHub"));

// ── Reporting & Strategy ──
const Reports = lazy(() => import("@/pages/Reports"));
const BoardReport = lazy(() => import("@/pages/BoardReport"));
const Executive = lazy(() => import("@/pages/Executive"));
const StrategyPack = lazy(() => import("@/pages/StrategyPack"));
const Benchmarking = lazy(() => import("@/pages/Benchmarking"));
const OKRs = lazy(() => import("@/pages/OKRs"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));

// ── Governance & Compliance ──
const GovernanceCommandView = lazy(() => import("@/pages/GovernanceCommandView"));
const GovernanceMaturity = lazy(() => import("@/pages/GovernanceMaturity"));
const Compliance = lazy(() => import("@/pages/Compliance"));
const AlertPlaybooks = lazy(() => import("@/pages/AlertPlaybooks"));
const SystemHealth = lazy(() => import("@/pages/SystemHealth"));
const SecurityTrustCenter = lazy(() => import("@/pages/SecurityTrustCenter"));
const TrustCenter = lazy(() => import("@/pages/TrustCenter"));
const SecurityPolicy = lazy(() => import("@/pages/SecurityPolicy"));
const SecurityOverview = lazy(() => import("@/pages/SecurityOverview"));
const HowAIIsUsed = lazy(() => import("@/pages/HowAIIsUsed"));
const AISystemClassification = lazy(() => import("@/pages/AISystemClassification"));
const FairnessObservability = lazy(() => import("@/pages/FairnessObservability"));
const DecisionMaturity = lazy(() => import("@/pages/DecisionMaturity"));

// ── Organization & Admin ──
const Team = lazy(() => import("@/pages/Team"));
const Clients = lazy(() => import("@/pages/Clients"));
const Settings = lazy(() => import("@/pages/Settings"));
const Billing = lazy(() => import("@/pages/Billing"));
const SSOConfig = lazy(() => import("@/pages/SSOConfig"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const PrivacyDashboard = lazy(() => import("@/pages/PrivacyDashboard"));

// ── Public / Marketing ──
const Pricing = lazy(() => import("@/pages/Pricing"));
const Demo = lazy(() => import("@/pages/Demo"));
const Security = lazy(() => import("@/pages/Security"));
const SecurityQuestionnaire = lazy(() => import("@/pages/SecurityQuestionnaire"));
const Documentation = lazy(() => import("@/pages/Documentation"));
const APIDocs = lazy(() => import("@/pages/APIDocs"));
const BusinessModel = lazy(() => import("@/pages/BusinessModel"));
const FounderHandbook = lazy(() => import("@/pages/FounderHandbook"));
const WhyVsMicrosoft = lazy(() => import("@/pages/WhyVsMicrosoft"));
const Pitch = lazy(() => import("@/pages/Pitch"));
const Competitions = lazy(() => import("@/pages/Competitions"));
const PitchDeck = lazy(() => import("@/pages/PitchDeck"));
const Ebook = lazy(() => import("@/pages/Ebook"));
const FreeAnalysis = lazy(() => import("@/pages/FreeAnalysis"));
const EmbedDashboard = lazy(() => import("@/pages/EmbedDashboard"));
const PilotAudit = lazy(() => import("@/pages/PilotAudit"));
const SystemStatus = lazy(() => import("@/pages/SystemStatus"));
const SLA = lazy(() => import("@/pages/SLA"));
const Compare = lazy(() => import("@/pages/Compare"));
const CopilotOverview = lazy(() => import("@/pages/CopilotOverview"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const EnterpriseContact = lazy(() => import("@/pages/EnterpriseContact"));
const DataVendors = lazy(() => import("@/pages/admin/DataVendors"));
const InternalData = lazy(() => import("@/pages/admin/InternalData"));
const AdminConnectors = lazy(() => import("@/pages/admin/Connectors"));
const IngestionObservability = lazy(() => import("@/pages/admin/IngestionObservability"));
const ConnectorHealth = lazy(() => import("@/pages/admin/ConnectorHealth"));
const AicisSync = lazy(() => import("@/pages/admin/AicisSync"));
const BridgeHealth = lazy(() => import("@/pages/admin/BridgeHealth"));
const SapConnector = lazy(() => import("@/pages/admin/SapConnector"));
const CompetitiveAnalysis = lazy(() => import("@/pages/CompetitiveAnalysis"));
const IntelligenceDashboard = lazy(() => import("@/pages/IntelligenceDashboard"));
const IntelligenceInbox = lazy(() => import("@/pages/IntelligenceInbox"));
const ExecutiveIntelligence = lazy(() => import("@/pages/ExecutiveIntelligence"));
const Interventions = lazy(() => import("@/pages/Interventions"));
const NarrativeCockpit = lazy(() => import("@/pages/NarrativeCockpit"));
const OperationalGraph = lazy(() => import("@/pages/OperationalGraph"));
const Boardroom = lazy(() => import("@/pages/Boardroom"));

// ── Legal ──
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const DataProcessing = lazy(() => import("@/pages/DataProcessing"));
const DataRetention = lazy(() => import("@/pages/DataRetention"));
const Subprocessors = lazy(() => import("@/pages/Subprocessors"));
const Impressum = lazy(() => import("@/pages/Impressum"));
const TOMs = lazy(() => import("@/pages/TOMs"));
const AIGovernance = lazy(() => import("@/pages/AIGovernance"));
const IncidentResponse = lazy(() => import("@/pages/IncidentResponse"));
const Auditability = lazy(() => import("@/pages/Auditability"));
const ProcurementPack = lazy(() => import("@/pages/ProcurementPack"));

// ── Phase 5F: Procurement Localization & Compliance ──
const DatenschutzDe = lazy(() => import("@/pages/de/Datenschutz"));
const AGBDe = lazy(() => import("@/pages/de/AGB"));
const AVVDe = lazy(() => import("@/pages/de/AVV"));
const TOMsDe = lazy(() => import("@/pages/de/TOMs"));
const CookiesDe = lazy(() => import("@/pages/de/Cookies"));
const KINutzungDe = lazy(() => import("@/pages/de/KINutzung"));
const DataResidency = lazy(() => import("@/pages/DataResidency"));
const DPIA = lazy(() => import("@/pages/DPIA"));
const GDPRRights = lazy(() => import("@/pages/GDPRRights"));
const EnterpriseReadiness = lazy(() => import("@/pages/EnterpriseReadiness"));
const LocalizationAudit = lazy(() => import("@/pages/admin/LocalizationAudit"));
const ContextPacks = lazy(() => import("@/pages/admin/ContextPacks"));
const GovernanceSimulation = lazy(() => import("@/pages/admin/GovernanceSimulation"));
const GovernanceAudit = lazy(() => import("@/pages/admin/GovernanceAudit"));
const ObservabilityCheck = lazy(() => import("@/pages/admin/ObservabilityCheck"));

const NotFound = lazy(() => import("@/pages/NotFound"));
const ConversationsEp1 = lazy(() => import("@/pages/ConversationsEp1"));


export type RouteLayout = "none" | "public" | "full" | "minimal";

export interface RouteEntry {
  path: string;
  element: React.ReactNode;
  layout: RouteLayout;
}

export const routes: RouteEntry[] = [
  // ══════ Landing ══════
  { path: "/", element: <Index />, layout: "none" },

  // ══════ Auth ══════
  { path: "/login", element: <Login />, layout: "public" },
  { path: "/register", element: <Register />, layout: "public" },
  { path: "/auth/callback", element: <AuthCallback />, layout: "public" },
  { path: "/forgot-password", element: <ForgotPassword />, layout: "public" },
  { path: "/reset-password", element: <ResetPassword />, layout: "public" },
  { path: "/verify-email", element: <VerifyEmail />, layout: "none" },
  { path: "/accept-invite", element: <AcceptInvite />, layout: "public" },

  // ══════ Public ══════
  { path: "/demo", element: <Demo />, layout: "public" },
  { path: "/conversations/episode-1", element: <ConversationsEp1 />, layout: "none" },
  { path: "/embed", element: <EmbedDashboard />, layout: "public" },
  // layout: "none" — these pages render <Navbar>/<Footer> themselves;
  // PublicPageNav would duplicate the marketing nav. See DS-0 audit.
  { path: "/pricing", element: <Pricing />, layout: "none" },
  { path: "/calibration", element: <CalibrationAssessment />, layout: "full" },
  { path: "/free-analysis", element: <FreeAnalysis />, layout: "none" },
  { path: "/status", element: <SystemStatus />, layout: "public" },
  { path: "/system-status", element: <SystemStatus />, layout: "public" },
  { path: "/sla", element: <SLA />, layout: "public" },

  // ══════ Marketing / Trust / Comparison ══════
  { path: "/compare", element: <Compare />, layout: "none" },
  { path: "/copilot", element: <CopilotOverview />, layout: "public" },
  { path: "/integrations", element: <Integrations />, layout: "public" },
  { path: "/business-model", element: <BusinessModel />, layout: "full" },
  { path: "/security", element: <Security />, layout: "public" },
  { path: "/security-questionnaire", element: <SecurityQuestionnaire />, layout: "public" },
  { path: "/handbook", element: <FounderHandbook />, layout: "full" },
  { path: "/vs/microsoft", element: <WhyVsMicrosoft />, layout: "public" },
  // layout: "none" — renders own Navbar/Footer (DS-0).
  { path: "/decision-intelligence-platforms", element: <DecisionIntelligencePlatforms />, layout: "none" },
  { path: "/pitch", element: <Pitch />, layout: "full" },
  { path: "/competitions", element: <Competitions />, layout: "full" },
  { path: "/pitch-deck", element: <PitchDeck />, layout: "full" },
  { path: "/ebook", element: <Ebook />, layout: "full" },
  { path: "/enterprise", element: <Navigate to="/enterprise/contact" replace />, layout: "none" },
  // layout: "none" — renders own Navbar/Footer (DS-0).
  { path: "/enterprise/contact", element: <EnterpriseContact />, layout: "none" },
  { path: "/competitive-analysis", element: <CompetitiveAnalysis />, layout: "full" },
  { path: "/trust", element: <SecurityTrustCenter />, layout: "public" },
  { path: "/enterprise/trust", element: <TrustCenter />, layout: "public" },
  { path: "/trust-center", element: <Navigate to="/trust" replace />, layout: "none" },
  { path: "/docs", element: <Documentation />, layout: "public" },
  { path: "/api-docs", element: <APIDocs />, layout: "public" },

  // ══════ Legal ══════
  { path: "/terms", element: <Terms />, layout: "public" },
  { path: "/privacy", element: <Privacy />, layout: "public" },
  { path: "/cookies", element: <CookiePolicy />, layout: "public" },
  { path: "/dpa", element: <DataProcessing />, layout: "public" },
  { path: "/data-retention", element: <DataRetention />, layout: "public" },
  { path: "/subprocessors", element: <Subprocessors />, layout: "public" },
  { path: "/toms", element: <TOMs />, layout: "public" },
  { path: "/ai-governance", element: <AIGovernance />, layout: "public" },
  { path: "/incident-response", element: <IncidentResponse />, layout: "public" },
  { path: "/auditability", element: <Auditability />, layout: "public" },
  { path: "/procurement-pack", element: <ProcurementPack />, layout: "public" },
  { path: "/security-policy", element: <SecurityPolicy />, layout: "public" },
  { path: "/security-overview", element: <SecurityOverview />, layout: "public" },
  { path: "/how-ai-is-used", element: <HowAIIsUsed />, layout: "public" },
  { path: "/ai-system-classification", element: <AISystemClassification />, layout: "public" },
  { path: "/impressum", element: <Impressum />, layout: "public" },

  // ══════ Phase 5F — German Legal Localization ══════
  { path: "/de/datenschutz", element: <DatenschutzDe />, layout: "public" },
  { path: "/de/agb", element: <AGBDe />, layout: "public" },
  { path: "/de/avv", element: <AVVDe />, layout: "public" },
  { path: "/de/toms", element: <TOMsDe />, layout: "public" },
  { path: "/de/cookies", element: <CookiesDe />, layout: "public" },
  { path: "/de/ki-nutzung", element: <KINutzungDe />, layout: "public" },

  // ══════ Phase 5F — Procurement Compliance ══════
  { path: "/data-residency", element: <DataResidency />, layout: "public" },
  { path: "/dpia", element: <DPIA />, layout: "public" },
  { path: "/gdpr-rights", element: <GDPRRights />, layout: "public" },
  { path: "/enterprise-readiness", element: <EnterpriseReadiness />, layout: "public" },


  // ══════ Standalone protected (no sidebar) ══════
  { path: "/onboarding", element: <Onboarding />, layout: "minimal" },
  { path: "/board-report", element: <BoardReport />, layout: "minimal" },

  // ══════ Intelligence Core ══════
  { path: "/dashboard", element: <Dashboard />, layout: "full" },
  { path: "/app/copilot", element: <Copilot />, layout: "full" },
  { path: "/copilot/analytics", element: <CopilotAnalytics />, layout: "full" },
  { path: "/kpis", element: <KPIs />, layout: "full" },
  { path: "/diagnostics", element: <Diagnostics />, layout: "full" },
  { path: "/advisory", element: <Advisory />, layout: "full" },
  { path: "/forecasting", element: <Forecasting />, layout: "full" },
  { path: "/ask", element: <NaturalLanguageQuery />, layout: "full" },
  { path: "/market-intelligence", element: <MarketIntelligence />, layout: "full" },
  { path: "/intelligence-dashboard", element: <IntelligenceDashboard />, layout: "full" },
  { path: "/intelligence-inbox", element: <IntelligenceInbox />, layout: "full" },
  { path: "/executive-intelligence", element: <ExecutiveIntelligence />, layout: "full" },
  { path: "/interventions", element: <Interventions />, layout: "full" },
  { path: "/narratives", element: <NarrativeCockpit />, layout: "full" },
  { path: "/operational-graph", element: <OperationalGraph />, layout: "full" },
  { path: "/boardroom", element: <Boardroom />, layout: "minimal" },
  // ══════ Decision System ══════
  { path: "/executive-brief", element: <ExecutiveBrief />, layout: "full" },
  { path: "/decisions", element: <DecisionLedger />, layout: "full" },
  { path: "/decisions/:id/review", element: <DecisionReview />, layout: "full" },
  { path: "/decisions/:id/outcome", element: <DecisionOutcome />, layout: "full" },
  { path: "/evidence-pack/:decisionId", element: <EvidencePack />, layout: "full" },
  // ══════ ST-1 Scenario Templates ══════
  // Mounted under /enterprise/* — "/scenarios" is already the live financial
  // what-if scenario simulator (src/pages/Scenarios.tsx); this avoids colliding
  // with it, the same way /enterprise/trust avoided colliding with /trust.
  { path: "/enterprise/scenarios", element: <ScenarioTemplates />, layout: "full" },
  { path: "/enterprise/scenarios/:templateId", element: <ScenarioTemplateDetail />, layout: "full" },
  { path: "/deliberation", element: <Deliberation />, layout: "full" },
  { path: "/ai-boardroom", element: <AIBoardroom />, layout: "full" },
  { path: "/decision-intelligence", element: <DecisionIntelligence />, layout: "full" },
  { path: "/decision-fitness", element: <DecisionFitness />, layout: "full" },
  { path: "/execution", element: <ExecutionDashboard />, layout: "full" },
  { path: "/cognitive-bias", element: <CognitiveBiasDetection />, layout: "full" },
  { path: "/counterfactual", element: <CounterfactualExplanation />, layout: "full" },
  { path: "/causal-inference", element: <CausalInference />, layout: "full" },
  { path: "/misses", element: <Misses />, layout: "full" },
  { path: "/decision-accuracy", element: <DecisionAccuracy />, layout: "full" },
  { path: "/outcomes", element: <Outcomes />, layout: "full" },
  { path: "/history", element: <DecisionHistory />, layout: "full" },
  { path: "/decision-rules", element: <DecisionRules />, layout: "full" },

  // ══════ Scenarios & Simulations ══════
  { path: "/scenarios", element: <Scenarios />, layout: "full" },
  { path: "/simulations", element: <Simulations />, layout: "full" },
  { path: "/branching", element: <ScenarioBranching />, layout: "full" },

  // ══════ Data ══════
  { path: "/data-upload", element: <DataUpload />, layout: "full" },
  { path: "/data-sources", element: <DataSources />, layout: "full" },
  { path: "/data-connectors", element: <DataConnectors />, layout: "full" },
  { path: "/dataset-explorer", element: <DatasetExplorer />, layout: "full" },
  { path: "/data-catalog", element: <DataCatalog />, layout: "full" },
  { path: "/lineage", element: <DataLineage />, layout: "full" },
  { path: "/pipeline", element: <PipelineObservability />, layout: "full" },
  { path: "/data-hub", element: <DataHub />, layout: "full" },
  { path: "/aicis-sync", element: <AicisSync />, layout: "full" },
  { path: "/admin/bridge-health", element: <BridgeHealth />, layout: "full" },
  { path: "/admin/observability-check", element: <ObservabilityCheck />, layout: "full" },

  // ══════ Reporting & Strategy ══════
  { path: "/reports", element: <Reports />, layout: "full" },
  { path: "/executive", element: <Executive />, layout: "full" },
  { path: "/strategy-pack", element: <StrategyPack />, layout: "full" },
  { path: "/benchmarking", element: <Benchmarking />, layout: "full" },
  { path: "/okrs", element: <OKRs />, layout: "full" },
  { path: "/portfolio", element: <Portfolio />, layout: "full" },

  // ══════ Governance & Compliance ══════
  { path: "/governance", element: <GovernanceCommandView />, layout: "full" },
  { path: "/governance-maturity", element: <GovernanceMaturity />, layout: "full" },
  { path: "/compliance", element: <Compliance />, layout: "full" },
  { path: "/alert-playbooks", element: <AlertPlaybooks />, layout: "full" },
  { path: "/system-health", element: <SystemHealth />, layout: "full" },
  { path: "/fairness", element: <FairnessObservability />, layout: "full" },
  { path: "/decision-maturity", element: <DecisionMaturity />, layout: "full" },

  // ══════ Organization & Admin ══════
  { path: "/workspace", element: <Navigate to="/settings" replace />, layout: "none" },
  { path: "/team", element: <Team />, layout: "full" },
  { path: "/clients", element: <Clients />, layout: "full" },
  { path: "/billing", element: <Billing />, layout: "full" },
  { path: "/settings", element: <Settings />, layout: "full" },
  { path: "/sso", element: <SSOConfig />, layout: "full" },
  { path: "/privacy-dashboard", element: <PrivacyDashboard />, layout: "full" },
  { path: "/pilot-audit", element: <PilotAudit />, layout: "full" },
  { path: "/admin/data-vendors", element: <DataVendors />, layout: "full" },
  { path: "/admin/internal-data", element: <InternalData />, layout: "full" },
  { path: "/admin/connectors", element: <AdminConnectors />, layout: "full" },
  { path: "/admin/ingestion-observability", element: <IngestionObservability />, layout: "full" },
  { path: "/admin/connector-health", element: <ConnectorHealth />, layout: "full" },
  { path: "/admin/connectors/sap", element: <SapConnector />, layout: "full" },
  { path: "/admin/localization-audit", element: <LocalizationAudit />, layout: "full" },
  { path: "/admin/context-packs", element: <ContextPacks />, layout: "full" },
  { path: "/admin/governance-simulation", element: <GovernanceSimulation />, layout: "full" },
  { path: "/admin/governance-audit", element: <GovernanceAudit />, layout: "full" },

  // ══════ Catch-all ══════
  // ── Redirects for anchor-based sections accessed as standalone URLs ──
  { path: "/case-studies", element: <Navigate to="/#case-studies" replace />, layout: "none" },
  { path: "/capabilities", element: <Navigate to="/#features" replace />, layout: "none" },

  { path: "*", element: <NotFound />, layout: "public" },
];

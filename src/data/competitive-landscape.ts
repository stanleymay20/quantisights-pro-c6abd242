export type CompetitiveSegment =
  | "AI governance"
  | "Decision intelligence"
  | "Adjacent enterprise platform";

export type CompetitiveVendor = {
  name: string;
  segment: CompetitiveSegment;
  strength: string;
  chooseQuantivisWhen: string;
  chooseThemWhen: string;
};

/**
 * Buyer-safe 2026 competitive landscape.
 *
 * This is positioning data, not a claim that every vendor is feature-for-feature
 * interchangeable with Quantivis. The list deliberately includes direct and
 * adjacent alternatives that can appear in the same enterprise budget or RFP.
 * Strengths are phrased conservatively; sales teams should verify vendor-specific
 * roadmap, certification, pricing and deployment claims during live procurement.
 */
export const COMPETITIVE_VENDORS: CompetitiveVendor[] = [
  // Direct AI-governance alternatives
  {
    name: "Airia",
    segment: "AI governance",
    strength: "Enterprise AI orchestration and governance across models, applications and agents.",
    chooseQuantivisWhen: "The customer wants the governed business decision — evidence, recommendation, approval, execution and measured outcome — to be the primary system of record.",
    chooseThemWhen: "The main requirement is broad AI-agent orchestration and AI-estate governance rather than decision-lifecycle management.",
  },
  {
    name: "Cranium AI",
    segment: "AI governance",
    strength: "AI security, inventory, risk and governance with strong technical-AI focus.",
    chooseQuantivisWhen: "Executives need to prove why a consequential business decision was made and whether it worked, not only whether an AI asset was governed.",
    chooseThemWhen: "AI security posture, technical AI inventory and AI supply-chain risk are the central buying problem.",
  },
  {
    name: "Credo AI",
    segment: "AI governance",
    strength: "Purpose-built AI governance, policy packs, AI inventory, risk management, agent governance and regulatory mapping.",
    chooseQuantivisWhen: "The organization already understands AI governance but lacks a closed-loop decision record connecting evidence to accountable action and outcomes.",
    chooseThemWhen: "The primary mandate is enterprise-wide AI-system and agent governance, regulatory policy automation and AI inventory.",
  },
  {
    name: "Holistic AI",
    segment: "AI governance",
    strength: "AI governance, assurance, risk management, assessments and compliance workflows.",
    chooseQuantivisWhen: "The buyer wants governance embedded directly into operational and executive decisions with post-decision learning.",
    chooseThemWhen: "Independent AI assurance, AI-risk assessment and broad responsible-AI governance are the dominant requirements.",
  },
  {
    name: "IBM watsonx.governance",
    segment: "AI governance",
    strength: "Model and AI governance integrated with IBM's enterprise AI stack, lifecycle controls and compliance capabilities.",
    chooseQuantivisWhen: "The organization wants a vendor-neutral decision layer centered on human/AI decisions, approvals, outcomes and institutional learning.",
    chooseThemWhen: "The customer is deeply standardized on IBM and needs governance tightly coupled to model and AI lifecycle management.",
  },
  {
    name: "ModelOp",
    segment: "AI governance",
    strength: "Enterprise AI governance and model/AI lifecycle oversight with inventory, controls and monitoring.",
    chooseQuantivisWhen: "The board-level problem is decision accountability and decision quality rather than governing model operations themselves.",
    chooseThemWhen: "Central AI/model lifecycle governance, controls and technical oversight are the primary objective.",
  },
  {
    name: "Monitaur",
    segment: "AI governance",
    strength: "AI governance workflows, policy management, evidence and assurance for regulated enterprises.",
    chooseQuantivisWhen: "Evidence must continue beyond assurance into an executable decision, owner, intervention, outcome and learning loop.",
    chooseThemWhen: "The buying center is responsible-AI assurance and governance program management rather than enterprise decision operations.",
  },
  {
    name: "OneTrust AI Governance",
    segment: "AI governance",
    strength: "AI governance integrated with privacy, data governance, risk and compliance, including policy enforcement and runtime controls.",
    chooseQuantivisWhen: "The company wants a focused decision operating layer above existing privacy/GRC tooling and needs to measure whether decisions worked.",
    chooseThemWhen: "The priority is consolidating privacy, consent, data-use governance, risk and AI governance on one broad platform.",
  },
  {
    name: "Relyance AI",
    segment: "AI governance",
    strength: "Data governance, privacy and AI governance with automated discovery and policy context.",
    chooseQuantivisWhen: "The unresolved problem is governed management decision-making rather than discovering and controlling data/AI usage.",
    chooseThemWhen: "Privacy, data flows, regulatory data governance and AI-use visibility are the main requirements.",
  },
  {
    name: "Saidot",
    segment: "AI governance",
    strength: "AI governance, transparency, risk assessment, policies and regulatory compliance workflows.",
    chooseQuantivisWhen: "The organization wants to link governance requirements to real business choices and learn from predicted-versus-actual outcomes.",
    chooseThemWhen: "Responsible-AI program governance, transparency and compliance management are the primary scope.",
  },
  {
    name: "SAP AI governance",
    segment: "AI governance",
    strength: "Governance capabilities aligned with SAP's enterprise application and AI ecosystem.",
    chooseQuantivisWhen: "Decision evidence and accountability must span SAP plus CRM, warehouse, external intelligence and other non-SAP systems.",
    chooseThemWhen: "The enterprise is SAP-centric and wants governance embedded principally inside the SAP AI/application estate.",
  },
  {
    name: "ServiceNow AI Control Tower",
    segment: "AI governance",
    strength: "Central AI governance integrated with ServiceNow workflows, enterprise controls and operational processes.",
    chooseQuantivisWhen: "The customer wants a purpose-built decision ledger, evidence chain, outcome measurement and decision replay rather than configuring a general workflow estate.",
    chooseThemWhen: "ServiceNow is already the enterprise workflow backbone and the priority is central control of the AI estate within it.",
  },
  {
    name: "Truyo",
    segment: "AI governance",
    strength: "AI governance and regulatory-risk workflows with privacy and compliance orientation.",
    chooseQuantivisWhen: "The buying problem is broader than compliance: leadership needs governed choices, execution accountability and measurable outcomes.",
    chooseThemWhen: "AI compliance program administration and privacy-adjacent governance are the primary requirements.",
  },
  {
    name: "LatticeFlow AI",
    segment: "AI governance",
    strength: "Technical AI governance, model evaluation, risk diagnostics and compliance engineering.",
    chooseQuantivisWhen: "The organization needs to govern what humans and AI ultimately decide, not only assess model behavior and technical risk.",
    chooseThemWhen: "Model-level testing, technical AI diagnostics and compliance evaluation are the central requirements.",
  },
  {
    name: "Modulos",
    segment: "AI governance",
    strength: "AI governance and compliance workflows oriented around regulations, standards and evidence.",
    chooseQuantivisWhen: "The buyer needs compliance evidence tied to a living decision lifecycle, execution and outcome learning.",
    chooseThemWhen: "The primary requirement is AI-regulation readiness and structured compliance management.",
  },

  // Gartner-defined decision-intelligence alternatives (IBM omitted here to avoid duplication)
  {
    name: "ACTICO",
    segment: "Decision intelligence",
    strength: "Decision automation, rules and intelligent decisioning for regulated and high-volume processes.",
    chooseQuantivisWhen: "Human executive decisions, evidence provenance and outcome learning matter as much as automated rules.",
    chooseThemWhen: "The requirement is mature rules-driven operational decision automation at scale.",
  },
  {
    name: "Aera Technology",
    segment: "Decision intelligence",
    strength: "Decision intelligence and automation for operational and supply-chain decisions.",
    chooseQuantivisWhen: "The customer needs cross-functional executive governance, auditable rationale and learning across strategic decisions.",
    chooseThemWhen: "Autonomous operational decisioning and supply-chain execution are the principal use cases.",
  },
  {
    name: "CRIF",
    segment: "Decision intelligence",
    strength: "Decisioning, credit/risk data and analytics for financial and regulated workflows.",
    chooseQuantivisWhen: "The organization needs a domain-neutral decision operating layer across finance, risk, strategy and operations.",
    chooseThemWhen: "Credit, lending, identity or financial-risk decisioning is the specialized core requirement.",
  },
  {
    name: "Decisions",
    segment: "Decision intelligence",
    strength: "Rules, workflow and no-code/low-code process and decision automation.",
    chooseQuantivisWhen: "The buyer wants an opinionated governed decision lifecycle rather than a platform for building many custom workflow applications.",
    chooseThemWhen: "Flexible low-code workflow and decision-app construction is more important than a dedicated decision ledger.",
  },
  {
    name: "Faculty",
    segment: "Decision intelligence",
    strength: "Enterprise AI and decision intelligence combining software and applied AI expertise.",
    chooseQuantivisWhen: "The buyer wants a repeatable productized decision-governance layer with explicit evidence and outcome records.",
    chooseThemWhen: "The organization needs substantial bespoke AI delivery and consulting alongside decision technology.",
  },
  {
    name: "FICO",
    segment: "Decision intelligence",
    strength: "Mature decision management, optimization, scoring and high-volume risk decisioning.",
    chooseQuantivisWhen: "The target is cross-enterprise management decisions with deliberation, approval trails and outcome learning.",
    chooseThemWhen: "Complex high-volume automated decisions, optimization or credit/risk scoring are central.",
  },
  {
    name: "FlexRule",
    segment: "Decision intelligence",
    strength: "Decision management, rules, process automation and decision-centric modeling.",
    chooseQuantivisWhen: "Executives want an immediately understandable system of record for consequential decisions and evidence.",
    chooseThemWhen: "The team wants a flexible decision-modeling and rules platform to design custom decision services.",
  },
  {
    name: "InRule",
    segment: "Decision intelligence",
    strength: "Rules, decision automation and explainable business logic.",
    chooseQuantivisWhen: "The missing capability is lifecycle governance from evidence through human approval to measured business outcome.",
    chooseThemWhen: "Business-rules authoring and automated decision logic are the main problem.",
  },
  {
    name: "o9 Solutions",
    segment: "Decision intelligence",
    strength: "Integrated planning and decision intelligence with deep supply-chain and enterprise planning capability.",
    chooseQuantivisWhen: "The company needs a vendor-neutral governance layer for decisions across many functions, not a planning-centric digital brain.",
    chooseThemWhen: "Integrated business planning and supply-chain planning are the dominant use cases.",
  },
  {
    name: "Oracle",
    segment: "Decision intelligence",
    strength: "Decision, analytics and AI capabilities across a very broad enterprise application and cloud stack.",
    chooseQuantivisWhen: "The buyer wants a focused, cross-stack decision record independent of one application ecosystem.",
    chooseThemWhen: "Oracle is already the strategic enterprise platform and integrated suite breadth is the priority.",
  },
  {
    name: "Pegasystems",
    segment: "Decision intelligence",
    strength: "Real-time decisioning, workflow automation, case management and customer engagement.",
    chooseQuantivisWhen: "The core object is the enterprise decision and its evidence/outcome trail rather than customer interaction orchestration.",
    chooseThemWhen: "Customer next-best-action, case management and large-scale workflow automation are central.",
  },
  {
    name: "Quantexa",
    segment: "Decision intelligence",
    strength: "Contextual decision intelligence, entity resolution, graph analytics and risk/investigation use cases.",
    chooseQuantivisWhen: "The need is to govern and learn from management decisions after context has been assembled.",
    chooseThemWhen: "Entity resolution, graph context, fraud, AML or investigation-centric intelligence is the main problem.",
  },
  {
    name: "RelationalAI",
    segment: "Decision intelligence",
    strength: "Relational knowledge graphs and reasoning for complex enterprise decision logic.",
    chooseQuantivisWhen: "Business leaders need an application for accountability, approvals and outcomes without first engineering a knowledge-graph decision layer.",
    chooseThemWhen: "The organization needs a programmable relational knowledge/logic foundation for custom decision applications.",
  },
  {
    name: "Rulex",
    segment: "Decision intelligence",
    strength: "Prescriptive analytics, rules and decision automation for operational use cases.",
    chooseQuantivisWhen: "The buyer prioritizes governance, rationale, evidence provenance and learning around consequential decisions.",
    chooseThemWhen: "Operational optimization and automated prescriptive decisioning are the primary requirements.",
  },
  {
    name: "Sapiens",
    segment: "Decision intelligence",
    strength: "Decision management with strong insurance and financial-services domain depth.",
    chooseQuantivisWhen: "The organization wants a cross-industry, cross-functional governed decision layer.",
    chooseThemWhen: "Insurance-centered decisioning and packaged domain capabilities are most important.",
  },
  {
    name: "SAS Intelligent Decisioning",
    segment: "Decision intelligence",
    strength: "Rules, analytics, ML and real-time operational decision automation in the SAS ecosystem.",
    chooseQuantivisWhen: "Human deliberation, approval, evidence contracts and post-outcome learning need to be first-class objects.",
    chooseThemWhen: "Real-time automated decision services and deep SAS analytics integration dominate the requirement.",
  },

  // Adjacent alternatives frequently competing for the same budget or executive attention
  {
    name: "Palantir",
    segment: "Adjacent enterprise platform",
    strength: "Ontology-led operational data/AI platform with sophisticated enterprise workflows and AI applications.",
    chooseQuantivisWhen: "The customer needs a narrower governed decision layer and does not want a broad data/AI transformation as the prerequisite.",
    chooseThemWhen: "The problem requires a large operational ontology, extensive application building and deep data/AI platform transformation.",
  },
  {
    name: "Microsoft Fabric / Power BI",
    segment: "Adjacent enterprise platform",
    strength: "Ubiquitous BI, semantic analytics, data platform and Microsoft ecosystem integration.",
    chooseQuantivisWhen: "Teams already have dashboards but still cannot answer who decided what, on which evidence, and whether the choice worked.",
    chooseThemWhen: "The main need is enterprise BI, reporting, semantic modeling or Microsoft-native data analytics.",
  },
  {
    name: "Tableau",
    segment: "Adjacent enterprise platform",
    strength: "Enterprise visualization, self-service analytics and Salesforce ecosystem reach.",
    chooseQuantivisWhen: "The required output is an auditable decision and learning loop rather than another analytical view.",
    chooseThemWhen: "Visualization and broad self-service business analytics are the principal problem.",
  },
  {
    name: "ThoughtSpot",
    segment: "Adjacent enterprise platform",
    strength: "Search, conversational and agentic analytics for business users.",
    chooseQuantivisWhen: "Trusted answers must continue into governed approval, execution, outcome measurement and replay.",
    chooseThemWhen: "The buying priority is natural-language analytics and rapid self-service insight discovery.",
  },
  {
    name: "Qlik",
    segment: "Adjacent enterprise platform",
    strength: "Associative analytics, data integration and enterprise BI.",
    chooseQuantivisWhen: "The missing layer is management-decision accountability and evidence lineage, not analytics access.",
    chooseThemWhen: "Data integration and broad analytics are the central platform requirement.",
  },
  {
    name: "Dataiku",
    segment: "Adjacent enterprise platform",
    strength: "Enterprise AI development, analytics, collaboration and AI governance.",
    chooseQuantivisWhen: "The product owner is the business decision-maker and the desired artifact is a governed decision rather than an AI project.",
    chooseThemWhen: "Data science, AI development and enterprise AI lifecycle collaboration are the main requirements.",
  },
  {
    name: "Databricks",
    segment: "Adjacent enterprise platform",
    strength: "Lakehouse data/AI platform, ML/AI development, governance and analytics.",
    chooseQuantivisWhen: "The data platform is already in place and the missing layer is decision provenance, approval and outcome learning.",
    chooseThemWhen: "The buyer needs the underlying data, ML and AI engineering platform itself.",
  },
  {
    name: "Snowflake",
    segment: "Adjacent enterprise platform",
    strength: "Cloud data platform with governed analytics and expanding AI capabilities.",
    chooseQuantivisWhen: "The customer wants a ready decision application above governed data rather than assembling workflows from platform primitives.",
    chooseThemWhen: "Central cloud data infrastructure and data-native AI are the buying center.",
  },
  {
    name: "C3 AI",
    segment: "Adjacent enterprise platform",
    strength: "Enterprise AI application platform and packaged AI use cases.",
    chooseQuantivisWhen: "The requirement is a focused decision-governance product that can be adopted without first creating a broad AI-application estate.",
    chooseThemWhen: "The enterprise needs a wider AI application platform and substantial domain application development.",
  },
  {
    name: "DataRobot",
    segment: "Adjacent enterprise platform",
    strength: "Enterprise AI lifecycle, model development, deployment and governance.",
    chooseQuantivisWhen: "Decision lifecycle management matters more than the ML lifecycle itself.",
    chooseThemWhen: "Model building, deployment, monitoring and AI lifecycle operations are the primary scope.",
  },
  {
    name: "H2O.ai",
    segment: "Adjacent enterprise platform",
    strength: "Machine learning and enterprise AI development platforms.",
    chooseQuantivisWhen: "The hard problem is converting evidence into accountable, reviewable business decisions rather than building predictive models.",
    chooseThemWhen: "Model development and enterprise ML are the main requirement.",
  },
  {
    name: "Domino Data Lab",
    segment: "Adjacent enterprise platform",
    strength: "Enterprise data-science platform, model governance and MLOps collaboration.",
    chooseQuantivisWhen: "Executive-facing decision governance is needed above data-science and model operations.",
    chooseThemWhen: "The core requirement is governing data-science work, models and ML infrastructure.",
  },
  {
    name: "Celonis",
    segment: "Adjacent enterprise platform",
    strength: "Process intelligence, process mining and operational improvement.",
    chooseQuantivisWhen: "The organization needs to govern strategic choices across processes and measure decision outcomes, not only optimize process behavior.",
    chooseThemWhen: "Process discovery, conformance and process optimization are the central challenge.",
  },
  {
    name: "UiPath",
    segment: "Adjacent enterprise platform",
    strength: "Automation, agents, orchestration and process mining.",
    chooseQuantivisWhen: "Accountable human/AI decision-making and evidence are the center of gravity rather than automating tasks.",
    chooseThemWhen: "Robotic/agentic task automation and workflow execution are the principal requirements.",
  },
  {
    name: "Anaplan",
    segment: "Adjacent enterprise platform",
    strength: "Connected enterprise planning across finance, sales, supply chain and workforce.",
    chooseQuantivisWhen: "The problem extends beyond planning into why a decision was approved, what evidence supported it and what happened afterward.",
    chooseThemWhen: "Enterprise planning, forecasting and scenario modeling are the primary buying problem.",
  },
  {
    name: "Pigment",
    segment: "Adjacent enterprise platform",
    strength: "Modern business planning, modeling and AI-assisted planning workflows.",
    chooseQuantivisWhen: "The company wants to govern decisions across functions, not primarily models, budgets and plans.",
    chooseThemWhen: "Fast collaborative planning and financial/business modeling are the main requirements.",
  },
  {
    name: "Kinaxis Maestro",
    segment: "Adjacent enterprise platform",
    strength: "Deep supply-chain planning, orchestration and concurrent decisioning.",
    chooseQuantivisWhen: "The customer needs cross-enterprise decision governance beyond the supply-chain domain.",
    chooseThemWhen: "Supply-chain orchestration and planning depth are the decisive requirements.",
  },
  {
    name: "Blue Yonder",
    segment: "Adjacent enterprise platform",
    strength: "Supply-chain planning, execution, fulfillment and optimization.",
    chooseQuantivisWhen: "Decisions span finance, risk, strategy, compliance and operations rather than living mainly in supply-chain execution.",
    chooseThemWhen: "Deep supply-chain planning/execution is the core buying center.",
  },
  {
    name: "MetricStream",
    segment: "Adjacent enterprise platform",
    strength: "Enterprise GRC, integrated risk, compliance and audit workflows.",
    chooseQuantivisWhen: "Governance must be embedded directly into business decisions and outcome learning rather than maintained primarily as a compliance process.",
    chooseThemWhen: "Broad GRC program management, audit and risk administration are the dominant requirements.",
  },
];

export const COMPETITIVE_SEGMENTS: CompetitiveSegment[] = [
  "AI governance",
  "Decision intelligence",
  "Adjacent enterprise platform",
];

export const QUANTIVIS_BUYER_REASONS = [
  {
    title: "Govern the decision, not only the AI",
    body: "Quantivis treats the business decision as the durable object: recommendation, evidence, rationale, approval, execution, outcome and learning live together.",
  },
  {
    title: "Close the loop to outcomes",
    body: "Decision Replay, outcome measurement and calibration answer the question most governance and BI tools stop before: did the decision actually work?",
  },
  {
    title: "Make evidence board-defensible",
    body: "Named evidence, provenance, confidence and approval history make it easier to explain who knew what, why the decision was taken and what followed.",
  },
  {
    title: "Work above the existing stack",
    body: "Quantivis is strongest when it complements ERP, CRM, BI, warehouse, GRC and AI platforms rather than forcing a rip-and-replace program.",
  },
  {
    title: "Unify human and AI accountability",
    body: "The same governed record can capture AI recommendations and human approvals, preserving accountability as organizations move toward agentic workflows.",
  },
  {
    title: "Focused adoption",
    body: "A customer that needs decision governance should not have to buy a giant data platform, planning suite or workflow transformation just to establish a reliable decision record.",
  },
] as const;

if (COMPETITIVE_VENDORS.length !== 50) {
  throw new Error(`Expected exactly 50 competitive vendors, found ${COMPETITIVE_VENDORS.length}`);
}

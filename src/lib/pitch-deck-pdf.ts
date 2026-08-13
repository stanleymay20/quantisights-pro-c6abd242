import jsPDF from "jspdf";
import logoUrl from "@/assets/quantivis-logo.png";

const W = 1920;
const H = 1080;
const PAD = 80;
const PRIMARY: [number, number, number] = [15, 118, 110];
const DARK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const WHITE: [number, number, number] = [255, 255, 255];
const DESTRUCTIVE: [number, number, number] = [220, 38, 38];

interface SlideData {
  number: number;
  title: string;
  render: (doc: jsPDF, logoImg: HTMLImageElement) => void;
}

function drawLogo(doc: jsPDF, logoImg: HTMLImageElement) {
  doc.addImage(logoImg, "PNG", PAD, 40, 200, 58);
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text("Decision Governance Infrastructure", PAD + 210, 72);
}

function drawSlideNumber(doc: jsPDF, n: number) {
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(`${n} / 11`, W - PAD, H - 40, { align: "right" });
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setFontSize(40);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(text, W / 2, y, { align: "center" });
}

function bodyText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, size = 18) {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(text, x, y, { maxWidth });
}

function bullet(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, color = MUTED) {
  doc.setFontSize(17);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...color);
  doc.text(`•  ${text}`, x, y, { maxWidth });
}

function statBox(doc: jsPDF, value: string, label: string, x: number, y: number, w: number, h: number, valueColor = PRIMARY) {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.roundedRect(x, y, w, h, 8, 8, "S");
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...valueColor);
  doc.text(value, x + w / 2, y + h / 2 - 8, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(label, x + w / 2, y + h / 2 + 18, { align: "center", maxWidth: w - 20 });
}

const SLIDES: SlideData[] = [
  // 1 — Cover
  {
    number: 1,
    title: "Cover",
    render: (doc, logoImg) => {
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, W, H, "F");
      doc.addImage(logoImg, "PNG", W / 2 - 140, 200, 280, 82);
      doc.setFontSize(52);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Quantivis", W / 2, 360, { align: "center" });
      doc.setFontSize(24);
      doc.setTextColor(...PRIMARY);
      doc.setFont("helvetica", "bold");
      doc.text("Decision Governance Infrastructure", W / 2, 410, { align: "center" });
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("AI platform for tracking, calibrating, and improving strategic decisions", W / 2, 450, { align: "center" });
      doc.setFontSize(18);
      doc.text("The operating system for strategic decisions — making every", W / 2, 510, { align: "center" });
      doc.text("executive call traceable, calibrated, and board-defensible.", W / 2, 538, { align: "center" });
      doc.setFontSize(14);
      doc.text("Quantivis Global GmbH  ·  Germany  ·  hello@quantivis.io  ·  quantivis.io", W / 2, 630, { align: "center" });
      doc.text("Pre-Seed  ·  B2B SaaS  ·  Decision Intelligence", W / 2, 658, { align: "center" });
    },
  },
  // 2 — Problem
  {
    number: 2,
    title: "Problem",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "The Problem", 180);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Executives make high-stakes decisions with no institutional memory, no calibration, and no audit trail.", W / 2, 250, { align: "center", maxWidth: 1400 });

      const problems = [
        ["73%", "Executives systematically\noverconfident (HBR 2023)"],
        ["$2.3T", "Annual value destruction\nfrom ungoverned decisions"],
        ["Zero", "Enterprise tools tracking\nprediction accuracy"],
        ["100%", "Boards lacking defensible\ndecision audit trails"],
      ];
      const boxW = 340;
      const startX = (W - (boxW * 4 + 60 * 3)) / 2;
      problems.forEach(([val, label], i) => {
        statBox(doc, val, label, startX + i * (boxW + 60), 310, boxW, 150, DESTRUCTIVE);
      });

      // Real-world example
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(PAD + 100, 520, W - PAD * 2 - 200, 90, 8, 8, "F");
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Real-World Examples", PAD + 130, 552);
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("Meta invested $36B+ in the metaverse with no calibrated decision process. WeWork's $47B collapse had zero governance trail.", PAD + 130, 582, { maxWidth: W - PAD * 2 - 300 });

      doc.setFillColor(254, 242, 242);
      doc.roundedRect(PAD + 200, 660, W - PAD * 2 - 400, 70, 8, 8, "F");
      doc.setFontSize(17);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DESTRUCTIVE);
      doc.text("No enterprise tool closes the loop: Decision → Outcome → Learning", W / 2, 702, { align: "center" });
      drawSlideNumber(doc, 2);
    },
  },
  // 3 — Solution
  {
    number: 3,
    title: "Solution",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "The Solution", 180);
      bodyText(doc, "Quantivis creates a permanent institutional memory for strategic decisions — closing the loop between prediction and outcome.", PAD + 100, 250, W - PAD * 2 - 200, 18);

      // Decision loop visual
      const loopSteps = ["Decision", "Prediction", "Outcome", "Calibration", "Better Decisions"];
      const loopStartX = 280;
      const loopY = 310;
      const stepW = 200;
      const gap = 80;
      loopSteps.forEach((step, i) => {
        const x = loopStartX + i * (stepW + gap);
        doc.setFillColor(240, 253, 250);
        doc.roundedRect(x, loopY, stepW, 40, 6, 6, "F");
        doc.setDrawColor(...PRIMARY);
        doc.setLineWidth(1);
        doc.roundedRect(x, loopY, stepW, 40, 6, 6, "S");
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PRIMARY);
        doc.text(step, x + stepW / 2, loopY + 26, { align: "center" });
        if (i < 4) {
          doc.setTextColor(...MUTED);
          doc.text("→", x + stepW + gap / 2, loopY + 26, { align: "center" });
        }
      });

      const steps = [
        { month: "Month 1", title: "Decision Ledger", desc: "Log every strategic call with confidence scores, predicted impact, and accountability." },
        { month: "Month 2", title: "Outcome Tracking", desc: "Record real results. Measure where forecasts diverged from reality." },
        { month: "Month 3", title: "Calibration Engine", desc: "AI adjusts confidence based on track record. Your organization makes measurably better decisions." },
      ];
      const colW = 480;
      const startX = (W - (colW * 3 + 60 * 2)) / 2;
      steps.forEach((s, i) => {
        const x = startX + i * (colW + 60);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(x, 400, colW, 260, 8, 8, "S");
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PRIMARY);
        doc.text(s.month.toUpperCase(), x + 30, 440);
        doc.setFontSize(24);
        doc.setTextColor(...DARK);
        doc.text(s.title, x + 30, 480);
        bodyText(doc, s.desc, x + 30, 520, colW - 60, 16);
      });
      drawSlideNumber(doc, 3);
    },
  },
  // 4 — Product
  {
    number: 4,
    title: "Product",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "The Product", 180);
      bodyText(doc, "Full-stack Decision Governance platform with 20+ analytical frameworks built for enterprise leadership.", PAD + 100, 240, W - PAD * 2 - 200, 18);

      const features = [
        "Monte Carlo Simulation", "Bayesian Prior Calibration",
        "Causal Inference Engine", "Cognitive Bias Detection",
        "AI Executive Copilot", "Scenario War Room",
        "Governance Board Reports", "Evidence Contract (A–F grading)",
      ];
      const col1X = PAD + 100;
      const col2X = W / 2 + 60;
      features.forEach((f, i) => {
        const x = i < 4 ? col1X : col2X;
        const y = 300 + (i % 4) * 48;
        doc.setFontSize(16);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...PRIMARY);
        doc.text("✓", x, y);
        doc.setTextColor(...DARK);
        doc.text(f, x + 30, y);
      });

      // Use case example
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(PAD + 100, 520, W - PAD * 2 - 200, 140, 8, 8, "F");
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text('Example: "Should we open 5 stores in France?"', PAD + 130, 555);
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      const useCases = [
        "✓  Probability of success: 67%",
        "✓  Confidence calibration grade: B+",
        "✓  10,000 Monte Carlo scenario simulations",
        "✓  Board-ready explanation with full evidence trail",
      ];
      useCases.forEach((uc, i) => {
        doc.text(uc, PAD + 130, 590 + i * 22);
      });

      doc.setFillColor(240, 253, 250);
      doc.roundedRect(PAD + 100, 700, W - PAD * 2 - 200, 60, 8, 8, "F");
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("Every output classified: Observed Fact vs. Statistical Inference vs. AI Recommendation", W / 2, 737, { align: "center", maxWidth: W - 400 });
      drawSlideNumber(doc, 4);
    },
  },
  // 5 — Category Creation
  {
    number: 5,
    title: "Category Creation",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "Category Creation", 180);
      bodyText(doc, "Quantivis defines a new software layer that sits between data infrastructure and executive action.", PAD + 100, 240, W - PAD * 2 - 200, 18);

      // Stack visualization
      const layers = [
        { layer: "Executive Action", tool: "Quantivis", desc: "Decision Governance", highlight: true },
        { layer: "Analytics & BI", tool: "Tableau / Power BI", desc: "Visualization", highlight: false },
        { layer: "Data Infrastructure", tool: "Snowflake / Databricks", desc: "Storage & Compute", highlight: false },
      ];
      const stackX = PAD + 200;
      const stackW = W - PAD * 2 - 400;
      layers.forEach((l, i) => {
        const y = 300 + i * 110;
        if (l.highlight) {
          doc.setFillColor(240, 253, 250);
          doc.setDrawColor(...PRIMARY);
        } else {
          doc.setFillColor(248, 248, 248);
          doc.setDrawColor(200, 200, 200);
        }
        doc.setLineWidth(2);
        doc.roundedRect(stackX, y, stackW, 80, 8, 8, "FD");
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(l.highlight ? PRIMARY[0] : DARK[0], l.highlight ? PRIMARY[1] : DARK[1], l.highlight ? PRIMARY[2] : DARK[2]);
        doc.text(l.layer, stackX + 40, y + 35);
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...MUTED);
        doc.text(l.desc, stackX + 40, y + 58);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(l.highlight ? PRIMARY[0] : MUTED[0], l.highlight ? PRIMARY[1] : MUTED[1], l.highlight ? PRIMARY[2] : MUTED[2]);
        doc.text(l.tool, stackX + stackW - 40, y + 45, { align: "right" });
      });

      // Why Now
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Why Now?", PAD + 200, 680);
      const whyNow = [
        "AI governance regulations emerging globally (EU AI Act)",
        "Boards demanding traceable decision processes post-SVB, FTX",
        "LLMs make calibrated confidence scoring accessible at scale",
      ];
      whyNow.forEach((w, i) => {
        bullet(doc, w, PAD + 220, 720 + i * 36, W - PAD * 2 - 400, DARK);
      });

      // Positioning callout
      doc.setFillColor(240, 253, 250);
      doc.roundedRect(PAD + 200, 850, W - PAD * 2 - 400, 60, 8, 8, "F");
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text('"The GitHub for Strategic Decisions" — version control for every executive call.', W / 2, 887, { align: "center", maxWidth: W - 500 });
      drawSlideNumber(doc, 5);
    },
  },
  // 6 — Market
  {
    number: 6,
    title: "Market",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "Market Opportunity", 180);

      const data = [
        { l: "TAM", v: "$4.2B", d: "Decision Intelligence (2026)" },
        { l: "CAGR", v: "22%", d: "Growth through 2030" },
        { l: "SAM", v: "$850M", d: "EU enterprise segment" },
        { l: "SOM", v: "$42M", d: "PE/VC + mid-market DACH" },
      ];
      const boxW = 340;
      const startX = (W - (boxW * 4 + 60 * 3)) / 2;
      data.forEach((m, i) => {
        statBox(doc, m.v, `${m.l}\n${m.d}`, startX + i * (boxW + 60), 280, boxW, 180);
      });

      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("ICP:  CEO, CFO, COO at 50–5,000 employee companies; PE/VC portfolio managers", W / 2, 560, { align: "center" });
      doc.text("ACV:  €18K – €72K per organization (usage-based tiers)", W / 2, 600, { align: "center" });

      // Sources
      doc.setFontSize(12);
      doc.text("Sources: Gartner Decision Intelligence Market Guide 2024 · McKinsey AI Governance Spending · Deloitte Enterprise Analytics 2023", W / 2, 660, { align: "center", maxWidth: W - 300 });
      drawSlideNumber(doc, 6);
    },
  },
  // 7 — Traction
  {
    number: 7,
    title: "Traction",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "Traction & Readiness", 180);

      const traction = [
        { v: "Live", l: "Production platform deployed" },
        { v: "3", l: "Companies evaluating pilots" },
        { v: "2", l: "PE funds testing\nportfolio governance" },
        { v: "20+", l: "Decision science frameworks" },
      ];
      const boxW = 340;
      const startX = (W - (boxW * 4 + 60 * 3)) / 2;
      traction.forEach((t, i) => {
        statBox(doc, t.v, t.l, startX + i * (boxW + 60), 260, boxW, 160);
      });

      const highlights = [
        "Platform live for controlled enterprise pilot validation",
        "Enterprise security posture: tenant-scoped RLS policies, RBAC, SSO, workspace isolation",
        "Paid pilot model (€5K–€15K) validates demand before full deployment",
        "15-month seeded demo environment with real decision simulations",
        "Multi-tenant architecture with 50+ backend functions",
      ];
      highlights.forEach((h, i) => {
        bullet(doc, h, PAD + 100, 510 + i * 48, W - PAD * 2 - 200, DARK);
      });
      drawSlideNumber(doc, 7);
    },
  },
  // 8 — Business Model
  {
    number: 8,
    title: "Business Model",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "Business Model", 180);

      const tiers = [
        { name: "Essentials", price: "€499/mo", features: "5 seats, 3 connectors, core decision ledger,\ngovernance documentation\n\nTeams operationalising decision governance" },
        { name: "Governance", price: "€1,999/mo", features: "15 seats, enterprise connectors, AI advisory,\nforecasting, calibration and board reports" },
        { name: "Enterprise", price: "€18K–€72K/yr", features: "Unlimited everything, cognitive bias\ndetection, SSO/RBAC, audit logs,\nmulti-org, scenario war room" },
      ];
      const colW = 500;
      const startX = (W - (colW * 3 + 50 * 2)) / 2;
      tiers.forEach((t, i) => {
        const x = startX + i * (colW + 50);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(x, 260, colW, 300, 8, 8, "S");
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...DARK);
        doc.text(t.name, x + colW / 2, 310, { align: "center" });
        doc.setFontSize(28);
        doc.setTextColor(...PRIMARY);
        doc.text(t.price, x + colW / 2, 360, { align: "center" });
        bodyText(doc, t.features, x + 30, 410, colW - 60, 14);
      });

      doc.setFillColor(240, 253, 250);
      doc.roundedRect(PAD + 200, 630, W - PAD * 2 - 400, 70, 8, 8, "F");
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("Paid pilot (€5K–€15K) de-risks adoption  ·  Usage-based AI compute add-on  ·  PE portfolio pricing available", W / 2, 672, { align: "center", maxWidth: W - 500 });
      drawSlideNumber(doc, 8);
    },
  },
  // 9 — Competitive Landscape
  {
    number: 9,
    title: "Competitive Landscape",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "Competitive Landscape", 180);

      // Table header
      const tableX = PAD + 100;
      const tableW = W - PAD * 2 - 200;
      const cols = [
        { label: "Capability", w: tableW * 0.32 },
        { label: "Quantivis", w: tableW * 0.17 },
        { label: "Palantir", w: tableW * 0.17 },
        { label: "Tableau", w: tableW * 0.17 },
        { label: "Mosaic", w: tableW * 0.17 },
      ];

      let cx = tableX;
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      cols.forEach((col, i) => {
        const color = i === 1 ? PRIMARY : DARK;
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(col.label, cx + (i === 0 ? 0 : col.w / 2), 260, { align: i === 0 ? "left" : "center" });
        cx += col.w;
      });

      // Subtitle row
      cx = tableX + cols[0].w;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      const subtitles = ["Decision Gov.", "Data Analysis", "BI Tool", "FP&A"];
      subtitles.forEach((sub, i) => {
        doc.text(sub, cx + cols[i + 1].w / 2, 278, { align: "center" });
        cx += cols[i + 1].w;
      });

      // Table rows
      const rows = [
        { f: "Decision → Outcome loop", vals: ["✓", "✕", "✕", "✕"] },
        { f: "Calibrated confidence scores", vals: ["✓", "✕", "✕", "✕"] },
        { f: "Board-defensible audit trail", vals: ["✓", "Partial", "✕", "✕"] },
        { f: "Cognitive bias detection", vals: ["✓", "✕", "✕", "✕"] },
        { f: "Time to first insight", vals: ["5 min", "Weeks", "Days", "Hours"] },
        { f: "Monthly cost", vals: ["€499+", "€50K+", "€70/user", "€800+"] },
      ];

      rows.forEach((row, ri) => {
        const y = 310 + ri * 55;
        // Alternating bg
        if (ri % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(tableX, y - 15, tableW, 50, "F");
        }
        // Quantivis column highlight
        doc.setFillColor(240, 253, 250);
        doc.rect(tableX + cols[0].w, y - 15, cols[1].w, 50, "F");

        doc.setFontSize(15);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK);
        doc.text(row.f, tableX, y + 12);

        let colX = tableX + cols[0].w;
        row.vals.forEach((val, vi) => {
          if (val === "✓") {
            doc.setTextColor(...PRIMARY);
            doc.setFont("helvetica", "bold");
          } else if (val === "✕") {
            doc.setTextColor(200, 200, 200);
            doc.setFont("helvetica", "normal");
          } else {
            doc.setTextColor(...(vi === 0 ? PRIMARY : MUTED));
            doc.setFont("helvetica", "normal");
          }
          doc.text(val, colX + cols[vi + 1].w / 2, y + 12, { align: "center" });
          colX += cols[vi + 1].w;
        });
      });

      // Category callout
      doc.setFillColor(240, 253, 250);
      doc.roundedRect(PAD + 200, 660, W - PAD * 2 - 400, 60, 8, 8, "F");
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("Category: Decision Governance — not BI, not data infra. We own the layer between data and executive action.", W / 2, 697, { align: "center", maxWidth: W - 500 });
      drawSlideNumber(doc, 9);
    },
  },
  // 10 — Defensibility & AI Moat
  {
    number: 10,
    title: "Defensibility & AI Moat",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "Defensibility & AI Moat", 180);
      bodyText(doc, "Quantivis builds compounding defensibility that cannot be replicated by general-purpose AI tools.", PAD + 100, 240, W - PAD * 2 - 200, 18);

      const moats = [
        { title: "Decision Data Accumulation", desc: "Every logged decision, prediction, and outcome trains organization-specific calibration models. Competitors start at zero." },
        { title: "Calibration Models Improve Over Time", desc: "Bayesian models get smarter with each resolved decision. After 6 months, switching costs become prohibitive." },
        { title: "Organizational Memory Graph", desc: "Decision patterns, bias profiles, and team calibration scores create an irreplaceable institutional knowledge base." },
      ];
      const colW = 480;
      const startX = (W - (colW * 3 + 60 * 2)) / 2;
      moats.forEach((m, i) => {
        const x = startX + i * (colW + 60);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(x, 290, colW, 200, 8, 8, "S");
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...DARK);
        doc.text(m.title, x + 30, 330, { maxWidth: colW - 60 });
        bodyText(doc, m.desc, x + 30, 380, colW - 60, 15);
      });

      // Data Network Effect
      doc.setFillColor(240, 253, 250);
      doc.roundedRect(PAD + 200, 540, W - PAD * 2 - 400, 80, 8, 8, "F");
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("Data Network Effect", PAD + 240, 570);
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("The more decisions a company logs, the smarter Quantivis becomes. This creates a compounding moat that general-purpose AI cannot replicate.", PAD + 240, 598, { maxWidth: W - PAD * 2 - 520 });

      // Why not Copilot
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(PAD + 200, 660, W - PAD * 2 - 400, 80, 8, 8, "F");
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Why not Microsoft Copilot or OpenAI?", PAD + 240, 695);
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("General AI assists with tasks. Quantivis governs decisions — tracking predictions against outcomes, calibrating confidence, and building organizational memory.", PAD + 240, 722, { maxWidth: W - PAD * 2 - 520 });

      drawSlideNumber(doc, 10);
    },
  },
  // 11 — The Ask
  {
    number: 11,
    title: "The Ask",
    render: (doc, logoImg) => {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      drawLogo(doc, logoImg);
      sectionTitle(doc, "The Ask", 170);

      doc.setFillColor(240, 253, 250);
      doc.roundedRect(W / 2 - 350, 220, 700, 140, 12, 12, "F");
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("We're raising", W / 2, 265, { align: "center" });
      doc.setFontSize(44);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("€500K Pre-Seed", W / 2, 315, { align: "center" });
      doc.setFontSize(15);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text("to close first 10 enterprise customers and reach €150K ARR in 12 months", W / 2, 348, { align: "center" });

      const alloc = [
        { pct: "40%", label: "Product &\nEngineering" },
        { pct: "35%", label: "Sales &\nGTM" },
        { pct: "25%", label: "Operations" },
      ];
      const boxW = 280;
      const allocStartX = (W - (boxW * 3 + 60 * 2)) / 2;
      alloc.forEach((a, i) => {
        statBox(doc, a.pct, a.label, allocStartX + i * (boxW + 60), 400, boxW, 120);
      });

      // GTM Strategy
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Go-To-Market Strategy", PAD + 100, 580);
      const gtm = [
        "PE portfolio governance deals (multi-company deployments)",
        "CFO & COO network outreach via industry events",
        "Board risk committee partnerships",
        "Consulting firm channel partners (Big 4, boutique strategy)",
      ];
      gtm.forEach((g, i) => {
        bullet(doc, g, PAD + 120, 615 + i * 35, W / 2 - 200, DARK);
      });

      // Founder Story
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Why I Built This", W / 2 + 100, 580);
      doc.setFontSize(14);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...MUTED);
      doc.text('"After building AI systems and working with enterprise data, I saw a major gap: companies track everything — revenue, customers, code — but not the decisions that drive them. Quantivis closes that loop."', W / 2 + 100, 620, { maxWidth: W / 2 - 250 });

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("hello@quantivis.io  ·  quantivis.io  ·  Germany", W / 2, 790, { align: "center" });
      drawSlideNumber(doc, 11);
    },
  },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generatePitchDeckPDF(): Promise<void> {
  const logoImg = await loadImage(logoUrl);
  const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });

  SLIDES.forEach((slide, i) => {
    if (i > 0) doc.addPage([W, H], "landscape");
    slide.render(doc, logoImg);
  });

  doc.setProperties({
    title: "Quantivis Pitch Deck",
    author: "Quantivis Global GmbH",
    subject: "Decision Governance Infrastructure",
    keywords: "decision intelligence, governance, pitch deck, pre-seed",
    creator: "quantivis.io",
  });

  doc.save("Quantivis_Pitch_Deck.pdf");
}

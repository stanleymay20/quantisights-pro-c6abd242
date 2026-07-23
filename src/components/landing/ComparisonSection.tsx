import { forwardRef, Fragment } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const comparisons = [
  {
    category: "Decision Intelligence",
    rows: [
      { feature: "Causal inference (not just correlation)", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Counterfactual simulation ('what if we hadn't acted?')", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Prescriptive optimization (not just 'what happened')", quantivis: true, mckinsey: "Manual", tableau: false, mosaic: false },
      { feature: "Self-correcting confidence scores", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Cognitive bias detection & mitigation", quantivis: true, mckinsey: "Manual", tableau: false, mosaic: false },
    ],
  },
  {
    category: "Decision Governance",
    rows: [
      { feature: "DROI / TCI quantification", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Value of Information (VoI) analysis", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Decision Velocity Curve optimization", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Audit-ready decision trail", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Decision Maturity Assessment", quantivis: true, mckinsey: "Manual", tableau: false, mosaic: false },
    ],
  },
  {
    category: "Board Defensibility",
    rows: [
      { feature: "Decision Fitness Framework (7S adapted)", quantivis: true, mckinsey: true, tableau: false, mosaic: false },
      { feature: "Role-based risk scoring", quantivis: true, mckinsey: "Manual", tableau: false, mosaic: false },
      { feature: "One-click board reports", quantivis: true, mckinsey: true, tableau: "Manual", mosaic: "Basic" },
      { feature: "Corrected probability disclosures", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
    ],
  },
  {
    category: "Data & Visualization",
    rows: [
      { feature: "Interactive dashboards & drag-drop charts", quantivis: "Basic", mckinsey: false, tableau: true, mosaic: true },
      { feature: "SQL-level ad hoc queries", quantivis: false, mckinsey: false, tableau: true, mosaic: "Limited" },
      { feature: "Polished pixel-perfect report design", quantivis: false, mckinsey: true, tableau: true, mosaic: false },
    ],
  },
  {
    category: "Cost & Speed",
    rows: [
      { feature: "Time to first insight", quantivis: "5 min", mckinsey: "4–6 weeks", tableau: "Days", mosaic: "Hours" },
      { feature: "Monthly cost", quantivis: "From €99", mckinsey: "€50K+/project", tableau: "€70/user", mosaic: "€800+" },
      { feature: "No implementation required", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
      { feature: "Continuously learning system", quantivis: true, mckinsey: false, tableau: false, mosaic: false },
    ],
  },
];

const renderCellIcon = (value: boolean | string) => {
  if (value === true) return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />;
  return <span className="text-xs font-medium text-foreground">{value}</span>;
};

const ComparisonSection = forwardRef<HTMLElement, { inline?: boolean }>(({ inline = false }, ref) => (
  <section className={inline ? "max-w-5xl mx-auto" : "py-20"}>
    <div className={inline ? "" : "container mx-auto px-6"}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-10"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Traditional BI vs Decision Intelligence</p>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
          From Describing Data to <span className="gradient-text">Diagnosing Businesses</span>
        </h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          Traditional analytics answers "what happened." Quantivis answers "why it happened, what to do next, 
          and how confident you should be." The strategic defensibility gap is measured in billions.
        </p>
      </motion.div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 md:px-6 text-muted-foreground font-medium w-[35%]">Capability</th>
                <th className="text-center py-4 px-3 md:px-4 font-semibold text-primary">
                  <div>Quantivis</div>
                  <div className="text-[10px] font-normal text-primary/70">Decision Governance</div>
                </th>
                <th className="text-center py-4 px-3 md:px-4 font-semibold">
                  <div>McKinsey</div>
                  <div className="text-[10px] font-normal text-muted-foreground">Consulting</div>
                </th>
                <th className="text-center py-4 px-3 md:px-4 font-semibold hidden sm:table-cell">
                  <div>Tableau</div>
                  <div className="text-[10px] font-normal text-muted-foreground">BI Tool</div>
                </th>
                <th className="text-center py-4 px-3 md:px-4 font-semibold hidden sm:table-cell">
                  <div>Mosaic</div>
                  <div className="text-[10px] font-normal text-muted-foreground">FP&A</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((group) => (
                <Fragment key={group.category}>
                  <tr>
                    <td colSpan={5} className="py-3 px-4 md:px-6 text-xs uppercase tracking-widest text-primary font-semibold bg-primary/[0.03] border-b border-border/50">
                      {group.category}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.feature} className="border-b border-border/20 hover:bg-card/50 transition-colors">
                      <td className="py-3 px-4 md:px-6 font-medium text-xs md:text-sm">{row.feature}</td>
                      <td className="text-center py-3 px-3 md:px-4 bg-primary/[0.02]">{renderCellIcon(row.quantivis)}</td>
                      <td className="text-center py-3 px-3 md:px-4">{renderCellIcon(row.mckinsey)}</td>
                      <td className="text-center py-3 px-3 md:px-4 hidden sm:table-cell">{renderCellIcon(row.tableau)}</td>
                      <td className="text-center py-3 px-3 md:px-4 hidden sm:table-cell">{renderCellIcon(row.mosaic)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Honesty section — builds trust */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mt-8 p-6 rounded-xl border border-border/40 bg-muted/20 max-w-3xl mx-auto"
      >
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Where Quantivis Is Not the Best Fit</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <X className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">Ad hoc data exploration</strong> — If you need SQL-level queries or pixel-perfect report design, a dedicated BI tool (Tableau, Looker) is stronger.</span>
          </li>
          <li className="flex items-start gap-2">
            <X className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">One-off decisions</strong> — Quantivis is built for teams making recurring strategic calls, not single isolated choices.</span>
          </li>
          <li className="flex items-start gap-2">
            <X className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">Unstructured data only</strong> — The platform requires structured operational data (CSV, database, or API) to deliver calibrated insights.</span>
          </li>
        </ul>
      </motion.div>
    </div>
  </section>
));

ComparisonSection.displayName = "ComparisonSection";

export default ComparisonSection;

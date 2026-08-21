import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const fitRows = [
  {
    need: "Governed decision record",
    quantivis: "Core focus",
    alternative: "BI: usually not the primary record",
  },
  {
    need: "Evidence + human approval trail",
    quantivis: "Built into the decision workflow",
    alternative: "Often assembled across workflow, ticketing or document tools",
  },
  {
    need: "Predicted vs observed outcome tracking",
    quantivis: "Built into the decision lifecycle",
    alternative: "Often modelled or analysed separately",
  },
  {
    need: "Interactive ad-hoc visual exploration",
    quantivis: "Supported, but not the primary design goal",
    alternative: "Dedicated BI tools are typically stronger",
  },
  {
    need: "Deep bespoke strategic engagement",
    quantivis: "Software-led recurring workflow",
    alternative: "A consulting engagement may be the better fit",
  },
  {
    need: "Budgeting and financial planning",
    quantivis: "Can consume and govern relevant decision inputs",
    alternative: "Dedicated FP&A tools are typically stronger",
  },
] as const;

const ComparisonSection = forwardRef<HTMLElement, { inline?: boolean }>(({ inline = false }, ref) => (
  <section ref={ref} className={inline ? "max-w-5xl mx-auto" : "py-20"}>
    <div className={inline ? "" : "container mx-auto px-6"}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-10"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Choose the right layer</p>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
          Decision Governance, Not a Replacement for <span className="gradient-text">Every Analytics Tool</span>
        </h2>
        <p className="text-muted-foreground text-sm max-w-2xl mx-auto leading-relaxed">
          Quantivis is designed to sit between evidence, AI-assisted recommendations and accountable human decisions.
          BI, consulting and FP&amp;A products can remain part of the surrounding stack where they are the better specialist tool.
        </p>
      </motion.div>

      <div className="glass-card overflow-hidden">
        <div
          className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          tabIndex={0}
          role="region"
          aria-label="Quantivis product fit comparison table; scroll horizontally for all columns"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 md:px-6 text-muted-foreground font-medium w-[30%]">Customer need</th>
                <th className="text-left py-4 px-4 md:px-6 font-semibold text-primary w-[35%]">Quantivis position</th>
                <th className="text-left py-4 px-4 md:px-6 font-semibold w-[35%]">When another specialist may fit better</th>
              </tr>
            </thead>
            <tbody>
              {fitRows.map((row) => (
                <tr key={row.need} className="border-b border-border/20 hover:bg-card/50 transition-colors align-top">
                  <td className="py-4 px-4 md:px-6 font-medium">{row.need}</td>
                  <td className="py-4 px-4 md:px-6 text-muted-foreground">
                    <span className="inline-flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{row.quantivis}</span>
                    </span>
                  </td>
                  <td className="py-4 px-4 md:px-6 text-muted-foreground">{row.alternative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
            <span><strong className="text-foreground">Ad-hoc BI as the primary job</strong> — teams that mainly need SQL exploration or pixel-perfect dashboard design should use a dedicated BI product.</span>
          </li>
          <li className="flex items-start gap-2">
            <X className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">A one-time bespoke strategy engagement</strong> — a specialist advisory team can be a better fit when the need is not a recurring governed workflow.</span>
          </li>
          <li className="flex items-start gap-2">
            <X className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">Financial planning as the primary system of record</strong> — dedicated FP&amp;A software remains the better specialist layer for budgeting and planning.</span>
          </li>
        </ul>
        <p className="text-[11px] text-muted-foreground/70 mt-4 leading-relaxed">
          This comparison describes product positioning, not a claim about every feature or price offered by any specific third-party vendor. Buyers should verify current vendor capabilities against their own requirements.
        </p>
      </motion.div>
    </div>
  </section>
));

ComparisonSection.displayName = "ComparisonSection";

export default ComparisonSection;

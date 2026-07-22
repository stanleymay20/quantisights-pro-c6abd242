import { forwardRef } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Upload, Webhook } from "lucide-react";

const INTEGRATIONS = [
  { name: "Stripe", desc: "Revenue, MRR, churn, refunds, subscription metrics", status: "live" as const },
  { name: "CSV Upload", desc: "Drag-and-drop with column mapping & validation", status: "live" as const, icon: Upload },
  { name: "Webhook API", desc: "Push data from any system in real-time", status: "live" as const, icon: Webhook },
  { name: "Google Analytics 4", desc: "Traffic, conversions, acquisition channels", status: "soon" as const },
  { name: "HubSpot", desc: "Pipeline, deal velocity, lead scoring", status: "soon" as const },
  { name: "QuickBooks", desc: "P&L, cash flow, balance sheet automation", status: "soon" as const },
  { name: "Xero", desc: "Accounting data with multi-currency support", status: "soon" as const },
  { name: "Salesforce", desc: "CRM pipeline, closed-won, lead metrics", status: "soon" as const },
];

const IntegrationsSection = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref} className="py-24 relative">
    <div className="container mx-auto px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-14"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Integrations</p>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
          Connect Your <span className="gradient-text">Source of Truth</span>
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          No more weekly CSV exports. Connect your tools and let intelligence flow automatically.
        </p>
      </motion.div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {INTEGRATIONS.map((integration, i) => (
          <motion.div
            key={integration.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="glass-card p-5 group relative"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-sm">{integration.name}</h3>
              {integration.status === "live" ? (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Live
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" /> Soon
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{integration.desc}</p>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5 }}
        className="text-center mt-10 text-sm text-muted-foreground"
      >
        Custom integrations available on Enterprise plans
      </motion.p>
    </div>
  </section>
));

IntegrationsSection.displayName = "IntegrationsSection";

export default IntegrationsSection;

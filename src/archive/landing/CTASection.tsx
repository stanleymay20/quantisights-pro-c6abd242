import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Mail, Linkedin } from "lucide-react";
import { CONTACT } from "@/lib/contact-config";

const TIMELINE = [
  { month: "Month 1", title: "Decision Ledger", desc: "Start tracking your most important strategic calls with signals and confidence scores." },
  { month: "Month 2", title: "Outcome Tracking", desc: "Record real results and measure where forecasts diverge from reality." },
  { month: "Month 3", title: "Calibration Active", desc: "The platform adjusts confidence scores. Your organization makes measurably better decisions." },
];

const CTASection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section ref={ref} id="contact" className="py-24 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/5 rounded-full blur-[120px]" />
      </div>
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="border border-border rounded-2xl bg-card/80 backdrop-blur-sm p-6 sm:p-12 md:p-16 text-center max-w-3xl mx-auto shadow-lg"
        >
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">Start building institutional memory</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            Start Building Your Decision Ledger
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-xl mx-auto">
            Within 90 days, your leadership team can track, evaluate, and continuously improve the accuracy of every strategic call.
          </p>

          {/* 90-day timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left">
            {TIMELINE.map((step, i) => (
              <motion.div
                key={step.month}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="p-4 rounded-xl border border-border/50 bg-muted/30"
              >
                <span className="text-xs font-semibold text-primary">{step.month}</span>
                <p className="text-sm font-semibold mt-1 mb-1">{step.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8">
            <Link
              to="/free-analysis"
              className="inline-flex items-center justify-center gap-2 px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-base sm:text-lg hover:brightness-110 transition-all shadow-lg shadow-primary/25"
            >
              Run Free Business Analysis <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl border border-border bg-card/50 text-foreground font-semibold text-base sm:text-lg hover:border-primary/30 transition-all"
            >
              Start Tracking Decisions
            </Link>
          </div>

          {/* Contact channels */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-6">
            <a
              href={`mailto:${CONTACT.email.general}`}
              className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="w-4 h-4 text-primary" />
              {CONTACT.email.general}
            </a>
            <a
              href={CONTACT.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Linkedin className="w-4 h-4 text-primary" />
              LinkedIn
            </a>
          </div>

          <p className="text-xs text-muted-foreground">14-day free trial · No credit card required · GDPR ready · Enterprise-grade security</p>
        </motion.div>
      </div>
    </section>
  );
});

CTASection.displayName = "CTASection";

export default CTASection;

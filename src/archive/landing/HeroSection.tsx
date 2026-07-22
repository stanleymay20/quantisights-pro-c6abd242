import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Play } from "lucide-react";
import heroBg from "@/assets/hero-dashboard.jpg";

const HeroSection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <header
      ref={ref}
      className="relative min-h-[90vh] min-h-[90dvh] flex items-center overflow-hidden pt-16 sm:pt-20"
      role="banner"
    >
      {/* Layered background: abstract data visualization + soft gradient wash */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroBg}
          alt=""
          aria-hidden="true"
          width={1600}
          height={1024}
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/[0.08] rounded-full blur-[180px]" />
      </div>

      <div className="container mx-auto px-5 sm:px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Pill badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Decision Intelligence Platform
            </motion.div>

            {/* Single bold headline — InVideo style */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-4 sm:mb-5">
              Make <span className="gradient-text">Better Decisions</span>,{" "}
              <br className="hidden sm:block" />
              Track Every Outcome.
            </h1>

            {/* One sentence — no jargon */}
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed">
              Upload your data. Get insights in minutes.{" "}
              <span className="text-foreground font-medium">
                See which decisions actually worked.
              </span>
            </p>

            {/* Two clear CTAs — InVideo pattern */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm sm:text-base hover:brightness-110 transition-all shadow-lg shadow-primary/20"
              >
                <Sparkles className="w-4 h-4" />
                Start Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl border border-border bg-card/60 text-foreground font-semibold text-sm sm:text-base hover:border-primary/40 transition-all"
              >
                <Play className="w-4 h-4" />
                See It In Action
              </Link>
            </div>

            {/* Trust strip — minimal */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap gap-x-5 gap-y-2 justify-center text-xs text-muted-foreground/60"
            >
              <span>✓ No credit card</span>
              <span>✓ 5 min setup</span>
              <span>✓ SOC 2 compliant</span>
              <span>✓ GDPR ready</span>
            </motion.div>
          </motion.div>

          {/* How it works — 3 steps, InVideo simplicity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-16 sm:mt-20"
          >
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-6 font-semibold">
              How it works
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-2xl mx-auto">
              {[
                { step: "1", title: "Upload", desc: "Drop your CSV or connect a source" },
                { step: "2", title: "Decide", desc: "Log decisions, get AI recommendations" },
                { step: "3", title: "Learn", desc: "Track outcomes, calibrate confidence" },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.1 }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm"
                >
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                    {item.step}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground text-center">{item.desc}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </header>
  );
});

HeroSection.displayName = "HeroSection";

export default HeroSection;

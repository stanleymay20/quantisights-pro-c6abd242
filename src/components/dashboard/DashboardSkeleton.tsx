import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface DashboardSkeletonProps {
  className?: string;
}

const Pulse = forwardRef<HTMLDivElement, { className?: string; delay?: number }>(
  ({ className, delay = 0 }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.8, repeat: Infinity, delay }}
      className={cn("rounded-lg bg-muted/50", className)}
    />
  )
);
Pulse.displayName = "Pulse";

const DashboardSkeleton = ({ className }: DashboardSkeletonProps) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.3 }}
    className={cn("space-y-6", className)}
  >
    {/* Greeting */}
    <div className="space-y-2">
      <Pulse className="h-7 w-56" />
      <Pulse className="h-4 w-80" delay={0.1} />
    </div>

    {/* KPI cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-border/20 bg-card/40 p-5 space-y-3">
          <div className="flex justify-between">
            <Pulse className="h-3 w-16" delay={i * 0.08} />
            <Pulse className="h-4 w-4 rounded" delay={i * 0.08} />
          </div>
          <Pulse className="h-8 w-28" delay={i * 0.08 + 0.05} />
          <Pulse className="h-2 w-20" delay={i * 0.08 + 0.1} />
        </div>
      ))}
    </div>

    {/* Charts row */}
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 rounded-xl border border-border/20 bg-card/40 p-6">
        <Pulse className="h-4 w-32 mb-4" delay={0.2} />
        <Pulse className="h-52 w-full rounded-lg" delay={0.25} />
      </div>
      <div className="rounded-xl border border-border/20 bg-card/40 p-6">
        <Pulse className="h-4 w-36 mb-4" delay={0.3} />
        <Pulse className="h-44 w-44 rounded-full mx-auto" delay={0.35} />
      </div>
    </div>

    {/* Intelligence row */}
    <div className="grid lg:grid-cols-3 gap-5">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-xl border border-border/20 bg-card/40 p-6 space-y-3">
          <Pulse className="h-3 w-20" delay={0.4 + i * 0.05} />
          <Pulse className="h-3 w-32" delay={0.45 + i * 0.05} />
          <div className="space-y-2 pt-2">
            {[0, 1, 2].map(j => (
              <Pulse key={j} className="h-10 w-full" delay={0.5 + i * 0.05 + j * 0.03} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </motion.div>
);

export { DashboardSkeleton };

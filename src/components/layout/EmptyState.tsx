import { type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionPath?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryPath?: string;
}

/**
 * Reusable empty-state component for pages with no data.
 * Shows a clear explanation and CTA instead of a blank screen.
 */
const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionPath,
  onAction,
  secondaryLabel,
  secondaryPath,
}: EmptyStateProps) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center text-center py-20 px-6 max-w-md mx-auto"
    >
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-[16px] font-semibold tracking-tight tracking-tight mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">{description}</p>
      <div className="flex items-center gap-3">
        {actionLabel && (
          <Button
            size="sm"
            onClick={() => (onAction ? onAction() : actionPath && navigate(actionPath))}
          >
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && secondaryPath && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(secondaryPath)}
          >
            {secondaryLabel}
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default EmptyState;

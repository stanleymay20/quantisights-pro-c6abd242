import type { ComponentPropsWithoutRef, ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "light" | "dark";

type EyebrowProps = HTMLAttributes<HTMLParagraphElement> & {
  tone?: Tone;
};

export const Eyebrow = ({ className, style, tone = "dark", ...props }: EyebrowProps) => (
  <p
    className={className}
    style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color:
        tone === "light"
          ? "hsl(var(--brand-marketing-muted) / 0.62)"
          : "hsl(var(--brand-marketing-slate))",
      ...style,
    }}
    {...props}
  />
);

type MarketingSectionProps = HTMLAttributes<HTMLElement> & {
  surface?: "light" | "muted" | "dark";
};

export const MarketingSection = ({
  className,
  style,
  surface = "light",
  ...props
}: MarketingSectionProps) => {
  const background =
    surface === "dark"
      ? "hsl(var(--surface-marketing-dark))"
      : surface === "muted"
        ? "hsl(var(--brand-marketing-muted))"
        : "hsl(var(--surface-marketing))";

  return <section className={className} style={{ background, ...style }} {...props} />;
};

type MarketingCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export const MarketingCard = ({ className, interactive = false, ...props }: MarketingCardProps) => (
  <div className={cn("qv-card", interactive && "qv-card-interactive", className)} {...props} />
);

type TagBadgeTone = "Approved" | "Pending" | "Review" | "Success" | "Warning" | "Info";

const tagBadgeToneStyles: Record<TagBadgeTone, { background: string; color: string }> = {
  Approved: {
    background: "hsl(var(--status-success) / 0.14)",
    color: "hsl(var(--status-success))",
  },
  Pending: {
    background: "hsl(var(--decision-needs-review) / 0.16)",
    color: "hsl(var(--decision-needs-review))",
  },
  Review: {
    background: "hsl(var(--status-info) / 0.14)",
    color: "hsl(var(--status-info))",
  },
  Success: {
    background: "hsl(var(--status-success) / 0.14)",
    color: "hsl(var(--status-success))",
  },
  Warning: {
    background: "hsl(var(--status-warning) / 0.16)",
    color: "hsl(var(--status-warning))",
  },
  Info: {
    background: "hsl(var(--status-info) / 0.14)",
    color: "hsl(var(--status-info))",
  },
};

type TagBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: string;
  children?: ReactNode;
};

export const TagBadge = ({ children, className, style, tone = "Info", ...props }: TagBadgeProps) => {
  const resolvedTone = tone in tagBadgeToneStyles ? (tone as TagBadgeTone) : "Info";
  const toneStyle = tagBadgeToneStyles[resolvedTone];

  return (
    <span
      className={className}
      style={{
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 3,
        background: toneStyle.background,
        color: toneStyle.color,
        fontWeight: 700,
        ...style,
      }}
      {...props}
    >
      {children ?? tone}
    </span>
  );
};

type MarketingCTAProps<T extends ElementType = "a"> = {
  as?: T;
  variant?: "primary" | "secondary";
  external?: boolean;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export const MarketingCTA = <T extends ElementType = "a",>({
  as,
  className,
  variant = "primary",
  external = false,
  ...props
}: MarketingCTAProps<T>) => {
  const Component = as ?? "a";
  const externalLinkProps = {
    target: external ? "_blank" : undefined,
    rel: external ? "noreferrer" : undefined,
  };

  return (
    <Component
      className={cn(variant === "primary" ? "qv-primary-cta" : "qv-secondary-cta", className)}
      {...props}
      {...externalLinkProps}
    />
  );
};

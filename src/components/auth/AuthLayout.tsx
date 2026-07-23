import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Globe2, Sparkles } from "lucide-react";
import logo from "@/assets/quantivis-logo.png";

interface AuthLayoutProps {
  /** Card heading shown above the form */
  title: string;
  /** Card sub-heading */
  subtitle?: string;
  /** Form / card body */
  children: ReactNode;
  /** Optional ribbon (e.g. plan badge) rendered above the title */
  ribbon?: ReactNode;
  /** Footer block under the card (e.g. "Don't have an account? Sign up") */
  footer?: ReactNode;
  /** Eyebrow shown above the brand title in the left panel */
  eyebrow?: string;
  /** Brand title in the left panel */
  brandTitle?: string;
  /** Brand description in the left panel */
  brandDescription?: string;
}

/**
 * Enterprise-grade split-screen auth layout.
 * Left:  brand panel with logo, value-prop, trust signals.
 * Right: glass card with the form (Login, Register, Forgot, Reset, etc).
 *
 * Mobile collapses to a single column with the form first.
 */
const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Controls aligned to SOC 2; independent audit in progress" },
  { icon: Lock, label: "AES-256 at rest · TLS 1.3 in transit" },
  { icon: Globe2, label: "EU data residency · DSGVO ready" },
  { icon: Sparkles, label: "Enterprise SSO, SCIM, and MFA available when configured" },
];

const AuthLayout = ({
  title,
  subtitle,
  children,
  ribbon,
  footer,
  eyebrow = "Enterprise AI Decision Governance",
  brandTitle = "Every AI recommendation. Every approval. Every outcome. Governed.",
  brandDescription = "The enterprise standard for AI decision governance. Board-defensible audit trails, built automatically.",
}: AuthLayoutProps) => {
  return (
    <div className="relative min-h-dvh w-full bg-background text-foreground overflow-hidden">
      {/* Top nav */}
      <header className="relative z-20 flex items-center justify-between px-6 lg:px-10 h-16 border-b border-border/40 bg-background/60 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img src={logo} alt="Quantivis" className="h-7 w-auto" />
          <span className="hidden sm:inline text-[11px] uppercase tracking-[0.18em] text-muted-foreground group-hover:text-foreground transition-colors">
            Quantivis
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors hidden sm:inline">
            Back to home
          </Link>
          <a
            href="https://quantivis.io/security"
            className="hidden md:inline hover:text-foreground transition-colors"
          >
            Security
          </a>
          <Link to="/status" className="hidden md:inline hover:text-foreground transition-colors">
            View system status
          </Link>
        </nav>
      </header>

      {/* Background field */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-primary/10 blur-[140px]" />
        <div className="absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-primary/5 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 90%)",
          }}
        />
      </div>

      {/* Body */}
      <main className="relative z-10 grid lg:grid-cols-[1.05fr_1fr] min-h-[calc(100dvh-4rem)]">
        {/* Brand panel */}
        <aside className="hidden lg:flex relative flex-col justify-between px-12 xl:px-20 py-14 border-r border-border/40">
          <div className="space-y-8 max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.22em] text-primary/80 font-medium">
              {eyebrow}
            </p>
            <h2 className="tracking-tight text-4xl xl:text-5xl leading-[1.05] tracking-tight">
              {brandTitle}
            </h2>
            <p className="text-sm xl:text-base text-muted-foreground leading-relaxed max-w-lg">
              {brandDescription}
            </p>
          </div>

          {/* Trust grid */}
          <div className="space-y-6 max-w-xl">
            <div className="grid grid-cols-2 gap-3">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-card/40 backdrop-blur px-3 py-2.5"
                >
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-[12px] text-muted-foreground leading-tight">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <figure className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-5">
              <blockquote className="text-sm text-foreground/90 leading-relaxed">
                "Quantivis is the first system that gave our board a defensible
                trail from signal to decision to outcome — without slowing the
                operators down."
              </blockquote>
              <figcaption className="mt-3 text-[11px] text-muted-foreground">
                Chief Risk Officer · DAX-listed industrial group
              </figcaption>
            </figure>

            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              © {new Date().getFullYear()} Quantivis · Frankfurt · London · NYC
            </p>
          </div>
        </aside>

        {/* Form panel */}
        <section className="flex items-center justify-center px-4 sm:px-8 py-10 lg:py-14">
          <div className="w-full max-w-md">
            {/* Mobile-only logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src={logo} alt="Quantivis" className="h-9 w-auto" />
            </div>

            <div className="glass-card p-7 sm:p-9 shadow-[0_30px_80px_-30px_hsl(var(--primary)/0.25)]">
              {ribbon}
              <div className="mb-7">
                <h1 className="tracking-tight text-2xl sm:text-[28px] leading-tight tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
              {children}
            </div>

            {footer && (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            )}

            <p className="mt-8 text-center text-[11px] text-muted-foreground/70 leading-relaxed">
              Protected by enterprise-grade security ·{" "}
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>{" "}
              ·{" "}
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>{" "}
              ·{" "}
              <Link to="/impressum" className="hover:text-foreground transition-colors">
                Impressum
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AuthLayout;

import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // ─── DS-1 Brand layer ─────────────────────────────────────
        // bg-brand, bg-brand-secondary, bg-brand-executive-navy, etc.
        brand: {
          DEFAULT: "hsl(var(--brand-primary))",
          primary: "hsl(var(--brand-primary))",
          secondary: "hsl(var(--brand-secondary))",
          accent: "hsl(var(--brand-accent))",
          "executive-navy": "hsl(var(--brand-executive-navy))",
          "marketing-accent": "hsl(var(--brand-marketing-accent))",
          "marketing-deep": "hsl(var(--brand-marketing-deep))",
          "marketing-muted": "hsl(var(--brand-marketing-muted))",
          "marketing-slate": "hsl(var(--brand-marketing-slate))",
        },
        // ─── DS-1 Surface layer ───────────────────────────────────
        surface: {
          marketing: "hsl(var(--surface-marketing))",
          "marketing-dark": "hsl(var(--surface-marketing-dark))",
          dashboard: "hsl(var(--surface-dashboard))",
          trust: "hsl(var(--surface-trust))",
          evidence: "hsl(var(--surface-evidence))",
          decision: "hsl(var(--surface-decision))",
        },
        // ─── DS-1 Status layer ────────────────────────────────────
        status: {
          success: {
            DEFAULT: "hsl(var(--status-success))",
            foreground: "hsl(var(--status-success-foreground))",
          },
          warning: {
            DEFAULT: "hsl(var(--status-warning))",
            foreground: "hsl(var(--status-warning-foreground))",
          },
          danger: {
            DEFAULT: "hsl(var(--status-danger))",
            foreground: "hsl(var(--status-danger-foreground))",
          },
          info: {
            DEFAULT: "hsl(var(--status-info))",
            foreground: "hsl(var(--status-info-foreground))",
          },
        },
        // ─── DS-1 Decision layer ──────────────────────────────────
        decision: {
          approve: "hsl(var(--decision-approve))",
          reject: "hsl(var(--decision-reject))",
          "needs-review": "hsl(var(--decision-needs-review))",
        },
        // ─── DS-1 Evidence layer ──────────────────────────────────
        evidence: {
          "high-confidence": "hsl(var(--evidence-high-confidence))",
          "medium-confidence": "hsl(var(--evidence-medium-confidence))",
          "low-confidence": "hsl(var(--evidence-low-confidence))",
        },
        // ─── DS-1 Governance layer ────────────────────────────────
        governance: {
          risk: "hsl(var(--governance-risk))",
          compliance: "hsl(var(--governance-compliance))",
        },
        // ─── DS-1 Chart palette ───────────────────────────────────
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
          7: "hsl(var(--chart-7))",
          8: "hsl(var(--chart-8))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // ─── DS-1 Component-named radius (in addition to lg/md/sm) ──
        button: "var(--radius-button)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
        dialog: "var(--radius-dialog)",
      },
      // ─── DS-1 Motion ────────────────────────────────────────────
      transitionDuration: {
        fast: "var(--motion-fast)",
        normal: "var(--motion-normal)",
        slow: "var(--motion-slow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "float": "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-in-left": "slide-in-left 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "shimmer": "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

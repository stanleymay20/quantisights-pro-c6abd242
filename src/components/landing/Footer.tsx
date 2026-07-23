/**
 * Canonical public marketing footer (DS-0).
 *
 * Use this on public marketing pages that need the full Quantivis brand
 * footer (brand block, contact, social, three link columns, bottom bar
 * with auto-updating copyright). Do not mount on dashboard/internal pages.
 *
 * Utility/legal pages mounted via layout: "public" intentionally render
 * no footer at present; revisit during the broader design-system migration.
 *
 * The homepage (Index.tsx) still renders its own inline footer; migration
 * of that surface is deferred past DS-0.
 */
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Linkedin } from "lucide-react";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

const FOOTER_SECTIONS = [
  {
    title: "Platform",
    links: [
      { label: "How It Works", to: "/#how-it-works" },
      { label: "Capabilities", to: "/#features" },
      { label: "Case Studies", to: "/#case-studies" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    title: "Enterprise Trust",
    links: [
      { label: "Trust Center", to: "/trust" },
      { label: "System Status", to: "/status" },
      { label: "SLA & Incident Response", to: "/sla" },
      { label: "Security & Compliance", to: "/security" },
      { label: "Security Questionnaire", to: "/security-questionnaire" },
      { label: "Contact Enterprise Sales", to: "/enterprise/contact" },
    ],
  },
  {
    title: "Legal & Compliance",
    links: [
      { label: "Impressum", to: "/impressum" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Cookie Policy", to: "/cookies" },
      { label: "DPA", to: "/dpa" },
      { label: "Data Retention", to: "/data-retention" },
      { label: "Subprocessors", to: "/subprocessors" },
    ],
  },
];

const Footer = forwardRef<HTMLElement>((_, ref) => (
  <footer ref={ref} role="contentinfo" className="border-t border-border pt-16 pb-8 bg-card/30">
    <div className="container mx-auto px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-12">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <img src={logo} alt={CONTACT.company} className="h-8 w-auto mb-4" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-4">
            Enterprise decision intelligence platform. Transforming operational data into defensible strategic choices.
          </p>
          {/* Contact details */}
          <div className="space-y-2">
            <a href={`mailto:${CONTACT.email.general}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Mail className="w-3.5 h-3.5 text-primary" />
              {CONTACT.email.general}
            </a>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              {CONTACT.location}
            </div>
            <a
              href={CONTACT.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Linkedin className="w-3.5 h-3.5 text-primary" />
              Follow on LinkedIn
            </a>
          </div>
        </div>

        {/* Links */}
        {FOOTER_SECTIONS.map((section) => (
          <div key={section.title}>
            <h4 className="text-sm font-semibold mb-4">{section.title}</h4>
            <ul className="space-y-2.5">
              {section.links.map((link) => (
                <li key={link.label}>
                  {"to" in link && link.to ? (
                    <Link to={link.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </Link>
                  ) : (
                    <a href={"href" in link ? (link as { href: string }).href : "#"} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Get Started */}
        <div>
          <h4 className="text-sm font-semibold mb-4">Get Started</h4>
          <ul className="space-y-2.5">
            <li>
              <Link to="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Start Free Trial
              </Link>
            </li>
            <li>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sign In
              </Link>
            </li>
            <li>
              <Link to="/demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Request Demo
              </Link>
            </li>
            <li>
              <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Documentation
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {CONTACT.company}. All rights reserved.
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          <Link to="/impressum" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          <Link to="/cookies" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cookies</Link>
          <Link to="/dpa" className="text-xs text-muted-foreground hover:text-foreground transition-colors">DPA</Link>
        </div>
      </div>
    </div>
  </footer>
));

Footer.displayName = "Footer";

export default Footer;

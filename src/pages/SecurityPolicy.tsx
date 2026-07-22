import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

const SecurityPolicy = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl space-y-6 text-sm">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Vulnerability Disclosure Policy</h1>
        <p className="text-muted-foreground">Last reviewed: May 26, 2026 · Version 2026.2</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Reporting</h2>
        <p className="text-muted-foreground leading-relaxed">
          Email <a href={`mailto:${CONTACT.email.security}`} className="text-primary hover:underline">{CONTACT.email.security}</a>{" "}
          with a clear description, steps to reproduce, and impact. Encrypt sensitive details if available; see{" "}
          <a href="/.well-known/security.txt" className="text-primary hover:underline">/.well-known/security.txt</a>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Response SLAs</h2>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5">
          <li>Acknowledgement within <strong>24 hours</strong></li>
          <li>Initial assessment within <strong>5 business days</strong></li>
          <li>Status updates every <strong>7 days</strong> during triage</li>
          <li>Severity assignment per <Link to="/incident-response" className="text-primary hover:underline">/incident-response</Link></li>
          <li>Public credit on request once a fix ships</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Scope</h2>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5">
          <li><code>*.quantivis.io</code> production surface</li>
          <li>Quantivis Cloud edge functions</li>
          <li>Authentication, authorization, tenant isolation</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Out of Scope</h2>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5">
          <li>Denial-of-service, social engineering, physical attacks</li>
          <li>Third-party sub-processors (see <Link to="/subprocessors" className="text-primary hover:underline">/subprocessors</Link>)</li>
          <li>Issues requiring man-in-the-middle or already-compromised client</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Safe Harbour</h2>
        <p className="text-muted-foreground leading-relaxed">
          Good-faith research conducted under this policy is welcomed. We will not pursue legal action against
          researchers who comply with the scope, do not access or exfiltrate customer data beyond what is necessary
          to demonstrate the issue, and give us a reasonable window to remediate before disclosure.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Coordinated Disclosure Window</h2>
        <p className="text-muted-foreground leading-relaxed">
          We follow a <strong>90-day coordinated disclosure</strong> window. Extensions are negotiated on a per-case
          basis for issues requiring complex coordination.
        </p>
      </section>
    </main>
  </div>
);

export default SecurityPolicy;

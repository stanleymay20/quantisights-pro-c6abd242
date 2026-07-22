import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";
import { useSeoHead } from "@/lib/useSeoHead";

const Privacy = () => {
  useSeoHead({
    title: "Privacy Policy | Quantivis",
    description: "Review how Quantivis collects, protects, processes, retains, and shares customer data, including GDPR and CCPA rights.",
    canonicalPath: "/privacy",
  });

  return (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-10">Last updated: February 25, 2026</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Information We Collect</h2>
          <p><strong>Account Data:</strong> Name, email address, and organization details provided during registration.</p>
          <p><strong>Usage Data:</strong> Analytics on feature usage, session duration, and interactions within the Platform.</p>
          <p><strong>Uploaded Data:</strong> Business data (CSV files, datasets) you upload for analysis. This data is processed solely for the purpose of delivering intelligence insights.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">2. How We Use Your Data</h2>
          <p>We use your data to: (a) provide and improve our services; (b) compute KPIs, diagnostics, and advisory outputs; (c) send transactional communications (password resets, alerts); (d) aggregate anonymized usage statistics.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">3. Data Security</h2>
          <p>We employ industry-standard encryption (TLS 1.3 in transit, AES-256 at rest), row-level security policies, and role-based access control. All data is hosted in SOC 2 compliant infrastructure.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">4. Data Sharing</h2>
          <p>We do not sell your data. Data may be shared with: (a) sub-processors required for service delivery (cloud hosting, payment processing); (b) law enforcement if legally required. All sub-processors are contractually bound to equivalent data protection standards.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
          <p>Account data is retained while your account is active. Upon deletion request, all personal data is purged within 30 days. Uploaded datasets are deleted within 7 days of account closure.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">6. Your Rights (GDPR / CCPA)</h2>
          <p>You have the right to: (a) access your data; (b) request correction or deletion; (c) export your data; (d) withdraw consent; (e) lodge a complaint with a supervisory authority. Contact <span className="text-primary">{CONTACT.email.privacy}</span> to exercise these rights.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">7. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use advertising or third-party tracking cookies.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">8. Changes to This Policy</h2>
          <p>We may update this policy periodically. Material changes will be communicated via email or in-app notification.</p>
        </section>
      </div>
    </main>
  </div>
  );
};

export default Privacy;

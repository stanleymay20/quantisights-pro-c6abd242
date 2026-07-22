import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";

const DataProcessing = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Data Processing Agreement (DPA)</h1>
      <p className="text-muted-foreground text-sm mb-10">Last updated: February 25, 2026</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Scope</h2>
          <p>This Data Processing Agreement ("DPA") supplements the Terms of Service between Quantivis Global GmbH ("Processor") and you ("Controller"). It governs the processing of personal data provided by the Controller in connection with the Platform services.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Definitions</h2>
          <p>"Personal Data," "Processing," "Data Subject," "Controller," and "Processor" have the meanings given in the GDPR (Regulation (EU) 2016/679).</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">3. Processing Purpose & Instructions</h2>
          <p>The Processor processes personal data solely to provide the Platform services as described in the Terms of Service. Processing occurs only upon documented instructions from the Controller unless required by EU or member state law.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">4. Data Categories</h2>
          <p><strong>Data subjects:</strong> Controller's employees, clients, and end users.</p>
          <p><strong>Categories of data:</strong> Name, email, organization metadata, operational business metrics (revenue, costs, churn rates), and usage analytics.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">5. Security Measures</h2>
          <p>The Processor implements: TLS 1.3 encryption in transit; AES-256 encryption at rest; row-level security (RLS) for multi-tenant data isolation; role-based access control (RBAC); automated audit logging; regular security assessments; and encrypted credential storage with SHA-256 hashing.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">6. Sub-processors</h2>
          <p>The Processor uses the following sub-processors. Changes are communicated 30 days in advance:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Amazon Web Services (AWS)</strong> — EU-West-1 — Cloud infrastructure</li>
            <li><strong>Stripe, Inc.</strong> — United States — Payment processing (SCCs in place)</li>
            <li><strong>Google LLC</strong> — EU/US — AI model inference (data not retained)</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">7. Data Subject Rights</h2>
          <p>The Processor assists the Controller in fulfilling data subject requests (access, rectification, erasure, portability) within 72 hours of receiving a forwarded request.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">8. Data Breach Notification</h2>
          <p>The Processor notifies the Controller of any personal data breach without undue delay and no later than 48 hours after becoming aware of it, providing all information necessary for the Controller to meet its GDPR Article 33 obligations.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">9. Data Retention & Deletion</h2>
          <p>Upon termination or upon Controller request, the Processor deletes all personal data within 30 days and certifies deletion in writing. Uploaded datasets are deleted within 7 days.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">10. Data Residency</h2>
          <p>All primary data storage occurs within the European Union (EU-West-1). Data transferred outside the EU is protected by Standard Contractual Clauses (SCCs) as approved by the European Commission.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
          <p>Data Protection Officer: <span className="text-primary">dpo@quantivis.io</span></p>
        </section>
      </div>
    </main>
  </div>
);

export default DataProcessing;

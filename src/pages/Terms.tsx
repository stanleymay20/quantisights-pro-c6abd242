import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";
import { useSeoHead } from "@/lib/useSeoHead";

const Terms = () => {
  useSeoHead({
    title: "Terms of Service | Quantivis",
    description: "Read the Quantivis Terms of Service covering platform access, data ownership, acceptable use, billing, decision responsibility, and liability.",
    canonicalPath: "/terms",
  });

  return (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-muted-foreground text-sm mb-10">Last updated: February 27, 2026</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using Quantivis Global ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
          <p>Quantivis Global provides an enterprise intelligence platform for data consultancy, KPI analytics, scenario modeling, diagnostics, and advisory services. Access is subject to your subscription tier.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">3. Account Registration</h2>
          <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials and for all activity under your account.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">4. Data Ownership</h2>
          <p>You retain all rights to the data you upload. Quantivis Global processes your data solely to provide the services you've subscribed to. We do not sell, share, or use your data for purposes outside of service delivery.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">5. Acceptable Use</h2>
          <p>You agree not to: (a) reverse-engineer the Platform; (b) use it for unlawful purposes; (c) attempt to gain unauthorized access to other accounts or systems; (d) upload malicious files or data.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">6. Subscription & Billing</h2>
          <p>Paid plans are billed in advance on a monthly or annual basis. Cancellations take effect at the end of the billing period. Refunds are issued at our discretion.</p>
        </section>

        {/* ── NEW: Non-Fiduciary Disclaimer ── */}
        <section>
          <h2 className="text-lg font-semibold mb-2">7. No Financial or Professional Advice</h2>
          <p>The Platform is a <strong>decision-support tool</strong>. All outputs — including but not limited to insights, recommendations, simulations, confidence scores, risk assessments, and strategic advisories — are probabilistic estimates derived from data you provide and statistical models. They are <strong>not</strong> financial advice, investment advice, legal advice, or any form of regulated professional counsel.</p>
          <p className="mt-2">Quantivis Global does not act as a fiduciary, financial advisor, auditor, or investment advisor. You acknowledge that:</p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>All strategic and financial decisions remain <strong>solely the responsibility of your organization</strong> and its authorized decision-makers.</li>
            <li>Model outputs are subject to data quality limitations, assumption uncertainty, and inherent statistical variance.</li>
            <li>Confidence scores are <strong>algorithmically capped</strong> based on data sufficiency and do not represent guarantees of accuracy.</li>
            <li>The Platform does not execute, authorize, or commit to any financial transactions or strategic actions on your behalf.</li>
            <li>You should seek independent professional advice before making material business decisions.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Decision Responsibility</h2>
          <p>You agree that any action taken based on Platform outputs is at your organization's sole risk and discretion. The Platform provides probabilistic intelligence to <strong>augment</strong>, not replace, executive judgment and established governance processes. You are responsible for validating assumptions, verifying data accuracy, and obtaining appropriate internal approvals before acting on any recommendation.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Data Accuracy Disclaimer</h2>
          <p>Platform outputs are only as reliable as the data you provide. Quantivis Global does not independently verify, audit, or guarantee the accuracy, completeness, or timeliness of your uploaded data. Outputs derived from incomplete, inaccurate, or outdated data may be unreliable. You are solely responsible for data quality governance.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Limitation of Liability</h2>
          <p>Quantivis Global is provided "as is" and "as available." To the maximum extent permitted by applicable law:</p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>We disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement.</li>
            <li>We are <strong>not liable</strong> for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of revenue, profit, business opportunity, or data, arising from your use of or reliance on Platform outputs.</li>
            <li>Our total aggregate liability shall not exceed the amount you paid to us in the <strong>twelve (12) months preceding</strong> the event giving rise to the claim.</li>
            <li>We are not liable for any business decisions, strategic actions, or financial outcomes that result from your use of the Platform.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">11. Indemnification</h2>
          <p>You agree to indemnify, defend, and hold harmless Quantivis Global, its affiliates, officers, directors, and employees from any claims, damages, or expenses arising from: (a) your use of Platform outputs for business decisions; (b) your violation of these Terms; (c) any third-party claims related to decisions made using Platform intelligence.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">12. Modifications</h2>
          <p>We may update these Terms at any time. We will provide notice of material changes via the Platform or email. Continued use of the Platform after changes constitutes acceptance of the revised Terms.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">13. Contact</h2>
          <p>For questions regarding these Terms, contact us at <span className="text-primary">{CONTACT.email.legal}</span>.</p>
        </section>
      </div>
    </main>
  </div>
  );
};

export default Terms;

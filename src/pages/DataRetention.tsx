import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

const DataRetention = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Data Retention Policy</h1>
      <p className="text-muted-foreground text-sm mb-10">Last updated: February 25, 2026</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Active Account Data</h2>
          <p>While your account is active, we retain all data necessary to provide the service, including: account profiles, organization settings, uploaded datasets, computed KPIs, advisory instances, scenario results, audit logs, and intelligence trail records.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Retention Periods</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Data Type</th>
                  <th className="text-left py-2 font-semibold">Retention Period</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Account profile</td><td className="py-2">Duration of account + 30 days</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Uploaded datasets</td><td className="py-2">Duration of account + 7 days</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">KPI values & results</td><td className="py-2">Duration of account + 30 days</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Advisory instances</td><td className="py-2">Duration of account + 30 days</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Audit logs</td><td className="py-2">24 months (regulatory minimum)</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Intelligence audit trail</td><td className="py-2">24 months</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Copilot messages</td><td className="py-2">90 days (auto-cleaned)</td></tr>
                <tr className="border-b border-border/30"><td className="py-2 pr-4">Session & usage data</td><td className="py-2">12 months</td></tr>
                <tr><td className="py-2 pr-4">Billing records</td><td className="py-2">7 years (tax compliance)</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">3. Account Deletion</h2>
          <p>You may request account deletion at any time via Settings → Profile → Delete Account or by emailing <span className="text-primary">{CONTACT.email.privacy}</span>. Upon deletion:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Personal data is purged within 30 days</li>
            <li>Uploaded datasets are deleted within 7 days</li>
            <li>Anonymized aggregate statistics may be retained</li>
            <li>Audit logs are retained for 24 months per regulatory requirements</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">4. Data Export</h2>
          <p>Before deletion, you can export all your data via the Reports section (CSV/PDF). We support GDPR Article 20 data portability requests within 72 hours.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">5. Contact</h2>
          <p>For questions about data retention, contact <span className="text-primary">{CONTACT.email.privacy}</span>.</p>
        </section>
      </div>
    </main>
  </div>
);

export default DataRetention;

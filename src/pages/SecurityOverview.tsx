import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";

const Block = ({ title, points }: { title: string; points: string[] }) => (
  <section>
    <h2 className="text-base font-semibold mb-1.5">{title}</h2>
    <ul className="space-y-1 text-muted-foreground text-sm list-disc pl-5 leading-relaxed">
      {points.map((p) => <li key={p}>{p}</li>)}
    </ul>
  </section>
);

const SecurityOverview = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Security Overview</h1>
        <p className="text-muted-foreground text-sm">Architectural reference for procurement security reviews.</p>
      </div>

      <Block title="Authentication" points={[
        "Email + password with bcrypt-based hashing (managed by Supabase Auth)",
        "MFA via TOTP and WebAuthn / Passkeys",
        "SAML 2.0 single sign-on with domain enforcement",
        "Auth throttling on failed attempts (useAuthThrottle)",
        "Step-up authentication for destructive actions (StepUpAuthDialog)",
      ]} />

      <Block title="RBAC" points={[
        "Roles: owner, admin, analyst, executive, viewer",
        "Roles stored in dedicated user_roles table (never on profiles)",
        "Access checked server-side via has_role() and has_permission() SECURITY DEFINER",
        "Sensitive RPCs additionally gated on exec_require_elevated_role",
      ]} />

      <Block title="Audit Logging" points={[
        "audit_log table is write-once (database-level DENY on UPDATE/DELETE)",
        "Every approval, dismissal, override, and intervention is logged with actor, IP, payload",
        "cron_run_log records every scheduled job execution",
      ]} />

      <Block title="Retention" points={[
        "Per-organization retention policies, configurable in Settings",
        "Daily cleanup job removes expired data",
        "Erasure requests fulfilled via /privacy-dashboard (Art. 17 GDPR)",
      ]} />

      <Block title="Encryption" points={[
        "Data at rest: AES-256 (AWS KMS)",
        "Data in transit: TLS 1.3 with HSTS preload",
        "PII redaction layer applied before LLM inference (default on)",
        "Secrets stored in Supabase Vault, never in code or env",
      ]} />

      <Block title="Tenant Isolation" points={[
        "Every public-schema table enforces RLS scoped by organization_id",
        "Realtime channels isolated per organization",
        "Cross-tenant access only via SECURITY DEFINER helpers with explicit checks",
      ]} />

      <Block title="Secret Handling" points={[
        "Vendor and connector credentials in Supabase Vault (vault.decrypted_secrets)",
        "Accessed exclusively from SECURITY DEFINER getters (get_connector_secret, etc.)",
        "Never logged, never returned to the client",
      ]} />

      <Block title="Connector Isolation" points={[
        "Per-connector advisory locks (connector_try_lock / connector_release_lock)",
        "3-state circuit breakers on every connector",
        "Dead-letter queue for failed ingestion batches",
        "Rate limiting per vendor",
      ]} />

      <Block title="Edge Function Hardening" points={[
        "All functions ship with CORS + x-request-id + input validation",
        "Cron jobs guarded by pg_advisory_lock and logged to cron_run_log",
        "Retry policy via invokeWithRetry; destructive operations bypass retry",
      ]} />

      <p className="text-xs text-muted-foreground pt-4 border-t border-border/30">
        See also: <Link to="/toms" className="text-primary hover:underline">TOMs</Link> ·{" "}
        <Link to="/incident-response" className="text-primary hover:underline">Incident Response</Link> ·{" "}
        <Link to="/auditability" className="text-primary hover:underline">Auditability</Link> ·{" "}
        <Link to="/trust" className="text-primary hover:underline">Trust Center</Link>
      </p>
    </main>
  </div>
);

export default SecurityOverview;

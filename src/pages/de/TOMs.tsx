import LegalDocHeader from "@/components/legal/LegalDocHeader";
import { CONTACT } from "@/lib/contact-config";

const Block = ({ title, art, items }: { title: string; art: string; items: string[] }) => (
  <section>
    <h2 className="text-lg font-semibold mb-1">{title} <span className="text-xs text-muted-foreground font-normal">— {art}</span></h2>
    <ul className="list-disc pl-5 space-y-1">{items.map((i) => <li key={i}>{i}</li>)}</ul>
  </section>
);

const TOMsDe = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
      <LegalDocHeader
        title="Technische und organisatorische Maßnahmen"
        subtitle="TOMs gemäß Art. 32 DSGVO"
        version="1.0"
        effectiveDate="30. Mai 2026"
        language="de"
        counterpartHref="/toms"
      />

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <Block title="Vertraulichkeit" art="Art. 32 Abs. 1 lit. b"
          items={[
            "AES-256-Verschlüsselung sämtlicher Datenträger (AWS KMS).",
            "TLS 1.2+ und HSTS-Preload für alle Client- und Service-Verbindungen.",
            "Row-Level Security auf 100 % der Anwendungstabellen, scoped per organization_id.",
            "PII-Redaktion vor jedem LLM-Aufruf, sofern Klartext nicht explizit erlaubt.",
            "Rollenbasierte Zugriffssteuerung (Owner / Admin / Member / Viewer) mit Least-Privilege.",
          ]} />

        <Block title="Integrität" art="Art. 32 Abs. 1 lit. b"
          items={[
            "Append-only Audit-Log mit DB-seitigen DENY-Regeln für UPDATE und DELETE.",
            "Unveränderliches Decision Ledger mit Versionierung, Begründung und Aktor-Identität.",
            "Kryptografische Inhaltshashes (content_hash) bei Signal-Ingestion.",
            "Versionsverwaltete Schema-Migrationen — jede Änderung commit-rückverfolgbar.",
          ]} />

        <Block title="Verfügbarkeit und Belastbarkeit" art="Art. 32 Abs. 1 lit. b"
          items={[
            "Mehrzonen-Hosting (Multi-AZ) inkl. automatischem Failover.",
            "Tägliche, verschlüsselte Datenbank-Backups; Wiederherstellungstest mind. quartalsweise.",
            "Circuit Breaker auf allen externen Integrationen (3-Zustand-Modell).",
            "Health-Probes alle 5 Minuten; SLO-Sichtbarkeit unter /system-health.",
          ]} />

        <Block title="Wiederherstellbarkeit" art="Art. 32 Abs. 1 lit. c"
          items={[
            "RPO ≤ 24 h, RTO ≤ 4 h für kritische Funktionen.",
            "Dokumentiertes Disaster-Recovery-Runbook.",
            "Point-in-Time-Recovery für die Anwendungsdatenbank.",
          ]} />

        <Block title="Regelmäßige Überprüfung" art="Art. 32 Abs. 1 lit. d"
          items={[
            "Automatisierter Security-Linter bei jeder Migration.",
            "Quartalsweise Pen-Test- und Dependency-Scans.",
            "Jährliche Überprüfung dieser TOMs.",
          ]} />

        <Block title="Auftrags­kontrolle / Zugriffs­steuerung"
          art="Art. 28, 32 DSGVO"
          items={[
            "Vollständige Auftragsverarbeiterliste mit Hosting-Region und Übermittlungsmechanismus: /subprocessors.",
            "Vertragliche Bindung jedes Auftragsverarbeiters an gleichwertige Schutzstandards.",
            "Trennungsgebot durch organization_id-Scoping in jeder Anfrage und Policy.",
          ]} />

        <section>
          <h2 className="text-lg font-semibold mb-1">Datenschutzbeauftragter</h2>
          <p><a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a></p>
        </section>
      </div>
    </main>
  </div>
);

export default TOMsDe;

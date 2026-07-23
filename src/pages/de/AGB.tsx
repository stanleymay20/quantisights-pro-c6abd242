import LegalDocHeader from "@/components/legal/LegalDocHeader";
import { CONTACT } from "@/lib/contact-config";

const AGB = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
      <LegalDocHeader
        title="Allgemeine Geschäftsbedingungen"
        subtitle="AGB für die Nutzung der Quantivis-Plattform"
        version="1.0"
        effectiveDate="30. Mai 2026"
        language="de"
        counterpartHref="/terms"
      />

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold mb-2">§1 Geltungsbereich</h2>
          <p>Diese AGB regeln die Nutzung der von {CONTACT.companyLegal} ({CONTACT.location}) bereitgestellten Quantivis-Plattform durch Unternehmen (B2B). Verbraucher gemäß § 13 BGB sind ausgeschlossen.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§2 Vertragsgegenstand</h2>
          <p>Software-as-a-Service-Bereitstellung einer Plattform zur betrieblichen Entscheidungs- und Reasoning-Unterstützung. Funktionsumfang gemäß gewählter Tarifebene (Starter, Growth, Enterprise).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§3 Vertragsschluss</h2>
          <p>Der Vertrag kommt mit Bestätigung der Registrierung oder Annahme eines individuellen Angebots zustande.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§4 Pflichten des Kunden</h2>
          <p>Der Kunde stellt sicher, dass die in die Plattform eingestellten Daten rechtmäßig erhoben wurden und keine Rechte Dritter verletzen. Zugangsdaten sind vertraulich zu behandeln.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§5 Auftragsverarbeitung</h2>
          <p>Soweit personenbezogene Daten verarbeitet werden, gilt der Auftragsverarbeitungsvertrag (<a href="/de/avv" className="text-primary hover:underline">/de/avv</a>) als Bestandteil dieses Vertrags.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§6 Verfügbarkeit (SLA)</h2>
          <p>Service-Level gemäß <a href="/sla" className="text-primary hover:underline">/sla</a>. Geplante Wartungsfenster werden mit angemessener Vorlaufzeit angekündigt.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§7 Vergütung</h2>
          <p>Die Vergütung richtet sich nach der gewählten Tarifebene. Preise verstehen sich zzgl. gesetzlicher Umsatzsteuer.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§8 Haftung</h2>
          <p>Für leichte Fahrlässigkeit haftet {CONTACT.companyLegal} nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypisch vorhersehbaren Schaden. Die Plattform liefert Entscheidungs-<em>empfehlungen</em>; die finale Entscheidungsverantwortung verbleibt beim Kunden.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§9 Vertragslaufzeit</h2>
          <p>Verträge laufen monatlich oder jährlich; Kündigung jeweils zum Ende des Abrechnungszeitraums.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§10 Schlussbestimmungen</h2>
          <p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist – soweit zulässig – der Sitz von {CONTACT.companyLegal}.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Kontakt</h2>
          <p>Rechtsfragen: <a href={`mailto:${CONTACT.email.legal}`} className="text-primary hover:underline">{CONTACT.email.legal}</a></p>
        </section>
      </div>
    </main>
  </div>
);

export default AGB;

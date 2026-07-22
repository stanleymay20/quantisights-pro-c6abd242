import LegalDocHeader from "@/components/legal/LegalDocHeader";
import { CONTACT } from "@/lib/contact-config";

const Datenschutz = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
      <LegalDocHeader
        title="Datenschutzerklärung"
        subtitle="Informationen gemäß Art. 13 und 14 DSGVO"
        version="1.0"
        effectiveDate="30. Mai 2026"
        language="de"
        counterpartHref="/privacy"
      />

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Verantwortlicher</h2>
          <p>
            {CONTACT.companyLegal}, {CONTACT.location}<br />
            E-Mail: <a href={`mailto:${CONTACT.email.privacy}`} className="text-primary hover:underline">{CONTACT.email.privacy}</a><br />
            Datenschutzbeauftragter: <a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Erhobene Daten</h2>
          <p><strong>Kontodaten:</strong> Name, E-Mail-Adresse, Organisationszuordnung.</p>
          <p><strong>Nutzungsdaten:</strong> Funktionsnutzung, Sitzungsdauer, Interaktionsereignisse.</p>
          <p><strong>Hochgeladene Daten:</strong> Geschäftsdatensätze (z. B. CSV) zur Berechnung von KPIs, Diagnosen und Empfehlungen.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Zwecke und Rechtsgrundlagen</h2>
          <p>Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO), berechtigtes Interesse an Produktverbesserung (lit. f) sowie gesetzliche Pflichten (lit. c). Wir verarbeiten keine Daten zu Werbezwecken.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Empfänger und Auftragsverarbeiter</h2>
          <p>Eine vollständige Liste der eingesetzten Auftragsverarbeiter inkl. Hosting-Region und Übermittlungsmechanismus finden Sie unter <a href="/subprocessors" className="text-primary hover:underline">/subprocessors</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Übermittlung in Drittländer</h2>
          <p>Sofern Daten ausnahmsweise außerhalb der EU verarbeitet werden, geschieht dies ausschließlich auf Grundlage der EU-Standardvertragsklauseln (SCC) gemäß Durchführungsbeschluss (EU) 2021/914. Details: <a href="/data-residency" className="text-primary hover:underline">/data-residency</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Speicherdauer</h2>
          <p>Kontodaten: aktive Vertragslaufzeit. Hochgeladene Datensätze: 7 Tage nach Kontolöschung. Detailpolitik: <a href="/data-retention" className="text-primary hover:underline">/data-retention</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Ihre Rechte (Art. 15–22 DSGVO)</h2>
          <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch und Beschwerde bei einer Aufsichtsbehörde. Selbstbedienungsformular: <a href="/gdpr-rights" className="text-primary hover:underline">/gdpr-rights</a>. Reaktions-SLA: 30 Tage.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Automatisierte Entscheidungsfindung</h2>
          <p>Quantivis trifft keine ausschließlich automatisierten Entscheidungen mit rechtlicher Wirkung im Sinne von Art. 22 DSGVO. Alle Entscheidungsempfehlungen erfordern eine menschliche Freigabe (siehe <a href="/how-ai-is-used" className="text-primary hover:underline">/how-ai-is-used</a>).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Sicherheit</h2>
          <p>Technische und organisatorische Maßnahmen gemäß Art. 32 DSGVO: <a href="/de/toms" className="text-primary hover:underline">/de/toms</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Kontakt</h2>
          <p>Anfragen: <a href={`mailto:${CONTACT.email.privacy}`} className="text-primary hover:underline">{CONTACT.email.privacy}</a></p>
        </section>
      </div>
    </main>
  </div>
);

export default Datenschutz;

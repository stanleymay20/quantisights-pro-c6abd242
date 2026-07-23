import LegalDocHeader from "@/components/legal/LegalDocHeader";
import { CONTACT } from "@/lib/contact-config";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Auftragsverarbeitungsvertrag (AVV) — DSGVO Art. 28.
 * Procurement-ready format with version history, change log,
 * counterparty placeholders, and Annex I–III structure.
 */
const AVV = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
      <LegalDocHeader
        title="Auftragsverarbeitungsvertrag"
        subtitle="AVV gemäß Art. 28 DSGVO · Beschaffungsreife Version"
        version="1.0"
        effectiveDate="30. Mai 2026"
        language="de"
        counterpartHref="/dpa"
      />

      {/* Versionshistorie */}
      <Card className="mb-8 border-border/50">
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold mb-3">Versionshistorie / Änderungsprotokoll</h2>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="text-left py-1.5 font-medium">Version</th>
                <th className="text-left py-1.5 font-medium">Datum</th>
                <th className="text-left py-1.5 font-medium">Änderung</th>
                <th className="text-left py-1.5 font-medium">Autor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/20">
                <td className="py-1.5">1.0</td>
                <td className="py-1.5">30.05.2026</td>
                <td className="py-1.5">Erstveröffentlichung der beschaffungsreifen Fassung</td>
                <td className="py-1.5">Legal / DPO</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold mb-2">Vertragsparteien</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-border/40 rounded-md p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Auftragsverarbeiter</p>
              <p>{CONTACT.companyLegal}<br />{CONTACT.location}<br />DPO: {CONTACT.email.dpo}</p>
            </div>
            <div className="border border-border/40 rounded-md p-3 border-dashed">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Auftraggeber / Verantwortlicher</p>
              <p className="text-muted-foreground italic">
                [Firmenname]<br />
                [Anschrift]<br />
                [Vertretungsberechtigte Person]<br />
                [Kontakt-E-Mail]
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§1 Gegenstand und Dauer</h2>
          <p>Gegenstand ist die Verarbeitung personenbezogener Daten durch den Auftragsverarbeiter im Rahmen der Bereitstellung der Quantivis-Plattform. Laufzeit deckungsgleich mit dem Hauptvertrag.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§2 Art und Zweck der Verarbeitung</h2>
          <p>Hosting, Speicherung, Auswertung und Bereitstellung von Geschäfts- und Kontodaten zur Erbringung der vertraglich vereinbarten SaaS-Leistungen (siehe <strong>Anlage I</strong>).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§3 Pflichten des Auftragsverarbeiters</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Verarbeitung ausschließlich auf dokumentierte Weisung des Verantwortlichen.</li>
            <li>Verpflichtung zur Vertraulichkeit aller mit der Verarbeitung befassten Personen.</li>
            <li>Umsetzung der technischen und organisatorischen Maßnahmen gemäß <strong>Anlage II</strong>.</li>
            <li>Unterstützung des Verantwortlichen bei Betroffenenanfragen und Meldungen gemäß Art. 33/34 DSGVO.</li>
            <li>Löschung oder Rückgabe sämtlicher Daten nach Vertragsende gemäß § 11.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§4 Unterauftragsverarbeiter</h2>
          <p>Der Verantwortliche genehmigt die in <strong>Anlage III</strong> aufgeführten Unterauftragsverarbeiter. Änderungen werden mit 30-Tage-Vorlauf gemäß <a href="/subprocessors" className="text-primary hover:underline">/subprocessors</a> bekanntgegeben; Widerspruchsrecht binnen 14 Tagen.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§5 Drittlandtransfers</h2>
          <p>Übermittlungen außerhalb der EU/EWR erfolgen ausschließlich auf Grundlage der EU-Standardvertragsklauseln (Modul 2/3, Beschluss EU 2021/914). Details siehe <a href="/data-residency" className="text-primary hover:underline">/data-residency</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§6 Datenschutzverletzungen</h2>
          <p>Meldung an den Verantwortlichen unverzüglich, spätestens binnen 48 Stunden nach Kenntnisnahme.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§7 Audit-Rechte</h2>
          <p>Der Verantwortliche kann einmal jährlich – nach 30-tägiger Voranzeige – die Einhaltung dieses AVV überprüfen, alternativ durch unabhängige Auditberichte (SOC 2, ISO-Reports).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§8 Haftung</h2>
          <p>Es gilt Art. 82 DSGVO. Innenverhältnis-Haftung gemäß Hauptvertrag.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">§9 Schlussbestimmungen</h2>
          <p>Es gilt deutsches Recht. Bei Widersprüchen zwischen AVV und Hauptvertrag geht dieser AVV in Datenschutzfragen vor.</p>
        </section>

        {/* ── Anlagen ── */}
        <section className="pt-4 border-t border-border/40">
          <h2 className="text-lg font-semibold mb-2">Anlage I — Beschreibung der Verarbeitung</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Betroffene Personen:</strong> Mitarbeiter, Kunden und Endnutzer des Verantwortlichen.</li>
            <li><strong>Datenkategorien:</strong> Name, E-Mail, Organisationsmetadaten, betriebliche Geschäftskennzahlen, Nutzungsanalytik.</li>
            <li><strong>Art der Verarbeitung:</strong> Erhebung, Speicherung, Aggregation, Auswertung, Bereitstellung.</li>
            <li><strong>Zweck:</strong> Bereitstellung der SaaS-Plattform inkl. KPIs, Diagnose und Entscheidungsempfehlung.</li>
            <li><strong>Dauer:</strong> Vertragslaufzeit; Löschung gemäß <a href="/data-retention" className="text-primary hover:underline">/data-retention</a>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Anlage II — Technische und organisatorische Maßnahmen</h2>
          <p>Vollständige TOMs unter <a href="/de/toms" className="text-primary hover:underline">/de/toms</a> (deutsche Fassung) bzw. <a href="/toms" className="text-primary hover:underline">/toms</a> (englische Fassung). Inhalte: Vertraulichkeit (Art. 32 Abs. 1 lit. b), Integrität, Verfügbarkeit und Belastbarkeit, Wiederherstellbarkeit, regelmäßige Überprüfung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Anlage III — Unterauftragsverarbeiter</h2>
          <p>Aktuelle Liste mit Hosting-Region und Übermittlungsmechanismus: <a href="/subprocessors" className="text-primary hover:underline">/subprocessors</a>. Änderungen erfolgen mit 30-tägiger Vorankündigung.</p>
        </section>

        <section className="pt-4 border-t border-border/40">
          <h2 className="text-lg font-semibold mb-2">Unterschriften</h2>
          <div className="grid md:grid-cols-2 gap-6 text-xs text-muted-foreground">
            <div>
              <p>Ort / Datum: ____________________</p>
              <p className="mt-6 border-t border-border/40 pt-1">Auftragsverarbeiter — {CONTACT.companyLegal}</p>
            </div>
            <div>
              <p>Ort / Datum: ____________________</p>
              <p className="mt-6 border-t border-border/40 pt-1">Verantwortlicher (Auftraggeber)</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
);

export default AVV;

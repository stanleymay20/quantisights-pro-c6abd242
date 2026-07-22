import LegalDocHeader from "@/components/legal/LegalDocHeader";
import { CONTACT } from "@/lib/contact-config";

const KINutzung = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
      <LegalDocHeader
        title="KI-Nutzungserklärung"
        subtitle="Transparenz gemäß EU-KI-Verordnung (AI Act) und Art. 13/14 DSGVO"
        version="1.0"
        effectiveDate="30. Mai 2026"
        language="de"
        counterpartHref="/how-ai-is-used"
      />

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Wo KI eingesetzt wird</h2>
          <p>Quantivis setzt KI ausschließlich für <em>natürliche Spracherzeugung</em> (Zusammenfassungen, Briefings) und semantische Klassifizierung ein. Alle Bewertungen, Punktzahlen, Prognosen und Klassifikationen werden durch deterministische statistische Engines (Holt's Glättung, ARIMA, k-Means, Welch's t-Test) berechnet — nicht durch ein LLM.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Eingesetzte Modell-Anbieter</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Google (Gemini-Familie)</strong> — Inferenz EU/US, keine Datenaufbewahrung für Trainingszwecke.</li>
            <li><strong>OpenAI (GPT-Familie)</strong> — Inferenz US, Standardvertragsklauseln (SCC), Opt-out vom Training.</li>
          </ul>
          <p className="mt-2">Vollständige Drittland-Übermittlungsdetails: <a href="/data-residency" className="text-primary hover:underline">/data-residency</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Einstufung nach EU-KI-Verordnung</h2>
          <p>Die Einstufung nach EU-KI-Verordnung ist <strong>bereitstellungskontextabhängig</strong>. Quantivis stellt Transparenz-, Governance-, Erklärbarkeits- und menschliche Aufsichtskontrollen bereit. Die endgültige Klassifizierung verbleibt in der Verantwortung der einsetzenden Organisation und der zuständigen Rechtsprüfung.</p>
          <p className="mt-2">Eine vollständige fähigkeitsbezogene Matrix finden Sie unter <a href="/ai-system-classification" className="text-primary hover:underline">/ai-system-classification</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Menschliche Aufsicht (Art. 14 AI Act)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Keine ausschließlich automatisierten Entscheidungen mit rechtlicher Wirkung (Art. 22 DSGVO).</li>
            <li>Entscheidungsempfehlungen erfordern eine namentlich erfasste Freigabe.</li>
            <li>Vertrauenswerte sind bei 0,85 hartgedeckelt; geringe Datenmengen reduzieren die Obergrenze automatisch.</li>
            <li>Jede KI-Ausgabe ist mit Erklärbarkeitsanker, Evidenzquellen und Modellversion versehen.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Datenverwendung</h2>
          <p>Personenbezogene und sensitive Felder werden vor jeder LLM-Inferenz durch eine PII-Redaktionsschicht ersetzt. Kundeninhalte werden <strong>nicht</strong> zum Trainieren von Modellen verwendet.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Kontakt</h2>
          <p>Fragen zur KI-Nutzung: <a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a></p>
        </section>
      </div>
    </main>
  </div>
);

export default KINutzung;

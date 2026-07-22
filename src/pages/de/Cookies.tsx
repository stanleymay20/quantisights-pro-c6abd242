import LegalDocHeader from "@/components/legal/LegalDocHeader";
import { CONTACT } from "@/lib/contact-config";

const CookiesDe = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
      <LegalDocHeader
        title="Cookie-Richtlinie"
        subtitle="Informationen zu Cookies und vergleichbaren Technologien (§ 25 TTDSG)"
        version="1.0"
        effectiveDate="30. Mai 2026"
        language="de"
        counterpartHref="/cookies"
      />

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Was sind Cookies?</h2>
          <p>Cookies sind kleine Textdateien, die beim Besuch einer Website auf Ihrem Endgerät gespeichert werden, um Funktionen bereitzustellen oder Einstellungen zu merken.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Eingesetzte Kategorien</h2>
          <p><strong>Notwendige Cookies:</strong> Authentifizierung, Sitzungs- und CSRF-Schutz. Ohne diese ist die Plattform nicht nutzbar (Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TTDSG).</p>
          <p><strong>Präferenz-Cookies:</strong> Speichern Einstellungen (Theme, Sidebar-Zustand, gewählte Organisation). Einwilligung gemäß § 25 Abs. 1 TTDSG.</p>
          <p>Wir setzen <strong>keine</strong> Werbe-, Marketing- oder Tracking-Cookies und keine Third-Party-Profiling-Pixel.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Speicherdauer</h2>
          <p>Sitzungs-Cookies enden mit dem Schließen des Browsers. Persistente Auth-Cookies bestehen bis zu 30 Tage oder bis zur Abmeldung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Widerruf / Verwaltung</h2>
          <p>Einwilligungen können jederzeit über die Cookie-Banner-Schaltfläche oder die Browser-Einstellungen widerrufen werden. Das Deaktivieren notwendiger Cookies beeinträchtigt die Funktionalität.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Drittdienste</h2>
          <p>Stripe (Zahlungsabwicklung) kann während des Checkouts eigene Cookies setzen — siehe <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Stripe Privacy Policy</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Kontakt</h2>
          <p>Fragen: <a href={`mailto:${CONTACT.email.privacy}`} className="text-primary hover:underline">{CONTACT.email.privacy}</a></p>
        </section>
      </div>
    </main>
  </div>
);

export default CookiesDe;

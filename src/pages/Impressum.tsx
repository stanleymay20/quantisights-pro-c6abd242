import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";
import { useSeoHead } from "@/lib/useSeoHead";

/**
 * Impressum — legally required under German TMG §5 / DDG §5
 * Must be accessible within 2 clicks from any page.
 */
const Impressum = () => {
  useSeoHead({
    title: "Impressum — Quantivis Global",
    description: "Angaben gemäß § 5 DDG (ehemals TMG). Anbieter, Kontakt und vertretungsberechtigte Person der Quantivis Global.",
    canonicalPath: "/impressum",
  });
  return (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt={CONTACT.company} className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Impressum</h1>
      <p className="text-muted-foreground text-sm mb-10">Angaben gemäß § 5 DDG (ehemals TMG)</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">Anbieter</h2>
          <p>
            {CONTACT.companyLegal}<br />
            {CONTACT.location}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Kontakt</h2>
          <p>
            E-Mail: <a href={`mailto:${CONTACT.email.general}`} className="text-primary hover:underline">{CONTACT.email.general}</a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Vertretungsberechtigte Person</h2>
          <p>Geschäftsführer: Stanley Osei-Wusu</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Registereintrag</h2>
          <p>
            Registergericht: Eintragung beantragt<br />
            Registernummer: Eintragung beantragt
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Umsatzsteuer-Identifikationsnummer</h2>
          <p>USt-IdNr. gemäß § 27a UStG: Erteilung beantragt</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
          <p>
            Stanley Osei-Wusu<br />
            {CONTACT.companyLegal}<br />
            {CONTACT.location}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Datenschutzbeauftragter</h2>
          <p>
            E-Mail: <a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">EU-Streitschlichtung</h2>
          <p>
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
            <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p>
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Haftungsausschluss</h2>
          <h3 className="text-sm font-semibold mt-3 mb-1">Haftung für Inhalte</h3>
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten
            nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als
            Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
            Informationen zu überwachen.
          </p>
          <h3 className="text-sm font-semibold mt-3 mb-1">Haftung für Links</h3>
          <p>
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
            Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
            verantwortlich.
          </p>
          <h3 className="text-sm font-semibold mt-3 mb-1">Urheberrecht</h3>
          <p>
            Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
            dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
            der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
            Zustimmung des jeweiligen Autors bzw. Erstellers.
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-border">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Datenschutzerklärung</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/cookies" className="hover:text-foreground transition-colors">Cookie-Richtlinie</Link>
          <Link to="/dpa" className="hover:text-foreground transition-colors">AVV</Link>
        </div>
      </div>
    </main>
  </div>
  );
};

export default Impressum;

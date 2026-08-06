import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";
import { useState } from "react";
import { readPrivacyConsent, setPrivacyConsent, type PrivacyConsentChoice } from "@/lib/privacy-consent";

const ConsentControls = () => {
  const [choice, setChoice] = useState(() => readPrivacyConsent()?.choice ?? null);
  const update = (next: PrivacyConsentChoice) => {
    setPrivacyConsent(next);
    setChoice(next);
  };

  return (
    <div className="not-prose rounded-lg border border-border/50 p-4 mt-3">
      <p className="text-sm mb-3">
        Current choice: <strong>{choice === "analytics" ? "Product analytics allowed" : choice === "essential_only" ? "Essential only" : "No choice recorded"}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => update("analytics")} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Allow product analytics</button>
        <button type="button" onClick={() => update("essential_only")} className="rounded-md border border-border px-3 py-2 text-xs font-semibold">Withdraw / essential only</button>
      </div>
    </div>
  );
};

const CookiePolicy = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Cookie Policy</h1>
      <p className="text-muted-foreground text-sm mb-10">Last updated: August 6, 2026</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. What Are Cookies</h2>
          <p>Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences and improve your experience.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Cookies We Use</h2>
          <p><strong>Essential Cookies:</strong> Required for authentication, session management, and security. These cannot be disabled.</p>
          <p><strong>Preference storage:</strong> Remembers settings such as sidebar state, theme, and selected organization.</p>
          <p><strong>Optional product analytics:</strong> If you opt in, PostHog EU receives pseudonymous interaction events so we can understand feature usage. Autocapture and session recording are disabled. We do not use advertising cookies or behavioral advertising profiles.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">3. Cookie Duration</h2>
          <p><strong>Session cookies</strong> are deleted when you close your browser. <strong>Persistent cookies</strong> (authentication tokens) remain for up to 30 days or until you sign out.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">4. Managing Cookies</h2>
          <p>You can change or withdraw your analytics choice at any time below. Withdrawal disables capture and resets the local analytics identity. You can also control storage through browser settings; disabling essential storage may prevent the Platform from functioning correctly.</p>
          <ConsentControls />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">5. Third-Party Services</h2>
          <p>We use PostHog EU for consent-based product analytics and Stripe for payment processing. Stripe may set its own cookies during checkout. Refer to <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PostHog's Privacy Policy</a> and <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe's Privacy Policy</a> for details.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">6. Contact</h2>
          <p>Questions about our cookie practices? Contact <span className="text-primary">{CONTACT.email.privacy}</span>.</p>
        </section>
      </div>
    </main>
  </div>
);

export default CookiePolicy;

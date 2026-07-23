import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

const CookiePolicy = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Cookie Policy</h1>
      <p className="text-muted-foreground text-sm mb-10">Last updated: February 25, 2026</p>

      <div className="prose prose-sm prose-invert max-w-none space-y-6 text-foreground/90 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. What Are Cookies</h2>
          <p>Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences and improve your experience.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Cookies We Use</h2>
          <p><strong>Essential Cookies:</strong> Required for authentication, session management, and security. These cannot be disabled.</p>
          <p><strong>Preference Cookies:</strong> Remember your settings such as sidebar state, theme, and selected organization.</p>
          <p>We do <strong>not</strong> use advertising cookies, third-party tracking pixels, or behavioral profiling cookies.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">3. Cookie Duration</h2>
          <p><strong>Session cookies</strong> are deleted when you close your browser. <strong>Persistent cookies</strong> (authentication tokens) remain for up to 30 days or until you sign out.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">4. Managing Cookies</h2>
          <p>You can control cookies through your browser settings. Disabling essential cookies may prevent the Platform from functioning correctly.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">5. Third-Party Services</h2>
          <p>We use Stripe for payment processing. Stripe may set its own cookies during checkout. Refer to <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe's Privacy Policy</a> for details.</p>
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

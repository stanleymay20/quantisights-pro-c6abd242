/**
 * Canonical public marketing navigation (DS-0).
 *
 * Use this on public marketing pages (Pricing, Enterprise Contact, Compare,
 * etc.). For utility/legal pages (/trust, /privacy, /terms, /security, ...)
 * the route uses layout: "public" which mounts `PublicPageNav` instead.
 *
 * Pages that import this Navbar must be registered with layout: "none"
 * in src/routes/index.tsx so PublicPageNav is not also injected — see
 * the DS-0 audit for the double-nav case.
 *
 * The homepage (Index.tsx) still uses its own inline nav; migration of
 * that surface is intentionally deferred past DS-0.
 */
import { useState, forwardRef } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/quantivis-logo.png";

const NAV_LINKS: { label: string; href?: string; to?: string }[] = [
  { to: "/pricing", label: "Pricing" },
  { to: "/enterprise/contact", label: "Enterprise" },
  { to: "/security", label: "Security" },
  { to: "/docs", label: "Docs" },
];

const NavItem = forwardRef<HTMLAnchorElement, { link: typeof NAV_LINKS[number]; onClick?: () => void }>(({ link, onClick }, ref) => {
  const className = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  if (link.to) {
    return <Link to={link.to} className={className} onClick={onClick} ref={ref}>{link.label}</Link>;
  }
  return <a href={link.href} className={className} onClick={onClick} ref={ref}>{link.label}</a>;
});
NavItem.displayName = "NavItem";

const Navbar = forwardRef<HTMLElement>((_, ref) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  return (
    <nav ref={ref} aria-label="Main navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-2xl">
      <div className="container mx-auto flex items-center justify-between py-3 px-5 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Quantivis" className="h-8 sm:h-9 w-auto" />
        </Link>

        {/* Desktop nav — simplified: 3 links max */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <NavItem key={link.label} link={link} />
          ))}
          {user ? (
            <Link
              to="/dashboard"
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
            >
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Log in
              </Link>
              <Link
                to="/register"
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
              >
                Start Free
              </Link>
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-secondary/60 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu — clean slide-down */}
      <div
        className={`md:hidden border-t border-border/30 bg-background/95 backdrop-blur-xl overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-5 py-4 space-y-2">
          {NAV_LINKS.map((link) => (
            <div key={link.label} className="py-2">
              <NavItem link={link} onClick={() => setMobileOpen(false)} />
            </div>
          ))}
          <div className="pt-2 border-t border-border/30 space-y-2">
            {user ? (
              <Link
                to="/dashboard"
                className="block text-center px-5 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="block text-sm text-muted-foreground hover:text-foreground py-2"
                  onClick={() => setMobileOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="block text-center px-5 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
                  onClick={() => setMobileOpen(false)}
                >
                  Start Free
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
});

Navbar.displayName = "Navbar";

export default Navbar;

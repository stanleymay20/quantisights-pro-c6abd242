import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Calendar, Clock, Video, BookOpen, Users, ChevronRight, Mic, Globe, Lightbulb, TrendingUp, MessageSquare } from "lucide-react";

const NAVY = "#1E2761";
const DEEP = "#0E1628";
const ACCENT = "#3D5AFE";
const GOLD = "#C9A84C";
const MUTED = "#F4F6F9";
const SLATE = "#64748B";

const TEAMS_LINK = "https://teams.microsoft.com/meet/391887961194453?p=gs3i4BbISAYdWvdTo0";
const SCROLLLIBRARY_LINK = "https://scrolllibrary.org";

export default function ConversationsEp1() {
  useEffect(() => {
    document.title = "Quantivis Conversations Ep.1 | Innovation & Startups in Germany";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", "Join Quantivis Conversations with Prof. Dr. Tilmann Lindberg for an executive discussion on AI, innovation, entrepreneurship, and startups in Germany.");
    } else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = "Join Quantivis Conversations with Prof. Dr. Tilmann Lindberg for an executive discussion on AI, innovation, entrepreneurship, and startups in Germany.";
      document.head.appendChild(m);
    }
    return () => { document.title = "Quantivis — The Decision Operating System"; };
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: NAVY }}>
      <Style />

      {/* ── NAV ── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(14,22,40,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,0.15)" }}>
        <div className="cv-wrap" style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: ACCENT, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: "-0.05em" }}>Q</span>
            </div>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>Quantivis</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>Conversations</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>·</span>
            <span style={{ color: GOLD, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em" }}>Ep. 1</span>
          </div>
          <a
            href={TEAMS_LINK}
            target="_blank"
            rel="noopener noreferrer"
            id="join-teams-event-nav"
            className="cv-btn-primary"
            style={{ fontSize: 13, padding: "8px 18px" }}
          >
            Join Event
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background: "linear-gradient(160deg, " + DEEP + " 0%, #0B1D3A 55%, #1A2B5E 100%)", padding: "80px 0 96px", position: "relative", overflow: "hidden" }}>
        {/* Subtle grid */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(61,90,254,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(61,90,254,0.04) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />
        {/* Gold accent line */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, transparent, " + GOLD + ", transparent)" }} />

        <div className="cv-wrap" style={{ position: "relative" }}>
          {/* Series badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 4, padding: "6px 14px", marginBottom: 28 }}>
            <Mic size={13} color={GOLD} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>Quantivis Conversations · Episode 1</span>
          </div>

          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(32px, 5vw, 58px)", lineHeight: 1.08, color: "#fff", fontWeight: 400, letterSpacing: "-0.02em", maxWidth: 820, margin: "0 0 16px" }}>
            Innovation & Startups<br />in Germany
          </h1>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "clamp(18px, 2.5vw, 24px)", color: GOLD, fontWeight: 400, margin: "0 0 32px", letterSpacing: "-0.01em" }}>
            The Future of Business in the AI Era
          </p>

          {/* Event meta */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 44 }}>
            {[
              { icon: <Calendar size={15} />, text: "Thursday, 25 June 2026" },
              { icon: <Clock size={15} />, text: "18:00 – 19:00 CEST" },
              { icon: <Video size={15} />, text: "Microsoft Teams · Live" },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
                <span style={{ color: GOLD }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
            <a
              href={TEAMS_LINK}
              target="_blank"
              rel="noopener noreferrer"
              id="join-teams-event"
              className="cv-btn-primary"
            >
              <Video size={16} />
              Join Event on Microsoft Teams
            </a>
            <a
              href={SCROLLLIBRARY_LINK}
              target="_blank"
              rel="noopener noreferrer"
              id="download-scrolllibrary-ebook"
              className="cv-btn-secondary"
            >
              <BookOpen size={15} />
              Download Free Ebook
              <ChevronRight size={14} />
            </a>
          </div>

          {/* Host/guest preview */}
          <div style={{ marginTop: 56, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexWrap: "wrap", gap: 24 }}>
            {[
              { initials: "SO", name: "Stanley Osei-Wusu", role: "Founder & CEO, Quantivis Global", label: "HOST" },
              { initials: "TL", name: "Prof. Dr. Tilmann Lindberg", role: "Professor of International Business Management, GISMA", label: "GUEST" },
            ].map(({ initials, name, role, label }) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(61,90,254,0.3)", border: "2px solid " + ACCENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                  {initials}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase" }}>{label}</span>
                  </div>
                  <p style={{ color: "#fff", fontWeight: 600, fontSize: 14, margin: 0 }}>{name}</p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0 }}>{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section style={{ background: MUTED, padding: "72px 0" }}>
        <div className="cv-wrap" style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 2, background: GOLD }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: SLATE, textTransform: "uppercase" }}>About the Series</span>
          </div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(26px, 3.5vw, 40px)", color: NAVY, fontWeight: 400, margin: "0 0 20px", lineHeight: 1.2 }}>
            Quantivis Conversations
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.75, color: SLATE, margin: "0 0 16px" }}>
            Quantivis Conversations is an executive discussion series exploring the intersection of artificial intelligence, business innovation, and leadership strategy. Each episode brings together founders, academics, and industry leaders for candid, high-signal conversations.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.75, color: SLATE, margin: 0 }}>
            Episode 1 focuses on Germany's AI opportunity — with one of Europe's leading business schools represented by a professor who shapes the next generation of founders, joined by a solo founder building at the frontier of AI governance.
          </p>
        </div>
      </section>

      {/* ── TOPICS ── */}
      <section style={{ background: "#fff", padding: "72px 0" }}>
        <div className="cv-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 2, background: GOLD }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: SLATE, textTransform: "uppercase" }}>Discussion Topics</span>
          </div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(24px, 3vw, 38px)", color: NAVY, fontWeight: 400, margin: "0 0 40px", lineHeight: 1.2 }}>
            What we'll cover
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { icon: <Lightbulb size={20} />, title: "Innovation in the AI era", text: "How artificial intelligence is redefining competitive advantage across industries." },
              { icon: <TrendingUp size={20} />, title: "Entrepreneurship in Germany", text: "Startup opportunities, funding landscape, and the German regulatory environment." },
              { icon: <Globe size={20} />, title: "Design Thinking & transformation", text: "Applying design-led frameworks to navigate business transformation at scale." },
              { icon: <Users size={20} />, title: "Future skills for founders", text: "What capabilities matter most for leaders building companies in the AI decade." },
              { icon: <MessageSquare size={20} />, title: "Audience Q&A", text: "Direct questions answered by Prof. Lindberg and Stanley. No prepared script." },
            ].map(({ icon, title, text }) => (
              <div key={title} style={{ background: MUTED, border: "1px solid rgba(30,39,97,0.08)", borderRadius: 8, padding: "24px 20px" }}>
                <div style={{ color: ACCENT, marginBottom: 14 }}>{icon}</div>
                <p style={{ fontWeight: 600, fontSize: 15, color: NAVY, margin: "0 0 8px" }}>{title}</p>
                <p style={{ fontSize: 13, color: SLATE, lineHeight: 1.6, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPEAKERS ── */}
      <section style={{ background: DEEP, padding: "80px 0" }}>
        <div className="cv-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 2, background: GOLD }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Speakers</span>
          </div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(24px, 3vw, 38px)", color: "#fff", fontWeight: 400, margin: "0 0 48px", lineHeight: 1.2 }}>
            Your speakers
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>

            {/* Stanley */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "32px 28px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg, " + ACCENT + ", #1A3FD8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20, flexShrink: 0, border: "2px solid rgba(61,90,254,0.4)" }}>
                  S
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 4 }}>Host</div>
                  <p style={{ color: "#fff", fontWeight: 600, fontSize: 17, margin: "0 0 4px" }}>Stanley Osei-Wusu</p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>Founder & CEO, Quantivis Global</p>
                </div>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 20 }}>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                  Stanley is a Berlin-based founder building Quantivis — an EU AI Act compliance and decision governance platform for DACH enterprises. Currently pursuing his MSc in Data Science & International Business Management at GISMA University of Applied Sciences.
                </p>
              </div>
              <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["EU AI Act", "Decision Governance", "AI Infrastructure", "DACH Enterprise"].map(t => (
                  <span key={t} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "3px 8px" }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Prof. Lindberg */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "32px 28px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg, " + GOLD + ", #A67C2C)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20, flexShrink: 0, border: "2px solid rgba(201,168,76,0.4)" }}>
                  T
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 4 }}>Guest Speaker</div>
                  <p style={{ color: "#fff", fontWeight: 600, fontSize: 17, margin: "0 0 4px" }}>Prof. Dr. Tilmann Lindberg</p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>Professor of International Business Management, GISMA University of Applied Sciences</p>
                </div>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 20 }}>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                  Prof. Dr. Lindberg is a distinguished academic at GISMA University of Applied Sciences in Berlin, specialising in International Business Management, Design Thinking, and entrepreneurship. He shapes future business leaders navigating the AI-driven transformation of global markets.
                </p>
              </div>
              <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["Design Thinking", "Entrepreneurship", "Innovation", "International Business"].map(t => (
                  <span key={t} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "3px 8px" }}>{t}</span>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── AGENDA ── */}
      <section style={{ background: "#fff", padding: "72px 0" }}>
        <div className="cv-wrap" style={{ maxWidth: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 2, background: GOLD }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: SLATE, textTransform: "uppercase" }}>Agenda</span>
          </div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(24px, 3vw, 38px)", color: NAVY, fontWeight: 400, margin: "0 0 40px", lineHeight: 1.2 }}>
            Thursday, 25 June · 18:00 CEST
          </h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { time: "18:00", title: "Welcome & Introductions", desc: "Stanley opens the session and introduces Prof. Dr. Lindberg." },
              { time: "18:05", title: "Prof. Lindberg's journey", desc: "From academia to shaping the next generation of European entrepreneurs." },
              { time: "18:15", title: "Innovation & Entrepreneurship in Germany", desc: "Opportunities, challenges, and what makes Germany unique for founders right now." },
              { time: "18:30", title: "AI and the Future of Business", desc: "How AI is transforming decision-making, governance, and competitive strategy." },
              { time: "18:40", title: "Audience Q&A", desc: "Live questions from attendees — unscripted and direct." },
              { time: "18:55", title: "Key takeaways + ebook announcement", desc: "Closing insights and how to access the free ScrollLibrary ebook." },
            ].map(({ time, title, desc }, i, arr) => (
              <div key={time} style={{ display: "flex", gap: 20, position: "relative" }}>
                {/* Timeline */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: i === 0 ? NAVY : MUTED, border: "2px solid " + (i === 0 ? NAVY : "rgba(30,39,97,0.15)") + "", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? "#fff" : NAVY }}>{time.split(":")[0]}</span>
                  </div>
                  {i < arr.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 24, background: "rgba(30,39,97,0.1)", margin: "4px 0" }} />}
                </div>
                {/* Content */}
                <div style={{ paddingBottom: i < arr.length - 1 ? 28 : 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>{time}</span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: 15, color: NAVY, margin: "0 0 4px" }}>{title}</p>
                  <p style={{ fontSize: 13, color: SLATE, lineHeight: 1.6, margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EBOOK ── */}
      <section style={{ background: MUTED, padding: "72px 0" }}>
        <div className="cv-wrap">
          <div style={{ background: "linear-gradient(135deg, " + NAVY + " 0%, #1A3A7A 100%)", borderRadius: 12, padding: "48px 40px", display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
            {/* Decorative */}
            <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(201,168,76,0.06)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -60, right: 80, width: 300, height: 300, borderRadius: "50%", background: "rgba(61,90,254,0.08)", pointerEvents: "none" }} />

            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <BookOpen size={16} color={GOLD} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase" }}>Free Resource</span>
              </div>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(22px, 3vw, 34px)", color: "#fff", fontWeight: 400, margin: "0 0 12px", lineHeight: 1.25, maxWidth: 520 }}>
                How to Build and Dominate a Tech Startup in Germany
              </h3>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, lineHeight: 1.7, margin: "0 0 8px", maxWidth: 480 }}>
                A comprehensive ebook from ScrollLibrary covering Germany's startup ecosystem, funding landscape, EU AI Act implications, and practical frameworks for founders.
              </p>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Available free on ScrollLibrary.org — mentioned in the event</p>
            </div>
            <div style={{ flexShrink: 0 }}>
              <a
                href={SCROLLLIBRARY_LINK}
                target="_blank"
                rel="noopener noreferrer"
                id="download-scrolllibrary-ebook-section"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, background: GOLD, color: DEEP, padding: "14px 28px", borderRadius: 4, fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
              >
                <BookOpen size={16} />
                Get Free Ebook
                <ChevronRight size={15} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ background: DEEP, padding: "96px 0", textAlign: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, " + GOLD + ", transparent)", top: "auto" }} />
        <div className="cv-wrap" style={{ maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 32, height: 2, background: GOLD }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Join Us Live</span>
            <div style={{ width: 32, height: 2, background: GOLD }} />
          </div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 4vw, 44px)", color: "#fff", fontWeight: 400, margin: "0 0 16px", lineHeight: 1.15 }}>
            Thursday, 25 June · 18:00 CEST
          </h2>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 16, lineHeight: 1.7, margin: "0 0 40px" }}>
            Free to attend. No sign-up required. Join directly on Microsoft Teams.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
            <a
              href={TEAMS_LINK}
              target="_blank"
              rel="noopener noreferrer"
              id="join-teams-event-footer"
              className="cv-btn-primary"
              style={{ fontSize: 15, padding: "16px 32px" }}
            >
              <Video size={18} />
              Join Event on Microsoft Teams
            </a>
            <a
              href={SCROLLLIBRARY_LINK}
              target="_blank"
              rel="noopener noreferrer"
              id="download-scrolllibrary-ebook-footer"
              className="cv-btn-secondary"
              style={{ fontSize: 15, padding: "16px 24px" }}
            >
              <BookOpen size={16} />
              Download Free Ebook
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#060D1C", padding: "28px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="cv-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, margin: 0 }}>
            © 2026 Quantivis Global · <Link to="/" style={{ color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>quantivis.io</Link>
          </p>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, margin: 0 }}>
            Quantivis Conversations Ep.1 · Innovation & Startups in Germany
          </p>
        </div>
      </footer>
    </div>
  );
}

function Style() {
  return (
    <style>{`
      .cv-wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
      .cv-btn-primary {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        background: #3D5AFE; color: #fff; padding: 13px 26px; border-radius: 4px;
        font-size: 14px; font-weight: 700; text-decoration: none; white-space: nowrap;
        transition: background 0.15s;
      }
      .cv-btn-primary:hover { background: #2D4AEE; }
      .cv-btn-secondary {
        display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        background: transparent; color: rgba(255,255,255,0.65); padding: 13px 20px;
        border: 1px solid rgba(255,255,255,0.18); border-radius: 4px;
        font-size: 14px; font-weight: 500; text-decoration: none; white-space: nowrap;
        transition: border-color 0.15s, color 0.15s;
      }
      .cv-btn-secondary:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
      @media (max-width: 640px) {
        .cv-wrap { padding: 0 16px; }
        .cv-btn-primary, .cv-btn-secondary { width: 100%; justify-content: center; }
      }
    `}</style>
  );
}

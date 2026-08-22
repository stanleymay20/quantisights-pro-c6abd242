import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import heroVideo from "@/assets/hero-video.mp4";
import heroPoster from "@/assets/hero-dashboard.jpg";

// Bundled by Vite so the published build always ships a same-origin, hashed URL.
const HERO_VIDEO_URL = heroVideo;


export default function LandingHeroMedia() {
  const { pathname } = useLocation();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setHost(null);
      return;
    }

    let frame = 0;
    const findHero = () => {
      const hero = document.querySelector<HTMLElement>(".qv-hero");
      if (hero) {
        setHost(hero);
        return;
      }
      frame = window.requestAnimationFrame(findHero);
    };
    findHero();

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  if (pathname !== "/" || !host) return null;

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {!reducedMotion && !videoFailed && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={HERO_VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          onError={() => setVideoFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,16,31,0.60)_0%,rgba(8,16,31,0.76)_48%,rgba(8,16,31,0.94)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(51,112,255,0.18),transparent_42%)]" />
    </div>,
    host,
  );
}

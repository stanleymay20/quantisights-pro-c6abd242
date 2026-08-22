import { useEffect, useState } from "react";
import heroVideo from "@/assets/hero-video.mp4";
import heroPoster from "@/assets/hero-dashboard.jpg";

/**
 * Hero background media. Rendered inline inside the landing hero section so the
 * element can never end up attached to a detached/stale DOM node, and bundled by
 * Vite so the published build always serves a same-origin, hashed asset URL.
 */
export default function LandingHeroMedia() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  const showVideo = !reducedMotion && !videoFailed;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {!showVideo && (
        <img
          src={heroPoster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {showVideo && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={heroVideo}
          poster={heroPoster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          tabIndex={-1}
          onError={() => setVideoFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,16,31,0.60)_0%,rgba(8,16,31,0.76)_48%,rgba(8,16,31,0.94)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(51,112,255,0.18),transparent_42%)]" />
    </div>
  );
}

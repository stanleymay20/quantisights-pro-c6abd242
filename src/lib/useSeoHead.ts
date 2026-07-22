import { useEffect } from "react";

export interface SeoHead {
  title: string;
  description: string;
  canonicalPath: string; // e.g. "/pricing"
  ogType?: "website" | "article";
  noindex?: boolean;
}

const ORIGIN = "https://www.quantivis.io";

/**
 * Per-route head manager. Sets <title>, description, canonical, og:*, twitter:*.
 * Restores previous values on unmount. Avoids react-helmet dependency.
 */
export function useSeoHead({ title, description, canonicalPath, ogType = "website", noindex }: SeoHead) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const canonical = `${ORIGIN}${canonicalPath}`;

    const upsertMeta = (selector: string, attrs: Record<string, string>) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        document.head.appendChild(el);
      }
      const prev: Record<string, string | null> = {};
      Object.entries(attrs).forEach(([k, v]) => {
        prev[k] = el!.getAttribute(k);
        el!.setAttribute(k, v);
      });
      return { el, created, prev };
    };
    const upsertLink = (rel: string, href: string) => {
      let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      const created = !el;
      const prevHref = el?.href ?? null;
      if (!el) {
        el = document.createElement("link");
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = href;
      return { el, created, prevHref };
    };

    const records = [
      upsertMeta('meta[name="description"]', { name: "description", content: description }),
      upsertMeta('meta[property="og:title"]', { property: "og:title", content: title }),
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: description }),
      upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical }),
      upsertMeta('meta[property="og:type"]', { property: "og:type", content: ogType }),
      upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title }),
      upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description }),
    ];
    const canon = upsertLink("canonical", canonical);

    let robotsRecord: ReturnType<typeof upsertMeta> | null = null;
    if (noindex) {
      robotsRecord = upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    }

    return () => {
      document.title = prevTitle;
      records.forEach(({ el, created, prev }) => {
        if (created) el.remove();
        else Object.entries(prev).forEach(([k, v]) => (v === null ? el.removeAttribute(k) : el.setAttribute(k, v)));
      });
      if (canon.created) canon.el.remove();
      else if (canon.prevHref) canon.el.href = canon.prevHref;
      if (robotsRecord) {
        const { el, created, prev } = robotsRecord;
        if (created) el.remove();
        else Object.entries(prev).forEach(([k, v]) => (v === null ? el.removeAttribute(k) : el.setAttribute(k, v)));
      }
    };
  }, [title, description, canonicalPath, ogType, noindex]);
}

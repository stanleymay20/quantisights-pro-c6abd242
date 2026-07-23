import { useEffect } from "react";
import type { PageMetadataDefinition } from "@/lib/page-metadata";

const SITE_URL = "https://www.quantivis.io";

interface PageMetadataProps {
  metadata: PageMetadataDefinition;
}

const ensureMeta = (
  selector: string,
  attributes: Record<string, string>,
): HTMLMetaElement => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
};

const ensureCanonical = (): HTMLLinkElement => {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  return element;
};

const PageMetadata = ({ metadata }: PageMetadataProps) => {
  useEffect(() => {
    const canonical = `${SITE_URL}${metadata.canonicalPath}`;
    document.title = metadata.title;

    ensureMeta('meta[name="description"]', {
      name: "description",
      content: metadata.description,
    });
    ensureMeta('meta[name="robots"]', {
      name: "robots",
      content: metadata.robots ?? "index, follow",
    });
    ensureMeta('meta[property="og:title"]', {
      property: "og:title",
      content: metadata.title,
    });
    ensureMeta('meta[property="og:description"]', {
      property: "og:description",
      content: metadata.description,
    });
    ensureMeta('meta[property="og:url"]', {
      property: "og:url",
      content: canonical,
    });
    ensureMeta('meta[property="og:type"]', {
      property: "og:type",
      content: metadata.type ?? "website",
    });
    ensureMeta('meta[name="twitter:title"]', {
      name: "twitter:title",
      content: metadata.title,
    });
    ensureMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: metadata.description,
    });

    ensureCanonical().href = canonical;
  }, [metadata]);

  return null;
};

export default PageMetadata;

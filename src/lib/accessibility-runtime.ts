const SCROLLABLE_SELECTOR = ".overflow-x-auto";

function enhanceScrollableRegions(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(SCROLLABLE_SELECTOR).forEach((region) => {
    if (!region.hasAttribute("tabindex")) region.tabIndex = 0;
    if (!region.hasAttribute("aria-label") && !region.hasAttribute("aria-labelledby")) {
      region.setAttribute("aria-label", "Scrollable content");
    }
  });
}

export function installAccessibilityRuntime() {
  if (typeof document === "undefined") return;

  const run = () => enhanceScrollableRegions(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(SCROLLABLE_SELECTOR)) enhanceScrollableRegions(node.parentNode ?? document);
        else enhanceScrollableRegions(node);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

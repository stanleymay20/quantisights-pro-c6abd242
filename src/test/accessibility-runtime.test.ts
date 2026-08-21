// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { installAccessibilityRuntime } from "@/lib/accessibility-runtime";

describe("accessibility runtime", () => {
  it("makes existing and dynamically mounted horizontal scroll regions keyboard accessible", async () => {
    document.body.innerHTML = '<div id="existing" class="overflow-x-auto"></div>';

    installAccessibilityRuntime();

    const existing = document.getElementById("existing");
    expect(existing).toHaveAttribute("tabindex", "0");
    expect(existing).toHaveAttribute("aria-label", "Scrollable content");

    const dynamic = document.createElement("div");
    dynamic.id = "dynamic";
    dynamic.className = "overflow-x-auto";
    dynamic.setAttribute("aria-label", "Feature comparison");
    document.body.appendChild(dynamic);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dynamic).toHaveAttribute("tabindex", "0");
    expect(dynamic).toHaveAttribute("aria-label", "Feature comparison");
  });
});

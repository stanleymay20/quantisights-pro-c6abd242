import { describe, expect, it } from "vitest";
import { generateAnswer } from "@/lib/copilot-answer-engine";

const ctx = {
  insights: [],
  metrics: [],
  pendingDecisions: 0,
  orgName: "Test Org",
  decisions: [],
};

describe("Dashboard 'Ask about this decision' widget (audit: identical canned response to any question)", () => {
  // The widget is a keyword router, not an NLU system -- each topical
  // pattern (risk, revenue, governance, etc.) is backed by real live data,
  // so it isn't purely fabricated. But an unmatched query silently fell
  // through to the "today's focus" default with no indication the
  // question wasn't understood, presenting an unrelated answer as if it
  // directly responded -- which is exactly what a live audit reproduced by
  // asking three unrelated questions and getting the same response each
  // time. Now an unmatched query gets an honest "didn't understand" answer
  // pointing at the real Ask Quantivis copilot instead.

  it("three unrelated, unmatched questions no longer collapse to the same 'focus' default", () => {
    const a = generateAnswer("What evidence supports this?", ctx);
    const b = generateAnswer("How many unicorns are in Belgium?", ctx);
    const c = generateAnswer("asdkjfhaskjdfh", ctx);
    for (const result of [a, b, c]) {
      expect(result.headline).toBe("I don't have a focused answer for that yet");
      expect(result.destination).toBe("/app/copilot");
      expect(result.dataSource).toBe("none");
    }
  });

  it("an unmatched answer echoes back what was actually typed, not a generic message", () => {
    const result = generateAnswer("How many unicorns are in Belgium?", ctx);
    expect(result.summary).toContain("unicorns are in Belgium");
  });

  it("a genuinely topical question still gets its real, data-grounded answer", () => {
    const result = generateAnswer("what are our biggest risks right now", ctx);
    expect(result.headline).not.toBe("I don't have a focused answer for that yet");
  });

  it("an empty query still shows the focus view (not the unmatched message) for the default on-load state", () => {
    const result = generateAnswer("", ctx);
    expect(result.headline).not.toBe("I don't have a focused answer for that yet");
  });
});
